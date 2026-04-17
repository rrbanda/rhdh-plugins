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
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAgenticSearch, type AgenticMessage, type StreamingState } from '../../hooks/useAgenticSearch';

interface AgenticPanelProps {
  onHighlightNodes: (nodeNames: string[]) => void;
  onSelectNode: (nodeName: string) => void;
  onClose: () => void;
}

export default function AgenticPanel({
  onHighlightNodes,
  onSelectNode,
  onClose,
}: AgenticPanelProps) {
  const { messages, streaming, isLoading, sendQuery, clearHistory } = useAgenticSearch();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streaming]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
    if (lastAssistant?.sources && lastAssistant.sources.length > 0) {
      onHighlightNodes(lastAssistant.sources);
    }
  }, [messages, onHighlightNodes]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendQuery(input.trim());
    setInput('');
  }, [input, isLoading, sendQuery]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }, [handleSubmit]);

  return (
    <div className="agentic-panel">
      <style>{agenticStyles}</style>

      <div className="agentic-header">
        <div className="agentic-header-left">
          <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M12 2a4 4 0 014 4c0 1.95-1.4 3.58-3.25 3.93L12 10l-.75-.07A4.001 4.001 0 0112 2z" />
            <path d="M12 10v4" />
            <path d="M8 18h8" />
            <path d="M7 22h10" />
            <circle cx="12" cy="6" r="1" fill="currentColor" stroke="none" />
          </svg>
          <span>Ask the Knowledge Graph</span>
        </div>
        <div className="agentic-header-actions">
          {messages.length > 0 && (
            <button onClick={clearHistory} className="agentic-clear-btn" title="Clear history" aria-label="Clear conversation history">
              <svg viewBox="0 0 16 16" width={12} height={12} fill="currentColor">
                <path d="M5.5 5.5A.5.5 0 016 6v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm2.5 0a.5.5 0 01.5.5v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm3 .5a.5.5 0 00-1 0v6a.5.5 0 001 0V6z" />
                <path fillRule="evenodd" d="M14.5 3a1 1 0 01-1 1H13v9a2 2 0 01-2 2H5a2 2 0 01-2-2V4h-.5a1 1 0 01-1-1V2a1 1 0 011-1H6a1 1 0 011-1h2a1 1 0 011 1h3.5a1 1 0 011 1v1zM4.118 4L4 4.059V13a1 1 0 001 1h6a1 1 0 001-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z" />
              </svg>
            </button>
          )}
          <button onClick={onClose} className="agentic-close-btn" aria-label="Close AI panel">
            &times;
          </button>
        </div>
      </div>

      <div className="agentic-body" ref={scrollRef}>
        {messages.length === 0 && streaming.status === 'idle' && (
          <div className="agentic-welcome">
            <div className="agentic-welcome-icon">
              <svg viewBox="0 0 24 24" width={28} height={28} fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                <path d="M18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
              </svg>
            </div>
            <p className="agentic-welcome-text">
              Ask questions about skills, tools, and relationships in the knowledge graph.
            </p>
            <div className="agentic-suggestions">
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  className="agentic-suggestion"
                  onClick={() => { setInput(s); sendQuery(s); }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg => (
          <MessageBubble
            key={msg.id}
            message={msg}
            onSourceClick={onSelectNode}
          />
        ))}

        {isLoading && <StreamingIndicator state={streaming} />}
      </div>

      <form className="agentic-input-area" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about skills, tools, dependencies..."
          aria-label="Ask the knowledge graph"
          className="agentic-input"
          disabled={isLoading}
        />
        <button
          type="submit"
          className="agentic-send-btn"
          aria-label="Send query"
          disabled={isLoading || !input.trim()}
        >
          <svg viewBox="0 0 16 16" width={14} height={14} fill="currentColor">
            <path d="M15.854.146a.5.5 0 01.11.54l-5.819 14.547a.75.75 0 01-1.329.124l-3.178-4.995L.643 7.184a.75.75 0 01.124-1.33L15.315.037a.5.5 0 01.539.11zM6.636 10.07l2.761 4.338L14.13 2.576 6.636 10.07zm6.787-8.201L1.591 6.602l4.339 2.76 7.494-7.493z" />
          </svg>
        </button>
      </form>
    </div>
  );
}

const SUGGESTIONS = [
  'What skills are available for security?',
  'Which skills depend on openai-chat tool?',
  'Compare the complexity of available skills',
  'What tools does the resume-screener skill use?',
];

