import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processItems } from '../app/core/processor.js';
import { createCache } from '../app/core/cache.js';
import { createUsageTracker } from '../app/core/usage.js';
import { createLogger, silentLogger } from '../app/core/logger.js';
import { summarize } from '../app/modes/summarize.js';
import { classify } from '../app/modes/classify.js';
import { createKeywordProvider } from '../app/providers/keyword.js';
import { FatalProviderError } from '../app/providers/errors.js';

const cfg = { batchSize: 20, maxCharsPerItem: 2000, maxCharsPerBatch: 12000 };

// Fake provider: records the ids of every batch it receives; `fn` decides the answer.
const fake = (fn) => {
  const calls = [];
  return {
    name: 'fake',
    calls,
    async complete(mode, batch) {
      calls.push(batch.map((i) => i.id));
      return fn(mode, batch, calls.length);
    },
  };
};
const answerAll = (output = { summary: 's.' }, usage = null) => fake((m, b) => ({ outputs: b.map(() => output), usage }));
const tracker = () => createUsageTracker({ priceInputPer1M: 0, priceOutputPer1M: 0 });

const run = (items, provider, extra = {}) =>
  processItems({
    mode: summarize,
    items,
    provider,
    config: cfg,
    logger: silentLogger,
    usage: tracker(),
    cache: createCache(0),
    ...extra,
  });

const sample = [
  { id: 1, subject: 'Invoice', body: 'Pay.' },
  { id: 2, subject: 'Sync', body: 'Agenda.' },
  { id: 3, subject: 'Retreat', body: 'Join.' },
  { id: 4, subject: '', body: ' ' },
];

test('keeps input order; empty item is never sent to the provider', async () => {
  const p = answerAll();
  const { results, stats } = await run(sample, p);
  assert.deepEqual(results.map((r) => r.id), [1, 2, 3, 4]);
  assert.deepEqual(results[0], { id: 1, summary: 's.' });
  assert.deepEqual(results[3], { id: 4, error: 'empty_input' });
  assert.deepEqual(p.calls, [[1, 2, 3]]);
  assert.equal(stats.total, 4);
  assert.equal(stats.ok, 3);
  assert.deepEqual(stats.errors, { empty_input: 1 });
});

test('invalid items keep their error results and are logged with the reason', async () => {
  const lines = [];
  const logger = createLogger('WARN', { write: (l) => lines.push(JSON.parse(l)) });
  const { results } = await run([null, { body: 'no id' }, { id: 5, body: 7 }], answerAll(), { logger });
  assert.deepEqual(results, [
    { id: null, index: 0, error: 'invalid_input' },
    { id: null, index: 1, error: 'invalid_input' },
    { id: 5, error: 'invalid_input' },
  ]);
  assert.equal(lines.filter((l) => l.level === 'WARN' && l.reason).length, 3);
});

test('no valid items -> no provider calls', async () => {
  const p = answerAll();
  const { results } = await run([{ id: 1, body: '' }], p);
  assert.equal(p.calls.length, 0);
  assert.deepEqual(results, [{ id: 1, error: 'empty_input' }]);
});

test('batches 45 items into 3 calls and records usage per call', async () => {
  const usage = tracker();
  const p = answerAll({ summary: 'ok.' }, { inputTokens: 10, outputTokens: 5 });
  const items = Array.from({ length: 45 }, (_, i) => ({ id: i, body: `text ${i}` }));
  await run(items, p, { usage });
  assert.equal(p.calls.length, 3);
  assert.deepEqual(usage.summary(), { requests: 3, inputTokens: 30, outputTokens: 15, estimatedPaidCostUsd: 0 });
});

