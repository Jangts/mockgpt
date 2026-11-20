/**
 * Deterministic text analysis primitives: word segmentation, sentence splitting and bounded
 * sampling.
 *
 * Used by the summary, keywords and title generators. Everything here is synchronous and
 * locale-driven rather than random, so equal inputs always produce equal tokens and samples.
 */

// Stopwords include generic document/summary vocabulary (本文, 文章, 内容, 总结, 摘要) so keyword
// extraction ranks topical terms above boilerplate.
const stops = new Set(
  '的 了 和 是 在 有 与 为 将 对 也 这 那 一个 我 你 它 我们 他们 以及 可以 进行 通过 这个 这些 那些 本文 文章 内容 the a an and of to is in for on with as it this that be are was were from by or at we you they 请 总结 摘要'.split(
    ' ',
  ),
);

// `Intl.Segmenter` handles Chinese word boundaries without a dictionary; the regex fallback keeps
// older runtimes (and the explicit no-Segmenter test) working with coarser tokens.
const segmenter =
  typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter('zh', { granularity: 'word' })
    : undefined;

/**
 * Tokenize text into lowercase non-stopword terms.
 *
 * @param text Source text, usually one candidate sentence.
 * @returns Terms in reading order, with duplicates preserved for frequency counting.
 */
export function words(text: string): string[] {
  const tokens: string[] = [];
  const add = (word: string) => {
    const value = word.toLowerCase();
    if (!stops.has(value)) tokens.push(value);
  };
  if (segmenter) {
    for (const item of segmenter.segment(text)) if (item.isWordLike) add(item.segment);
  } else {
    for (const match of text.matchAll(/[\p{L}\p{N}]+/gu)) add(match[0]);
  }
  return tokens;
}

/**
 * Split text into trimmed nonempty sentences.
 *
 * Splits after CJK and ASCII sentence punctuation (keeping the punctuation with the sentence)
 * and on line breaks, which is enough for the extractive summary to treat list items as units.
 *
 * @param text Source text.
 * @returns Sentences in document order.
 */
export function sentences(text: string): string[] {
  return text
    .split(/(?<=[。！？!?；;])\s*|(?<=\.)\s+|[\r\n]+/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Bounded deterministic sampling retains the beginning, middle and end instead of only a prefix.
 *
 * For a limit of at least 6, the budget is split into three equal portions: head, a centered
 * middle slice and the tail; the parts are joined with newlines. Below that the function degrades
 * to a plain prefix. Code-point offsets are used so every returned slice is valid text.
 *
 * @param text Source text (measured in code points).
 * @param limit Maximum code points to return.
 * @returns `text` unchanged when it fits, otherwise the sample plus `total` and `sampled: true`.
 */
export function sampleText(
  text: string,
  limit: number,
): { text: string; total: number; sampled: boolean } {
  const total = charLength(text);
  if (total <= limit) return { text, total, sampled: false };
  if (limit < 6) return { text: chars(text, limit), total, sampled: true };
  // Two of the budgeted characters are spent on the two joining newlines.
  const portion = Math.floor((limit - 2) / 3);
  const middle = Math.floor((total - portion) / 2),
    tail = limit - 2 - portion * 2;
  const headEnd = charEnd(text, portion),
    middleStart = charEnd(text, middle - portion, headEnd);
  const middleEnd = charEnd(text, portion, middleStart),
    tailStart = charEnd(text, total - tail - middle - portion, middleEnd);
  return {
    text: [text.slice(0, headEnd), text.slice(middleStart, middleEnd), text.slice(tailStart)].join(
      '\n',
    ),
    total,
    sampled: true,
  };
}
import { charEnd, charLength, chars } from '../shared/text.js';