function MessageBubble({
  message,
  onSourceClick,
}: {
  message: AgenticMessage;
  onSourceClick: (name: string) => void;
}) {
  const [stepsOpen, setStepsOpen] = useState(false);

  if (message.role === 'user') {
    return (
      <div className="agentic-msg agentic-msg-user">
        <div className="agentic-msg-content">{message.content}</div>
      </div>
    );
  }

  return (
    <div className="agentic-msg agentic-msg-assistant">
      {message.steps && message.steps.length > 0 && (
        <button
          className="agentic-steps-toggle"
          aria-label={stepsOpen ? 'Collapse tool call details' : 'Expand tool call details'}
          aria-expanded={stepsOpen}
          onClick={() => setStepsOpen(v => !v)}
        >
          <svg
            viewBox="0 0 16 16"
            width={10}
            height={10}
            fill="currentColor"
            style={{ transform: stepsOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}
          >
            <path d="M6 12.796V3.204L11.481 8 6 12.796zm.659.753l5.48-4.796a1 1 0 000-1.506L6.66 2.451C6.011 1.885 5 2.345 5 3.204v9.592a1 1 0 001.659.753z" />
          </svg>
          {message.steps.length} tool call{message.steps.length !== 1 ? 's' : ''}
          {message.durationMs ? ` · ${(message.durationMs / 1000).toFixed(1)}s` : ''}
          {message.iterations ? ` · ${message.iterations} iteration${message.iterations !== 1 ? 's' : ''}` : ''}
        </button>
      )}

      {stepsOpen && message.steps && (
        <div className="agentic-steps">
          {message.steps.map((step, i) => (
            <div key={i} className="agentic-step">
              <span className="agentic-step-tool">{friendlyTool(step.tool)}</span>
              <span className="agentic-step-summary">{String(step.output)}</span>
              {step.durationMs > 0 && (
                <span className="agentic-step-duration">{step.durationMs}ms</span>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="agentic-msg-content">{message.content}</div>

      {message.sources && message.sources.length > 0 && (
        <div className="agentic-sources">
          <span className="agentic-sources-label">Sources:</span>
          {message.sources.map((s, i) => (
            <button key={i} className="agentic-source-pill" aria-label={`Navigate to skill: ${s}`} onClick={() => onSourceClick(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function StreamingIndicator({ state }: { state: StreamingState }) {
  return (
    <div className="agentic-streaming">
      <div className="agentic-streaming-dot" />
      <span className="agentic-streaming-text">
        {state.currentStep || 'Thinking...'}
      </span>
    </div>
  );
}

function friendlyTool(name: string): string {
  const map: Record<string, string> = {
    search_skills_semantic: 'Semantic search',
    search_skills_keyword: 'Keyword search',
    get_skill_details: 'Skill details',
    explore_graph: 'Graph exploration',
    query_relationships: 'Relationship query',
    get_graph_schema: 'Schema lookup',
    list_skills_by_domain: 'Domain listing',
  };
  return map[name] ?? name;
}

const agenticStyles = `
  .agentic-panel {
    width: 360px;
    flex-shrink: 0;
    border-left: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
    background: var(--pf-t--global--background--color--primary--default, #fff);
    display: flex;
    flex-direction: column;
    border-radius: 0 12px 12px 0;
    overflow: hidden;
    animation: slideIn 0.2s ease-out;
  }

  .agentic-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-bottom: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
    background: linear-gradient(135deg, rgba(99,102,241,0.06), rgba(59,130,246,0.06));
  }
  .agentic-header-left {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 600;
    color: var(--pf-t--global--color--brand--default, #0066cc);
  }
  .agentic-header-actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .agentic-clear-btn, .agentic-close-btn {
    width: 24px;
    height: 24px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--pf-t--global--text--color--subtle, #6a6e73);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
  }
  .agentic-clear-btn:hover, .agentic-close-btn:hover {
    background: var(--pf-t--global--background--color--secondary--default, #f0f0f0);
  }

  .agentic-body {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .agentic-welcome {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 24px 16px;
    text-align: center;
    gap: 12px;
  }
  .agentic-welcome-icon {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    background: linear-gradient(135deg, rgba(99,102,241,0.1), rgba(59,130,246,0.1));
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--pf-t--global--color--brand--default, #0066cc);
  }
  .agentic-welcome-text {
    font-size: 13px;
    color: var(--pf-t--global--text--color--subtle, #6a6e73);
    margin: 0;
    line-height: 1.5;
  }
  .agentic-suggestions {
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 100%;
  }
  .agentic-suggestion {
    padding: 8px 12px;
    border: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
    border-radius: 8px;
    background: transparent;
    color: var(--pf-t--global--text--color--regular, #151515);
    font-size: 12px;
    text-align: left;
    cursor: pointer;
    transition: all 0.15s;
    line-height: 1.4;
  }
  .agentic-suggestion:hover {
    border-color: var(--pf-t--global--color--brand--default, #0066cc);
    background: rgba(0,102,204,0.04);
  }

  .agentic-msg {
    max-width: 100%;
    animation: fadeIn 0.2s ease-out;
  }
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .agentic-msg-user {
    align-self: flex-end;
  }
  .agentic-msg-user .agentic-msg-content {
    background: var(--pf-t--global--color--brand--default, #0066cc);
    color: #fff;
    border-radius: 12px 12px 4px 12px;
    padding: 8px 12px;
    font-size: 13px;
    line-height: 1.5;
  }
  .agentic-msg-assistant {
    align-self: flex-start;
  }
  .agentic-msg-assistant .agentic-msg-content {
    background: var(--pf-t--global--background--color--secondary--default, #f5f5f5);
    color: var(--pf-t--global--text--color--regular, #151515);
    border-radius: 12px 12px 12px 4px;
    padding: 10px 12px;
    font-size: 13px;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .agentic-steps-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    margin-bottom: 6px;
    border: none;
    border-radius: 6px;
    background: rgba(99,102,241,0.08);
    color: var(--pf-t--global--color--brand--default, #0066cc);
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s;
  }
  .agentic-steps-toggle:hover {
    background: rgba(99,102,241,0.14);
  }

  .agentic-steps {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 8px;
    padding: 6px;
    border-radius: 8px;
    background: rgba(99,102,241,0.04);
    border: 1px solid rgba(99,102,241,0.1);
  }
  .agentic-step {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    padding: 3px 0;
  }
  .agentic-step-tool {
    font-weight: 600;
    color: var(--pf-t--global--color--brand--default, #0066cc);
    flex-shrink: 0;
  }
  .agentic-step-summary {
    color: var(--pf-t--global--text--color--subtle, #6a6e73);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }
  .agentic-step-duration {
    font-size: 10px;
    color: var(--pf-t--global--text--color--subtle, #6a6e73);
    opacity: 0.7;
    flex-shrink: 0;
  }

  .agentic-sources {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    margin-top: 8px;
  }
  .agentic-sources-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--pf-t--global--text--color--subtle, #6a6e73);
  }
  .agentic-source-pill {
    padding: 2px 8px;
    border-radius: 999px;
    border: 1px solid rgba(0,102,204,0.3);
    background: rgba(0,102,204,0.06);
    color: var(--pf-t--global--color--brand--default, #0066cc);
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }
  .agentic-source-pill:hover {
    background: rgba(0,102,204,0.12);
    border-color: var(--pf-t--global--color--brand--default, #0066cc);
  }

  .agentic-streaming {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 8px;
    background: linear-gradient(135deg, rgba(99,102,241,0.06), rgba(59,130,246,0.06));
    animation: fadeIn 0.2s ease-out;
  }
  .agentic-streaming-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--pf-t--global--color--brand--default, #0066cc);
    animation: pulse 1.5s ease-in-out infinite;
    flex-shrink: 0;
  }
  .agentic-streaming-text {
    font-size: 12px;
    color: var(--pf-t--global--text--color--subtle, #6a6e73);
    font-style: italic;
  }

  .agentic-input-area {
    display: flex;
    gap: 6px;
    padding: 10px 12px;
    border-top: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
    background: var(--pf-t--global--background--color--primary--default, #fff);
  }
  .agentic-input {
    flex: 1;
    height: 34px;
    padding: 0 10px;
    border-radius: 8px;
    border: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
    background: var(--pf-t--global--background--color--primary--default, #fff);
    font-size: 13px;
    outline: none;
    color: var(--pf-t--global--text--color--regular, #151515);
    transition: border-color 0.15s;
  }
  .agentic-input:focus {
    border-color: var(--pf-t--global--color--brand--default, #0066cc);
  }
  .agentic-input:disabled {
    opacity: 0.6;
  }
  .agentic-send-btn {
    width: 34px;
    height: 34px;
    border-radius: 8px;
    border: none;
    background: var(--pf-t--global--color--brand--default, #0066cc);
    color: #fff;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
    flex-shrink: 0;
  }
  .agentic-send-btn:hover:not(:disabled) {
    background: #0052a3;
  }
  .agentic-send-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }
`;
