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

const composerStyles = `
.bld-input-bar {
  border-top: 1px solid var(--pf-t--global--border--color--default, #e8e8e8);
  padding: 12px 16px;
  flex-shrink: 0;
  background: var(--pf-t--global--background--color--primary--default, #fff);
}

.bld-composer {
  border: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
  border-radius: 12px;
  overflow: hidden;
  transition: border-color 0.15s;
}
.bld-composer:focus-within {
  border-color: var(--pf-t--global--color--brand--default, #0066cc);
  box-shadow: 0 0 0 2px var(--pf-t--global--color--brand--default, #0066cc)22;
}

.bld-textarea {
  width: 100%;
  border: none;
  outline: none;
  resize: none;
  padding: 12px 16px;
  font-size: 14px;
  font-family: inherit;
  line-height: 1.5;
  background: transparent;
  color: var(--pf-t--global--text--color--regular, #151515);
  box-sizing: border-box;
}
.bld-textarea::placeholder {
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
}

.bld-composer-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  background: var(--pf-t--global--background--color--secondary--default, #fafafa);
}

.bld-composer-left {
  display: flex;
  align-items: center;
  gap: 6px;
}
.bld-kbd-hint {
  font-size: 11px;
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
}

.bld-text-btn {
  border: none;
  background: none;
  cursor: pointer;
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 4px;
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
}
.bld-text-btn:hover {
  background: var(--pf-t--global--background--color--secondary--default, #f0f0f0);
  color: var(--pf-t--global--text--color--regular, #151515);
}
.bld-text-btn:focus-visible {
  outline: 2px solid var(--pf-t--global--color--brand--default, #0066cc);
}

.bld-composer-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.bld-send-btn {
  padding: 6px 14px;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  background: var(--pf-t--global--color--brand--default, #0066cc);
  color: #fff;
  transition: opacity 0.15s;
}
.bld-send-btn:hover { opacity: 0.9; }
.bld-send-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.bld-send-btn:focus-visible {
  outline: 2px solid var(--pf-t--global--color--brand--default, #0066cc);
  outline-offset: 2px;
}

.bld-stop-btn {
  padding: 6px 14px;
  border: 1px solid var(--pf-t--global--color--status--danger--default, #c9190b);
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  background: transparent;
  color: var(--pf-t--global--color--status--danger--default, #c9190b);
}
.bld-stop-btn:hover {
  background: var(--pf-t--global--color--status--danger--default, #c9190b)0d;
}
.bld-stop-btn:focus-visible {
  outline: 2px solid var(--pf-t--global--color--status--danger--default, #c9190b);
  outline-offset: 2px;
}

`;

interface ComposerProps {
  isGenerating: boolean;
  hasContent: boolean;
  hasMessages: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  onClear: () => void;
}

export function Composer({
  isGenerating,
  hasContent,
  hasMessages,
  onSend,
  onStop,
  onClear,
}: ComposerProps) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (input.trim() && !isGenerating) {
          onSend(input.trim());
          setInput('');
          if (textareaRef.current) textareaRef.current.style.height = 'auto';
        }
      }
    },
    [input, isGenerating, onSend],
  );

  const handleSend = useCallback(() => {
    if (input.trim() && !isGenerating) {
      onSend(input.trim());
      setInput('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    }
  }, [input, isGenerating, onSend]);

  const autoGrow = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 144)}px`;
  }, []);

  return (
    <>
      <style>{composerStyles}</style>
      <div className="bld-input-bar">
        <div className="bld-composer">
          <textarea
            ref={textareaRef}
            className="bld-textarea"
            value={input}
            onChange={e => {
              setInput(e.target.value);
              autoGrow();
            }}
            onKeyDown={handleKeyDown}
            placeholder={
              hasContent ? 'Describe changes to refine the skill...' : 'Describe the skill you want to create...'
            }
            rows={2}
            disabled={isGenerating}
            aria-label={hasContent ? 'Refine skill description' : 'Skill description'}
          />
          <div className="bld-composer-footer">
            <div className="bld-composer-left">
              <span className="bld-kbd-hint">&#8629; Send &middot; Shift+&#8629; New line</span>
              {hasMessages && (
                <button
                  className="bld-text-btn"
                  onClick={onClear}
                  type="button"
                  aria-label="Clear conversation"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="bld-composer-actions">
              {isGenerating ? (
                <button className="bld-stop-btn" onClick={onStop} type="button">
                  &#9632; Stop
                </button>
              ) : (
                <button
                  className="bld-send-btn"
                  onClick={handleSend}
                  disabled={!input.trim()}
                  type="button"
                >
                  {hasContent ? 'Refine' : 'Generate'} &#8594;
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
