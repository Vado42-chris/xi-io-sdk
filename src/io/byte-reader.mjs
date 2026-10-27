import fs from 'node:fs';
import path from 'node:path';
import { constants as bufferConstants } from 'node:buffer';

export class ByteReadError extends Error {
  constructor(code, message, cause) {
    super(message, { cause });
    this.name = 'ByteReadError';
    this.code = code;
  }
}

export function readExactBytes(target, {
  offset = 0,
  length,
  io = fs,
} = {}) {
  if (typeof target !== 'string' || !target.trim()) {
    throw new ByteReadError('INVALID_TARGET', 'A nonempty target path is required');
  }
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new ByteReadError('INVALID_OFFSET', 'Offset must be a nonnegative safe integer');
  }
  if (!Number.isSafeInteger(length) || length < 0 || length > bufferConstants.MAX_LENGTH) {
    throw new ByteReadError('INVALID_LENGTH', 'Length must be a bounded nonnegative safe integer');
  }
  if (offset + length > Number.MAX_SAFE_INTEGER) {
    throw new ByteReadError('INVALID_RANGE', 'Offset plus length exceeds safe integer range');
  }
  let descriptor;
  let failure;
  let result;
  try {
    descriptor = io.openSync(path.resolve(target), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    const metadata = io.fstatSync(descriptor);
    if (!metadata.isFile()) throw new ByteReadError('NOT_REGULAR_FILE', 'Target is not a regular file');
    const buffer = Buffer.alloc(length);
    let bytesRead = 0;
    while (bytesRead < length) {
      const count = io.readSync(descriptor, buffer, bytesRead, length - bytesRead, offset + bytesRead);
      if (!Number.isInteger(count) || count < 0 || count > length - bytesRead) {
        throw new ByteReadError('INVALID_READ_COUNT', 'Reader returned an invalid byte count');
      }
      if (count === 0) break;
      bytesRead += count;
    }
    if (bytesRead !== length) {
      throw new ByteReadError('UNEXPECTED_EOF', 'Expected ' + length + ' bytes but received ' + bytesRead);
    }
    result = Object.freeze({ bytes: buffer, bytesRead, offset });
  } catch (error) {
    failure = error instanceof ByteReadError ? error : new ByteReadError(error.code || 'READ_FAILURE', error.message, error);
  } finally {
    if (descriptor !== undefined) {
      try {
        io.closeSync(descriptor);
      } catch (error) {
        const closeFailure = new ByteReadError(error.code || 'CLOSE_FAILURE', error.message, error);
        failure = failure ? new AggregateError([failure, closeFailure], 'Read and close both failed') : closeFailure;
      }
    }
  }
  if (failure) throw failure;
  return result;
}
