import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { readExactBytes } from '../src/io/byte-reader.mjs';

const base = process.env.XI_WORKSPACE_TEMP || os.tmpdir();
const root = fs.mkdtempSync(path.join(base, 'xi-sdk-byte-reader-'));
let passed = 0;
const results = [];
function check(id, execute) {
  try { execute(); results.push({ id, state: 'PASS' }); passed += 1; }
  catch (error) { results.push({ id, state: 'FAIL', reason: error.message }); }
}
function fixture(name, bytes) {
  const file = path.join(root, name);
  fs.writeFileSync(file, bytes, { flag: 'wx' });
  return file;
}
let cleanup = false;
try {
  for (const size of [0, 1, 15, 16, 17, 4096, 65536]) {
    check('size-' + size, () => {
      const expected = crypto.randomBytes(size);
      const file = fixture('size-' + size, expected);
      const actual = readExactBytes(file, { length: size });
      assert.equal(actual.bytesRead, size);
      assert.equal(Buffer.compare(actual.bytes, expected), 0);
    });
  }
  const bytes = Buffer.from(Array.from({ length: 16 }, (_, i) => i));
  const file = fixture('offsets', bytes);
  for (const [offset, length] of [[0, 16], [1, 15], [15, 1]]) {
    check('offset-' + offset + '-' + length, () => {
      const actual = readExactBytes(file, { offset, length });
      assert.equal(Buffer.compare(actual.bytes, bytes.subarray(offset, offset + length)), 0);
    });
  }
  for (const [offset, length] of [[15, 2], [16, 1], [17, 1]]) {
    check('eof-' + offset + '-' + length, () => {
      assert.throws(() => readExactBytes(file, { offset, length }), { code: 'UNEXPECTED_EOF' });
    });
  }
  check('invalid-offset', () => assert.throws(() => readExactBytes(file, { offset: -1, length: 1 }), { code: 'INVALID_OFFSET' }));
  check('invalid-range', () => assert.throws(() => readExactBytes(file, { offset: Number.MAX_SAFE_INTEGER, length: 1 }), { code: 'INVALID_RANGE' }));
  check('invalid-length', () => assert.throws(() => readExactBytes(file, { length: -1 }), { code: 'INVALID_LENGTH' }));
  check('missing-file', () => assert.throws(() => readExactBytes(path.join(root, 'absent'), { length: 1 }), { code: 'ENOENT' }));
  check('symlink-final', () => {
    const link = path.join(root, 'link');
    fs.symlinkSync(file, link);
    assert.throws(() => readExactBytes(link, { length: 1 }), { code: 'ELOOP' });
  });
  check('read-fault-closes-descriptor', () => {
    let closeCount = 0;
    const io = { ...fs, readSync() { throw Object.assign(new Error('injected'), { code: 'EIO' }); },
      closeSync(fd) { closeCount += 1; fs.closeSync(fd); } };
    assert.throws(() => readExactBytes(file, { length: 1, io }), { code: 'EIO' });
    assert.equal(closeCount, 1);
  });
  check('short-read-loop', () => {
    let readCalls = 0;
    const io = { ...fs, readSync(fd, buffer, bufferOffset, remaining, fileOffset) {
      readCalls += 1;
      return fs.readSync(fd, buffer, bufferOffset, Math.min(1, remaining), fileOffset);
    } };
    const actual = readExactBytes(file, { length: bytes.length, io });
    assert.equal(Buffer.compare(actual.bytes, bytes), 0);
    assert.equal(readCalls, bytes.length);
  });
  check('early-zero-read-closes-descriptor', () => {
    let closeCount = 0;
    const io = { ...fs, readSync() { return 0; },
      closeSync(fd) { closeCount += 1; fs.closeSync(fd); } };
    assert.throws(() => readExactBytes(file, { length: 1, io }), { code: 'UNEXPECTED_EOF' });
    assert.equal(closeCount, 1);
  });
  check('nonregular-target', () =>
    assert.throws(() => readExactBytes(root, { length: 1 }), { code: 'NOT_REGULAR_FILE' }));
  check('close-only-failure', () => {
    const io = { ...fs, closeSync(fd) {
      fs.closeSync(fd);
      throw Object.assign(new Error('injected close failure'), { code: 'EIO' });
    } };
    assert.throws(() => readExactBytes(file, { length: 1, io }), { code: 'EIO' });
  });
  check('read-close-double-fault', () => {
    const io = { ...fs, readSync() { throw Object.assign(new Error('read'), { code: 'EIO' }); },
      closeSync(fd) { fs.closeSync(fd); throw Object.assign(new Error('close'), { code: 'EBADF' }); } };
    assert.throws(() => readExactBytes(file, { length: 1, io }),
      error => error instanceof AggregateError && error.errors.length === 2 &&
        error.errors[0].code === 'EIO' && error.errors[1].code === 'EBADF');
  });
} finally {
  try {
    fs.rmSync(root, { recursive: true });
    cleanup = !fs.existsSync(root);
  } catch (error) {
    results.push({ id: 'cleanup', state: 'FAIL', reason: error.message });
  }
}
const summary = { schema: 'xiio.sdk.byte-reader-canary/v1', passed, denominator: results.length,
  cleanup, results };
console.log(JSON.stringify(summary));
if (!cleanup || passed !== results.length) process.exitCode = 1;
