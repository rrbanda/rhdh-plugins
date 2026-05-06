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
import { MarkdownContent } from '@backstage/core-components';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getPluginColor } from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import type { GraphRAGSkill } from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import type {
  AgenticMessage,
  StreamingState,
} from '../../hooks/useAgenticSearch';
import styles from './AgenticPanel.module.css';

export type HighlightNodesHandler = (
  nodeNames: string[],
  meta?: { userQuery?: string | null },
) => void | Promise<void>;

const PANEL_MIN = 280;
const PANEL_MAX = 640;
const PANEL_DEFAULT = 360;

function formatMessageTime(ts?: number): string {
  if (ts === null || ts === undefined) {
    return '';
  }
  try {
    return new Date(ts).toLocaleString(undefined, {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return '';
  }
}

interface AgenticPanelProps {
  messages: AgenticMessage[];
  streaming: StreamingState;
  isLoading: boolean;
  sendQuery: (query: string, context?: string) => void | Promise<void>;
  clearHistory: () => void;
  onHighlightNodes: HighlightNodesHandler;
  onSelectNode: (nodeName: string) => void;
  onClose: () => void;
}

const SUGGESTIONS = [
  'What skills are available for security?',
  'Which skills depend on openai-chat tool?',
  'Compare the complexity of available skills',
  'What tools does the resume-screener skill use?',
];

const MATCH_DISPLAY: Record<GraphRAGSkill['matchType'], string> = {
  semantic: 'Semantic',
  fulltext: 'Text',
  graph: 'Graph',
};

export default function AgenticPanel({
  messages,
  streaming,
  isLoading,
  sendQuery,
  clearHistory,
  onHighlightNodes,
  onSelectNode,
  onClose,
}: AgenticPanelProps) {
  const [panelWidth, setPanelWidth] = useState(PANEL_DEFAULT);
  const [inputValue, setInputValue] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastAssistantHighlightIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streaming]);

  useEffect(() => {
    if (messages.length === 0) {
      lastAssistantHighlightIdRef.current = null;
      return undefined;
    }
    const lastAssistant = [...messages]
      .reverse()
      .find(m => m.role === 'assistant');
    if (!lastAssistant?.sources?.length) {
      return undefined;
    }
    if (lastAssistantHighlightIdRef.current === lastAssistant.id) {
      return undefined;
    }
    lastAssistantHighlightIdRef.current = lastAssistant.id;
    const idx = messages.findIndex(m => m.id === lastAssistant.id);
    const prior = idx > 0 ? messages[idx - 1] : null;
    const userQuery = prior?.role === 'user' ? prior.content : null;
    void onHighlightNodes(lastAssistant.sources, { userQuery });
    return undefined;
  }, [messages, onHighlightNodes]);

  const onResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = panelWidth;
      const onMove = (ev: MouseEvent) => {
        const delta = startX - ev.clientX;
        setPanelWidth(Math.min(PANEL_MAX, Math.max(PANEL_MIN, startW + delta)));
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [panelWidth],
  );

  return (
    <div className={styles.agenticRoot} style={{ width: panelWidth }}>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- custom resize handle; keyboard resize below */}
      <div
        className={styles.resizeHandle}
        onMouseDown={onResizeStart}
        role="slider"
        aria-orientation="vertical"
        aria-label="Resize knowledge graph assistant panel"
        aria-valuemin={PANEL_MIN}
        aria-valuemax={PANEL_MAX}
        aria-valuenow={Math.round(panelWidth)}
        tabIndex={0}
        onKeyDown={e => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            const delta = e.key === 'ArrowLeft' ? 8 : -8;
            setPanelWidth(w =>
              Math.min(PANEL_MAX, Math.max(PANEL_MIN, w + delta)),
            );
          }
        }}
      />
      <div className={styles.agenticPanel}>
        <div className={styles.agenticHeader}>
          <div className={styles.agenticHeaderLeft}>
            <svg
              viewBox="0 0 24 24"
              width={16}
              height={16}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden
            >
              <path d="M12 2a4 4 0 014 4c0 1.95-1.4 3.58-3.25 3.93L12 10l-.75-.07A4.001 4.001 0 0112 2z" />
              <path d="M12 10v4" />
              <path d="M8 18h8" />
              <path d="M7 22h10" />
              <circle cx="12" cy="6" r="1" fill="currentColor" stroke="none" />
            </svg>
            <span>Knowledge Graph Chat</span>
          </div>
          <div className={styles.agenticHeaderActions}>
            {messages.length > 0 && (
              <button
                onClick={clearHistory}
                className={styles.agenticClearBtn}
                title="Clear history"
                aria-label="Clear conversation history"
                type="button"
              >
                <svg
                  viewBox="0 0 16 16"
                  width={12}
                  height={12}
                  fill="currentColor"
                  aria-hidden
                >
                  <path d="M5.5 5.5A.5.5 0 016 6v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm2.5 0a.5.5 0 01.5.5v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm3 .5a.5.5 0 00-1 0v6a.5.5 0 001 0V6z" />
                  <path
                    fillRule="evenodd"
                    d="M14.5 3a1 1 0 01-1 1H13v9a2 2 0 01-2 2H5a2 2 0 01-2-2V4h-.5a1 1 0 01-1-1V2a1 1 0 011-1H6a1 1 0 011-1h2a1 1 0 011 1h3.5a1 1 0 011 1v1zM4.118 4L4 4.059V13a1 1 0 001 1h6a1 1 0 001-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"
                  />
                </svg>
              </button>
            )}
            <button
              onClick={onClose}
              className={styles.agenticCloseBtn}
              aria-label="Close AI panel"
              type="button"
            >
              &times;
            </button>
          </div>
        </div>

        <div className={styles.agenticBody} ref={scrollRef}>
          {messages.length === 0 && streaming.status === 'idle' && (
            <div className={styles.agenticWelcome}>
              <div className={styles.agenticWelcomeIcon} aria-hidden>
                <svg
                  viewBox="0 0 24 24"
                  width={28}
                  height={28}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  <path d="M18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
                </svg>
              </div>
              <p className={styles.agenticWelcomeText}>
                Ask questions about skills, tools, and relationships in the
                knowledge graph.
              </p>
              <div className={styles.agenticSuggestionGroup}>
                <p className={styles.agenticSuggestionLabel}>Try asking</p>
                <div className={styles.agenticSuggestions}>
                  {SUGGESTIONS.map((s, i) => (
                    <button
                      key={i}
                      className={styles.agenticSuggestion}
                      type="button"
                      onClick={() => sendQuery(s)}
                      aria-label={`Use suggestion: ${s}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
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

          {isLoading && <TypingIndicator state={streaming} />}
        </div>

        <form
          className={styles.panelInput}
          onSubmit={e => {
            e.preventDefault();
            const q = inputValue.trim();
            if (q && !isLoading) {
              sendQuery(q);
              setInputValue('');
            }
          }}
        >
          <input
            ref={inputRef}
            className={styles.panelInputField}
            type="text"
            placeholder="Ask about skills, dependencies, tools..."
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            disabled={isLoading}
            aria-label="Ask the knowledge graph"
          />
          <button
            type="submit"
            className={styles.panelInputSend}
            disabled={isLoading || !inputValue.trim()}
            aria-label="Send question"
          >
            <svg
              viewBox="0 0 16 16"
              width={14}
              height={14}
              fill="currentColor"
              aria-hidden
            >
              <path d="M15.854 8.354a.5.5 0 000-.708l-3-3a.5.5 0 00-.708.708L14.293 7.5H1a.5.5 0 000 1h13.293l-2.147 2.146a.5.5 0 00.708.708l3-3z" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}

function getCategoryColor(category: string): string {
  return getPluginColor(category || 'general');
}

function MessageBubble({
  message,
  onSourceClick,
}: {
  message: AgenticMessage;
  onSourceClick: (name: string) => void;
}) {
  const [stepsOpen, setStepsOpen] = useState(false);
  const [copyDone, setCopyDone] = useState(false);
  const t = formatMessageTime(message.createdAt);
  const titleAttr = t ? `Sent ${t}` : undefined;

  const handleCopy = useCallback(() => {
    const text = message.content ?? '';
    void window.navigator.clipboard.writeText(text).then(() => {
      setCopyDone(true);
      window.setTimeout(() => setCopyDone(false), 2000);
    });
  }, [message.content]);

  if (message.role === 'user') {
    return (
      <div className={`${styles.agenticMsg} ${styles.agenticMsgUser}`}>
        <div className={styles.msgRowUser}>
          <div className={styles.userBubble} title={titleAttr}>
            <div className={styles.userText}>{message.content}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.agenticMsg} ${styles.agenticMsgAssistant}`}>
      {message.steps && message.steps.length > 0 && (
        <button
          className={styles.agenticStepsToggle}
          type="button"
          aria-label={
            stepsOpen
              ? 'Collapse tool call details'
              : 'Expand tool call details'
          }
          aria-expanded={stepsOpen}
          onClick={() => setStepsOpen(v => !v)}
        >
          <svg
            viewBox="0 0 16 16"
            width={10}
            height={10}
            fill="currentColor"
            style={{
              transform: stepsOpen ? 'rotate(90deg)' : 'none',
              transition: 'transform 0.15s',
            }}
            aria-hidden
          >
            <path d="M6 12.796V3.204L11.481 8 6 12.796zm.659.753l5.48-4.796a1 1 0 000-1.506L6.66 2.451C6.011 1.885 5 2.345 5 3.204v9.592a1 1 0 001.659.753z" />
          </svg>
          {message.steps.length} tool call
          {message.steps.length !== 1 ? 's' : ''}
          {message.durationMs
            ? ` · ${(message.durationMs / 1000).toFixed(1)}s`
            : ''}
          {message.iterations
            ? ` · ${message.iterations} iteration${message.iterations !== 1 ? 's' : ''}`
            : ''}
        </button>
      )}

      {stepsOpen && message.steps && (
        <div className={styles.agenticSteps}>
          {message.steps.map((step, i) => (
            <div key={i} className={styles.agenticStep}>
              <span className={styles.agenticStepTool}>
                {friendlyTool(step.tool)}
              </span>
              <span className={styles.agenticStepSummary}>
                {String(step.output)}
              </span>
              {step.durationMs > 0 && (
                <span className={styles.agenticStepDuration}>
                  {step.durationMs}ms
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {(message.sources?.length || message.ragSkills?.length) && (
        <div className={styles.provenanceBadge}>
          <svg
            viewBox="0 0 16 16"
            width={11}
            height={11}
            fill="currentColor"
            aria-hidden
          >
            <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 12.5a5.5 5.5 0 110-11 5.5 5.5 0 010 11z" />
            <path d="M8 4a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 018 4zm0 7a.75.75 0 100-1.5.75.75 0 000 1.5z" />
          </svg>
          Grounded in{' '}
          {(message.sources?.length ?? 0) + (message.ragSkills?.length ?? 0)}{' '}
          graph nodes
          {message.durationMs
            ? ` · ${(message.durationMs / 1000).toFixed(1)}s`
            : ''}
        </div>
      )}

      <div className={styles.assistantShell}>
        <div
          className={styles.assistantBubble}
          title={t ? `Assistant · ${t}` : undefined}
        >
          <button
            type="button"
            className={styles.copyBtn}
            onClick={handleCopy}
            aria-label={
              copyDone
                ? 'Copied to clipboard'
                : 'Copy assistant message to clipboard'
            }
          >
            {copyDone ? (
              <svg
                viewBox="0 0 16 16"
                width={14}
                height={14}
                fill="currentColor"
                aria-hidden
              >
                <path d="M13.485 1.431a.75.75 0 00-1.06 0L5.5 8.36 3.57 6.43a.75.75 0 00-1.14.976l2.5 2.75a.75.75 0 001.15-.043l7.25-7.5a.75.75 0 00-1.001-1.125z" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 16 16"
                width={14}
                height={14}
                fill="currentColor"
                aria-hidden
              >
                <path d="M4 1.5H3a2 2 0 00-2 2V14a2 2 0 002 2h5a2 2 0 002-2v-1.5H4a1.5 1.5 0 01-1.5-1.5V1.5z" />
                <path d="M4.5 0A1.5 1.5 0 016 1.5V3h6.5A1.5 1.5 0 0114 4.5v8a1.5 1.5 0 01-1.5 1.5H6V14h5.5A2.5 2.5 0 0014 11.5v-7A2.5 2.5 0 0011.5 2H4.5z" />
              </svg>
            )}
          </button>
          <div className={styles.markdownInBubble}>
            <MarkdownContent content={message.content} />
          </div>
        </div>
      </div>

      {message.ragSkills && message.ragSkills.length > 0 && (
        <div className={styles.agenticRagResults}>
          <span className={styles.agenticRagLabel}>
            Related skills
            <span className={styles.ragLabelCount}>
              {message.ragSkills.length}
            </span>
          </span>
          {message.ragSkills.map((hit, i) => (
            <button
              key={i}
              className={styles.agenticRagCard}
              type="button"
              onClick={() => onSourceClick(hit.skill.name)}
              aria-label={`View ${hit.skill.name} in graph`}
            >
              <span className={styles.ragCardTop}>
                <span
                  className={styles.ragCardCategory}
                  style={{
                    borderLeftColor: getCategoryColor(hit.skill.category),
                  }}
                >
                  {hit.domain || hit.skill.category}
                </span>
                <span className={styles.ragCardScore}>
                  {Math.round(hit.score * 100)}%
                </span>
                <span
                  className={`${styles.ragCardMatch} ${
                    hit.matchType === 'semantic'
                      ? styles.ragMatchSemantic
                      : hit.matchType === 'fulltext'
                        ? styles.ragMatchText
                        : styles.ragMatchGraph
                  }`}
                >
                  {MATCH_DISPLAY[hit.matchType] ?? hit.matchType}
                </span>
              </span>
              <span className={styles.ragCardName}>{hit.skill.name}</span>
              {hit.reason && (
                <span className={styles.ragCardReason}>{hit.reason}</span>
              )}
              {hit.tools && hit.tools.length > 0 && (
                <span className={styles.ragCardTools}>
                  {hit.tools.slice(0, 3).join(', ')}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {message.sources && message.sources.length > 0 && (
        <div className={styles.agenticSources}>
          <span className={styles.agenticSourcesLabel}>Sources:</span>
          {message.sources.map((s, i) => (
            <button
              key={i}
              className={styles.agenticSourcePill}
              aria-label={`Navigate to skill: ${s}`}
              onClick={() => onSourceClick(s)}
              type="button"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TypingIndicator({ state }: { state: StreamingState }) {
  const live = state.currentStep?.trim() || 'Assistant is responding';
  return (
    <div
      className={styles.agenticStreaming}
      role="status"
      aria-live="polite"
      aria-label={live}
    >
      <div className={styles.typingRow}>
        <span className={styles.typingDots} aria-hidden>
          <span className={styles.typingDot} />
          <span className={styles.typingDot} />
          <span className={styles.typingDot} />
        </span>
        {state.currentStep && state.currentStep !== 'Thinking...' ? (
          <span className={styles.typingStepText}>{state.currentStep}</span>
        ) : null}
      </div>
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
