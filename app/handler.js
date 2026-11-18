/**
 * AWS Lambda entry point (handler: app/handler.handler).
 *
 * Event:  { "mode": "classify" | "summarize", "items": [{ id, subject, body }, ...] }
 *         or a bare array of items, with the mode taken from the MODE env var.
 * Result: an array with one entry per item, in input order:
 *         { id, topics } | { id, summary } | { id, error }
 */

import { loadConfig } from './config.js';
import { createLogger } from './core/logger.js';
import { createCache } from './core/cache.js';
import { createUsageTracker } from './core/usage.js';
import { processItems } from './core/processor.js';
import { getMode } from './modes/index.js';
import { createProvider } from './providers/index.js';
import { createKeywordProvider } from './providers/keyword.js';

/**
 * Turns the raw event into a mode and an item list. Problems here concern the
 * whole request (not a single item), so they throw.
 * @param {unknown} event
 * @param {string} [defaultMode]
 * @returns {{ mode: import('./modes/index.js').Mode, items: unknown[] }}
 */
export function parseEvent(event, defaultMode) {
  let mode;
  let items;
  if (Array.isArray(event)) {
    items = event;
    mode = defaultMode;
  } else if (typeof event === 'object' && event !== null) {
    ({ mode = defaultMode, items } = /** @type {{ mode?: string, items?: unknown }} */ (event));
  } else {
    throw new Error('Event must be { mode, items } or an array of items');
  }

  if (!mode) throw new Error('Missing "mode": pass { mode, items } or set the MODE env var');
  if (!Array.isArray(items)) throw new Error('"items" must be an array');
  return { mode: getMode(mode), items };
}

/**
 * Builds a handler from explicit dependencies (used by tests and run.js).
 * @param {Object} deps
 * @param {import('./config.js').Config} deps.config
 * @param {import('./providers/keyword.js').Provider} deps.provider
 * @param {import('./providers/keyword.js').Provider} [deps.fallbackProvider]
 * @param {import('./core/logger.js').Logger} deps.logger
 * @param {ReturnType<typeof createCache>} deps.cache
 * @returns {(event: unknown) => Promise<object[]>}
 */
export function createHandler({ config, provider, fallbackProvider, logger, cache }) {
  return async (event) => {
    const started = Date.now();
    const { mode, items } = parseEvent(event, config.mode);
    // Usage is per invocation; the cache and provider are reused across warm invocations.
    const usage = createUsageTracker(config);

    const { results, stats } = await processItems({
      mode,
      items,
      provider,
      config,
      logger,
      usage,
      cache,
      fallbackProvider,
    });

    const { estimatedPaidCostUsd, ...tokens } = usage.summary();
    logger.info('run complete', {
      mode: mode.name,
      provider: provider.name,
      ...(provider.name === 'gemini' && { model: config.geminiModel }),
      ...stats,
      ...tokens,
      estimatedPaidCostUsd: Number(estimatedPaidCostUsd.toFixed(6)),
      durationMs: Date.now() - started,
    });
    return results;
  };
}

/**
 * Wires real dependencies from config. Throws at startup on a bad setup
 * (e.g. PROVIDER=gemini without a key) so it is never discovered per item.
 * @param {import('./config.js').Config} config
 * @param {import('./core/logger.js').Logger} logger
 */
export function createHandlerFromConfig(config, logger) {
  const provider = createProvider(config, { logger });
  const fallbackProvider =
    config.fallbackToKeyword && provider.name !== 'keyword' ? createKeywordProvider() : undefined;
  return createHandler({ config, provider, fallbackProvider, logger, cache: createCache(config.cacheMaxEntries) });
}

// Built once per container (lazily, on the first invocation) so warm invocations
// reuse the SDK client and the result cache.
let warmHandler;

/** Lambda entry point. */
export async function handler(event) {
  if (!warmHandler) {
    const config = loadConfig();
    warmHandler = createHandlerFromConfig(config, createLogger(config.logLevel));
  }
  return warmHandler(event);
}
