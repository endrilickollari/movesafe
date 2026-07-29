import { helperB } from './b.js';
import { shared } from '../shared.js';

export function helperA(): string {
  return helperB() + shared();
}
