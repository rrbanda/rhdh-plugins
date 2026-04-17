import '@testing-library/jest-dom';
import { TextEncoder, TextDecoder } from 'util';
import { ReadableStream } from 'stream/web';

Object.assign(globalThis, {
  TextEncoder,
  TextDecoder,
  ReadableStream,
});
