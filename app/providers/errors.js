/**
 * Error types shared by providers.
 */

/**
 * Thrown when calling the provider again cannot help for the rest of the run:
 * an invalid API key, or an exhausted quota. The processor reacts by making no
 * further calls (instead of splitting and retrying, which would just burn more
 * quota) and marking the remaining items `model_error`.
 *
 * Any other error is treated as transient and handled by splitting the batch.
 */
export class FatalProviderError extends Error {
  /**
   * @param {string} message
   * @param {{ cause?: unknown }} [options]
   */
  constructor(message, options) {
    super(message, options);
    this.name = 'FatalProviderError';
  }
}
