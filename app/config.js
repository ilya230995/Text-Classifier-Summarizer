/**
 * Central configuration. Every tunable comes from environment variables so the
 * same code runs unchanged locally (via .env) and on AWS Lambda (via function env).
 */

// Cheapest current Gemini model with a free tier (checked against
// ai.google.dev pricing, November 2026). Free-tier availability changes often,
// so it can be overridden with GEMINI_MODEL.
export const GEMINI_DEFAULT_MODEL = 'gemini-3.5-flash-lite';

// Paid-tier list prices (USD per 1M tokens) for the default model; output
// includes thinking tokens. The free tier costs $0; these are only used to report
// what a run *would* cost at scale.
export const DEFAULT_PRICE_INPUT_PER_1M = 0.3;
export const DEFAULT_PRICE_OUTPUT_PER_1M = 2.5;

/**
 * @typedef {Object} Config
 * @property {string} provider            Backend name: 'gemini' | 'keyword'
 * @property {string} geminiApiKey        Empty string when not set
 * @property {string} geminiModel
 * @property {number} batchSize           Max items per model request
 * @property {number} maxCharsPerItem     Longer texts are truncated to bound input tokens
 * @property {number} maxCharsPerBatch    Char budget per request
 * @property {number} maxRetries          Retries for rate-limit / server errors
 * @property {boolean} fallbackToKeyword  Use the offline backend for items the model failed on
 * @property {number} priceInputPer1M
 * @property {number} priceOutputPer1M
 * @property {string} logLevel            'DEBUG' | 'INFO' | 'WARN' | 'ERROR'
 * @property {number} cacheMaxEntries     0 disables the warm-container cache
 * @property {string|undefined} mode      Default mode when the event doesn't name one
 */

/**
 * Builds the config from an env-like object. Takes `env` as a parameter (instead of
 * reading process.env directly) so tests can pass a clean environment.
 * @param {Record<string, string|undefined>} [env]
 * @returns {Config}
 */
export function loadConfig(env = process.env) {
  // Treat empty strings like unset: `.env` files often contain `KEY=` placeholders.
  const get = (name) => {
    const value = env[name];
    return value === undefined || value.trim() === '' ? undefined : value.trim();
  };

  return {
    provider: (get('PROVIDER') ?? 'gemini').toLowerCase(),
    geminiApiKey: get('GEMINI_API_KEY') ?? '',
    geminiModel: get('GEMINI_MODEL') ?? GEMINI_DEFAULT_MODEL,
    batchSize: readInt(get, 'BATCH_SIZE', 20, 1),
    maxCharsPerItem: readInt(get, 'MAX_CHARS_PER_ITEM', 2000, 1),
    maxCharsPerBatch: readInt(get, 'MAX_CHARS_PER_BATCH', 12000, 1),
    maxRetries: readInt(get, 'MAX_RETRIES', 3, 0),
    fallbackToKeyword: ['true', '1', 'yes'].includes((get('FALLBACK_TO_KEYWORD') ?? '').toLowerCase()),
    priceInputPer1M: readNumber(get, 'PRICE_INPUT_PER_1M', DEFAULT_PRICE_INPUT_PER_1M),
    priceOutputPer1M: readNumber(get, 'PRICE_OUTPUT_PER_1M', DEFAULT_PRICE_OUTPUT_PER_1M),
    logLevel: (get('LOG_LEVEL') ?? 'INFO').toUpperCase(),
    cacheMaxEntries: readInt(get, 'CACHE_MAX_ENTRIES', 500, 0),
    mode: get('MODE'),
  };
}

// Fail fast with the variable's name: a typo in Lambda env config should be obvious
// at cold start, not surface later as odd batching behaviour.
function readInt(get, name, fallback, min) {
  const raw = get(name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min) {
    throw new Error(`Invalid ${name}="${raw}": expected an integer >= ${min}`);
  }
  return value;
}

function readNumber(get, name, fallback) {
  const raw = get(name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid ${name}="${raw}": expected a non-negative number`);
  }
  return value;
}
