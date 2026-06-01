/*
 * Copyright Red Hat, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { parseSSEStream } from './sseStreaming';
import type { StreamingEvent } from '../types';

function createMockReader(
  chunks: string[],
): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;
  return {
    read: async () => {
      if (index >= chunks.length) {
        return { done: true as const, value: undefined };
      }
      const chunk = chunks[index++];
      return {
        done: false,
        value: encoder.encode(chunk),
      };
    },
    cancel: async () => {},
    releaseLock: () => {},
    closed: Promise.resolve(undefined),
  } as ReadableStreamDefaultReader<Uint8Array>;
}

describe('parseSSEStream', () => {
  it('parses a single complete SSE event', async () => {
    const events: StreamingEvent[] = [];
    const reader = createMockReader([
      'data: {"type":"stream.text.delta","delta":"Hello"}\n\n',
    ]);

    await parseSSEStream(reader, evt => events.push(evt));

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: 'stream.text.delta',
      delta: 'Hello',
    });
  });

  it('parses multiple events in a single chunk', async () => {
    const events: StreamingEvent[] = [];
    const reader = createMockReader([
      'data: {"type":"stream.started","responseId":"r1"}\n\ndata: {"type":"stream.text.delta","delta":"Hi"}\n\ndata: {"type":"stream.completed"}\n\n',
    ]);

    await parseSSEStream(reader, evt => events.push(evt));

    expect(events).toHaveLength(3);
    expect(events[0].type).toBe('stream.started');
    expect(events[1].type).toBe('stream.text.delta');
    expect(events[2].type).toBe('stream.completed');
  });

  it('handles events split across chunks', async () => {
    const events: StreamingEvent[] = [];
    const reader = createMockReader([
      'data: {"type":"stream.tex',
      't.delta","delta":"world"}\n\n',
    ]);

    await parseSSEStream(reader, evt => events.push(evt));

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: 'stream.text.delta',
      delta: 'world',
    });
  });

  it('ignores [DONE] sentinel', async () => {
    const events: StreamingEvent[] = [];
    const reader = createMockReader([
      'data: {"type":"stream.text.delta","delta":"x"}\n\ndata: [DONE]\n\n',
    ]);

    await parseSSEStream(reader, evt => events.push(evt));

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('stream.text.delta');
  });

  it('ignores comment lines (heartbeats)', async () => {
    const events: StreamingEvent[] = [];
    const reader = createMockReader([
      ': heartbeat\n\ndata: {"type":"stream.text.delta","delta":"a"}\n\n',
    ]);

    await parseSSEStream(reader, evt => events.push(evt));

    expect(events).toHaveLength(1);
  });

  it('ignores events without type field', async () => {
    const events: StreamingEvent[] = [];
    const reader = createMockReader([
      'data: {"noType":"bad"}\n\ndata: {"type":"stream.text.delta","delta":"ok"}\n\n',
    ]);

    await parseSSEStream(reader, evt => events.push(evt));

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('stream.text.delta');
  });

  it('handles malformed JSON gracefully', async () => {
    const events: StreamingEvent[] = [];
    const reader = createMockReader([
      'data: not-json\n\ndata: {"type":"stream.text.delta","delta":"ok"}\n\n',
    ]);

    await parseSSEStream(reader, evt => events.push(evt));

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('stream.text.delta');
  });

  it('handles \\r\\n line endings', async () => {
    const events: StreamingEvent[] = [];
    const reader = createMockReader([
      'data: {"type":"stream.text.delta","delta":"cr"}\r\n\r\n',
    ]);

    await parseSSEStream(reader, evt => events.push(evt));

    expect(events).toHaveLength(1);
    expect((events[0] as { delta: string }).delta).toBe('cr');
  });

  it('emits buffer_overflow error when buffer exceeds max size', async () => {
    const events: StreamingEvent[] = [];
    const bigChunk = 'x'.repeat(1024 * 1024 + 100);
    const reader = createMockReader([bigChunk]);

    await parseSSEStream(reader, evt => events.push(evt));

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('stream.error');
    expect((events[0] as { code?: string }).code).toBe('buffer_overflow');
  });

  it('stops reading when signal is aborted', async () => {
    const events: StreamingEvent[] = [];
    const controller = new AbortController();
    const reader = createMockReader([
      'data: {"type":"stream.text.delta","delta":"a"}\n\n',
      'data: {"type":"stream.text.delta","delta":"b"}\n\n',
    ]);

    controller.abort();

    await parseSSEStream(reader, evt => events.push(evt), controller.signal);

    expect(events).toHaveLength(0);
  });

  it('handles empty lines between events', async () => {
    const events: StreamingEvent[] = [];
    const reader = createMockReader([
      '\n\ndata: {"type":"stream.text.delta","delta":"x"}\n\n\n\n',
    ]);

    await parseSSEStream(reader, evt => events.push(evt));

    expect(events).toHaveLength(1);
  });

  it('processes event in buffer tail after stream ends', async () => {
    const events: StreamingEvent[] = [];
    const reader = createMockReader([
      'data: {"type":"stream.text.delta","delta":"tail"}',
    ]);

    await parseSSEStream(reader, evt => events.push(evt));

    expect(events).toHaveLength(1);
    expect((events[0] as { delta: string }).delta).toBe('tail');
  });

  it('survives onEvent handler throwing', async () => {
    const events: StreamingEvent[] = [];
    let callCount = 0;
    const reader = createMockReader([
      'data: {"type":"stream.text.delta","delta":"1"}\n\ndata: {"type":"stream.text.delta","delta":"2"}\n\n',
    ]);

    await parseSSEStream(reader, evt => {
      callCount++;
      if (callCount === 1) throw new Error('handler error');
      events.push(evt);
    });

    expect(callCount).toBe(2);
    expect(events).toHaveLength(1);
    expect((events[0] as { delta: string }).delta).toBe('2');
  });
});
