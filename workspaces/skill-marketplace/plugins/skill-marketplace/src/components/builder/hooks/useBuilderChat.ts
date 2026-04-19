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
import { useState, useCallback, useRef, useEffect } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { skillMarketplaceApiRef } from '../../../api';
import { useBuilderSSE } from './useBuilderSSE';
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
  previousContent: string;
  currentAgent: string;
  events: BuilderEvent[];
  contextId: string;
  send: (text: string) => Promise<void>;
  retry: () => void;
  clear: () => void;
  abort: () => void;
}

const MAX_RETRIES = 2;

export function useBuilderChat(): UseBuilderChatReturn {
  const api = useApi(skillMarketplaceApiRef);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [contextId, setContextId] = useState('');
  const [generatedContent, setGeneratedContent] = useState('');
  const [previousContent, setPreviousContent] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamIdleTimeout, setStreamIdleTimeout] = useState<number | undefined>(undefined);

  const lastUserInputRef = useRef('');

  const sse = useBuilderSSE({ idleTimeoutMs: streamIdleTimeout });

  useEffect(() => {
    let cancelled = false;
    api
      .getHealth()
      .then((health: Record<string, unknown>) => {
        if (cancelled) return;
        const builder = health.builder as { streamTimeoutMs?: number } | undefined;
        if (builder?.streamTimeoutMs) setStreamIdleTimeout(builder.streamTimeoutMs);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [api]);

  useEffect(() => () => sse.abort(), [sse]);

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
      sse.resetEvents();

      const isRefine = !!contextId && !!generatedContent;
      if (isRefine) setPreviousContent(generatedContent);

      let errorMsg: string | null = null;
      let finalEvents: BuilderEvent[] = [];

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        errorMsg = null;
        try {
          if (isRefine) {
            const response = await api.refineSkill({
              feedback: trimmed,
              context_id: contextId,
            });
            await sse.startStream(response);
          } else {
            const cid = contextId || `builder-${Date.now()}`;
            if (!contextId) setContextId(cid);
            const response = await api.generateSkill({
              description: trimmed,
              context_id: cid,
            });
            await sse.startStream(response);
          }
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
            sse.resetEvents();
            continue;
          }
          errorMsg = isNetworkError
            ? `Network error \u2014 could not reach the builder agent. Check that the backend is running and the builder agent URL is configured. Original error: ${msg}`
            : msg;
        }
      }

      setIsGenerating(false);

      // Capture final state from sse -- events are preserved
      finalEvents = sse.events;
      if (sse.content) setGeneratedContent(sse.content);

      const hasCompletion = finalEvents.some(e => e.type === 'complete');
      const streamError = finalEvents.find(
        (e): e is Extract<BuilderEvent, { type: 'error' }> => e.type === 'error',
      );

      if (errorMsg) {
        setMessages(prev => [
          ...prev,
          {
            id: nextMsgId(),
            role: 'agent',
            text: errorMsg!,
            timestamp: Date.now(),
            isError: true,
            events: finalEvents,
          },
        ]);
      } else if (streamError) {
        setMessages(prev => [
          ...prev,
          {
            id: nextMsgId(),
            role: 'agent',
            text: streamError.error,
            timestamp: Date.now(),
            isError: true,
            events: finalEvents,
          },
        ]);
      } else if (hasCompletion) {
        const completeEvt = finalEvents.find(e => e.type === 'complete');
        setMessages(prev => [
          ...prev,
          {
            id: nextMsgId(),
            role: 'agent',
            text: isRefine
              ? 'Skill refined successfully. Check the updated preview.'
              : 'Skill generated successfully. Review the preview and publish when ready.',
            timestamp: Date.now(),
            events: finalEvents,
            validation: completeEvt?.type === 'complete' ? completeEvt.validation : undefined,
          },
        ]);
      } else {
        const streamEnded = finalEvents.some(e => e.type === 'stream_end');
        const hasContent = !!sse.content;
        const message = streamEnded && !hasContent
          ? 'The agent ended unexpectedly without producing output. Please try again.'
          : streamEnded
            ? 'The stream ended without full completion. Partial output is shown in the preview.'
            : 'Generation completed with no final result. Try describing the skill differently.';
        setMessages(prev => [
          ...prev,
          {
            id: nextMsgId(),
            role: 'agent',
            text: message,
            timestamp: Date.now(),
            isError: !hasContent,
            events: finalEvents,
          },
        ]);
      }
    },
    [api, isGenerating, contextId, generatedContent, sse],
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
    setPreviousContent('');
    sse.resetEvents();
  }, [sse]);

  return {
    messages,
    isGenerating,
    generatedContent,
    previousContent,
    currentAgent: sse.currentAgent,
    events: sse.events,
    contextId,
    send,
    retry,
    clear,
    abort: sse.abort,
  };
}
