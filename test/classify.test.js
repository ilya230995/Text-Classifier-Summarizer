import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, filterTopics } from '../app/modes/classify.js';
import { TOPICS } from '../app/topics.js';

const batch = [
  {
    index: 0,
    id: 1,
    subject: 'Invoice #1234 overdue',
    body: 'Please pay the outstanding invoice by Friday.',
    text: 'Subject: Invoice #1234 overdue\nPlease pay the outstanding invoice by Friday.',
  },
  {
    index: 1,
    id: 3,
    subject: 'Company retreat announcement',
    body: 'We invite all employees to the retreat. Share it on our social channels.',
    text: 'Subject: Company retreat announcement\nWe invite all employees to the retreat. Share it on our social channels.',
  },
];

test('buildRequest numbers items and constrains topics to the list', () => {
  const r = classify.buildRequest(batch);
  assert.match(r.user, /\[1\]\nSubject: Invoice/);
  assert.match(r.user, /\[2\]\nSubject: Company/);
  assert.deepEqual(r.schema.items.properties.topics.items.enum, TOPICS);
  assert.deepEqual(r.schema.items.required, ['index', 'topics']);
  for (const t of TOPICS) assert.ok(r.system.includes(t), `system prompt mentions ${t}`);
  assert.equal(r.maxOutputTokens, 130);
});

test('parseResponse normalizes, filters and reorders by index', () => {
  assert.deepEqual(
    classify.parseResponse(
      [
        { index: 2, topics: ['HR', ' marketing ', 'unknown'] },
        { index: 1, topics: ['finance'] },
      ],
      batch,
    ),
    [{ topics: ['finance'] }, { topics: ['hr', 'marketing'] }],
  );
});

test('filterTopics: unknown-only -> other, max 3, dedupe, non-array -> null', () => {
  assert.deepEqual(filterTopics(['spam']), ['other']);
  assert.deepEqual(filterTopics([]), ['other']);
  assert.equal(filterTopics(['finance', 'hr', 'legal', 'sales']).length, 3);
  assert.deepEqual(filterTopics(['hr', 'HR', 'hr ']), ['hr']);
  assert.deepEqual(filterTopics(['finance', 42, null]), ['finance']);
  assert.equal(filterTopics('finance'), null);
  assert.equal(filterTopics(undefined), null);
});

test('filterTopics drops "other" when a real topic is present', () => {
  assert.deepEqual(filterTopics(['other', 'finance']), ['finance']);
});

test('parseResponse: out-of-range, missing, duplicate indexes and bad shapes -> null', () => {
  assert.deepEqual(classify.parseResponse([{ index: 5, topics: ['hr'] }, { topics: ['hr'] }], batch), [null, null]);
  assert.deepEqual(classify.parseResponse({ oops: true }, batch), [null, null]);
  assert.deepEqual(classify.parseResponse(null, batch), [null, null]);
  assert.deepEqual(
    classify.parseResponse([{ index: 1, topics: ['hr'] }, { index: 1, topics: ['legal'] }], batch),
    [{ topics: ['hr'] }, null],
  );
  assert.deepEqual(classify.parseResponse([{ index: 1, topics: 'hr' }, 'junk'], batch), [null, null]);
  assert.deepEqual(classify.parseResponse([{ index: '1', topics: ['hr'] }], batch), [null, null]);
});

test('offline classify scores keywords', () => {
  assert.ok(classify.offline(batch[0]).topics.includes('finance'));
  assert.ok(classify.offline(batch[1]).topics.includes('hr'));
  assert.deepEqual(classify.offline({ subject: 'zzz', body: 'qqq', text: 'Subject: zzz\nqqq' }), { topics: ['other'] });
});

test('offline classify returns at most 3 known topics', () => {
  const item = {
    subject: 'Invoice, contract, deploy, campaign, ticket, interview',
    body: 'invoice contract deploy campaign ticket interview deal',
  };
  const { topics } = classify.offline(item);
  assert.ok(topics.length >= 1 && topics.length <= 3);
  assert.ok(topics.every((t) => TOPICS.includes(t)));
});
