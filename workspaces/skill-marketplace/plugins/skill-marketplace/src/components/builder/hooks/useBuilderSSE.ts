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
import { useState, useCallback, useRef } from 'react';
import type { BuilderEvent } from '../types';

const DEFAULT_IDLE_TIMEOUT_MS = 120_000;
const MAX_CONSECUTIVE_PARSE_ERRORS = 5;

export interface UseBuilderSSEOptions {
  idleTimeoutMs?: number;
}

export interface StreamResult {
  events: BuilderEvent[];
  content: string;
}

export interface UseBuilderSSEReturn {
  events: BuilderEvent[];
  content: string;
  currentAgent: string;
  isStreaming: boolean;
  error: string | null;
  startStream: (response: Response) => Promise<StreamResult>;
  abort: () => void;
  resetEvents: () => void;
}

/**
 * Self-contained SSE parser that owns its own state.
 * Events persist across the stream lifecycle -- they are never
 * cleared automatically. Call `resetEvents()` to clear explicitly.
 */
export function useBuilderSSE(
  opts?: UseBuilderSSEOptions,
): UseBuilderSSEReturn {
  const idleTimeoutMs = opts?.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;

  const [events, setEvents] = useState<BuilderEvent[]>([]);
  const [content, setContent] = useState('');
  const [currentAgent, setCurrentAgent] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    readerRef.current?.cancel().catch(() => {});
    readerRef.current = null;
    setIsStreaming(false);
  }, []);

  const resetEvents = useCallback(() => {
    setEvents([]);
    setContent('');
    setCurrentAgent('');
    setError(null);
  }, []);

  const startStream = useCallback(
    async (response: Response): Promise<StreamResult> => {
      if (!response.body) {
        const errEvt: BuilderEvent = {
          type: 'error',
          error: 'Response has no streaming body — the fetch implementation may not support ReadableStream. This is a browser/runtime issue.',
          ts: Date.now(),
        };
        setEvents(prev => [...prev, errEvt]);
        setError(errEvt.error);
        return { events: [errEvt], content: '' };
      }
      const reader = response.body.getReader();

      const controller = new AbortController();
      abortRef.current = controller;
      readerRef.current = reader;
      setIsStreaming(true);
      setError(null);

      controller.signal.addEventListener('abort', () => {
        reader.cancel().catch(() => {});
      });

      let idleTimer: ReturnType<typeof setTimeout> | null = null;
      const resetIdleTimer = () => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          controller.abort();
          const mins = Math.round(idleTimeoutMs / 60_000);
          const msg = `Stream timed out \u2014 no data received for ${mins} minute${mins !== 1 ? 's' : ''}`;
          setError(msg);
          pushEvent({ type: 'error', error: msg, ts: Date.now() });
        }, idleTimeoutMs);
      };
      resetIdleTimer();

      const decoder = new TextDecoder();
      let buffer = '';
      let streamContent = '';
      let lastEventType = '';
      let consecutiveParseErrors = 0;
      const collected: BuilderEvent[] = [];
      const pushEvent = (evt: BuilderEvent) => {
        collected.push(evt);
        setEvents(prev => [...prev, evt]);
      };

      try {
        while (!controller.signal.aborted) {
          let readResult: ReadableStreamReadResult<Uint8Array>;
          try {
            readResult = await reader.read();
          } catch (readErr) {
            if (!controller.signal.aborted) {
              const msg = `Connection lost: ${readErr instanceof Error ? readErr.message : 'stream interrupted'}`;
              setError(msg);
              pushEvent({ type: 'error', error: msg, ts: Date.now() });
            }
            break;
          }

          const { done, value } = readResult;
          if (done) break;

          resetIdleTimer();
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              lastEventType = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              try {
                const payload = JSON.parse(line.slice(6));
                const ts = Date.now();

                switch (lastEventType) {
                  case 'agent_start':
                    if (payload.agent) {
                      setCurrentAgent(payload.agent);
                      pushEvent({ type: 'agent_start', agent: payload.agent, ts });
                    }
                    break;

                  case 'tool_call':
                    pushEvent({
                      type: 'tool_call',
                      agent: payload.agent || '',
                      tool: payload.tool || 'unknown',
                      args: payload.args || {},
                      ts,
                    });
                    break;

                  case 'agent_output':
                    if (payload.text) {
                      streamContent += payload.text;
                      setContent(streamContent);
                      pushEvent({ type: 'agent_output', agent: payload.agent || '', text: payload.text, ts });
                    }
                    break;

                  case 'tool_result':
                    pushEvent({
                      type: 'tool_result',
                      agent: payload.agent || '',
                      tool: payload.tool || 'unknown',
                      result:
                        typeof payload.result === 'string'
                          ? payload.result
                          : JSON.stringify(payload.result ?? payload.output ?? '', null, 2),
                      ts,
                    });
                    break;

                  case 'complete':
                    if (payload.skill_content) {
                      streamContent = payload.skill_content;
                      setContent(streamContent);
                    }
                    pushEvent({
                      type: 'complete',
                      skillContent: payload.skill_content || '',
                      validation: payload.validation || '',
                      ts,
                    });
                    break;

                  case 'stream_end':
                    pushEvent({ type: 'stream_end', ts });
                    break;

                  case 'error':
                    if (payload.error) {
                      setError(payload.error);
                      pushEvent({ type: 'error', error: payload.error, ts });
                    }
                    break;

                  default:
                    if (payload.text) {
                      streamContent += payload.text;
                      setContent(streamContent);
                    }
                    if (payload.skill_content) {
                      streamContent = payload.skill_content;
                      setContent(streamContent);
                    }
                    break;
                }
                lastEventType = '';
                consecutiveParseErrors = 0;
              } catch {
                consecutiveParseErrors++;
                if (consecutiveParseErrors >= MAX_CONSECUTIVE_PARSE_ERRORS) {
                  controller.abort();
                  const msg = 'Stream corrupted \u2014 too many malformed chunks';
                  setError(msg);
                  pushEvent({ type: 'error', error: msg, ts: Date.now() });
                }
              }
            }
          }
        }
      } finally {
        if (idleTimer) clearTimeout(idleTimer);
        reader.releaseLock();
        abortRef.current = null;
        readerRef.current = null;
        setIsStreaming(false);
      }

      if (streamContent) setContent(streamContent);
      return { events: collected, content: streamContent };
    },
    [idleTimeoutMs],
  );

  return { events, content, currentAgent, isStreaming, error, startStream, abort, resetEvents };
}
