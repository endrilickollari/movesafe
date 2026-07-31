export interface BaseRunOptions {
  readonly color: boolean;
  readonly cwd: string;
}

export interface RunResult {
  readonly exitCode: number;
  readonly lines: string[];
}

export function fail(message: string): RunResult {
  return { exitCode: 1, lines: [`✖ ${message}`] };
}
