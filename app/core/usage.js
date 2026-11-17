/**
 * Token usage and cost tracking for one run.
 *
 * The free tier costs nothing, but reporting what the same run would cost on
 * the paid tier makes the effect of batching, deduplication and caching visible
 * and shows how cost scales.
 */

/**
 * @typedef {{ requests: number, inputTokens: number, outputTokens: number, estimatedPaidCostUsd: number }} UsageSummary
 */

/**
 * @param {{ priceInputPer1M: number, priceOutputPer1M: number }} prices  USD per 1M tokens
 * @returns {{ add(usage: { inputTokens?: number, outputTokens?: number }): void, summary(): UsageSummary }}
 */
export function createUsageTracker({ priceInputPer1M, priceOutputPer1M }) {
  let requests = 0;
  let inputTokens = 0;
  let outputTokens = 0;

  return {
    // Called once per model request.
    add(usage) {
      requests += 1;
      inputTokens += usage.inputTokens ?? 0;
      outputTokens += usage.outputTokens ?? 0;
    },
    summary() {
      const estimatedPaidCostUsd =
        (inputTokens / 1_000_000) * priceInputPer1M + (outputTokens / 1_000_000) * priceOutputPer1M;
      return { requests, inputTokens, outputTokens, estimatedPaidCostUsd };
    },
  };
}
