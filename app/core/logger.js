/**
 * Minimal levelled logger that writes one JSON object per line.
 *
 * JSON lines are what CloudWatch Logs Insights queries natively, and writing to
 * stderr keeps stdout free for the results, so `node app/run.js ... > out.json`
 * produces a clean file.
 */

const LEVELS = { DEBUG: 10, INFO: 20, WARN: 30, ERROR: 40 };

/**
 * @typedef {(msg: string, fields?: Record<string, unknown>) => void} LogFn
 * @typedef {{ debug: LogFn, info: LogFn, warn: LogFn, error: LogFn }} Logger
 */

/**
 * @param {string} level  Minimum level to emit (case-insensitive)
 * @param {{ write(chunk: string): unknown }} [stream]
 * @returns {Logger}
 */
export function createLogger(level, stream = process.stderr) {
  const threshold = LEVELS[String(level).toUpperCase()];
  if (threshold === undefined) {
    throw new Error(`Unknown log level "${level}". Use one of: ${Object.keys(LEVELS).join(', ')}`);
  }

  const emit = (name) => (msg, fields = {}) => {
    if (LEVELS[name] < threshold) return;
    const ts = new Date().toISOString();
    // Core keys are written first for readability and again last so a field
    // named "msg" or "level" can't disguise the record.
    const record = { ts, level: name, msg, ...serialize(fields), ...{ ts, level: name, msg } };
    stream.write(`${JSON.stringify(record)}\n`);
  };

  return { debug: emit('DEBUG'), info: emit('INFO'), warn: emit('WARN'), error: emit('ERROR') };
}

// JSON.stringify turns Error into {}, which would hide the one thing we need.
function serialize(fields) {
  const out = {};
  for (const [key, value] of Object.entries(fields)) {
    out[key] = value instanceof Error ? { name: value.name, message: value.message } : value;
  }
  return out;
}

/** Logger that discards everything; handy for tests. */
export const silentLogger = createLogger('ERROR', { write() {} });
