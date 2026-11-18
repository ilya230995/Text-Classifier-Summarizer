import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, GEMINI_DEFAULT_MODEL } from '../app/config.js';

test('loadConfig applies defaults when env is empty', () => {
  const c = loadConfig({});
  assert.equal(c.provider, 'gemini');
  assert.equal(c.geminiApiKey, '');
  assert.equal(c.geminiModel, GEMINI_DEFAULT_MODEL);
  assert.equal(c.batchSize, 20);
  assert.equal(c.maxCharsPerItem, 2000);
  assert.equal(c.maxCharsPerBatch, 12000);
  assert.equal(c.maxRetries, 3);
  assert.equal(c.fallbackToKeyword, false);
  assert.equal(c.logLevel, 'INFO');
  assert.equal(c.cacheMaxEntries, 500);
  assert.equal(c.mode, undefined);
  assert.equal(typeof c.priceInputPer1M, 'number');
  assert.equal(typeof c.priceOutputPer1M, 'number');
});

test('loadConfig reads env overrides', () => {
  const c = loadConfig({
    PROVIDER: 'Keyword',
    GEMINI_API_KEY: 'abc',
    GEMINI_MODEL: 'some-model',
    BATCH_SIZE: '5',
    MAX_RETRIES: '0',
    CACHE_MAX_ENTRIES: '0',
    FALLBACK_TO_KEYWORD: 'true',
    LOG_LEVEL: 'debug',
    MODE: 'summarize',
    PRICE_INPUT_PER_1M: '0.5',
  });
  assert.equal(c.provider, 'keyword');
  assert.equal(c.geminiApiKey, 'abc');
  assert.equal(c.geminiModel, 'some-model');
  assert.equal(c.batchSize, 5);
  assert.equal(c.maxRetries, 0);
  assert.equal(c.cacheMaxEntries, 0);
  assert.equal(c.fallbackToKeyword, true);
  assert.equal(c.logLevel, 'DEBUG');
  assert.equal(c.mode, 'summarize');
  assert.equal(c.priceInputPer1M, 0.5);
});

test('loadConfig treats empty strings as unset', () => {
  const c = loadConfig({ GEMINI_MODEL: '', BATCH_SIZE: '', LOG_LEVEL: '' });
  assert.equal(c.geminiModel, GEMINI_DEFAULT_MODEL);
  assert.equal(c.batchSize, 20);
  assert.equal(c.logLevel, 'INFO');
});

test('loadConfig rejects invalid numbers and names the variable', () => {
  assert.throws(() => loadConfig({ BATCH_SIZE: '0' }), /BATCH_SIZE/);
  assert.throws(() => loadConfig({ MAX_CHARS_PER_ITEM: 'abc' }), /MAX_CHARS_PER_ITEM/);
  assert.throws(() => loadConfig({ MAX_RETRIES: '-1' }), /MAX_RETRIES/);
  assert.throws(() => loadConfig({ BATCH_SIZE: '2.5' }), /BATCH_SIZE/);
  assert.throws(() => loadConfig({ PRICE_OUTPUT_PER_1M: '-3' }), /PRICE_OUTPUT_PER_1M/);
});
