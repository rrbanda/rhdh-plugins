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
import { useState, useEffect, useCallback } from 'react';
import type { BuilderEvent } from '../types';

const toolCallStyles = `
.bld-tool-card {
  border: 1px solid var(--pf-t--global--border--color--default, #e8e8e8);
  border-radius: 8px;
  overflow: hidden;
  margin: 4px 0;
  transition: border-color 0.2s;
}
.bld-tool-card--pending {
  border-color: var(--pf-t--global--color--brand--default, #0066cc)44;
}
.bld-tool-card--done {
  border-color: var(--pf-t--global--border--color--default, #e8e8e8);
}

.bld-tool-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  border: none;
  background: var(--pf-t--global--background--color--secondary--default, #f8f8f8);
  width: 100%;
  text-align: left;
  font-size: 13px;
  color: var(--pf-t--global--text--color--regular, #151515);
}
.bld-tool-summary:hover {
  background: var(--pf-t--global--background--color--secondary--hover, #f0f0f0);
}
.bld-tool-summary:focus-visible {
  outline: 2px solid var(--pf-t--global--color--brand--default, #0066cc);
  outline-offset: -2px;
}

.bld-tool-icon {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  flex-shrink: 0;
}
.bld-tool-icon--done {
  background: var(--pf-t--global--color--status--success--default, #3e8635)22;
  color: var(--pf-t--global--color--status--success--default, #3e8635);
}
.bld-tool-icon--pending {
  background: var(--pf-t--global--color--brand--default, #0066cc)22;
  color: var(--pf-t--global--color--brand--default, #0066cc);
}

.bld-tool-name {
  font-weight: 500;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bld-tool-agent-tag {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--pf-t--global--background--color--secondary--default, #f0f0f0);
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
}

.bld-tool-timer {
  font-size: 12px;
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}
.bld-tool-spinner {
  width: 12px;
  height: 12px;
  border: 2px solid var(--pf-t--global--color--brand--default, #0066cc)44;
  border-top-color: var(--pf-t--global--color--brand--default, #0066cc);
  border-radius: 50%;
  animation: bld-spin 0.8s linear infinite;
}
@keyframes bld-spin { to { transform: rotate(360deg); } }

.bld-tool-chevron {
  font-size: 10px;
  transition: transform 0.2s;
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
}
.bld-tool-chevron--open {
  transform: rotate(90deg);
}

.bld-tool-details {
  padding: 12px;
  border-top: 1px solid var(--pf-t--global--border--color--default, #e8e8e8);
  background: var(--pf-t--global--background--color--primary--default, #fff);
}
.bld-tool-section-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.bld-tool-json {
  font-family: var(--pf-t--global--font--family--mono, 'Red Hat Mono', monospace);
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  padding: 10px 12px;
  border-radius: 6px;
  background: var(--pf-t--global--background--color--secondary--default, #f5f5f5);
  margin-bottom: 10px;
  max-height: 400px;
  overflow-y: auto;
}
.bld-tool-copy-btn {
  border: none;
  background: none;
  cursor: pointer;
  font-size: 11px;
  color: var(--pf-t--global--color--brand--default, #0066cc);
  padding: 2px 6px;
  border-radius: 4px;
}
.bld-tool-copy-btn:hover {
  background: var(--pf-t--global--background--color--secondary--default, #f0f0f0);
}
`;

interface ToolCallAccordionProps {
  toolCall: Extract<BuilderEvent, { type: 'tool_call' }>;
  toolResult?: Extract<BuilderEvent, { type: 'tool_result' }>;
}

export function ToolCallAccordion({ toolCall, toolResult }: ToolCallAccordionProps) {
  const [expanded, setExpanded] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const done = !!toolResult;

  useEffect(() => {
    if (done) {
      setElapsed(Math.round((toolResult.ts - toolCall.ts) / 1000));
      return;
    }
    const start = toolCall.ts;
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [done, toolCall.ts, toolResult?.ts]);

  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
  }, []);

  const argsText = JSON.stringify(toolCall.args, null, 2);

  return (
    <>
      <style>{toolCallStyles}</style>
      <div className={`bld-tool-card ${done ? 'bld-tool-card--done' : 'bld-tool-card--pending'}`}>
        <button
          className="bld-tool-summary"
          onClick={() => setExpanded(prev => !prev)}
          type="button"
          aria-expanded={expanded}
          aria-label={`Tool call: ${toolCall.tool}${done ? ' (completed)' : ' (in progress)'}`}
        >
          <span className={`bld-tool-icon ${done ? 'bld-tool-icon--done' : 'bld-tool-icon--pending'}`}>
            {done ? '\u2713' : '\u2699'}
          </span>
          <span className="bld-tool-name">{toolCall.tool}</span>
          {toolCall.agent && <span className="bld-tool-agent-tag">{toolCall.agent}</span>}
          <span className="bld-tool-timer">
            {done ? (
              <span style={{ color: 'var(--pf-t--global--color--status--success--default, #3e8635)' }}>
                \u2713
              </span>
            ) : (
              <span className="bld-tool-spinner" />
            )}
            {elapsed}s
          </span>
          <span className={`bld-tool-chevron ${expanded ? 'bld-tool-chevron--open' : ''}`}>
            \u25B6
          </span>
        </button>

        {expanded && (
          <div className="bld-tool-details">
            <div className="bld-tool-section-label">
              Arguments
              <button
                className="bld-tool-copy-btn"
                onClick={() => handleCopy(argsText)}
                type="button"
                aria-label="Copy arguments"
              >
                Copy
              </button>
            </div>
            <div className="bld-tool-json">{argsText}</div>

            {toolResult && (
              <>
                <div className="bld-tool-section-label">
                  Result
                  <button
                    className="bld-tool-copy-btn"
                    onClick={() => handleCopy(toolResult.result)}
                    type="button"
                    aria-label="Copy result"
                  >
                    Copy
                  </button>
                </div>
                <div className="bld-tool-json">{toolResult.result}</div>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
