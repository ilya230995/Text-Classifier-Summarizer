import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGeminiProvider } from '../app/providers/gemini.js';
import { FatalProviderError } from '../app/providers/errors.js';
import { classify } from '../app/modes/classify.js';
import { silentLogger } from '../app/core/logger.js';

const batch = [
  { index: 0, id: 1, subject: 'Invoice', body: 'Pay.', text: 'Subject: Invoice\nPay.' },
  { index: 1, id: 2, subject: 'Retreat', body: 'Join.', text: 'Subject: Retreat\nJoin.' },
];

const err = (status, message = 'x') => Object.assign(new Error(message), { status });

// Fake @google/genai client: each call consumes the next step (a response or an Error to throw).
const fakeClient = (...steps) => {
  const calls = [];
  return {
    calls,
    models: {
      async generateContent(req) {
        calls.push(req);
        const step = steps[calls.length - 1];
        if (step instanceof Error) throw step;
        return step;
      },
    },
  };
};

const ok = (json, usage = { promptTokenCount: 120, candidatesTokenCount: 30 }) => ({
  text: JSON.stringify(json),
  usageMetadata: usage,
});

const make = (client, sleeps = []) =>
  createGeminiProvider({
    apiKey: 'k',
    model: 'test-model',
    maxRetries: 3,
    logger: silentLogger,
    client,
    sleep: async (ms) => sleeps.push(ms),
    random: () => 0,
  });

test('success maps outputs and usage, and sends the expected request', async () => {
  const c = fakeClient(ok([{ index: 1, topics: ['finance'] }, { index: 2, topics: ['hr'] }]));
  const r = await make(c).complete(classify, batch);
  assert.deepEqual(r.outputs, [{ topics: ['finance'] }, { topics: ['hr'] }]);
  assert.deepEqual(r.usage, { inputTokens: 120, outputTokens: 30 });

  const [req] = c.calls;
  assert.equal(req.model, 'test-model');
  assert.match(req.contents, /\[1\]\nSubject: Invoice/);
  assert.equal(req.config.responseMimeType, 'application/json');
  assert.ok(req.config.responseJsonSchema);
  assert.ok(req.config.systemInstruction.includes('finance'));
  assert.equal(req.config.maxOutputTokens, 130);
  // Newer Gemini models reject sampling overrides, so none are sent.
  assert.equal('temperature' in req.config, false);
});

test('thinking tokens are billed as output tokens', async () => {
  const c = fakeClient(ok([], { promptTokenCount: 100, candidatesTokenCount: 20, thoughtsTokenCount: 15 }));
  const r = await make(c).complete(classify, batch);
  assert.deepEqual(r.usage, { inputTokens: 100, outputTokens: 35 });
});

test('missing usageMetadata counts as zero tokens', async () => {
  const r = await make(fakeClient({ text: '[]' })).complete(classify, batch);
  assert.deepEqual(r.usage, { inputTokens: 0, outputTokens: 0 });
});

test('invalid JSON -> all null outputs, usage still reported', async () => {
  const r = await make(fakeClient({ text: 'not json', usageMetadata: { promptTokenCount: 50 } })).complete(classify, batch);
  assert.deepEqual(r.outputs, [null, null]);
  assert.equal(r.usage.inputTokens, 50);
});

test('empty response text -> all null outputs', async () => {
  const r = await make(fakeClient({ text: undefined })).complete(classify, batch);
  assert.deepEqual(r.outputs, [null, null]);
});

test('429 then success retries once with exponential backoff', async () => {
  const sleeps = [];
  const c = fakeClient(err(429), ok([]));
  await make(c, sleeps).complete(classify, batch);
  assert.equal(c.calls.length, 2);
  assert.deepEqual(sleeps, [1000]);
});

test('429 honours a short retryDelay hint', async () => {
  const sleeps = [];
  const c = fakeClient(err(429, '{"error":{"details":[{"retryDelay": "7s"}]}}'), ok([]));
  await make(c, sleeps).complete(classify, batch);
  assert.deepEqual(sleeps, [7000]);
});

test('5xx then success retries', async () => {
  const c = fakeClient(err(503), ok([]));
  await make(c).complete(classify, batch);
  assert.equal(c.calls.length, 2);
});

test('network error without status is retried', async () => {
  const c = fakeClient(new Error('fetch failed'), ok([]));
  await make(c).complete(classify, batch);
  assert.equal(c.calls.length, 2);
});

test('long retryDelay -> fatal immediately, without sleeping', async () => {
  const sleeps = [];
  const c = fakeClient(err(429, '{"retryDelay": "3600s"}'));
  await assert.rejects(make(c, sleeps).complete(classify, batch), FatalProviderError);
  assert.equal(c.calls.length, 1);
  assert.equal(sleeps.length, 0);
});

test('daily quota 429 -> fatal immediately', async () => {
  const c = fakeClient(err(429, 'Quota exceeded for metric: generate_content_free_tier_requests, GenerateRequestsPerDayPerProjectPerModel'));
  await assert.rejects(make(c).complete(classify, batch), FatalProviderError);
  assert.equal(c.calls.length, 1);
});

test('429 on every attempt -> fatal after maxRetries', async () => {
  const sleeps = [];
  const c = fakeClient(err(429), err(429), err(429), err(429));
  await assert.rejects(make(c, sleeps).complete(classify, batch), FatalProviderError);
  assert.equal(c.calls.length, 4);
  assert.deepEqual(sleeps, [1000, 2000, 4000]);
});

test('5xx on every attempt -> original non-fatal error after maxRetries', async () => {
  const c = fakeClient(err(500), err(500), err(500), err(500));
  await assert.rejects(make(c).complete(classify, batch), (e) => e.status === 500 && !(e instanceof FatalProviderError));
  assert.equal(c.calls.length, 4);
});

test('401/403 -> fatal', async () => {
  await assert.rejects(make(fakeClient(err(403))).complete(classify, batch), FatalProviderError);
  await assert.rejects(make(fakeClient(err(401))).complete(classify, batch), FatalProviderError);
});

test('400 with invalid API key -> fatal', async () => {
  const c = fakeClient(err(400, 'API key not valid. Please pass a valid API key. [reason: API_KEY_INVALID]'));
  await assert.rejects(make(c).complete(classify, batch), FatalProviderError);
});

test('404 unknown model -> fatal', async () => {
  await assert.rejects(make(fakeClient(err(404, 'models/nope is not found'))).complete(classify, batch), FatalProviderError);
});

test('other 400 -> non-fatal error, not retried', async () => {
  const c = fakeClient(err(400, 'Request contains an invalid argument.'));
  await assert.rejects(make(c).complete(classify, batch), (e) => e.status === 400 && !(e instanceof FatalProviderError));
  assert.equal(c.calls.length, 1);
});
