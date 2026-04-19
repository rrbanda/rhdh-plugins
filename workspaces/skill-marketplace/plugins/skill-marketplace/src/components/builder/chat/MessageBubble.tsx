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
import { useState, useMemo } from 'react';
import type { ChatMessage, BuilderEvent } from '../types';
import { ToolCallAccordion } from './ToolCallAccordion';

const messageBubbleStyles = `
.bld-msg {
  padding: 12px 16px;
  margin: 4px 16px;
  border-radius: 12px;
  animation: bld-msg-in 0.2s ease;
}
@keyframes bld-msg-in { from { opacity: 0; transform: translateY(6px); } }

.bld-msg--user {
  background: var(--pf-t--global--color--brand--default, #0066cc)0d;
  border: 1px solid var(--pf-t--global--color--brand--default, #0066cc)22;
}
.bld-msg--agent {
  background: var(--pf-t--global--background--color--secondary--default, #f8f8f8);
  border: 1px solid var(--pf-t--global--border--color--default, #e8e8e8);
}
.bld-msg--error {
  border-color: var(--pf-t--global--color--status--danger--default, #c9190b)44;
  background: var(--pf-t--global--color--status--danger--default, #c9190b)08;
}

.bld-msg-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.bld-msg-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}
.bld-msg--user .bld-msg-avatar {
  background: var(--pf-t--global--color--brand--default, #0066cc);
  color: #fff;
}
.bld-msg--agent .bld-msg-avatar {
  background: var(--pf-t--global--background--color--secondary--default, #e8e8e8);
  color: var(--pf-t--global--text--color--regular, #151515);
}

.bld-msg-role {
  font-size: 13px;
  font-weight: 500;
  color: var(--pf-t--global--text--color--regular, #151515);
}
.bld-msg-ts {
  font-size: 11px;
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
  margin-left: auto;
}

.bld-msg-text {
  font-size: 14px;
  line-height: 1.5;
  color: var(--pf-t--global--text--color--regular, #151515);
  word-break: break-word;
}

.bld-msg-retry {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
  padding: 6px 12px;
  border: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
  border-radius: 6px;
  background: var(--pf-t--global--background--color--primary--default, #fff);
  cursor: pointer;
  font-size: 13px;
  color: var(--pf-t--global--text--color--regular, #151515);
}
.bld-msg-retry:hover {
  background: var(--pf-t--global--background--color--secondary--default, #f0f0f0);
}
.bld-msg-retry:focus-visible {
  outline: 2px solid var(--pf-t--global--color--brand--default, #0066cc);
}

.bld-msg-tools {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.bld-validation {
  display: flex;
  gap: 10px;
  margin: 8px 16px;
  padding: 12px 14px;
  border-radius: 8px;
  background: var(--pf-t--global--color--status--success--default, #3e8635)0d;
  border: 1px solid var(--pf-t--global--color--status--success--default, #3e8635)33;
}
.bld-validation-icon {
  color: var(--pf-t--global--color--status--success--default, #3e8635);
  font-size: 16px;
  flex-shrink: 0;
  margin-top: 2px;
}
.bld-validation-body {
  flex: 1;
  min-width: 0;
}
.bld-validation-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--pf-t--global--color--status--success--default, #3e8635);
  margin-bottom: 4px;
}
.bld-validation-text {
  font-size: 13px;
  line-height: 1.5;
  color: var(--pf-t--global--text--color--regular, #151515);
  white-space: pre-wrap;
}
.bld-validation-toggle {
  border: none;
  background: none;
  cursor: pointer;
  font-size: 12px;
  color: var(--pf-t--global--color--brand--default, #0066cc);
  padding: 2px 0;
  margin-top: 4px;
}
.bld-validation-toggle:hover { text-decoration: underline; }
`;

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 10) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

interface MessageBubbleProps {
  message: ChatMessage;
  isLast: boolean;
  isGenerating: boolean;
  onRetry: () => void;
}

export function MessageBubble({ message, isLast, isGenerating, onRetry }: MessageBubbleProps) {
  const [validationExpanded, setValidationExpanded] = useState(false);

  const toolPairs = useMemo(() => {
    if (!message.events) return [];
    const results = new Map<string, Extract<BuilderEvent, { type: 'tool_result' }>>();
    for (const e of message.events) {
      if (e.type === 'tool_result') results.set(`${e.agent}:${e.tool}`, e);
    }
    return message.events
      .filter((e): e is Extract<BuilderEvent, { type: 'tool_call' }> => e.type === 'tool_call')
      .map(tc => ({
        call: tc,
        result: results.get(`${tc.agent}:${tc.tool}`),
      }));
  }, [message.events]);

  return (
    <>
      <style>{messageBubbleStyles}</style>
      <div>
        <div className={`bld-msg bld-msg--${message.role}${message.isError ? ' bld-msg--error' : ''}`}>
          <div className="bld-msg-header">
            <span className="bld-msg-avatar">
              {message.role === 'user' ? 'U' : '\u2726'}
            </span>
            <span className="bld-msg-role">
              {message.role === 'user' ? 'You' : 'Skill Builder'}
            </span>
            <span className="bld-msg-ts">{timeAgo(message.timestamp)}</span>
          </div>
          <div className="bld-msg-text">{message.text}</div>

          {message.isError && isLast && !isGenerating && (
            <button className="bld-msg-retry" onClick={onRetry} type="button">
              &#8635; Retry
            </button>
          )}
        </div>

        {toolPairs.length > 0 && (
          <div className="bld-msg-tools" style={{ margin: '4px 16px' }}>
            {toolPairs.map((pair, idx) => (
              <ToolCallAccordion key={idx} toolCall={pair.call} toolResult={pair.result} />
            ))}
          </div>
        )}

        {message.validation && (
          <div className="bld-validation">
            <span className="bld-validation-icon">&#10003;</span>
            <div className="bld-validation-body">
              <div className="bld-validation-title">Validation Passed</div>
              <div className="bld-validation-text">
                {validationExpanded
                  ? message.validation
                  : message.validation.length > 300
                    ? `${message.validation.slice(0, 300)}...`
                    : message.validation}
              </div>
              {message.validation.length > 300 && (
                <button
                  className="bld-validation-toggle"
                  onClick={() => setValidationExpanded(prev => !prev)}
                  type="button"
                >
                  {validationExpanded ? 'Show less' : 'Show full validation'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
