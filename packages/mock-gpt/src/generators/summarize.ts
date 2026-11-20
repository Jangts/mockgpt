/**
 * Extractive summarization used by the `summary` and `bullets` generators.
 *
 * The pipeline is deterministic: split into sentences, bound and de-duplicate candidates, score
 * them on a TextRank-style similarity graph, then greedily pick sentences with an MMR-style
 * redundancy penalty and a character budget. There is no language model and no randomness, so
 * the same text always yields the same selection.
 */
import { chars } from '../shared/utils.js';
import { sentences, words } from './text-analysis.js';

/** One de-duplicated sentence candidate plus its TF-IDF vector. */
interface Candidate {
  /** Sentence text after long-sentence splitting and trimming. */
  text: string;
  /** Position in the original sentence list; used to restore reading order. */
  index: number;
  /** Length in code points, used for budget accounting and shortening. */
  length: number;
  /** Term weights (TF-IDF); mutated in place while scoring. */
  vector: Map<string, number>;
  /** L2 norm of `vector`, for cosine similarity. */
  norm: number;
}

/** Result of `summarize`. */
export interface SummaryResult {
  /** Selected sentences, in reading order and joined by spaces or newlines (bullets). */
  text: string;
  /** Number of candidates considered after de-duplication and sampling. */
  candidates: number;
  /** Number of selected sentences; at least 1 unless the input had no candidates. */
  selected: number;
  /** Original sentence indexes of the selection, in reading order. */
  selectedIndexes: number[];
}

// Caps the quadratic similarity matrix regardless of document length.
const MAX_CANDIDATES = 180;

/**
 * Bound one sentence to at most 180 code points.
 *
 * Preference order: keep as-is, split on clause punctuation, then hard-split near a space so
 * English words stay intact. Only pathological unpunctuated text reaches the hard split.
 *
 * @param sentence Candidate sentence.
 * @returns One or more pieces, each at most 180 code points.
 */
function splitLong(sentence: string): string[] {
  if (Array.from(sentence).length <= 180) return [sentence];
  const clauses = sentence.split(/(?<=[，,：:])\s*/u).filter(Boolean);
  if (clauses.length > 1)
    return clauses
      .flatMap((part) => (Array.from(part).length > 180 ? splitLong(part) : [part]))
      .filter(Boolean);
  // Unpunctuated text still needs bounded candidates; English words should remain intact where possible.
  const points = Array.from(sentence);
  const parts: string[] = [];
  for (let offset = 0; offset < points.length;) {
    let end = Math.min(offset + 180, points.length);
    const boundary = points.slice(offset + 90, end).lastIndexOf(' ');
    if (end < points.length && boundary >= 0) end = offset + 90 + boundary + 1;
    parts.push(points.slice(offset, end).join('').trim());
    offset = end;
  }
  return parts;
}

/**
 * Build de-duplicated, bounded candidates with TF-IDF vectors.
 *
 * De-duplication keys ignore punctuation, spacing and case, so repeated boilerplate counts once.
 * When there are too many candidates they are sampled uniformly across the document rather than
 * truncated, which keeps the ending of long pages in reach.
 *
 * @param text Bounded source text.
 * @returns Candidates in document order with scored term vectors and L2 norms.
 */
