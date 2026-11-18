import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize, capSentences } from '../app/modes/summarize.js';

const batch = [
  {
    index: 0,
    id: 1,
    subject: 'Invoice #1234 overdue',
    body: 'Please pay the outstanding invoice by Friday.',
    text: 'Subject: Invoice #1234 overdue\nPlease pay the outstanding invoice by Friday.',
  },
  { index: 1, id: 2, subject: 'Weekly engineering sync', body: 'Agenda: deploy review.', text: 'Subject: Weekly engineering sync\nAgenda: deploy review.' },
];

test('capSentences keeps the first n sentences', () => {
  assert.equal(capSentences('One. Two! Three?'), 'One. Two!');
  assert.equal(capSentences('One. Two. Three.', 1), 'One.');
  assert.equal(capSentences('No terminal punctuation'), 'No terminal punctuation');
  assert.equal(capSentences('Budget is $1.5M this year. Approved. Extra.'), 'Budget is $1.5M this year. Approved.');
});

test('buildRequest numbers items, requests a summary field and sizes output', () => {
  const r = summarize.buildRequest(batch);
  assert.match(r.user, /\[1\]\nSubject: Invoice/);
  assert.match(r.user, /\[2\]\nSubject: Weekly/);
  assert.deepEqual(r.schema.items.required, ['index', 'summary']);
  assert.match(r.system, /1.2 sentences/);
  assert.match(r.system, /English/);
  assert.equal(r.maxOutputTokens, 230);
});

test('parseResponse caps sentences and rejects empty summaries', () => {
  assert.deepEqual(
    summarize.parseResponse(
      [
        { index: 1, summary: 'A. B. C.' },
        { index: 2, summary: '  ' },
      ],
      batch,
    ),
    [{ summary: 'A. B.' }, null],
  );
  assert.deepEqual(summarize.parseResponse([{ index: 2, summary: 42 }], batch), [null, null]);
});

test('offline summarize: subject plus first sentence of body', () => {
  assert.equal(
    summarize.offline(batch[0]).summary,
    'Invoice #1234 overdue: Please pay the outstanding invoice by Friday.',
  );
});

test('offline summarize skips a greeting and capitalizes', () => {
  const item = { subject: 'Deploy moved', body: 'Hi team, the deploy is moved to Friday. Thanks.' };
  assert.equal(summarize.offline(item).summary, 'Deploy moved: The deploy is moved to Friday.');
});

test('offline summarize without subject uses up to 2 body sentences', () => {
  const item = { subject: '', body: 'First point. Second point. Third point.' };
  assert.equal(summarize.offline(item).summary, 'First point. Second point.');
});

test('offline summarize with subject only', () => {
  assert.equal(summarize.offline({ subject: 'Only subject', body: '' }).summary, 'Only subject');
});

test('offline summarize caps length at 40 words', () => {
  const item = { subject: '', body: `${'word '.repeat(100).trim()}.` };
  const words = summarize.offline(item).summary.split(/\s+/);
  assert.ok(words.length <= 40);
});
