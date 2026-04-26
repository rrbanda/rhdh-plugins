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
import { useState, useCallback } from 'react';
import type { ChatMessageBase } from './types';
import { MarkdownBody } from './MarkdownBody';
import { CopyButton } from './CopyButton';
import { ToolCallChip } from './ToolCallChip';
import styles from './ChatBubble.module.css';

interface ChatBubbleProps {
  message: ChatMessageBase;
  isLast?: boolean;
  isGenerating?: boolean;
  onRetry?: () => void;
  selected?: boolean;
  onClick?: () => void;
}

export function ChatBubble({
  message,
  isLast,
  isGenerating,
  onRetry,
  selected,
  onClick,
}: ChatBubbleProps) {
  const [validExpanded, setValidExpanded] = useState(false);

  const isUser = message.role === 'user';
  const isAgent = message.role === 'agent';

  const handleRetry = useCallback(() => {
    onRetry?.();
  }, [onRetry]);

  return (
    <div
      className={`${styles.row} ${isUser ? styles.rowUser : styles.rowAgent} ${selected ? styles.selected : ''}`}
      onClick={onClick}
      onKeyDown={
        onClick
          ? e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? 'Select message' : undefined}
    >
      <div className={styles.avatarCol}>
        {isUser ? (
          <span className={`${styles.avatar} ${styles.avatarUser}`}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </span>
        ) : (
          <span className={`${styles.avatar} ${styles.avatarAgent}`}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="3" y="11" width="18" height="10" rx="2" />
              <circle cx="9" cy="16" r="1" fill="currentColor" />
              <circle cx="15" cy="16" r="1" fill="currentColor" />
              <path d="M8 11V7a4 4 0 018 0v4" />
            </svg>
          </span>
        )}
      </div>

      <div className={styles.bubble}>
        <div className={styles.header}>
          <span className={styles.role}>
            {isUser ? 'You' : message.agentName || 'Agent'}
          </span>
          {message.thought && (
            <span className={styles.thoughtChip}>Thought</span>
          )}
          {message.skill && (
            <span className={styles.skillBadge}>{message.skill}</span>
          )}
          <span className={styles.time}>{timeAgo(message.timestamp)}</span>
          {isAgent && !message.isError && (
            <CopyButton text={message.text} className={styles.copyMsg} />
          )}
        </div>

        {isUser && message.skill && (
          <div className={styles.skillContext}>
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
            </svg>
            Using skill: <strong>{message.skill}</strong>
          </div>
        )}

        <div
          className={`${styles.card} ${isUser ? styles.cardUser : styles.cardAgent} ${message.isError ? styles.cardError : ''} ${message.thought ? styles.cardThought : ''}`}
        >
          {isUser ? (
            <div className={styles.plainText}>{message.text}</div>
          ) : (
            <MarkdownBody text={message.text} thought={message.thought} />
          )}
        </div>

        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className={styles.tools}>
            {message.toolCalls.map((tc, idx) => (
              <ToolCallChip key={`${tc.name}-${idx}`} tool={tc} />
            ))}
          </div>
        )}

        {message.validation && (
          <div className={styles.validation}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--sm-success)"
              strokeWidth="2.5"
            >
              <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <div className={styles.validationBody}>
              <div className={styles.validationTitle}>Validation Passed</div>
              <div className={styles.validationText}>
                {validExpanded
                  ? message.validation
                  : message.validation.length > 300
                    ? `${message.validation.slice(0, 300)}...`
                    : message.validation}
              </div>
              {message.validation.length > 300 && (
                <button
                  className={styles.validationToggle}
                  onClick={() => setValidExpanded(p => !p)}
                  type="button"
                >
                  {validExpanded ? 'Show less' : 'Show full validation'}
                </button>
              )}
            </div>
          </div>
        )}

        {message.isError && isLast && !isGenerating && onRetry && (
          <button
            className={styles.retryBtn}
            onClick={handleRetry}
            type="button"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
            </svg>
            Retry
          </button>
        )}
      </div>
    </div>
  );
}

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 10) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}
