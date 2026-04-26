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
import { useRef, useEffect, useCallback, useState } from 'react';
import type { ChatMessageBase } from './types';
import { ChatBubble } from './ChatBubble';
import { ThinkingIndicator } from './ThinkingIndicator';
import styles from './ChatMessageList.module.css';

interface ChatMessageListProps {
  messages: ChatMessageBase[];
  isLoading?: boolean;
  agentName?: string;
  onRetry?: () => void;
  isGenerating?: boolean;
  emptyState?: React.ReactNode;
  selectedId?: string;
  onSelect?: (id: string) => void;
}

export function ChatMessageList({
  messages,
  isLoading,
  agentName,
  onRetry,
  isGenerating,
  emptyState,
  selectedId,
  onSelect,
}: ChatMessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [userScrolled, setUserScrolled] = useState(false);

  const scrollToBottom = useCallback(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (!userScrolled) {
      scrollToBottom();
    }
  }, [messages, isLoading, scrollToBottom, userScrolled]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    setUserScrolled(!atBottom);
  }, []);

  const showEmpty = messages.length === 0 && !isLoading;

  return (
    <div className={styles.list} ref={scrollRef} onScroll={handleScroll}>
      {showEmpty && emptyState}

      {messages.map((msg, idx) => (
        <ChatBubble
          key={msg.id}
          message={msg}
          isLast={idx === messages.length - 1}
          isGenerating={isGenerating}
          onRetry={onRetry}
          selected={msg.id === selectedId}
          onClick={onSelect ? () => onSelect(msg.id) : undefined}
        />
      ))}

      {isLoading && <ThinkingIndicator agentName={agentName} />}

      {userScrolled && messages.length > 0 && (
        <button
          type="button"
          className={styles.scrollBtn}
          onClick={() => {
            setUserScrolled(false);
            scrollToBottom();
          }}
          aria-label="Scroll to bottom"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      )}

      <div ref={endRef} />
    </div>
  );
}