test('dedupes identical texts; duplicate ids with different texts are both processed', async () => {
  const p = fake((m, b) => ({ outputs: b.map((i) => ({ summary: `s${i.id}.` })), usage: null }));
  const { results, stats } = await run(
    [
      { id: 1, body: 'same' },
      { id: 2, body: 'same' },
      { id: 7, body: 'a' },
      { id: 7, body: 'b' },
    ],
    p,
  );
  assert.deepEqual(p.calls, [[1, 7, 7]]);
  assert.equal(stats.duplicates, 1);
  assert.deepEqual(results[1], { id: 2, summary: 's1.' });
  assert.deepEqual(results.slice(2).map((r) => r.id), [7, 7]);
});

test('warm cache avoids repeat calls across runs', async () => {
  const cache = createCache(100);
  const p = answerAll();
  await run(sample, p, { cache });
  const { results, stats } = await run(sample, p, { cache });
  assert.equal(p.calls.length, 1);
  assert.equal(stats.cacheHits, 3);
  assert.deepEqual(results[0], { id: 1, summary: 's.' });
});

test('cache is per mode', async () => {
  const cache = createCache(100);
  const p = fake((m, b) => ({ outputs: b.map(() => (m.name === 'classify' ? { topics: ['other'] } : { summary: 's.' })), usage: null }));
  await run(sample, p, { cache });
  const { results } = await run(sample, p, { cache, mode: classify });
  assert.equal(p.calls.length, 2);
  assert.deepEqual(results[0], { id: 1, topics: ['other'] });
});

test('partial response retries only the missing item', async () => {
  const p = fake((m, b, n) => ({ outputs: b.map((i) => (n === 1 && i.id === 2 ? null : { summary: 's.' })), usage: null }));
  const { results } = await run(sample, p);
  assert.deepEqual(p.calls, [[1, 2, 3], [2]]);
  assert.ok(results.slice(0, 3).every((r) => r.summary));
});

test('always-failing batch splits down to single items, then model_error', async () => {
  const p = fake(() => {
    throw new Error('boom');
  });
  const items = [1, 2, 3, 4].map((id) => ({ id, body: `t${id}` }));
  const { results, stats } = await run(items, p);
  assert.equal(p.calls.length, 7); // [1,2,3,4] -> [1,2],[3,4] -> [1],[2],[3],[4]
  assert.ok(results.every((r) => r.error === 'model_error'));
  assert.deepEqual(stats.errors, { model_error: 4 });
});

test('fatal error stops all further calls; other items keep their own errors', async () => {
  const p = fake(() => {
    throw new FatalProviderError('quota');
  });
  const items = Array.from({ length: 45 }, (_, i) => ({ id: i, body: `t${i}` }));
  const { results } = await run([...items, { id: 99, body: '' }], p);
  assert.equal(p.calls.length, 1);
  assert.equal(results.filter((r) => r.error === 'model_error').length, 45);
  assert.deepEqual(results.at(-1), { id: 99, error: 'empty_input' });
});

test('fatal error mid-run keeps results already obtained', async () => {
  const p = fake((m, b, n) => {
    if (n === 2) throw new FatalProviderError('quota');
    return { outputs: b.map(() => ({ summary: 's.' })), usage: null };
  });
  const items = Array.from({ length: 45 }, (_, i) => ({ id: i, body: `t${i}` }));
  const { results } = await run(items, p);
  assert.equal(p.calls.length, 2);
  assert.equal(results.filter((r) => r.summary).length, 20);
  assert.equal(results.filter((r) => r.error === 'model_error').length, 25);
});

test('fallback provider rescues model_error items and is not cached', async () => {
  const cache = createCache(100);
  const p = fake(() => {
    throw new FatalProviderError('quota');
  });
  const { results, stats } = await run(sample, p, { cache, fallbackProvider: createKeywordProvider() });
  assert.ok(results.slice(0, 3).every((r) => typeof r.summary === 'string'));
  assert.equal(stats.fallbacks, 3);
  assert.equal(cache.size, 0);
});

test('successful results are cached under mode + text key', async () => {
  const cache = createCache(100);
  await run(sample, answerAll(), { cache });
  assert.equal(cache.size, 3);
});