function candidatesOf(text: string): Candidate[] {
  const seen = new Set<string>();
  const all = sentences(text)
    .flatMap(splitLong)
    .map((text, index) => ({ text, index }))
    .filter((item) => {
      const key = item.text.replace(/[\p{P}\p{Z}\s]/gu, '').toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const chosen =
    all.length <= MAX_CANDIDATES
      ? all
      : Array.from(
          { length: MAX_CANDIDATES },
          (_, index) => all[Math.round((index * (all.length - 1)) / (MAX_CANDIDATES - 1))],
        );
  const result = chosen.map((item) => {
    const vector = new Map<string, number>();
    // Only the first 128 terms per sentence contribute, which bounds scoring cost per candidate.
    for (const token of words(item.text).slice(0, 128))
      vector.set(token, (vector.get(token) ?? 0) + 1);
    return { ...item, length: Array.from(item.text).length, vector, norm: 0 };
  });
  const documentFrequency = new Map<string, number>();
  for (const item of result)
    for (const token of item.vector.keys())
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
  for (const item of result) {
    for (const [token, frequency] of item.vector)
      // Sublinear TF (1 + log tf) times smoothed IDF; rare terms become more discriminative.
      item.vector.set(
        token,
        (1 + Math.log(frequency)) *
          Math.log(1 + result.length / (1 + documentFrequency.get(token)!)),
      );
    item.norm = Math.sqrt(
      [...item.vector.values()].reduce((sum, weight) => sum + weight * weight, 0),
    );
  }
  return result;
}

/**
 * Cosine similarity between two candidate vectors.
 *
 * @param left First candidate.
 * @param right Second candidate.
 * @returns Similarity in [0, 1]; 0 when either vector is empty.
 */
function similarity(left: Candidate, right: Candidate): number {
  if (!left.norm || !right.norm) return 0;
  let sum = 0;
  // Iterate the smaller vector; the dot product is symmetric either way.
  const [small, large] = left.vector.size <= right.vector.size ? [left, right] : [right, left];
  for (const [word, weight] of small.vector) sum += weight * (large.vector.get(word) ?? 0);
  return sum / (left.norm * right.norm);
}

/**
 * TextRank power iteration over a symmetric weighted graph.
 *
 * @param candidates Candidates to rank.
 * @returns `ranks` per candidate plus the dense `edges` matrix reused for redundancy checks.
 */
function rankGraph(candidates: Candidate[]): { ranks: number[]; edges: Float64Array } {
  const n = candidates.length;
  const edges = new Float64Array(n * n);
  const sums = new Float64Array(n);
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const weight = similarity(candidates[i], candidates[j]);
      edges[i * n + j] = edges[j * n + i] = weight;
      sums[i] += weight;
      sums[j] += weight;
    }
  let ranks = Array(n).fill(1 / n) as number[];
  // 0.85 damping / 0.15 teleport is the standard PageRank weighting; 40 iterations with an
  // L1 change threshold of 1e-5 keep the result stable without needing exact convergence.
  for (let iteration = 0; iteration < 40; iteration++) {
    const dangling = ranks.reduce((sum, rank, index) => sum + (sums[index] ? 0 : rank), 0);
    const next = Array(n).fill((0.15 + 0.85 * dangling) / n) as number[];
    for (let i = 0; i < n; i++)
      if (sums[i])
        for (let j = 0; j < n; j++) next[j] += (0.85 * ranks[i] * edges[i * n + j]) / sums[i];
    const change = next.reduce((sum, rank, index) => sum + Math.abs(rank - ranks[index]), 0);
    ranks = next;
    if (change < 0.00001) break;
  }
  return { ranks, edges };
}

/**
 * Shorten text to a limit, preferring a clause or word boundary in the second half.
 *
 * @param text Text to shorten.
 * @param limit Maximum code points.
 * @returns The text unchanged, or a truncated form ending with an ellipsis.
 */
function shorten(text: string, limit: number): string {
  if (Array.from(text).length <= limit) return text;
  if (limit === 1) return '…';
  const prefix = chars(text, limit - 1);
  const boundary = Math.max(
    prefix.lastIndexOf('，'),
    prefix.lastIndexOf(','),
    prefix.lastIndexOf('；'),
    prefix.lastIndexOf(';'),
    prefix.lastIndexOf(' '),
  );
  return (boundary > prefix.length / 2 ? prefix.slice(0, boundary) : prefix).trimEnd() + '…';
}

/**
 * TextRank-style graph relevance followed by MMR-style redundancy control and budget-aware selection.
 *
 * @param text Source text (already bounded by the caller).
 * @param count Maximum number of sentences to select.
 * @param maxChars Maximum code points of the joined result, including separators.
 * @param bullets Render each sentence as a `- ` bullet line instead of space-joined prose.
 * @returns Selected sentences in reading order, plus candidate/selection counts.
 */
export function summarize(
  text: string,
  count: number,
  maxChars: number,
  bullets = false,
): SummaryResult {
  const candidates = candidatesOf(text);
  const n = candidates.length;
  if (!n) return { text: '', candidates: 0, selected: 0, selectedIndexes: [] };
  const { ranks, edges } = rankGraph(candidates);
  const peak = Math.max(...ranks);
  const selected: number[] = [];
  let used = 0;
  while (selected.length < Math.min(count, n)) {
    let best = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < n; i++) {
      if (selected.includes(i)) continue;
      // Budget includes the bullet prefix and the separator that this sentence would add.
      const cost = candidates[i].length + (bullets ? 2 : 0) + (selected.length ? 1 : 0);
      if (used + cost > maxChars) continue;
      const redundancy = selected.reduce(
        (maximum, prior) => Math.max(maximum, edges[i * n + prior]),
        0,
      );
      // Near-duplicate sentences add length without new information.
      if (redundancy > 0.88) continue;
      // Documents are divided into thirds so the selection covers start, middle and end.
      const region = Math.min(2, Math.floor((i * 3) / n));
      const uncovered = !selected.some(
        (prior) => Math.min(2, Math.floor((prior * 3) / n)) === region,
      );
      const distance = selected.length
        ? Math.min(...selected.map((prior) => Math.abs(i - prior) / Math.max(1, n - 1)))
        : 0;
      // Weights are engineering defaults; not claimed to reproduce a published quality benchmark.
      const score =
        (0.5 * ranks[i]) / peak - 0.5 * redundancy + 0.08 * Number(uncovered) + 0.02 * distance;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    if (best < 0) break;
    used += candidates[best].length + (bullets ? 2 : 0) + (selected.length ? 1 : 0);
    selected.push(best);
  }
  if (!selected.length) {
    // Every candidate exceeded the budget: return the best-ranked sentence, shortened to fit.
    const best = ranks.indexOf(peak);
    const prefix = bullets && maxChars > 2 ? '- ' : '';
    return {
      text: prefix + shorten(candidates[best].text, maxChars - prefix.length),
      candidates: n,
      selected: 1,
      selectedIndexes: [candidates[best].index],
    };
  }
  // Restore reading order only after relevance, diversity and length decisions are final.
  selected.sort((left, right) => candidates[left].index - candidates[right].index);
  return {
    text: selected
      .map((index) => (bullets ? '- ' : '') + candidates[index].text)
      .join(bullets ? '\n' : ' '),
    candidates: n,
    selected: selected.length,
    selectedIndexes: selected.map((index) => candidates[index].index),
  };
}
