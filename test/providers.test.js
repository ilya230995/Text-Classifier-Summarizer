import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProvider, PROVIDER_NAMES } from '../app/providers/index.js';
import { silentLogger } from '../app/core/logger.js';

const base = { geminiModel: 'm', maxRetries: 3 };

test('registry creates the keyword provider', () => {
  assert.equal(createProvider({ ...base, provider: 'keyword' }, { logger: silentLogger }).name, 'keyword');
});

test('registry creates the gemini provider when a key is set', () => {
  assert.equal(createProvider({ ...base, provider: 'gemini', geminiApiKey: 'k' }, { logger: silentLogger }).name, 'gemini');
});

test('gemini without a key fails fast with guidance', () => {
  assert.throws(
    () => createProvider({ ...base, provider: 'gemini', geminiApiKey: '' }, { logger: silentLogger }),
    /GEMINI_API_KEY.*PROVIDER=keyword/s,
  );
});

test('unknown provider lists the available ones', () => {
  assert.throws(
    () => createProvider({ ...base, provider: 'foo' }, { logger: silentLogger }),
    /Unknown provider "foo". Available: gemini, keyword/,
  );
  assert.throws(() => createProvider({ ...base, provider: 'constructor' }, { logger: silentLogger }), /Unknown provider/);
  assert.deepEqual(PROVIDER_NAMES, ['gemini', 'keyword']);
});
