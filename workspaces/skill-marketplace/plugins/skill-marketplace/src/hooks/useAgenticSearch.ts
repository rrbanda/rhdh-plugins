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
import { useCallback, useRef, useState } from 'react';
import { useApi, fetchApiRef } from '@backstage/core-plugin-api';
import { skillMarketplaceApiRef } from '../api';
import type {
  ReasoningStep,
  AgenticStreamEvent,
} from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';

export interface AgenticMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  steps?: ReasoningStep[];
  sources?: string[];
  durationMs?: number;
  iterations?: number;
}

export interface StreamingState {
  status: 'idle' | 'thinking' | 'tool_call' | 'tool_result' | 'answering' | 'error';
  currentTool?: string;
  currentStep?: string;
}

export function useAgenticSearch() {
  const api = useApi(skillMarketplaceApiRef);
  const { fetch: backstageFetch } = useApi(fetchApiRef);
  const [messages, setMessages] = useState<AgenticMessage[]>([]);
  const [streaming, setStreaming] = useState<StreamingState>({ status: 'idle' });
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const msgIdRef = useRef(0);

  const sendQuery = useCallback(async (query: string, context?: string) => {
    if (isLoading || !query.trim()) return;

    const userMsgId = `msg-${++msgIdRef.current}`;
    const assistantMsgId = `msg-${++msgIdRef.current}`;

    setMessages(prev => [
      ...prev,
      { id: userMsgId, role: 'user', content: query },
    ]);
    setIsLoading(true);
    setStreaming({ status: 'thinking' });

    const steps: ReasoningStep[] = [];
    let answer = '';
    let sources: string[] = [];
    let durationMs = 0;
    let iterations = 0;

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const { url, body, headers } = await api.agenticQueryStreamUrl({
        query,
        context,
      });

      const res = await backstageFetch(url, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `HTTP ${res.status}`);
      }

      if (!res.body) {
        throw new Error('No response body');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        let eventType = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data: ') && eventType) {
            try {
              const event: AgenticStreamEvent = {
                type: eventType as AgenticStreamEvent['type'],
                data: JSON.parse(line.slice(6)),
              };
              processEvent(event);
            } catch {
              /* skip malformed events */
            }
            eventType = '';
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setStreaming({ status: 'error', currentStep: (err as Error).message });
        answer = answer || `Error: ${(err as Error).message}`;
      }
    } finally {
      abortRef.current = null;
      setIsLoading(false);
      setStreaming({ status: 'idle' });

      setMessages(prev => [
        ...prev,
        {
          id: assistantMsgId,
          role: 'assistant',
          content: answer || 'No response received.',
          steps: steps.length > 0 ? steps : undefined,
          sources: sources.length > 0 ? sources : undefined,
          durationMs,
          iterations: iterations || undefined,
        },
      ]);
    }

    function processEvent(event: AgenticStreamEvent) {
      const d = event.data as Record<string, unknown>;

      switch (event.type) {
        case 'thinking':
          setStreaming({
            status: 'thinking',
            currentStep: `Thinking (iteration ${d.iteration}/${d.maxIterations})...`,
          });
          break;

        case 'tool_call':
          setStreaming({
            status: 'tool_call',
            currentTool: String(d.tool),
            currentStep: `Calling ${friendlyToolName(String(d.tool))}...`,
          });
          break;

        case 'tool_result':
          steps.push({
            tool: String(d.tool),
            input: {},
            output: d.summary,
            durationMs: Number(d.durationMs) || 0,
          });
          setStreaming({
            status: 'tool_result',
            currentTool: String(d.tool),
            currentStep: `${friendlyToolName(String(d.tool))}: ${d.summary}`,
          });
          break;

        case 'answer':
          answer = String(d.answer);
          setStreaming({ status: 'answering', currentStep: 'Composing answer...' });
          break;

        case 'done':
          sources = (d.sources as string[]) ?? [];
          durationMs = Number(d.durationMs) || 0;
          iterations = Number(d.iterations) || 0;
          break;

        case 'error':
          setStreaming({ status: 'error', currentStep: String(d.error) });
          if (!answer) answer = `Error: ${d.error}`;
          break;
      }
    }
  }, [api, backstageFetch, isLoading]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clearHistory = useCallback(() => {
    setMessages([]);
    setStreaming({ status: 'idle' });
  }, []);

  return { messages, streaming, isLoading, sendQuery, cancel, clearHistory };
}

function friendlyToolName(name: string): string {
  const map: Record<string, string> = {
    search_skills_semantic: 'Semantic search',
    search_skills_keyword: 'Keyword search',
    get_skill_details: 'Fetching skill details',
    explore_graph: 'Exploring graph',
    query_relationships: 'Querying relationships',
    get_graph_schema: 'Reading schema',
    list_skills_by_domain: 'Listing domain skills',
  };
  return map[name] ?? name;
}
