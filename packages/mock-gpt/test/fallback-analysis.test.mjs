/**
 * Regression test for the `Intl.Segmenter` fallback in `generators/text-analysis.js`.
 *
 * The module is imported dynamically while `Intl.Segmenter` is temporarily undefined, which is the
 * only way to exercise the regex tokenizer branch. Runs against the built output in `dist/`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

// A separate test process exercises the actual module without a query-string
// duplicate that V8 would report as a second copy of the same source file.
const saved = Intl.Segmenter;
let analysis;
try {
  Intl.Segmenter = undefined;
  analysis = await import('../dist/esm/generators/text-analysis.js');
} finally {
  Intl.Segmenter = saved;
}
test('word segmentation has a deterministic Unicode fallback when Intl.Segmenter is absent', () => {
  assert.deepEqual(analysis.words('the CAT and 中文 42'), ['cat', '中文', '42']);
});
