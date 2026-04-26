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
import type { ChatMessage } from '../types';

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

export function useBuilderChat(): UseBuilderChatReturn {
  const api = useApi(skillMarketplaceApiRef);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [contextId, setContextId] = useState('');
  const [generatedContent, setGeneratedContent] = useState('');
  const [publishContent, setPublishContent] = useState('');
  const [previousContent, setPreviousContent] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

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

      const isRefine = !!contextId && !!generatedContent;
      if (isRefine) setPreviousContent(generatedContent);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const prompt = isRefine
          ? `Refine this skill based on feedback.\n\nCurrent skill:\n${generatedContent}\n\nFeedback: ${trimmed}`
          : trimmed;

        const smpResult = (await api.askSmpAgent(
          'builder',
          prompt,
          contextId || undefined,
          controller.signal,
        )) as { answer?: string; contextId?: string };

        if (controller.signal.aborted) return;

        if (!smpResult?.answer) {
          throw new Error('Empty response from skill builder agent');
        }

        if (smpResult.contextId) {
          setContextId(smpResult.contextId);
        } else if (!contextId) {
          setContextId(globalThis.crypto.randomUUID());
        }

        const agentText = smpResult.answer;
        setGeneratedContent(agentText);
        setPublishContent(agentText);

        setMessages(prev => [
          ...prev,
          {
            id: nextMsgId(),
            role: 'agent',
            text: agentText,
            timestamp: Date.now(),
          },
        ]);
      } catch (err) {
        if (controller.signal.aborted) return;
        const msg =
          err instanceof Error ? err.message : 'Failed to reach agent';
        setMessages(prev => [
          ...prev,
          {
            id: nextMsgId(),
            role: 'agent',
            text: msg,
            timestamp: Date.now(),
            isError: true,
          },
        ]);
      } finally {
        setIsGenerating(false);
        abortRef.current = null;
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
    },
    [],
  );

  return {
    messages,
    isGenerating,
    generatedContent,
    publishContent,
    previousContent,
    contextId,
    send,
    retry,
    clear,
    abort,
    restore,
  };
}
