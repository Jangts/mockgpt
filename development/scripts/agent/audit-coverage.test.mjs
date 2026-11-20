import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeProcessCovs } from '@bcoe/v8-coverage';

const processCoverage = ranges => ({ result: [{ scriptId: '1', url: 'file:///coverage-fixture.js', functions: [{ functionName: 'boundary', isBlockCoverage: true, ranges }] }] });
const range = (startOffset, endOffset, count) => ({ startOffset, endOffset, count });

test('coverage range merging preserves uncovered intersections regardless of process completion order', () => {
  const inputs = [processCoverage([range(0, 100, 1), range(10, 40, 0)]), processCoverage([range(0, 100, 1), range(20, 50, 0)])];
  const merged = mergeProcessCovs(structuredClone(inputs));
  assert.deepEqual(mergeProcessCovs(structuredClone(inputs).reverse()), merged);
  assert.ok(merged.result[0].functions[0].ranges.some(item => item.startOffset === 20 && item.endOffset === 40 && item.count === 0));
});

test('coverage range merging counts a genuinely exercised branch across isolated processes', () => {
  const inputs = [processCoverage([range(0, 100, 1), range(20, 40, 0)]), processCoverage([range(0, 100, 1)])];
  const merged = mergeProcessCovs(inputs).result[0].functions[0].ranges;
  const branch = merged.filter(item => item.startOffset <= 20 && item.endOffset >= 40).at(-1);
  assert.ok(branch.count > 0);
});
