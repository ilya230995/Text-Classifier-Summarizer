/**
 * Google Gemini provider (official @google/genai SDK).
 *
 * Sends one request per batch with a JSON response schema, so answers come back
 * as structured data rather than prose. Rate limits and server errors are
 * retried with backoff; errors that retrying can't fix (bad key, unknown model,
 * exhausted daily quota) become FatalProviderError so the run stops spending
 * requests on them.
 */

import { GoogleGenAI } from '@google/genai';
import { FatalProviderError } from './errors.js';

/** @typedef {import('./keyword.js').Provider} Provider */

// Waiting longer than this inside a Lambda invocation is worse than failing the
// remaining items: a long hint means the per-day quota is gone, not a burst limit.
const MAX_RETRY_WAIT_MS = 60_000;
const BASE_BACKOFF_MS = 1000;
const MAX_JITTER_MS = 250;

/**
 * @param {Object} options
 * @param {string} options.apiKey
 * @param {string} options.model
 * @param {number} options.maxRetries
 * @param {import('../core/logger.js').Logger} options.logger
 * @param {{ models: { generateContent(req: object): Promise<any> } }} [options.client]  Injected in tests
 * @param {(ms: number) => Promise<void>} [options.sleep]                               Injected in tests
 * @param {() => number} [options.random]                                               Injected in tests
 * @returns {Provider}
 */
export function createGeminiProvider({
  apiKey,
  model,
  maxRetries,
  logger,
  client = new GoogleGenAI({ apiKey }),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  random = Math.random,
}) {
  async function callWithRetry(request) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await client.models.generateContent(request);
      } catch (error) {
        const fatal = toFatal(error);
        if (fatal) throw fatal;

        const status = error?.status;
        // No status = network-level failure (reset, timeout), worth another try.
        const retryable = status === undefined || status === 429 || (status >= 500 && status < 600);
        if (!retryable) throw error;

        if (attempt >= maxRetries) {
          // A rate limit that outlasts every retry won't clear within this run.
          if (status === 429) {
            throw new FatalProviderError('Gemini rate limit persisted after retries', { cause: error });
          }
          throw error;
        }

        const delayMs = retryDelayMs(error) ?? BASE_BACKOFF_MS * 2 ** attempt + Math.floor(random() * MAX_JITTER_MS);
        logger.warn('Gemini request failed, retrying', { status, attempt: attempt + 1, delayMs, model });
        await sleep(delayMs);
      }
    }
  }

  return {
    name: 'gemini',

    async complete(mode, batch) {
      const req = mode.buildRequest(batch);
      const response = await callWithRetry({
        model,
        contents: req.user,
        config: {
          systemInstruction: req.system,
          responseMimeType: 'application/json',
          responseJsonSchema: req.schema,
          maxOutputTokens: req.maxOutputTokens,
          // No temperature/topP: current Gemini models reject sampling overrides,
          // and the response schema already constrains the output.
        },
      });

      const meta = response.usageMetadata ?? {};
      const usage = {
        inputTokens: meta.promptTokenCount ?? 0,
        // Thinking tokens are billed at the output rate, so they count as output.
        outputTokens: (meta.candidatesTokenCount ?? 0) + (meta.thoughtsTokenCount ?? 0),
      };

      let json;
      try {
        json = JSON.parse(response.text ?? '');
      } catch {
        // Usually a response cut off by maxOutputTokens. Returning nulls lets the
        // processor retry these items in smaller batches.
        logger.warn('Gemini returned invalid JSON', {
          model,
          batchSize: batch.length,
          finishReason: response.candidates?.[0]?.finishReason,
        });
        return { outputs: new Array(batch.length).fill(null), usage };
      }

      return { outputs: mode.parseResponse(json, batch), usage };
    },
  };
}

/** Maps errors that no retry can fix to FatalProviderError; returns null otherwise. */
function toFatal(error) {
  const status = error?.status;
  const message = String(error?.message ?? '');

  if (status === 401 || status === 403 || (status === 400 && /API[ _]KEY/i.test(message))) {
    return new FatalProviderError(`Gemini rejected the API key (HTTP ${status})`, { cause: error });
  }
  if (status === 404) {
    return new FatalProviderError('Gemini model not found; check GEMINI_MODEL', { cause: error });
  }
  if (status === 429) {
    const hinted = retryDelayMs(error);
    if (/PerDay/i.test(message) || (hinted !== null && hinted > MAX_RETRY_WAIT_MS)) {
      return new FatalProviderError('Gemini quota exhausted', { cause: error });
    }
  }
  return null;
}

// Gemini puts the server's suggested wait in the error body, e.g. "retryDelay": "43s".
function retryDelayMs(error) {
  const match = /"retryDelay":\s*"(\d+(?:\.\d+)?)s"/.exec(String(error?.message ?? ''));
  return match ? Math.ceil(Number(match[1]) * 1000) : null;
}
