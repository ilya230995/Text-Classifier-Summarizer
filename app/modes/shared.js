/**
 * Helpers shared by modes: rendering a batch for the model and mapping the
 * model's JSON answer back onto the batch.
 */

/** @typedef {import('../core/validate.js').WorkItem} WorkItem */

/**
 * Renders a batch as numbered blocks. 1-based numbers are what models handle
 * most reliably, and they let one request carry many emails.
 * @param {WorkItem[]} batch
 */
export function renderBatch(batch) {
  return batch.map((item, i) => `[${i + 1}]\n${item.text}`).join('\n\n');
}

/**
 * Maps a model response (expected: array of `{ index, ... }`) onto the batch.
 *
 * Anything unusable becomes null instead of throwing: the processor retries
 * null slots in smaller batches, so one malformed entry never fails the rest.
 *
 * @param {unknown} json
 * @param {number} size                        Batch length
 * @param {(entry: Record<string, unknown>) => object|null} extract  Mode-specific value parser
 * @returns {(object|null)[]}
 */
export function alignByIndex(json, size, extract) {
  const outputs = new Array(size).fill(null);
  if (!Array.isArray(json)) return outputs;

  for (const entry of json) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { index } = entry;
    if (!Number.isInteger(index) || index < 1 || index > size) continue;
    // First valid answer for an index wins; a duplicate can't overwrite it.
    if (outputs[index - 1] !== null) continue;
    outputs[index - 1] = extract(entry);
  }
  return outputs;
}
