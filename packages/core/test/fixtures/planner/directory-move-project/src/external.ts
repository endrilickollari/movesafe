import { helperA } from './feature/a.js';
import { helperA as helperAViaAlias } from '@app/feature/a';

export function useFeature(): string {
  return helperA() + helperAViaAlias();
}
