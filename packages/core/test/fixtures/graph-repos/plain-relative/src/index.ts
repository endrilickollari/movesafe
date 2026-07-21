import { formatGreeting } from './utils/format.js';
import type { Greeting } from './types.js';

export function greet(name: string): Greeting {
  return { message: formatGreeting(name) };
}
