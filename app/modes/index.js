/**
 * Mode registry. Adding a mode = one new file in this folder + one line below.
 */

import { classify } from './classify.js';
import { summarize } from './summarize.js';

/**
 * What a provider needs to call an LLM for one batch.
 * @typedef {{ system: string, user: string, schema: object, maxOutputTokens: number }} LlmRequest
 */

/**
 * A processing mode. Modes own the task logic; providers only execute requests.
 * @typedef {Object} Mode
 * @property {string} name
 * @property {(batch: import('../core/validate.js').WorkItem[]) => LlmRequest} buildRequest
 * @property {(json: unknown, batch: import('../core/validate.js').WorkItem[]) => (object|null)[]} parseResponse
 *   One output per batch item, in batch order; null = unusable, retry it
 * @property {(item: import('../core/validate.js').WorkItem) => object} offline
 *   Model-free result used by the keyword provider
 */

const MODES = { classify, summarize };

export const MODE_NAMES = Object.keys(MODES);

/**
 * @param {string} name
 * @returns {Mode}
 */
export function getMode(name) {
  // hasOwn, not `name in MODES`: "constructor" or "toString" must not resolve.
  if (typeof name !== 'string' || !Object.hasOwn(MODES, name)) {
    throw new Error(`Unknown mode "${name}". Available: ${MODE_NAMES.join(', ')}`);
  }
  return MODES[name];
}
