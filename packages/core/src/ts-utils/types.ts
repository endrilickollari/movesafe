/**
 * UTF-16 code-unit offsets into an in-memory source string (matches JS string
 * indexing and the TS scanner) — NOT UTF-8 byte offsets. Only valid when
 * sliced against the same string the offsets were computed from.
 */
export interface SourceOffset {
  readonly start: number;
  readonly end: number;
}
