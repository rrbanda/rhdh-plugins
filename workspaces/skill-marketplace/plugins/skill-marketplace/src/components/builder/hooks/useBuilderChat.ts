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
import { useApi } from '@backstage/core-plugin-api';
import { skillMarketplaceApiRef } from '../../../api';
import type { BuilderEvent, ChatMessage } from '../types';

let msgIdCounter = 0;
function nextMsgId(): string {
  msgIdCounter += 1;
  return `msg-${Date.now()}-${msgIdCounter}`;
}

export interface UseBuilderChatReturn {
  messages: ChatMessage[];
  isGenerating: boolean;
  generatedContent: string;
  publishContent: string;
  previousContent: string;
  currentAgent: string;
  events: BuilderEvent[];
  contextId: string;
  send: (text: string) => Promise<void>;
  retry: () => void;
  clear: () => void;
  abort: () => void;
  restore: (state: {
    contextId: string;
    messages: ChatMessage[];
    generatedContent: string;
  }) => void;
}

const MAX_RETRIES = 2;

export function useBuilderChat(): UseBuilderChatReturn {
  const api = useApi(skillMarketplaceApiRef);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [contextId, setContextId] = useState('');
  const [generatedContent, setGeneratedContent] = useState('');
  const [publishContent, setPublishContent] = useState('');
  const [previousContent, setPreviousContent] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [events, setEvents] = useState<BuilderEvent[]>([]);

  const lastUserInputRef = useRef('');
  const abortRef = useRef<AbortController | null>(null);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsGenerating(false);
  }, []);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isGenerating) return;

      lastUserInputRef.current = trimmed;
      setMessages(prev => [
        ...prev,
        { id: nextMsgId(), role: 'user', text: trimmed, timestamp: Date.now() },
      ]);
      setIsGenerating(true);
      setEvents([]);

      const isRefine = !!contextId && !!generatedContent;
      if (isRefine) setPreviousContent(generatedContent);

      const controller = new AbortController();
      abortRef.current = controller;

      let errorMsg: string | null = null;
      let finalContent = '';
      const localEvents: BuilderEvent[] = [];

      const startEvt: BuilderEvent = {
        type: 'agent_start',
        agent: 'skill-builder',
        ts: Date.now(),
      };
      localEvents.push(startEvt);
      setEvents([startEvt]);

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        errorMsg = null;
        try {
          let result: { content: string; action: string };

          // Try smp-agents /agents/builder first for richer generation
          let usedSmpAgent = false;
          try {
            const smpResult = (await api.askSmpAgent(
              'builder',
              isRefine
                ? `Refine this skill based on feedback.\n\nCurrent skill:\n${generatedContent}\n\nFeedback: ${trimmed}`
                : trimmed,
              contextId || undefined,
              controller.signal,
            )) as { answer?: string; contextId?: string };
            if (smpResult?.answer) {
              if (smpResult.contextId) {
                setContextId(smpResult.contextId);
              } else if (!contextId) {
                setContextId(globalThis.crypto.randomUUID());
              }
              result = {
                content: smpResult.answer,
                action: isRefine ? 'refine' : 'generate',
              };
              usedSmpAgent = true;
            } else {
              throw new Error('Empty response from smp-agent builder');
            }
          } catch (primaryErr: unknown) {
            const p = primaryErr as {
              response?: { status?: number };
              status?: number;
            };
            const status = p?.response?.status ?? p?.status;
            if (status === 403 || status === 401) {
              throw primaryErr;
            }
            console.warn(
              'Builder primary path failed, falling back:',
              primaryErr instanceof Error ? primaryErr.message : primaryErr,
            );
          }

          // Fall back to legacy /builder endpoint
          if (!usedSmpAgent) {
            if (isRefine) {
              result = await api.refineSkillJson(
                {
                  prompt: trimmed,
                  feedback: trimmed,
                  currentSkill: generatedContent,
                  context_id: contextId,
                },
                controller.signal,
              );
            } else {
              const cid = contextId || `builder-${Date.now()}`;
              if (!contextId) setContextId(cid);
              result = await api.generateSkillJson(
                {
                  prompt: trimmed,
                  description: trimmed,
                  context_id: cid,
                },
                controller.signal,
              );
            }
          }

          if (controller.signal.aborted) return;

          finalContent = result!.content;
          const completeEvt: BuilderEvent = {
            type: 'complete',
            skillContent: result!.content,
            fullOutput: result!.content,
            validation: '',
            ts: Date.now(),
          };
          localEvents.push(completeEvt);
          setEvents([...localEvents]);
          break;
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Generation failed';
          const isNetworkError =
            msg.toLowerCase().includes('network') ||
            msg.toLowerCase().includes('fetch') ||
            msg.toLowerCase().includes('failed to fetch') ||
            msg.toLowerCase().includes('aborted');

          if (isNetworkError && attempt < MAX_RETRIES) {
            await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
            continue;
          }
          errorMsg = isNetworkError
            ? `Network error — could not reach the builder agent. Check that the backend is running and the builder agent URL is configured. Original error: ${msg}`
            : msg;
        }
      }

      setIsGenerating(false);
      if (finalContent) {
        setGeneratedContent(finalContent);
        setPublishContent(finalContent);
      }

      if (errorMsg) {
        const errEvt: BuilderEvent = {
          type: 'error',
          error: errorMsg,
          ts: Date.now(),
        };
        localEvents.push(errEvt);
        setEvents([...localEvents]);
        setMessages(prev => [
          ...prev,
          {
            id: nextMsgId(),
            role: 'agent',
            text: errorMsg!,
            timestamp: Date.now(),
            isError: true,
            events: [...localEvents],
          },
        ]);
      } else if (finalContent) {
        setMessages(prev => [
          ...prev,
          {
            id: nextMsgId(),
            role: 'agent',
            text: isRefine
              ? 'Skill refined successfully. Check the updated preview.'
              : 'Skill generated successfully. Review the preview and publish when ready.',
            timestamp: Date.now(),
            events: [...localEvents],
          },
        ]);
      } else {
        setMessages(prev => [
          ...prev,
          {
            id: nextMsgId(),
            role: 'agent',
            text: 'Generation completed with no output. Try describing the skill differently.',
            timestamp: Date.now(),
            isError: true,
            events: [...localEvents],
          },
        ]);
      }
    },
    [api, isGenerating, contextId, generatedContent],
  );

  const retry = useCallback(() => {
    const lastInput = lastUserInputRef.current;
    if (!lastInput || isGenerating) return;
    setMessages(prev => {
      const last = prev[prev.length - 1];
      if (last?.role === 'agent' && last.isError) return prev.slice(0, -1);
      return prev;
    });
    send(lastInput);
  }, [isGenerating, send]);

  const clear = useCallback(() => {
    setMessages([]);
    setContextId('');
    setGeneratedContent('');
    setPublishContent('');
    setPreviousContent('');
    setEvents([]);
  }, []);

  const restore = useCallback(
    (state: {
      contextId: string;
      messages: ChatMessage[];
      generatedContent: string;
    }) => {
      setContextId(state.contextId);
      setMessages(state.messages);
      const content = state.generatedContent || '';
      setGeneratedContent(content);
      setPublishContent(content);
      setPreviousContent('');
      setEvents([]);
    },
    [],
  );

  return {
    messages,
    isGenerating,
    generatedContent,
    publishContent,
    previousContent,
    currentAgent: 'skill-builder',
    events,
    contextId,
    send,
    retry,
    clear,
    abort,
    restore,
  };
}
