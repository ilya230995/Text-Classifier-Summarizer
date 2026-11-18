import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUsageTracker } from '../app/core/usage.js';

test('accumulates requests, tokens and estimated paid-tier cost', () => {
  const u = createUsageTracker({ priceInputPer1M: 0.1, priceOutputPer1M: 0.4 });
  u.add({ inputTokens: 1000, outputTokens: 200 });
  u.add({ inputTokens: 1000, outputTokens: 200 });
  const s = u.summary();
  assert.equal(s.requests, 2);
  assert.equal(s.inputTokens, 2000);
  assert.equal(s.outputTokens, 400);
  assert.ok(Math.abs(s.estimatedPaidCostUsd - 0.00036) < 1e-12);
});

test('starts at zero', () => {
  assert.deepEqual(createUsageTracker({ priceInputPer1M: 1, priceOutputPer1M: 1 }).summary(), {
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    estimatedPaidCostUsd: 0,
  });
});

test('missing token counts are treated as 0 but the request still counts', () => {
  const u = createUsageTracker({ priceInputPer1M: 1, priceOutputPer1M: 1 });
  u.add({});
  const s = u.summary();
  assert.equal(s.requests, 1);
  assert.equal(s.inputTokens, 0);
  assert.equal(s.outputTokens, 0);
});
