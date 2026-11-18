import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateItem } from '../app/core/validate.js';

const opts = { maxCharsPerItem: 2000 };

test('normalizes a valid item into a WorkItem', () => {
  const r = validateItem(
    { id: 1, subject: 'Invoice #1234 overdue', body: '  Dear   customer,\n please pay. ' },
    0,
    opts,
  );
  assert.equal(r.ok, true);
  assert.equal(r.item.text, 'Subject: Invoice #1234 overdue\nDear customer, please pay.');
  assert.equal(r.item.id, 1);
  assert.equal(r.item.index, 0);
  assert.equal(r.item.subject, 'Invoice #1234 overdue');
  assert.equal(r.item.body, 'Dear customer, please pay.');
  assert.equal(r.item.truncated, false);
  assert.match(r.item.key, /^[0-9a-f]{64}$/);
});

test('body-only and subject-only items', () => {
  assert.equal(validateItem({ id: 1, body: 'Just a body.' }, 0, opts).item.text, 'Just a body.');
  assert.equal(validateItem({ id: 2, subject: 'Only subject' }, 0, opts).item.text, 'Subject: Only subject');
});

test('empty subject and whitespace body -> empty_input', () => {
  const r = validateItem({ id: 4, subject: '', body: '  ' }, 3, opts);
  assert.equal(r.ok, false);
  assert.deepEqual(r.result, { id: 4, error: 'empty_input' });
  assert.equal(typeof r.reason, 'string');
});

test('missing subject and body -> empty_input', () => {
  assert.deepEqual(validateItem({ id: 5 }, 0, opts).result, { id: 5, error: 'empty_input' });
});

test('id 0 and string ids are valid', () => {
  assert.equal(validateItem({ id: 0, body: 'hi' }, 0, opts).ok, true);
  assert.equal(validateItem({ id: 0, body: 'hi' }, 0, opts).item.id, 0);
  assert.equal(validateItem({ id: 'abc', body: 'hi' }, 0, opts).ok, true);
});

test('bad ids -> invalid_input with id null and the index', () => {
  for (const id of [undefined, '', '   ', null, NaN, Infinity, {}, [], true]) {
    assert.deepEqual(
      validateItem({ id, body: 'hi' }, 2, opts).result,
      { id: null, index: 2, error: 'invalid_input' },
      `id=${String(id)}`,
    );
  }
});

test('non-object items -> invalid_input', () => {
  for (const raw of [null, undefined, 'str', 42, [], [1, 2]]) {
    assert.deepEqual(validateItem(raw, 1, opts).result, { id: null, index: 1, error: 'invalid_input' });
  }
});

test('non-string subject or body -> invalid_input keeping the id', () => {
  assert.deepEqual(validateItem({ id: 1, body: 123 }, 0, opts).result, { id: 1, error: 'invalid_input' });
  assert.deepEqual(validateItem({ id: 1, subject: { a: 1 }, body: 'x' }, 0, opts).result, {
    id: 1,
    error: 'invalid_input',
  });
});

test('null subject or body is treated as missing', () => {
  assert.equal(validateItem({ id: 1, subject: null, body: 'hello' }, 0, opts).item.text, 'hello');
});

test('truncates long text to maxCharsPerItem', () => {
  const r = validateItem({ id: 1, body: 'a'.repeat(5000) }, 0, { maxCharsPerItem: 100 });
  assert.equal(r.item.text.length, 100);
  assert.equal(r.item.truncated, true);
});

test('truncation does not split a surrogate pair', () => {
  // 99 ASCII chars + emoji (2 UTF-16 units): a naive slice(0, 100) would leave half an emoji.
  const r = validateItem({ id: 1, body: `${'a'.repeat(99)}😀tail` }, 0, { maxCharsPerItem: 100 });
  assert.equal(r.item.text, 'a'.repeat(99));
  assert.equal(r.item.truncated, true);
});

test('identical normalized text -> identical key; different text -> different key', () => {
  const a = validateItem({ id: 1, body: 'x  y' }, 0, opts);
  const b = validateItem({ id: 2, body: 'x y' }, 1, opts);
  const c = validateItem({ id: 3, body: 'x z' }, 2, opts);
  assert.equal(a.item.key, b.item.key);
  assert.notEqual(a.item.key, c.item.key);
});
