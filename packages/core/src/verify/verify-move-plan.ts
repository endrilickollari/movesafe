import { readFileSync } from 'node:fs';
import * as ts from 'typescript';
import { applyEditsToContent } from '../apply/apply-edits-to-content.js';
import { collectModuleResolutionDiagnostics } from '../module-resolution/diagnostics.js';
import { resolveSpecifier } from '../module-resolution/index.js';
import { canonicalPath, toFileSystemPath } from '../path-utils.js';
import type { Edit, FileMove, MovePlanDiagnostic } from '../planner/types.js';
import { scanSourceFile } from '../scanner/scan-file.js';
import {
  createOverlayCompilerHost,
  createOverlayModuleResolutionHost,
} from './create-overlay-module-resolution-host.js';

export interface VerifyMovePlanInput {
  readonly moves: readonly FileMove[];
  readonly edits: readonly Edit[];
  /** Baseline program whose root files and diagnostics are compared with the simulated post-move program. */
  readonly program: ts.Program;
  /** Defaults to `ts.sys`, matching `resolveSpecifier`'s own default. */
  readonly moduleResolutionHost?: ts.ModuleResolutionHost;
  readonly moduleResolutionCache?: ts.ModuleResolutionCache;
  readonly workspacePackages?: ReadonlyMap<string, string>;
}

/**
 * Builds a complete post-move Program over an in-memory filesystem overlay,
 * then blocks on module-resolution diagnostics introduced in any moved or
 * edited file. Baseline diagnostics are subtracted, so a pre-existing broken
 * import remains visible to the checker without spuriously blocking a move.
 * CommonJS `require()` calls are compared separately because TypeScript does
 * not report their resolution failures as semantic diagnostics.
 */
export function verifyMovePlan(input: VerifyMovePlanInput): MovePlanDiagnostic[] {
  const { moves, edits, program, moduleResolutionHost, moduleResolutionCache, workspacePackages } = input;

  const movedPathMap = new Map(
    moves.map((move) => [canonicalPath(move.fromFilePath), move.toFilePath]),
  );
  const movedPath = (path: string): string | undefined => movedPathMap.get(canonicalPath(path));

  const editsByFile = new Map<string, Edit[]>();
  for (const edit of edits) {
    const existing = editsByFile.get(edit.file);
    if (existing) {
      existing.push(edit);
    } else {
      editsByFile.set(edit.file, [edit]);
    }
  }

  const overlay = new Map<string, string | null>();

  // Every relocated file needs its content placed at the destination and
  // its absence recorded at the source — regardless of whether it has any
  // edits of its own — since other files' (inbound) edits resolve against
  // its new path.
  for (const move of moves) {
    const ownEdits = editsByFile.get(move.fromFilePath) ?? [];
    const content = applyEditsToContent(readFileSync(move.fromFilePath, 'utf8'), ownEdits);
    overlay.set(move.toFilePath, content);
    overlay.set(move.fromFilePath, null);
  }

  // Every other edited (non-moved) file needs its post-edit content at its own, unchanged path.
  for (const [file, fileEdits] of editsByFile) {
    if (movedPath(file)) continue;
    overlay.set(file, applyEditsToContent(readFileSync(file, 'utf8'), fileEdits));
  }

  const overlayHost = createOverlayModuleResolutionHost(moduleResolutionHost ?? ts.sys, overlay);
  const compilerOptions = program.getCompilerOptions();
  const compilerHost = createOverlayCompilerHost(compilerOptions, overlay, moduleResolutionHost);
  const plannedProgram = ts.createProgram({
    rootNames: program.getRootFileNames().map((file) => movedPath(file) ?? file),
    options: compilerOptions,
    projectReferences: program.getProjectReferences(),
    host: compilerHost,
  });

  const baselineSourceFiles = program.getSourceFiles().filter(
    (sourceFile) =>
      !program.isSourceFileDefaultLibrary(sourceFile) &&
      !program.isSourceFileFromExternalLibrary(sourceFile),
  );
  const plannedSourceFiles = baselineSourceFiles
    .map((sourceFile) => plannedProgram.getSourceFile(movedPath(sourceFile.fileName) ?? sourceFile.fileName))
    .filter((sourceFile): sourceFile is ts.SourceFile => sourceFile !== undefined);

  const diagnosticKey = (diagnostic: ts.Diagnostic, mapMovedPath: boolean): string => {
    const fileName = diagnostic.file?.fileName ?? '';
    const effectiveFileName = mapMovedPath ? movedPath(fileName) ?? fileName : fileName;
    return `${fileName ? canonicalPath(effectiveFileName) : ''}\0${diagnostic.code}\0${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`;
  };

  const baselineCounts = new Map<string, number>();
  for (const diagnostic of collectModuleResolutionDiagnostics(program, baselineSourceFiles)) {
    const key = diagnosticKey(diagnostic, true);
    baselineCounts.set(key, (baselineCounts.get(key) ?? 0) + 1);
  }

  const diagnostics: MovePlanDiagnostic[] = [];
  for (const diagnostic of collectModuleResolutionDiagnostics(plannedProgram, plannedSourceFiles)) {
    const key = diagnosticKey(diagnostic, false);
    const baselineCount = baselineCounts.get(key) ?? 0;
    if (baselineCount > 0) {
      baselineCounts.set(key, baselineCount - 1);
    } else {
      const fileName = diagnostic.file?.fileName;
      diagnostics.push({
        severity: 'error',
        code: 'broken-import-after-move',
        message: `After the move, TypeScript would report: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`,
        path: fileName ? toFileSystemPath(fileName) : undefined,
      });
    }
  }

  const plannedCache = ts.createModuleResolutionCache(
    program.getCurrentDirectory(),
    ts.sys.useCaseSensitiveFileNames ? (file) => file : (file) => file.toLowerCase(),
    compilerOptions,
  );
  for (const baselineSourceFile of baselineSourceFiles) {
    const baselinePath = baselineSourceFile.fileName;
    const plannedPath = movedPath(baselinePath) ?? baselinePath;
    const plannedSourceFile = plannedProgram.getSourceFile(plannedPath);
    if (!plannedSourceFile) continue;

    const baselineRequires = scanSourceFile(baselineSourceFile).specifiers.filter(
      (record) => record.formKind === 'requireCall',
    );
    const plannedRequires = scanSourceFile(plannedSourceFile).specifiers.filter(
      (record) => record.formKind === 'requireCall',
    );

    for (let index = 0; index < plannedRequires.length; index++) {
      const baselineRecord = baselineRequires[index];
      const plannedRecord = plannedRequires[index];
      if (!baselineRecord || !plannedRecord) continue;

      const baselineResult = resolveSpecifier(baselineRecord.moduleText, baselinePath, program, {
        moduleResolutionHost: moduleResolutionHost ?? ts.sys,
        moduleResolutionCache,
        workspacePackages,
      }).result;
      const plannedResult = resolveSpecifier(plannedRecord.moduleText, plannedPath, plannedProgram, {
        moduleResolutionHost: overlayHost,
        moduleResolutionCache: plannedCache,
        workspacePackages,
      }).result;
      if (baselineResult.kind !== 'unresolved' && plannedResult.kind === 'unresolved') {
        diagnostics.push({
          severity: 'error',
          code: 'broken-import-after-move',
          message: `After the move, '${plannedRecord.moduleText}' in ${plannedPath} would no longer resolve.`,
          path: plannedPath,
        });
      }
    }
  }

  return diagnostics;
}
