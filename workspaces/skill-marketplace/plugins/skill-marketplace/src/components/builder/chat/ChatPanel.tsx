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
import { useMemo } from 'react';
import type { ChatMessage } from '../types';
import type { ChatMessageBase } from '../../chat/types';
import { ChatMessageList, ChatComposer } from '../../chat';
import { WelcomeHero } from './WelcomeHero';
import styles from './ChatPanel.module.css';

interface ChatPanelProps {
  messages: ChatMessage[];
  isGenerating: boolean;
  hasContent: boolean;
  onSend: (text: string) => void;
  onRetry: () => void;
  onClear: () => void;
  onAbort: () => void;
}

function toSharedMessages(messages: ChatMessage[]): ChatMessageBase[] {
  return messages.map(msg => ({
    id: msg.id,
    role: msg.role,
    text: msg.text,
    timestamp: msg.timestamp,
    isError: msg.isError,
    agentName: msg.role === 'agent' ? 'Skill Builder' : undefined,
  }));
}

export function ChatPanel({
  messages,
  isGenerating,
  hasContent,
  onSend,
  onRetry,
  onClear,
  onAbort,
}: ChatPanelProps) {
  const sharedMessages = useMemo(() => toSharedMessages(messages), [messages]);

  return (
    <div className={styles.chat}>
      {messages.length > 0 && (
        <div className={styles.chatHeader}>
          <span className={styles.chatHeaderTitle}>Skill Builder</span>
          <button
            type="button"
            className={styles.clearBtn}
            onClick={onClear}
            aria-label="Clear conversation and start over"
          >
            New Conversation
          </button>
        </div>
      )}
      <ChatMessageList
        messages={sharedMessages}
        isLoading={isGenerating}
        agentName="skill-builder"
        onRetry={onRetry}
        isGenerating={isGenerating}
        emptyState={<WelcomeHero onSuggestionClick={onSend} />}
      />

      <ChatComposer
        onSend={onSend}
        onStop={onAbort}
        onClear={onClear}
        isGenerating={isGenerating}
        hasMessages={messages.length > 0}
        placeholder={
          hasContent
            ? 'Describe changes to refine the skill...'
            : 'Describe the skill you want to create...'
        }
        sendLabel={hasContent ? 'Refine' : 'Generate'}
      />
    </div>
  );
}
