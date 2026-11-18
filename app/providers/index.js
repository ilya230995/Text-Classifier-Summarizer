/**
 * Provider registry. Adding a model backend = one new file in this folder that
 * implements `complete(mode, batch)` (see keyword.js for the interface) plus one
 * entry below. Modes and the processor don't change.
 */

import { createGeminiProvider } from './gemini.js';
import { createKeywordProvider } from './keyword.js';

/** @typedef {import('./keyword.js').Provider} Provider */

const FACTORIES = {
  gemini: (config, { logger }) => {
    // Fail at startup, before any item is processed, rather than per item.
    if (!config.geminiApiKey) {
      throw new Error(
        'GEMINI_API_KEY is not set. Get a free key at https://aistudio.google.com/apikey or run with PROVIDER=keyword.',
      );
    }
    return createGeminiProvider({
      apiKey: config.geminiApiKey,
      model: config.geminiModel,
      maxRetries: config.maxRetries,
      logger,
    });
  },
  keyword: () => createKeywordProvider(),
};

export const PROVIDER_NAMES = Object.keys(FACTORIES);

/**
 * @param {import('../config.js').Config} config
 * @param {{ logger: import('../core/logger.js').Logger }} deps
 * @returns {Provider}
 */
export function createProvider(config, deps) {
  const name = config.provider;
  if (!Object.hasOwn(FACTORIES, name)) {
    throw new Error(`Unknown provider "${name}". Available: ${PROVIDER_NAMES.join(', ')}`);
  }
  return FACTORIES[name](config, deps);
}
