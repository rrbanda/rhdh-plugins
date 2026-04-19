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
import { useEffect, useCallback } from 'react';
import type { ChatMessage } from '../types';

const STORAGE_KEY = 'skill-builder-session';

interface SessionState {
  contextId: string;
  messages: ChatMessage[];
  generatedContent: string;
  savedAt: number;
}

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

export interface UseBuilderSessionOptions {
  contextId: string;
  messages: ChatMessage[];
  generatedContent: string;
  isGenerating: boolean;
  onRestore: (state: {
    contextId: string;
    messages: ChatMessage[];
    generatedContent: string;
  }) => void;
}

export function useBuilderSession(opts: UseBuilderSessionOptions) {
  const { contextId, messages, generatedContent, isGenerating, onRestore } = opts;

  // Restore session on mount
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const state: SessionState = JSON.parse(raw);
      if (Date.now() - state.savedAt > SESSION_TTL_MS) {
        sessionStorage.removeItem(STORAGE_KEY);
        return;
      }
      if (state.contextId && state.messages?.length > 0) {
        onRestore({
          contextId: state.contextId,
          messages: state.messages,
          generatedContent: state.generatedContent || '',
        });
      }
    } catch {
      sessionStorage.removeItem(STORAGE_KEY);
    }
    // only restore once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save after each completed turn
  useEffect(() => {
    if (isGenerating || !contextId || messages.length === 0) return;
    try {
      const state: SessionState = {
        contextId,
        messages,
        generatedContent,
        savedAt: Date.now(),
      };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // sessionStorage full or unavailable
    }
  }, [isGenerating, contextId, messages, generatedContent]);

  const clearSession = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
  }, []);

  return { clearSession };
}
