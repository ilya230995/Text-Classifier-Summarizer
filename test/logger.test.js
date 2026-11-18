import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLogger, silentLogger } from '../app/core/logger.js';

const capture = () => {
  const lines = [];
  return { lines, stream: { write: (s) => lines.push(s) } };
};

test('filters below the level and writes one JSON line per record', () => {
  const { lines, stream } = capture();
  const log = createLogger('WARN', stream);
  log.debug('hidden');
  log.info('hidden');
  log.warn('shown', { id: 4 });
  log.error('also shown');
  assert.equal(lines.length, 2);
  assert.ok(lines.every((l) => l.endsWith('\n')));
  const rec = JSON.parse(lines[0]);
  assert.equal(rec.level, 'WARN');
  assert.equal(rec.msg, 'shown');
  assert.equal(rec.id, 4);
  assert.ok(!Number.isNaN(Date.parse(rec.ts)));
});

test('level is case-insensitive', () => {
  const { lines, stream } = capture();
  createLogger('debug', stream).debug('x');
  assert.equal(lines.length, 1);
});

test('fields cannot overwrite core keys', () => {
  const { lines, stream } = capture();
  createLogger('INFO', stream).info('real', { msg: 'fake', level: 'ERROR' });
  const rec = JSON.parse(lines[0]);
  assert.equal(rec.msg, 'real');
  assert.equal(rec.level, 'INFO');
});

test('Error values are serialized with their message', () => {
  const { lines, stream } = capture();
  createLogger('INFO', stream).error('failed', { err: new Error('boom') });
  assert.equal(JSON.parse(lines[0]).err.message, 'boom');
});

test('unknown level throws', () => {
  assert.throws(() => createLogger('LOUD'), /log level/i);
});

test('silentLogger writes nothing and does not throw', () => {
  silentLogger.error('nothing');
});
