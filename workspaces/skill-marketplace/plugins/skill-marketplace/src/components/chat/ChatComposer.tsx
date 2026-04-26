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
import styles from './ChatComposer.module.css';

interface ChatComposerProps {
  onSend: (text: string) => void;
  onStop?: () => void;
  onClear?: () => void;
  isGenerating?: boolean;
  disabled?: boolean;
  placeholder?: string;
  sendLabel?: string;
  hasMessages?: boolean;
}

export function ChatComposer({
  onSend,
  onStop,
  onClear,
  isGenerating,
  disabled,
  placeholder = 'Send a message...',
  sendLabel = 'Send',
  hasMessages,
}: ChatComposerProps) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resetTextarea = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, []);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isGenerating || disabled) return;
    onSend(trimmed);
    setInput('');
    resetTextarea();
  }, [input, isGenerating, disabled, onSend, resetTextarea]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const autoGrow = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, []);

  const isDisabled = disabled || false;

  return (
    <div className={styles.bar}>
      <div className={styles.composer}>
        <textarea
          ref={textareaRef}
          className={styles.textarea}
          value={input}
          onChange={e => {
            setInput(e.target.value);
            autoGrow();
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          disabled={isGenerating || isDisabled}
          aria-label="Message input"
        />
        <div className={styles.footer}>
          <div className={styles.footerLeft}>
            <span className={styles.kbdHint}>
              {'\u21B5'} Send {'\u00B7'} Shift+{'\u21B5'} New line
            </span>
            {hasMessages && onClear && (
              <button
                className={styles.textBtn}
                onClick={onClear}
                type="button"
              >
                Clear
              </button>
            )}
          </div>
          <div className={styles.footerRight}>
            {isGenerating && onStop ? (
              <button className={styles.stopBtn} onClick={onStop} type="button">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <rect x="4" y="4" width="16" height="16" rx="2" />
                </svg>
                Stop
              </button>
            ) : (
              <button
                className={styles.sendBtn}
                onClick={handleSend}
                disabled={!input.trim() || isDisabled}
                type="button"
              >
                {sendLabel}
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
