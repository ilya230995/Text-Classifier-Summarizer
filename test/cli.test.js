import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const execFileP = promisify(execFile);
const root = new URL('..', import.meta.url).pathname;
// Explicit values win over anything in a local .env (dotenv never overrides).
const env = { ...process.env, PROVIDER: 'keyword', GEMINI_API_KEY: '', LOG_LEVEL: 'INFO' };
const cli = (args, extraEnv = {}) =>
  execFileP('node', ['app/run.js', ...args], { cwd: root, env: { ...env, ...extraEnv } });
const fail = (args, extraEnv) => cli(args, extraEnv).then(
  () => assert.fail('expected a non-zero exit'),
  (e) => e,
);

const tmpDir = mkdtempSync(join(tmpdir(), 'cli-test-'));
const writeTmp = (name, content) => {
  const path = join(tmpDir, name);
  writeFileSync(path, content);
  return path;
};

test('classify sample: pure JSON on stdout, logs on stderr', async () => {
  const { stdout, stderr } = await cli(['--input', 'sample/emails.json', '--mode', 'classify', '--log-level', 'INFO']);
  const out = JSON.parse(stdout);
  assert.equal(out.length, 10);
  assert.deepEqual(out[3], { id: 4, error: 'empty_input' });
  assert.ok(out[0].topics.includes('finance'));
  assert.match(stderr, /"msg":"run complete"/);
});

test('summarize edge cases never crashes', async () => {
  const { stdout } = await cli(['--input', 'sample/edge-cases.json', '--mode', 'summarize', '--log-level', 'ERROR']);
  const out = JSON.parse(stdout);
  assert.equal(out.length, 14);
  assert.ok(out.some((r) => r.error === 'invalid_input'));
  assert.ok(out.some((r) => r.error === 'empty_input'));
  assert.ok(out.some((r) => r.id === 0 && typeof r.summary === 'string'));
  assert.equal(out.filter((r) => r.id === 19).length, 2);
});

test('--help prints usage and exits 0', async () => {
  const { stdout } = await cli(['--help']);
  assert.match(stdout, /--input/);
  assert.match(stdout, /--mode/);
});

test('bad input files exit 1 with a one-line message and no stack trace', async () => {
  const cases = [
    [['--input', 'missing.json', '--mode', 'classify'], /not found/i],
    [['--input', writeTmp('obj.json', '{"a":1}'), '--mode', 'classify'], /array/],
    [['--input', writeTmp('bad.json', '{nope'), '--mode', 'classify'], /JSON/],
  ];
  for (const [args, re] of cases) {
    const e = await fail(args);
    assert.equal(e.code, 1);
    assert.match(e.stderr, re);
    assert.doesNotMatch(e.stderr, /at .*\.js:\d+/);
    assert.equal(e.stdout, '');
  }
});

test('usage errors exit 1: missing --input, missing/unknown mode, unknown flag', async () => {
  assert.match((await fail(['--mode', 'classify'])).stderr, /--input is required/);
  assert.match((await fail(['--input', 'sample/emails.json'], { MODE: '' })).stderr, /mode/);
  assert.match((await fail(['--input', 'sample/emails.json', '--mode', 'translate'])).stderr, /Unknown mode "translate"/);
  assert.equal((await fail(['--input', 'sample/emails.json', '--mode', 'classify', '--bogus'])).code, 1);
});

test('gemini without a key exits 1 with guidance', async () => {
  const e = await fail(['--input', 'sample/emails.json', '--mode', 'classify', '--provider', 'gemini']);
  assert.equal(e.code, 1);
  assert.match(e.stderr, /GEMINI_API_KEY/);
});
