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
import { renderHook, act } from '@testing-library/react';
import { useBuilderStream } from './useBuilderStream';
import type { BuilderEvent } from './types';
import {
  createSSEStream,
  sseEvent,
  FULL_STREAM_EVENTS,
  ERROR_STREAM_EVENTS,
  MALFORMED_EVENTS,
  KEEPALIVE_EVENT,
} from './__fixtures__/sse-streams';

function createMockResponse(events: string[]): Response {
  return {
    body: createSSEStream(events),
  } as unknown as Response;
}

describe('useBuilderStream', () => {
  let currentAgent: string;
  let generatedContent: string;
  let liveEvents: BuilderEvent[];

  const setCurrentAgent = (a: string) => { currentAgent = a; };
  const setGeneratedContent = (fn: string | ((prev: string) => string)) => {
    generatedContent = typeof fn === 'function' ? fn(generatedContent) : fn;
  };
  const setLiveEvents = (fn: BuilderEvent[] | ((prev: BuilderEvent[]) => BuilderEvent[])) => {
    liveEvents = typeof fn === 'function' ? fn(liveEvents) : fn;
  };

  beforeEach(() => {
    currentAgent = '';
    generatedContent = '';
    liveEvents = [];
  });

  it('parses a full SSE stream correctly', async () => {
    const { result } = renderHook(() =>
      useBuilderStream(setCurrentAgent, setGeneratedContent, setLiveEvents),
    );

    const response = createMockResponse(FULL_STREAM_EVENTS);
    await act(async () => {
      await result.current.readSSEStream(response);
    });

    expect(currentAgent).toBe('SkillGeneratorAgent');
    expect(generatedContent).toBe('# Test Skill\n## Description\nA test skill.');

    const eventTypes = liveEvents.map(e => e.type);
    expect(eventTypes).toContain('agent_start');
    expect(eventTypes).toContain('tool_call');
    expect(eventTypes).toContain('tool_result');
    expect(eventTypes).toContain('agent_output');
    expect(eventTypes).toContain('complete');
    expect(eventTypes).toContain('stream_end');
  });

  it('handles agent_start events and updates currentAgent', async () => {
    const { result } = renderHook(() =>
      useBuilderStream(setCurrentAgent, setGeneratedContent, setLiveEvents),
    );

    const response = createMockResponse([
      sseEvent('agent_start', { agent: 'TestAgent' }),
    ]);
    await act(async () => {
      await result.current.readSSEStream(response);
    });

    expect(currentAgent).toBe('TestAgent');
    expect(liveEvents).toHaveLength(1);
    expect(liveEvents[0].type).toBe('agent_start');
  });

  it('handles tool_call events', async () => {
    const { result } = renderHook(() =>
      useBuilderStream(setCurrentAgent, setGeneratedContent, setLiveEvents),
    );

    const response = createMockResponse([
      sseEvent('tool_call', { agent: 'A', tool: 'search', args: { q: 'test' } }),
    ]);
    await act(async () => {
      await result.current.readSSEStream(response);
    });

    expect(liveEvents).toHaveLength(1);
    const evt = liveEvents[0];
    expect(evt.type).toBe('tool_call');
    if (evt.type === 'tool_call') {
      expect(evt.tool).toBe('search');
      expect(evt.args).toEqual({ q: 'test' });
    }
  });

  it('handles tool_result events with string result', async () => {
    const { result } = renderHook(() =>
      useBuilderStream(setCurrentAgent, setGeneratedContent, setLiveEvents),
    );

    const response = createMockResponse([
      sseEvent('tool_result', { agent: 'A', tool: 'analyze', result: 'done' }),
    ]);
    await act(async () => {
      await result.current.readSSEStream(response);
    });

    expect(liveEvents).toHaveLength(1);
    if (liveEvents[0].type === 'tool_result') {
      expect(liveEvents[0].result).toBe('done');
    }
  });

  it('handles tool_result events with object result', async () => {
    const { result } = renderHook(() =>
      useBuilderStream(setCurrentAgent, setGeneratedContent, setLiveEvents),
    );

    const response = createMockResponse([
      sseEvent('tool_result', { agent: 'A', tool: 'analyze', result: { status: 'ok' } }),
    ]);
    await act(async () => {
      await result.current.readSSEStream(response);
    });

    if (liveEvents[0].type === 'tool_result') {
      expect(JSON.parse(liveEvents[0].result)).toEqual({ status: 'ok' });
    }
  });

  it('accumulates agent_output text into generatedContent', async () => {
    const { result } = renderHook(() =>
      useBuilderStream(setCurrentAgent, setGeneratedContent, setLiveEvents),
    );

    const response = createMockResponse([
      sseEvent('agent_output', { agent: 'Gen', text: 'Hello ' }),
      sseEvent('agent_output', { agent: 'Gen', text: 'World' }),
    ]);
    await act(async () => {
      await result.current.readSSEStream(response);
    });

    expect(generatedContent).toBe('Hello World');
  });

  it('handles complete event and sets final content', async () => {
    const { result } = renderHook(() =>
      useBuilderStream(setCurrentAgent, setGeneratedContent, setLiveEvents),
    );

    const response = createMockResponse([
      sseEvent('complete', { skill_content: '# Final', validation: 'All good' }),
    ]);
    await act(async () => {
      await result.current.readSSEStream(response);
    });

    expect(generatedContent).toBe('# Final');
    const completeEvt = liveEvents.find(e => e.type === 'complete');
    expect(completeEvt).toBeDefined();
    if (completeEvt?.type === 'complete') {
      expect(completeEvt.validation).toBe('All good');
    }
  });

  it('handles error events', async () => {
    const { result } = renderHook(() =>
      useBuilderStream(setCurrentAgent, setGeneratedContent, setLiveEvents),
    );

    const response = createMockResponse(ERROR_STREAM_EVENTS);
    await act(async () => {
      await result.current.readSSEStream(response);
    });

    const errorEvt = liveEvents.find(e => e.type === 'error');
    expect(errorEvt).toBeDefined();
    if (errorEvt?.type === 'error') {
      expect(errorEvt.error).toBe('Pipeline failed: timeout exceeded');
    }
  });

  it('handles stream_end events', async () => {
    const { result } = renderHook(() =>
      useBuilderStream(setCurrentAgent, setGeneratedContent, setLiveEvents),
    );

    const response = createMockResponse([sseEvent('stream_end', {})]);
    await act(async () => {
      await result.current.readSSEStream(response);
    });

    expect(liveEvents).toHaveLength(1);
    expect(liveEvents[0].type).toBe('stream_end');
  });

  it('aborts on 5 consecutive parse errors', async () => {
    const { result } = renderHook(() =>
      useBuilderStream(setCurrentAgent, setGeneratedContent, setLiveEvents),
    );

    const response = createMockResponse(MALFORMED_EVENTS);
    await act(async () => {
      await result.current.readSSEStream(response);
    });

    const errorEvt = liveEvents.find(e => e.type === 'error');
    expect(errorEvt).toBeDefined();
    if (errorEvt?.type === 'error') {
      expect(errorEvt.error).toContain('corrupted');
    }
  });

  it('ignores SSE keepalive comments', async () => {
    const { result } = renderHook(() =>
      useBuilderStream(setCurrentAgent, setGeneratedContent, setLiveEvents),
    );

    const response = createMockResponse([
      KEEPALIVE_EVENT,
      sseEvent('agent_start', { agent: 'TestAgent' }),
      KEEPALIVE_EVENT,
    ]);
    await act(async () => {
      await result.current.readSSEStream(response);
    });

    expect(currentAgent).toBe('TestAgent');
    expect(liveEvents).toHaveLength(1);
    expect(liveEvents[0].type).toBe('agent_start');
  });

  it('resets parse error counter on successful parse', async () => {
    const { result } = renderHook(() =>
      useBuilderStream(setCurrentAgent, setGeneratedContent, setLiveEvents),
    );

    const response = createMockResponse([
      'event: agent_start\ndata: {bad\n\n',
      'event: agent_start\ndata: {bad\n\n',
      'event: agent_start\ndata: {bad\n\n',
      sseEvent('agent_start', { agent: 'Good' }),
      'event: agent_start\ndata: {bad\n\n',
      'event: agent_start\ndata: {bad\n\n',
    ]);
    await act(async () => {
      await result.current.readSSEStream(response);
    });

    expect(currentAgent).toBe('Good');
    const errorEvts = liveEvents.filter(e => e.type === 'error');
    expect(errorEvts).toHaveLength(0);
  });

  it('handles response with no body gracefully', async () => {
    const { result } = renderHook(() =>
      useBuilderStream(setCurrentAgent, setGeneratedContent, setLiveEvents),
    );

    const response = { body: null } as unknown as Response;
    await act(async () => {
      await result.current.readSSEStream(response);
    });

    expect(liveEvents).toHaveLength(0);
    expect(generatedContent).toBe('');
  });

  it('abort() cancels an in-progress stream', async () => {
    const { result } = renderHook(() =>
      useBuilderStream(setCurrentAgent, setGeneratedContent, setLiveEvents),
    );

    let resolveChunk: (() => void) | null = null;
    const slowStream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode(sseEvent('agent_start', { agent: 'SlowAgent' })));
      },
      pull() {
        return new Promise<void>(resolve => {
          resolveChunk = resolve;
        });
      },
    });

    const response = { body: slowStream } as unknown as Response;
    const streamPromise = act(async () => {
      await result.current.readSSEStream(response);
    });

    await act(async () => {
      result.current.abort();
    });

    await streamPromise;
    expect(currentAgent).toBe('SlowAgent');

    void resolveChunk;
  });

  it('uses custom idle timeout', async () => {
    jest.useFakeTimers();

    const { result } = renderHook(() =>
      useBuilderStream(setCurrentAgent, setGeneratedContent, setLiveEvents, 5000),
    );

    let resolveRead: (() => void) | null = null;
    const hangingStream = new ReadableStream<Uint8Array>({
      pull() {
        return new Promise<void>(resolve => {
          resolveRead = resolve;
        });
      },
    });

    const response = { body: hangingStream } as unknown as Response;
    let streamDone = false;
    const streamPromise = act(async () => {
      await result.current.readSSEStream(response);
      streamDone = true;
    });

    await act(async () => {
      jest.advanceTimersByTime(5100);
    });

    if (resolveRead) (resolveRead as () => void)();
    await streamPromise;

    const errorEvt = liveEvents.find(e => e.type === 'error');
    expect(errorEvt).toBeDefined();
    if (errorEvt?.type === 'error') {
      expect(errorEvt.error).toContain('timed out');
    }

    jest.useRealTimers();
    void streamDone;
  });

  it('handles unknown event types by extracting text/skill_content from payload', async () => {
    const { result } = renderHook(() =>
      useBuilderStream(setCurrentAgent, setGeneratedContent, setLiveEvents),
    );

    const response = createMockResponse([
      sseEvent('custom_event', { text: 'custom text' }),
    ]);
    await act(async () => {
      await result.current.readSSEStream(response);
    });

    expect(generatedContent).toBe('custom text');
  });
});
