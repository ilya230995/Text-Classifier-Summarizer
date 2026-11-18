/**
 * Offline provider: runs each mode's model-free logic (`mode.offline`).
 *
 * It needs no API key and costs nothing, which makes it useful three ways:
 * reviewers can run the project without signing up anywhere, tests never touch
 * the network, and it can stand in for the model when the model fails
 * (FALLBACK_TO_KEYWORD). It also shows that providers are interchangeable:
 * the processor calls it exactly like the Gemini provider.
 */

/**
 * @typedef {{ inputTokens: number, outputTokens: number }} TokenUsage
 * @typedef {Object} Provider
 * @property {string} name
 * @property {(mode: import('../modes/index.js').Mode, batch: import('../core/validate.js').WorkItem[])
 *   => Promise<{ outputs: (object|null)[], usage: TokenUsage|null }>} complete
 *   One output per batch item, in order; null = no usable result for that item.
 *   `usage` is null when no billable request was made.
 */

/** @returns {Provider} */
export function createKeywordProvider() {
  return {
    name: 'keyword',

    async complete(mode, batch) {
      const outputs = batch.map((item) => {
        // Same contract as the model path: one bad item becomes null, never a failed batch.
        try {
          return mode.offline(item);
        } catch {
          return null;
        }
      });
      return { outputs, usage: null };
    },
  };
}
