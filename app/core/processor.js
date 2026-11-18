/**
 * Orchestrates one run: validate → cache → dedupe → batch → provider → retry/split
 * → (optional) fallback → results in input order.
 *
 * This is the only place that knows the whole flow. Modes and providers stay
 * small and swappable, and nothing here depends on which ones are used.
 */

import { validateItem } from './validate.js';
import { makeBatches } from './batcher.js';
import { FatalProviderError } from '../providers/errors.js';

/** @typedef {import('./validate.js').WorkItem} WorkItem */

/**
 * @typedef {Object} RunStats
 * @property {number} total        Items received
 * @property {number} ok           Items with a result
 * @property {Record<string, number>} errors  Count per error code
 * @property {number} duplicates   Items answered by copying an identical text's result
 * @property {number} cacheHits    Items answered from the warm-container cache
 * @property {number} fallbacks    Items answered by the fallback provider
 */

/**
 * @param {Object} args
 * @param {import('../modes/index.js').Mode} args.mode
 * @param {unknown[]} args.items
 * @param {import('../providers/keyword.js').Provider} args.provider
 * @param {{ batchSize: number, maxCharsPerItem: number, maxCharsPerBatch: number }} args.config
 * @param {import('./logger.js').Logger} args.logger
 * @param {ReturnType<import('./usage.js').createUsageTracker>} args.usage
 * @param {ReturnType<import('./cache.js').createCache>} args.cache
 * @param {import('../providers/keyword.js').Provider} [args.fallbackProvider]
 * @returns {Promise<{ results: object[], stats: RunStats }>}
 */
export async function processItems({ mode, items, provider, config, logger, usage, cache, fallbackProvider }) {
  const results = new Array(items.length);
  const stats = { total: items.length, ok: 0, errors: {}, duplicates: 0, cacheHits: 0, fallbacks: 0 };
  const cacheKey = (item) => `${mode.name}:${item.key}`;

  // 1. Validate, answer from cache, and group identical texts. Only the first item
  //    of each group is sent; the others ("followers") copy its result.
  /** @type {Map<string, { item: WorkItem, followers: WorkItem[] }>} */
  const groups = new Map();
  items.forEach((raw, index) => {
    const checked = validateItem(raw, index, config);
    if (!checked.ok) {
      results[index] = checked.result;
      logger.warn('Skipping invalid item', { ...checked.result, index, reason: checked.reason });
      return;
    }
    const { item } = checked;
    if (item.truncated) {
      logger.debug('Item text truncated', { id: item.id, index, maxCharsPerItem: config.maxCharsPerItem });
    }

    const cached = cache.get(cacheKey(item));
    if (cached) {
      results[index] = { id: item.id, ...cached };
      stats.cacheHits += 1;
      return;
    }

    const group = groups.get(item.key);
    if (group) {
      group.followers.push(item);
      stats.duplicates += 1;
    } else {
      groups.set(item.key, { item, followers: [] });
    }
  });

  // 2. Send unique items in batches, sequentially: parallel requests would only
  //    hit the free tier's per-minute limit sooner.
  /** @type {Map<string, object>} text key -> output */
  const outputs = new Map();
  let stopped = false;

  const resolve = async (batch) => {
    if (stopped || batch.length === 0) return;

    let response;
    try {
      response = await provider.complete(mode, batch);
    } catch (error) {
      if (error instanceof FatalProviderError) {
        stopped = true;
        logger.error('Provider unavailable; no further calls this run', { provider: provider.name, error });
        return;
      }
      logger.warn('Batch request failed', { provider: provider.name, batchSize: batch.length, error });
      response = { outputs: [], usage: null };
    }
    if (response.usage) usage.add(response.usage);

    const failed = batch.filter((item, i) => {
      const output = response.outputs[i] ?? null;
      if (output) outputs.set(item.key, output);
      return !output;
    });

    // Retry only what failed, in halves. This isolates a problem item (or a
    // too-long batch) in O(log n) extra calls instead of failing everything.
    // A single item that fails again is given up on.
    if (failed.length === 0 || batch.length === 1) return;
    const middle = Math.ceil(failed.length / 2);
    await resolve(failed.slice(0, middle));
    await resolve(failed.slice(middle));
  };

  const unique = [...groups.values()].map((g) => g.item);
  for (const batch of makeBatches(unique, config)) {
    await resolve(batch);
  }

  // 3. Optional fallback for whatever the main provider couldn't answer.
  //    Its results are not cached, so a later warm invocation retries the model.
  const fromFallback = new Set();
  const unresolved = unique.filter((item) => !outputs.has(item.key));
  if (fallbackProvider && unresolved.length > 0) {
    try {
      const fallback = await fallbackProvider.complete(mode, unresolved);
      unresolved.forEach((item, i) => {
        const output = fallback.outputs[i];
        if (output) {
          outputs.set(item.key, output);
          fromFallback.add(item.key);
        }
      });
      logger.warn('Used fallback provider for failed items', {
        provider: fallbackProvider.name,
        items: fromFallback.size,
      });
    } catch (error) {
      logger.error('Fallback provider failed', { provider: fallbackProvider.name, error });
    }
  }

  // 4. Write results back in input order and cache fresh model answers.
  for (const { item, followers } of groups.values()) {
    const output = outputs.get(item.key);
    if (output && !fromFallback.has(item.key)) cache.set(cacheKey(item), output);
    for (const member of [item, ...followers]) {
      results[member.index] = output ? { id: member.id, ...output } : { id: member.id, error: 'model_error' };
      if (output && fromFallback.has(item.key)) stats.fallbacks += 1;
    }
  }

  const failedIds = [];
  for (const result of results) {
    if (result.error) {
      stats.errors[result.error] = (stats.errors[result.error] ?? 0) + 1;
      if (result.error === 'model_error') failedIds.push(result.id);
    } else {
      stats.ok += 1;
    }
  }
  if (failedIds.length > 0) {
    logger.warn('Items without a model result', { error: 'model_error', ids: failedIds });
  }

  return { results, stats };
}
