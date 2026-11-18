#!/usr/bin/env node
/**
 * Local runner that simulates a Lambda invocation:
 *
 *   node app/run.js --input sample/emails.json --mode classify --log-level INFO
 *
 * Reads a JSON array of items, invokes the same handler code Lambda runs, prints
 * the results as JSON on stdout and logs on stderr (so `> out.json` stays clean).
 */

import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import dotenv from 'dotenv';
import { loadConfig } from './config.js';
import { createLogger } from './core/logger.js';
import { createHandlerFromConfig } from './handler.js';

// quiet: dotenv otherwise prints a banner to stdout, which would corrupt the JSON output.
dotenv.config({ quiet: true });

const USAGE = `Usage: node app/run.js --input <file.json> --mode <classify|summarize> [options]

Options:
  -i, --input <file>       JSON file with an array of { id, subject, body } items (required)
  -m, --mode <mode>        classify | summarize (or set MODE)
  -l, --log-level <level>  DEBUG | INFO | WARN | ERROR (default: INFO)
  -p, --provider <name>    gemini | keyword (default: PROVIDER env or gemini)
  -h, --help               Show this help

Settings are read from environment variables and a local .env file (see .env.example).
`;

async function main(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      input: { type: 'string', short: 'i' },
      mode: { type: 'string', short: 'm' },
      'log-level': { type: 'string', short: 'l' },
      provider: { type: 'string', short: 'p' },
      help: { type: 'boolean', short: 'h' },
    },
    strict: true,
  });

  if (values.help) {
    process.stdout.write(USAGE);
    return;
  }
  if (!values.input) throw new Error(`--input is required\n\n${USAGE}`);

  // CLI flags take precedence over environment variables.
  const config = loadConfig({
    ...process.env,
    ...(values.mode && { MODE: values.mode }),
    ...(values['log-level'] && { LOG_LEVEL: values['log-level'] }),
    ...(values.provider && { PROVIDER: values.provider }),
  });
  const logger = createLogger(config.logLevel);

  const items = await readItems(values.input);
  const handler = createHandlerFromConfig(config, logger);
  const results = await handler({ mode: config.mode, items });
  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
}

async function readItems(path) {
  let text;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error(`Input file not found: ${path}`);
    throw error;
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new Error(`Input file is not valid JSON: ${error.message}`);
  }
  if (!Array.isArray(data)) throw new Error('Input file must contain a JSON array of items');
  return data;
}

main(process.argv.slice(2)).catch((error) => {
  // One readable line on stderr; the stack trace only when debugging.
  process.stderr.write(`Error: ${error.message}\n`);
  if (String(process.env.LOG_LEVEL).toUpperCase() === 'DEBUG') process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
