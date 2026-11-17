import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCache } from '../app/core/cache.js';

test('evicts the least recently used entry when full', () => {
  const c = createCache(2);
  c.set('a', 1);
  c.set('b', 2);
  c.get('a'); // 'a' is now most recent, so 'b' is the eviction candidate
  c.set('c', 3);
  assert.equal(c.get('b'), undefined);
  assert.equal(c.get('a'), 1);
  assert.equal(c.get('c'), 3);
  assert.equal(c.size, 2);
});

test('overwriting a key refreshes it and does not grow the cache', () => {
  const c = createCache(2);
  c.set('a', 1);
  c.set('b', 2);
  c.set('a', 10);
  c.set('c', 3);
  assert.equal(c.get('a'), 10);
  assert.equal(c.get('b'), undefined);
  assert.equal(c.size, 2);
});

test('missing key -> undefined', () => {
  assert.equal(createCache(5).get('nope'), undefined);
});

test('maxEntries 0 disables the cache', () => {
  const c = createCache(0);
  c.set('a', 1);
  assert.equal(c.get('a'), undefined);
  assert.equal(c.size, 0);
});
