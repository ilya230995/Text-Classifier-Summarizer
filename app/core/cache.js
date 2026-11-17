/**
 * Small in-memory LRU cache.
 *
 * Lambda reuses a warm container across invocations, so a module-level cache
 * lets repeated texts (newsletters, auto-replies, retries by the caller) skip the
 * model entirely. It is bounded so memory stays flat on long-lived containers.
 * An external cache (DynamoDB, Redis) would survive cold starts but adds cost
 * and infrastructure, which this project avoids on purpose.
 */

/**
 * @param {number} maxEntries  0 disables caching
 * @returns {{ get(key: string): any, set(key: string, value: any): void, readonly size: number }}
 */
export function createCache(maxEntries) {
  // Map keeps insertion order, so the first key is always the least recently used.
  const map = new Map();

  return {
    get(key) {
      if (!map.has(key)) return undefined;
      const value = map.get(key);
      map.delete(key);
      map.set(key, value);
      return value;
    },
    set(key, value) {
      if (maxEntries <= 0) return;
      map.delete(key);
      map.set(key, value);
      if (map.size > maxEntries) map.delete(map.keys().next().value);
    },
    get size() {
      return map.size;
    },
  };
}
