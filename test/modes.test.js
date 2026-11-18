import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getMode, MODE_NAMES } from '../app/modes/index.js';

test('getMode returns registered modes', () => {
  assert.equal(getMode('classify').name, 'classify');
  assert.equal(getMode('summarize').name, 'summarize');
  assert.deepEqual(MODE_NAMES, ['classify', 'summarize']);
});

test('getMode rejects unknown names, including Object prototype keys', () => {
  assert.throws(() => getMode('translate'), /Unknown mode "translate". Available: classify, summarize/);
  assert.throws(() => getMode('constructor'), /Unknown mode/);
  assert.throws(() => getMode(undefined), /Unknown mode/);
});

test('every mode implements the Mode interface', () => {
  for (const name of MODE_NAMES) {
    const mode = getMode(name);
    for (const fn of ['buildRequest', 'parseResponse', 'offline']) {
      assert.equal(typeof mode[fn], 'function', `${name}.${fn}`);
    }
  }
});
