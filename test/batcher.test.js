import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBatches } from '../app/core/batcher.js';

const mk = (n, len = 10) => Array.from({ length: n }, (_, i) => ({ index: i, text: 'x'.repeat(len) }));
const sizes = (batches) => batches.map((b) => b.length);

test('splits by item count', () => {
  assert.deepEqual(sizes(makeBatches(mk(45), { batchSize: 20, maxCharsPerBatch: 1e6 })), [20, 20, 5]);
});

test('splits by character budget', () => {
  assert.deepEqual(sizes(makeBatches(mk(5, 5000), { batchSize: 20, maxCharsPerBatch: 12000 })), [2, 2, 1]);
});

test('an item larger than the budget goes alone in its own batch', () => {
  const items = [...mk(1, 100), ...mk(1, 20000), ...mk(1, 100)];
  assert.deepEqual(sizes(makeBatches(items, { batchSize: 20, maxCharsPerBatch: 12000 })), [1, 1, 1]);
});

test('preserves input order across batches', () => {
  const batches = makeBatches(mk(7), { batchSize: 3, maxCharsPerBatch: 1e6 });
  assert.deepEqual(batches.flat().map((i) => i.index), [0, 1, 2, 3, 4, 5, 6]);
});

test('exact fit stays in one batch', () => {
  assert.deepEqual(sizes(makeBatches(mk(3, 4000), { batchSize: 20, maxCharsPerBatch: 12000 })), [3]);
});

test('empty input -> no batches', () => {
  assert.deepEqual(makeBatches([], { batchSize: 20, maxCharsPerBatch: 12000 }), []);
});
