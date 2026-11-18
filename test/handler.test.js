import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseEvent, createHandler, createHandlerFromConfig } from '../app/handler.js';
import { loadConfig } from '../app/config.js';
import { createLogger, silentLogger } from '../app/core/logger.js';
import { createCache } from '../app/core/cache.js';
import { createKeywordProvider } from '../app/providers/keyword.js';

const emails = JSON.parse(readFileSync(new URL('../sample/emails.json', import.meta.url), 'utf8'));

test('parseEvent accepts { mode, items } and a bare array with a default mode', () => {
  assert.equal(parseEvent({ mode: 'classify', items: [] }).mode.name, 'classify');
  assert.equal(parseEvent([], 'summarize').mode.name, 'summarize');
  assert.equal(parseEvent({ items: [] }, 'summarize').mode.name, 'summarize');
  assert.deepEqual(parseEvent({ mode: 'classify', items: [1] }).items, [1]);
});

test('parseEvent rejects request-level problems with clear messages', () => {
  assert.throws(() => parseEvent([]), /mode/);
  assert.throws(() => parseEvent({ mode: 'x', items: [] }), /Unknown mode "x"/);
  assert.throws(() => parseEvent({ mode: 'classify', items: {} }), /"items" must be an array/);
  assert.throws(() => parseEvent({ mode: 'classify' }), /"items" must be an array/);
  assert.throws(() => parseEvent(null, 'classify'), /Event must be/);
  assert.throws(() => parseEvent('text', 'classify'), /Event must be/);
});

const keywordHandler = (logger = silentLogger) =>
  createHandler({
    config: loadConfig({ PROVIDER: 'keyword' }),
    provider: createKeywordProvider(),
    logger,
    cache: createCache(0),
  });

test('handler returns one result per item for the sample file', async () => {
  const out = await keywordHandler()({ mode: 'classify', items: emails });
  assert.equal(out.length, emails.length);
  assert.ok(Array.isArray(out[0].topics));
  assert.deepEqual(out[3], { id: 4, error: 'empty_input' });
});

test('handler logs a run summary with stats and usage', async () => {
  const lines = [];
  const logger = createLogger('INFO', { write: (l) => lines.push(JSON.parse(l)) });
  await keywordHandler(logger)({ mode: 'summarize', items: emails });
  const summary = lines.find((l) => l.msg === 'run complete');
  assert.ok(summary);
  assert.equal(summary.mode, 'summarize');
  assert.equal(summary.provider, 'keyword');
  assert.equal(summary.total, emails.length);
  assert.equal(summary.requests, 0);
  assert.equal(typeof summary.durationMs, 'number');
});

test('createHandlerFromConfig builds a working handler and fails fast without a Gemini key', async () => {
  const h = createHandlerFromConfig(loadConfig({ PROVIDER: 'keyword' }), silentLogger);
  const out = await h({ mode: 'summarize', items: emails.slice(0, 2) });
  assert.equal(out.length, 2);
  assert.throws(() => createHandlerFromConfig(loadConfig({ PROVIDER: 'gemini' }), silentLogger), /GEMINI_API_KEY/);
});
