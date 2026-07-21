import * as ts from 'typescript';

export function detectTurborepo(rootDir: string): boolean {
  return ts.sys.fileExists(`${rootDir}/turbo.json`);
}
