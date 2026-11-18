/**
 * Groups work items into model requests.
 *
 * One request per batch instead of one per email is the single biggest cost
 * lever: the instructions are sent once per batch rather than once per email,
 * and the free tier limits requests per minute and per day far more tightly
 * than it limits tokens.
 */

/** @typedef {import('./validate.js').WorkItem} WorkItem */

/**
 * Greedy, order-preserving split by item count and character budget.
 * An item larger than the whole budget still gets its own batch rather than
 * being dropped; it was already truncated by validation.
 *
 * @param {WorkItem[]} items
 * @param {{ batchSize: number, maxCharsPerBatch: number }} limits
 * @returns {WorkItem[][]}
 */
export function makeBatches(items, { batchSize, maxCharsPerBatch }) {
  const batches = [];
  let current = [];
  let chars = 0;

  for (const item of items) {
    const len = item.text.length;
    const full = current.length >= batchSize || chars + len > maxCharsPerBatch;
    if (current.length > 0 && full) {
      batches.push(current);
      current = [];
      chars = 0;
    }
    current.push(item);
    chars += len;
  }
  if (current.length > 0) batches.push(current);

  return batches;
}
