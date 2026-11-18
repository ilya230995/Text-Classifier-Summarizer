/**
 * Input validation and normalization.
 *
 * Runs before any model call, so empty or malformed items cost nothing and can
 * never break a batch. Validation never throws: every outcome is a value the
 * processor can put straight into the output.
 */

import { createHash } from 'node:crypto';

/**
 * A validated, normalized item ready to be sent to a provider.
 * @typedef {Object} WorkItem
 * @property {number} index           Position in the original input (keeps output order stable)
 * @property {string|number} id
 * @property {string} subject         Whitespace-collapsed subject ('' if missing)
 * @property {string} body            Whitespace-collapsed body ('' if missing)
 * @property {string} text            What the model sees: "Subject: ...\n<body>", truncated
 * @property {string} key             sha256 of `text`; used for dedupe and caching
 * @property {boolean} truncated
 */

/**
 * @typedef {{ ok: true, item: WorkItem }
 *   | { ok: false, result: { id: string|number|null, error: string, index?: number }, reason: string }} ValidationResult
 */

/**
 * @param {unknown} raw     One element of the input array
 * @param {number} index    Its position in the input array
 * @param {{ maxCharsPerItem: number }} options
 * @returns {ValidationResult}
 */
export function validateItem(raw, index, { maxCharsPerItem }) {
  if (!isPlainObject(raw)) {
    return invalidWithoutId(index, 'item is not an object');
  }
  if (!isValidId(raw.id)) {
    // Without a usable id the caller couldn't match the result, so report the index.
    return invalidWithoutId(index, 'missing or invalid id');
  }

  const { id } = raw;
  for (const field of ['subject', 'body']) {
    const value = raw[field];
    if (value !== undefined && value !== null && typeof value !== 'string') {
      return { ok: false, result: { id, error: 'invalid_input' }, reason: `${field} must be a string` };
    }
  }

  const subject = collapse(raw.subject);
  const body = collapse(raw.body);
  if (!subject && !body) {
    return { ok: false, result: { id, error: 'empty_input' }, reason: 'subject and body are empty' };
  }

  // Labelling the subject helps the model weigh it, and costs only a couple of tokens.
  const full = subject ? (body ? `Subject: ${subject}\n${body}` : `Subject: ${subject}`) : body;
  const text = truncate(full, maxCharsPerItem);

  return {
    ok: true,
    item: {
      index,
      id,
      subject,
      body,
      text,
      key: createHash('sha256').update(text).digest('hex'),
      truncated: text.length < full.length,
    },
  };
}

function invalidWithoutId(index, reason) {
  return { ok: false, result: { id: null, index, error: 'invalid_input' }, reason };
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// 0 is a perfectly valid id, so check types rather than truthiness.
function isValidId(id) {
  if (typeof id === 'number') return Number.isFinite(id);
  if (typeof id === 'string') return id.trim() !== '';
  return false;
}

// Email bodies are full of line breaks and indentation that carry no meaning
// for classification but still cost tokens.
function collapse(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function truncate(text, max) {
  if (text.length <= max) return text;
  let cut = text.slice(0, max);
  // Don't leave half of a surrogate pair (e.g. an emoji) at the end.
  const last = cut.charCodeAt(cut.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1);
  return cut;
}
