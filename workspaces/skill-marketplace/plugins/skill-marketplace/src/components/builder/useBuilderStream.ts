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
import { useCallback, useRef } from 'react';
import type { BuilderEvent } from './types';

const DEFAULT_IDLE_TIMEOUT_MS = 120_000;

export function useBuilderStream(
  setCurrentAgent: (a: string) => void,
  setGeneratedContent: (fn: string | ((prev: string) => string)) => void,
  setLiveEvents: (fn: BuilderEvent[] | ((prev: BuilderEvent[]) => BuilderEvent[])) => void,
  idleTimeoutMs?: number,
) {
  const effectiveIdleTimeout = idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
  const abortRef = useRef<AbortController | null>(null);

  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    readerRef.current?.cancel().catch(() => {});
    readerRef.current = null;
  }, []);

  const readSSEStream = useCallback(
    async (response: Response) => {
      const reader = response.body?.getReader();
      if (!reader) return;

      const controller = new AbortController();
      abortRef.current = controller;
      readerRef.current = reader;

      controller.signal.addEventListener('abort', () => {
        reader.cancel().catch(() => {});
      });

      let idleTimer: ReturnType<typeof setTimeout> | null = null;
      const resetIdleTimer = () => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          controller.abort();
          const mins = Math.round(effectiveIdleTimeout / 60_000);
          setLiveEvents(prev => [
            ...prev,
            { type: 'error', error: `Stream timed out — no data received for ${mins} minute${mins !== 1 ? 's' : ''}`, ts: Date.now() },
          ]);
        }, effectiveIdleTimeout);
      };
      resetIdleTimer();

      const decoder = new TextDecoder();
      let buffer = '';
      let content = '';
      let lastEventType = '';
      let consecutiveParseErrors = 0;

      try {
        while (!controller.signal.aborted) {
          const { done, value } = await reader.read();
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
                      setLiveEvents(prev => [
                        ...prev,
                        { type: 'agent_start', agent: payload.agent, ts },
                      ]);
                    }
                    break;

                  case 'tool_call':
                    setLiveEvents(prev => [
                      ...prev,
                      {
                        type: 'tool_call',
                        agent: payload.agent || '',
                        tool: payload.tool || 'unknown',
                        args: payload.args || {},
                        ts,
                      },
                    ]);
                    break;

                  case 'agent_output':
                    if (payload.text) {
                      content += payload.text;
                      setGeneratedContent(content);
                      setLiveEvents(prev => [
                        ...prev,
                        { type: 'agent_output', agent: payload.agent || '', text: payload.text, ts },
                      ]);
                    }
                    break;

                  case 'tool_result':
                    setLiveEvents(prev => [
                      ...prev,
                      {
                        type: 'tool_result',
                        agent: payload.agent || '',
                        tool: payload.tool || 'unknown',
                        result: typeof payload.result === 'string'
                          ? payload.result
                          : JSON.stringify(payload.result ?? payload.output ?? '', null, 2),
                        ts,
                      },
                    ]);
                    break;

                  case 'complete':
                    if (payload.skill_content) {
                      content = payload.skill_content;
                      setGeneratedContent(content);
                    }
                    setLiveEvents(prev => [
                      ...prev,
                      {
                        type: 'complete',
                        skillContent: payload.skill_content || '',
                        validation: payload.validation || '',
                        ts,
                      },
                    ]);
                    break;

                  case 'stream_end':
                    setLiveEvents(prev => [
                      ...prev,
                      { type: 'stream_end', ts },
                    ]);
                    break;

                  case 'error':
                    if (payload.error) {
                      setLiveEvents(prev => [
                        ...prev,
                        { type: 'error', error: payload.error, ts },
                      ]);
                    }
                    break;

                  default:
                    if (payload.text) {
                      content += payload.text;
                      setGeneratedContent(content);
                    }
                    if (payload.skill_content) {
                      content = payload.skill_content;
                      setGeneratedContent(content);
                    }
                    break;
                }
                lastEventType = '';
                consecutiveParseErrors = 0;
              } catch {
                consecutiveParseErrors++;
                if (consecutiveParseErrors >= 5) {
                  controller.abort();
                  setLiveEvents(prev => [
                    ...prev,
                    { type: 'error', error: 'Stream corrupted — too many malformed chunks', ts: Date.now() },
                  ]);
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
      }

      if (content) setGeneratedContent(content);
    },
    [setCurrentAgent, setGeneratedContent, setLiveEvents],
  );

  return { readSSEStream, abort };
}
