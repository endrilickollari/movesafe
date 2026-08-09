import { describe, expect, it } from 'vitest';
import { commandInvocation } from '../src/command-invocation.js';

describe('commandInvocation', () => {
  it('executes commands directly outside Windows', () => {
    expect(commandInvocation('pnpm', ['install'], 'linux')).toEqual({
      command: 'pnpm',
      args: ['install'],
    });
  });

  it('executes Windows command shims through cmd.exe', () => {
    expect(commandInvocation('pnpm', ['install'], 'win32', 'C:\\Windows\\cmd.exe')).toEqual({
      command: 'C:\\Windows\\cmd.exe',
      args: ['/d', '/s', '/c', 'pnpm.cmd', 'install'],
    });
  });
});
