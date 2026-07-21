import * as ts from 'typescript';

export function createParseConfigFileHost(
  onUnRecoverableConfigFileDiagnostic: (diagnostic: ts.Diagnostic) => void,
): ts.ParseConfigFileHost {
  return {
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
    useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
    getCurrentDirectory: ts.sys.getCurrentDirectory,
    onUnRecoverableConfigFileDiagnostic,
  };
}
