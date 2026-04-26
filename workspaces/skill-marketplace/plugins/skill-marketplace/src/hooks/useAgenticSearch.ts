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
import { useCallback, useEffect, useRef, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import type { GraphRAGSkill } from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import { skillMarketplaceApiRef } from '../api';

function newSessionId(): string {
  const c = globalThis.crypto;
  if (typeof c !== 'undefined' && typeof c.randomUUID === 'function') {
    return c.randomUUID();
  }
  return `sess-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export interface AgenticMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** When the message was created (for hover timestamps) */
  createdAt?: number;
  steps?: Array<{
    tool: string;
    input: Record<string, unknown>;
    output: unknown;
    durationMs: number;
  }>;
  sources?: string[];
  /** Skills returned from parallel Graph RAG for cards in the panel */
  ragSkills?: GraphRAGSkill[];
  durationMs?: number;
  iterations?: number;
}

export interface StreamingState {
  status:
    | 'idle'
    | 'thinking'
    | 'tool_call'
    | 'tool_result'
    | 'answering'
    | 'error';
  currentTool?: string;
  currentStep?: string;
}

export function useAgenticSearch() {
  const api = useApi(skillMarketplaceApiRef);
  const [messages, setMessages] = useState<AgenticMessage[]>([]);
  const [streaming, setStreaming] = useState<StreamingState>({
    status: 'idle',
  });
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const msgIdRef = useRef(0);
  const sessionIdRef = useRef(newSessionId());
  const isMountedRef = useRef(true);
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const sendQuery = useCallback(
    async (query: string, context?: string) => {
      if (isLoading || !query.trim()) return;

      const startTime = Date.now();
      const userMsgId = `msg-${++msgIdRef.current}`;
      const assistantMsgId = `msg-${++msgIdRef.current}`;

      const userCreatedAt = Date.now();
      setMessages(prev => [
        ...prev,
        {
          id: userMsgId,
          role: 'user',
          content: query,
          createdAt: userCreatedAt,
        },
      ]);
      setIsLoading(true);
      setStreaming({
        status: 'thinking',
        currentStep: 'Querying KG Q&A agent...',
      });

      const controller = new AbortController();
      abortRef.current = controller;

      const prompt = context ? `${query}\n\nContext: ${context}` : query;
      const contextId = sessionIdRef.current;
      let answer = '';
      let sources: string[] = [];
      let ragSkills: GraphRAGSkill[] = [];

      try {
        setStreaming({
          status: 'answering',
          currentStep: 'Querying knowledge graph and RAG...',
        });
        const [agentResult, ragResult] = await Promise.allSettled([
          api.askSmpAgent('kgqa', prompt, contextId),
          api.queryRAG({ query, maxResults: 10, includeRelated: true }),
        ]);

        answer =
          agentResult.status === 'fulfilled'
            ? agentResult.value.answer
            : `Error: ${
                agentResult.reason instanceof Error
                  ? agentResult.reason.message
                  : 'Agent request failed'
              }`;

        sources =
          ragResult.status === 'fulfilled'
            ? ragResult.value.skills.map(s => s.skill.name)
            : [];
        ragSkills =
          ragResult.status === 'fulfilled' ? ragResult.value.skills : [];
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          answer = `Error: ${(err as Error).message}`;
        }
      } finally {
        abortRef.current = null;
      }

      if (!isMountedRef.current) {
        setIsLoading(false);
        return;
      }
      if (controller.signal.aborted) {
        setIsLoading(false);
        return;
      }
      setIsLoading(false);
      if (answer !== undefined && answer !== null) {
        setMessages(prev => [
          ...prev,
          {
            id: assistantMsgId,
            role: 'assistant',
            content: answer || 'No response from the agent.',
            sources: sources.length > 0 ? sources : undefined,
            ragSkills: ragSkills.length > 0 ? ragSkills : undefined,
            durationMs: Date.now() - startTime,
            createdAt: Date.now(),
          },
        ]);
      }
      setStreaming(
        answer.startsWith('Error:')
          ? { status: 'error', currentStep: answer }
          : { status: 'idle' },
      );
    },
    [api, isLoading],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clearHistory = useCallback(() => {
    setMessages([]);
    setStreaming({ status: 'idle' });
    sessionIdRef.current = newSessionId();
  }, []);

  return { messages, streaming, isLoading, sendQuery, cancel, clearHistory };
}
