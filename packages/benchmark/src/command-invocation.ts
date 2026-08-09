export interface CommandInvocation {
  readonly command: string;
  readonly args: readonly string[];
}

export function commandInvocation(
  command: string,
  args: readonly string[],
  platform = process.platform,
  windowsShell = process.env.ComSpec ?? 'cmd.exe',
): CommandInvocation {
  return platform === 'win32'
    ? { command: windowsShell, args: ['/d', '/s', '/c', `${command}.cmd`, ...args] }
    : { command, args };
}
