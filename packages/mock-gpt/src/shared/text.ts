/**
 * Unicode-aware string measurement and slicing.
 *
 * The mock reports limits in "characters" but streams by code point, so every limit check and
 * SSE chunk boundary goes through these helpers instead of `text.length`, which counts UTF-16
 * code units and would split surrogate pairs. Nothing here materializes an array of code
 * points, so arbitrarily long model output stays cheap to scan.
 */

/**
 * UTF-16 offset after at most count Unicode code points; no character array.
 *
 * @param text Source text.
 * @param count Maximum number of code points to advance.
 * @param start UTF-16 offset to start from; defaults to 0.
 * @returns Offset in [start, text.length] that never lands inside a surrogate pair.
 */
export function charEnd(text: string, count: number, start = 0): number {
  let offset = start;
  for (let i = 0; i < count && offset < text.length; i++)
    offset += text.codePointAt(offset)! > 0xffff ? 2 : 1;
  return offset;
}

/**
 * Count Unicode code points, stopping once the limit is exceeded.
 *
 * @param text Source text.
 * @param limit Maximum count to measure; the result is then a lower bound of `limit + 1`.
 * Higher values are exact.
 * @returns Number of code points, capped at `limit + 1`.
 */
export function charLength(text: string, limit = Infinity): number {
  let count = 0;
  for (let offset = 0; offset < text.length;) {
    offset += text.codePointAt(offset)! > 0xffff ? 2 : 1;
    if (++count > limit) break;
  }
  return count;
}

/**
 * Truncate text to a maximum number of code points.
 *
 * @param text Source text.
 * @param limit Maximum code points to keep.
 * @returns The original string when it already fits, otherwise a slice ending on a code point
 * boundary.
 */
export function chars(text: string, limit: number): string {
  return limit >= text.length ? text : text.slice(0, charEnd(text, limit));
}

/**
 * Lazily slice complete code points, retaining only the current output chunk.
 *
 * @param text Source text.
 * @param count Maximum code points per yielded chunk.
 * @yields Consecutive chunks that concatenate back to `text`; empty text yields nothing.
 */
export function* textChunks(text: string, count: number): Generator<string> {
  for (let start = 0; start < text.length;) {
    const end = charEnd(text, count, start);
    yield text.slice(start, end);
    start = end;
  }
}
