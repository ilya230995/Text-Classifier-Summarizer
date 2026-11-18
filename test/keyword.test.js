import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createKeywordProvider } from '../app/providers/keyword.js';
import { FatalProviderError } from '../app/providers/errors.js';
import { classify } from '../app/modes/classify.js';
import { summarize } from '../app/modes/summarize.js';

const batch = [
  { index: 0, id: 1, subject: 'Invoice #1234 overdue', body: 'Please pay the outstanding invoice by Friday.' },
  { index: 1, id: 2, subject: 'Weekly engineering sync', body: 'Agenda: deploy review and database migration.' },
];

test('keyword provider classifies a batch offline with no usage', async () => {
  const provider = createKeywordProvider();
  assert.equal(provider.name, 'keyword');
  const { outputs, usage } = await provider.complete(classify, batch);
  assert.equal(outputs.length, 2);
  assert.ok(outputs[0].topics.includes('finance'));
  assert.ok(outputs[1].topics.includes('technical'));
  assert.equal(usage, null);
});

test('keyword provider summarizes a batch offline', async () => {
  const { outputs } = await createKeywordProvider().complete(summarize, batch);
  assert.equal(outputs[0].summary, 'Invoice #1234 overdue: Please pay the outstanding invoice by Friday.');
});

test('a mode failing on one item yields null for that item only', async () => {
  const flaky = {
    name: 'flaky',
    offline: (item) => {
      if (item.id === 2) throw new Error('boom');
      return { ok: true };
    },
  };
  const { outputs } = await createKeywordProvider().complete(flaky, batch);
  assert.deepEqual(outputs, [{ ok: true }, null]);
});

test('empty batch -> empty outputs', async () => {
  const { outputs } = await createKeywordProvider().complete(classify, []);
  assert.deepEqual(outputs, []);
});

test('FatalProviderError is an Error with its own name and optional cause', () => {
  const cause = new Error('403');
  const err = new FatalProviderError('bad key', { cause });
  assert.ok(err instanceof Error);
  assert.ok(err instanceof FatalProviderError);
  assert.equal(err.name, 'FatalProviderError');
  assert.equal(err.message, 'bad key');
  assert.equal(err.cause, cause);
});
