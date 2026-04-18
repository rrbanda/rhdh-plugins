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
import { useState, useCallback, useRef, useEffect } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { skillMarketplaceApiRef } from '../../api';
import type { BuilderEvent, ChatMessage } from './types';
import { PIPELINE_STAGES } from './types';
import { PipelineProgress } from './PipelineProgress';
import { PublishForm, extractSkillMetadata } from './PublishForm';
import { SkillPreview } from './SkillPreview';
import { useBuilderStream } from './useBuilderStream';
import { builderStyles } from './builder-styles';

let msgIdCounter = 0;
function nextMsgId(): string {
  msgIdCounter += 1;
  return `msg-${Date.now()}-${msgIdCounter}`;
}

function stageLabel(agentName: string): string {
  return PIPELINE_STAGES.find(s => s.key === agentName)?.label || agentName;
}

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 10) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function EventItem({
  evt,
  eventKey,
  expandedTools,
  toggleTool,
}: {
  evt: BuilderEvent;
  eventKey: string;
  expandedTools: Set<string>;
  toggleTool: (k: string) => void;
}) {
  switch (evt.type) {
    case 'agent_start':
      return (
        <div className="sb-evt">
          <div className="sb-evt-icon sb-evt-icon--agent">{'\u25B6'}</div>
          <span className="sb-evt-text">
            <strong>{stageLabel(evt.agent)}</strong>
          </span>
        </div>
      );

    case 'tool_call':
      return (
        <div>
          <div className="sb-evt">
            <div className="sb-evt-icon sb-evt-icon--tool">{'\u2699'}</div>
            <button
              className="sb-tool-chip"
              onClick={() => toggleTool(eventKey)}
              type="button"
            >
              {'\u{1F527}'} {evt.tool}
            </button>
          </div>
          {expandedTools.has(eventKey) && (
            <div className="sb-tool-args">
              {JSON.stringify(evt.args, null, 2)}
            </div>
          )}
        </div>
      );

    case 'agent_output':
      return (
        <div className="sb-evt">
          <div className="sb-evt-icon sb-evt-icon--output">{'\u{1F4AC}'}</div>
          <span className="sb-evt-text sb-evt-text--output">
            {evt.text.length > 200 ? `${evt.text.slice(0, 200)}...` : evt.text}
          </span>
        </div>
      );

    case 'tool_result':
      return (
        <div>
          <div className="sb-evt">
            <div className="sb-evt-icon sb-evt-icon--result">{'\u2714'}</div>
            <button
              className="sb-tool-chip sb-tool-chip--result"
              onClick={() => toggleTool(eventKey)}
              type="button"
              aria-expanded={expandedTools.has(eventKey)}
              aria-label={`Toggle result for ${evt.tool}`}
            >
              {'\u2705'} {evt.tool} result
            </button>
          </div>
          {expandedTools.has(eventKey) && (
            <div className="sb-tool-args">
              {evt.result.length > 2000 ? `${evt.result.slice(0, 2000)}...` : evt.result}
            </div>
          )}
        </div>
      );

    case 'complete':
      return (
        <div className="sb-evt">
          <div className="sb-evt-icon sb-evt-icon--complete">{'\u2713'}</div>
          <span className="sb-evt-text">
            <strong>Pipeline Complete</strong>
          </span>
        </div>
      );

    case 'error':
      return (
        <div className="sb-evt">
          <div className="sb-evt-icon sb-evt-icon--error">{'\u2717'}</div>
          <span className="sb-evt-text">{evt.error}</span>
        </div>
      );

    default:
      return null;
  }
}

export function computeLineDiff(oldText: string, newText: string): Array<{ type: 'same' | 'added' | 'removed'; text: string }> {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const result: Array<{ type: 'same' | 'added' | 'removed'; text: string }> = [];

  let oi = 0;
  let ni = 0;
  while (oi < oldLines.length || ni < newLines.length) {
    if (oi < oldLines.length && ni < newLines.length && oldLines[oi] === newLines[ni]) {
      result.push({ type: 'same', text: oldLines[oi] });
      oi++;
      ni++;
    } else if (ni < newLines.length && (oi >= oldLines.length || !oldLines.slice(oi).includes(newLines[ni]))) {
      result.push({ type: 'added', text: newLines[ni] });
      ni++;
    } else if (oi < oldLines.length && (ni >= newLines.length || !newLines.slice(ni).includes(oldLines[oi]))) {
      result.push({ type: 'removed', text: oldLines[oi] });
      oi++;
    } else {
      result.push({ type: 'removed', text: oldLines[oi] });
      oi++;
    }
  }
  return result;
}

function DiffView({ oldText, newText }: { oldText: string; newText: string }) {
  const lines = computeLineDiff(oldText, newText);
  return (
    <div className="sb-diff">
      {lines.map((line, i) => (
        <div key={i} className={`sb-diff-line sb-diff-line--${line.type}`}>
          <span className="sb-diff-marker">
            {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
          </span>
          <span>{line.text || '\u00A0'}</span>
        </div>
      ))}
    </div>
  );
}

export default function BuilderPage() {
  const api = useApi(skillMarketplaceApiRef);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [generating, setGenerating] = useState(false);

  const [contextId, setContextId] = useState('');
  const [generatedContent, setGeneratedContent] = useState('');
  const [currentAgent, setCurrentAgent] = useState('');
  const [liveEvents, setLiveEvents] = useState<BuilderEvent[]>([]);

  const [previousContent, setPreviousContent] = useState('');
  const [previewMode, setPreviewMode] = useState<'rendered' | 'raw' | 'diff'>('rendered');
  const [copied, setCopied] = useState(false);
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [advancedOpts, setAdvancedOpts] = useState({
    complexity: '' as '' | 'simple' | 'moderate' | 'complex',
    category: '' as '' | 'code-review' | 'documentation' | 'testing' | 'devops' | 'data-processing' | 'other',
    tools: '',
  });

  const lastUserInputRef = useRef('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewBodyRef = useRef<HTMLDivElement>(null);

  const [streamIdleTimeout, setStreamIdleTimeout] = useState<number | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    api.getHealth().then((health: Record<string, unknown>) => {
      if (cancelled) return;
      const builder = health.builder as { streamTimeoutMs?: number } | undefined;
      if (builder?.streamTimeoutMs) {
        setStreamIdleTimeout(builder.streamTimeoutMs);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [api]);

  const { readSSEStream, abort: abortStream } = useBuilderStream(
    setCurrentAgent,
    setGeneratedContent,
    setLiveEvents,
    streamIdleTimeout,
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, liveEvents]);

  useEffect(() => {
    if (generating && previewBodyRef.current) {
      previewBodyRef.current.scrollTop = previewBodyRef.current.scrollHeight;
    }
  }, [generatedContent, generating]);

  useEffect(() => () => abortStream(), [abortStream]);

  const toggleTool = useCallback((key: string) => {
    setExpandedTools(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const sendMessage = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || generating) return;

    lastUserInputRef.current = text;
    setMessages(prev => [
      ...prev,
      { id: nextMsgId(), role: 'user', text, timestamp: Date.now() },
    ]);
    setInput('');
    setGenerating(true);
    setLiveEvents([]);
    setCurrentAgent('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    const isRefine = !!contextId && !!generatedContent;
    if (isRefine) {
      setPreviousContent(generatedContent);
    }
    let errorMsg: string | null = null;

    const extras: Record<string, string> = {};
    if (advancedOpts.complexity) extras.complexity = advancedOpts.complexity;
    if (advancedOpts.category) extras.category = advancedOpts.category;
    if (advancedOpts.tools.trim()) extras.tools = advancedOpts.tools.trim();

    try {
      if (isRefine) {
        const response = await api.refineSkill({
          feedback: text,
          context_id: contextId,
          ...extras,
        });
        await readSSEStream(response);
      } else {
        const cid = contextId || `builder-${Date.now()}`;
        if (!contextId) setContextId(cid);
        const response = await api.generateSkill({
          description: text,
          context_id: cid,
          ...extras,
        });
        await readSSEStream(response);
      }
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : 'Generation failed';
    }

    setGenerating(false);

    setLiveEvents(finalEvents => {
      const hasCompletion = finalEvents.some(e => e.type === 'complete');
      const streamError = finalEvents.find(e => e.type === 'error');

      if (errorMsg) {
        setMessages(prev => [
          ...prev,
          { id: nextMsgId(), role: 'agent', text: errorMsg!, timestamp: Date.now(), isError: true, events: finalEvents },
        ]);
      } else if (streamError) {
        setMessages(prev => [
          ...prev,
          { id: nextMsgId(), role: 'agent', text: streamError.error, timestamp: Date.now(), isError: true, events: finalEvents },
        ]);
      } else if (hasCompletion) {
        const completeEvt = finalEvents.find(e => e.type === 'complete');
        setMessages(prev => [
          ...prev,
          {
            id: nextMsgId(),
            role: 'agent',
            text: isRefine ? 'Skill refined successfully. Check the updated preview.' : 'Skill generated successfully. Review the preview and publish when ready.',
            timestamp: Date.now(),
            events: finalEvents,
            validation: completeEvt?.type === 'complete' ? completeEvt.validation : undefined,
          },
        ]);
      } else {
        const streamEnded = finalEvents.some(e => e.type === 'stream_end');
        const hasContent = !!generatedContent;
        const message = streamEnded && !hasContent
          ? 'The agent pipeline ended unexpectedly without producing output. This may be due to a timeout or network interruption. Please try again.'
          : streamEnded
            ? 'The stream ended without full completion. Partial output is shown in the preview — please review before publishing.'
            : 'Generation completed with no final result. Try describing the skill differently or check the agent configuration.';
        setMessages(prev => [
          ...prev,
          {
            id: nextMsgId(),
            role: 'agent',
            text: message,
            timestamp: Date.now(),
            isError: !hasContent,
            events: finalEvents,
          },
        ]);
      }

      return [];
    });
  }, [api, input, generating, contextId, generatedContent, readSSEStream]);

  const handlePublish = useCallback(
    async (params: { skillName: string; version: string; author: string }) => {
      const result = (await api.publishSkill({
        skillName: params.skillName,
        version: params.version,
        description: '',
        author: params.author,
        content: generatedContent,
      })) as { ociReference: string };
      setMessages(prev => [
        ...prev,
        { id: nextMsgId(), role: 'agent', text: `Skill published to OCI registry: ${result.ociReference}`, timestamp: Date.now() },
      ]);
      return result;
    },
    [api, generatedContent],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const autoGrow = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 144)}px`;
  }, []);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(generatedContent).catch(() => {
      /* clipboard unavailable */
    });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [generatedContent]);

  const clearChat = useCallback(() => {
    setMessages([]);
    setContextId('');
    setGeneratedContent('');
    setPreviousContent('');
    setCurrentAgent('');
    setLiveEvents([]);
    setExpandedTools(new Set());
    setPreviewMode('rendered');
  }, []);

  const retryLast = useCallback(() => {
    const lastInput = lastUserInputRef.current;
    if (!lastInput || generating) return;
    setMessages(prev => {
      const last = prev[prev.length - 1];
      if (last?.role === 'agent' && last.isError) {
        return prev.slice(0, -1);
      }
      return prev;
    });
    sendMessage(lastInput);
  }, [generating, sendMessage]);

  const pipelineCompleted = !generating && liveEvents.some(e => e.type === 'complete');
  const hasError = liveEvents.some(e => e.type === 'error');
  const lineCount = generatedContent ? generatedContent.split('\n').length : 0;

  return (
    <>
      <style>{builderStyles}</style>
      <div className="sb-page">
        {/* ---- Left: Chat panel ---- */}
        <div className="sb-chat">
          <div className="sb-messages">
            {messages.length === 0 && !generating && (
              <div className="sb-empty">
                <div className="sb-hero">
                  <div className="sb-hero-icon">{'\u2728'}</div>
                  <h2>Skill Builder</h2>
                  <p>
                    Describe the skill you want to create in natural language.
                    An AI pipeline will analyze requirements, research examples,
                    generate, and validate your skill.
                  </p>
                </div>
                <div className="sb-suggestions">
                  {[
                    {
                      icon: '\u{1F6E1}',
                      iconClass: 'sb-sug-icon--security',
                      title: 'Security Code Review',
                      desc: 'Scan code for vulnerabilities and suggest fixes',
                      prompt: 'Create a skill that reviews code for security vulnerabilities',
                    },
                    {
                      icon: '\u{1F4C4}',
                      iconClass: 'sb-sug-icon--docs',
                      title: 'PDF Summarizer',
                      desc: 'Extract key bullet points from PDF documents',
                      prompt: 'Build a skill that summarizes PDF documents into key bullet points',
                    },
                    {
                      icon: '\u{1F310}',
                      iconClass: 'sb-sug-icon--web',
                      title: 'URL Content Extractor',
                      desc: 'Structure and summarize web page content',
                      prompt: 'Create a URL summary skill that extracts and structures web page content',
                    },
                  ].map((s, i) => (
                    <button key={i} className="sb-suggestion" onClick={() => sendMessage(s.prompt)}>
                      <span className={`sb-sug-icon ${s.iconClass}`}>{s.icon}</span>
                      <span className="sb-sug-text">
                        <span className="sb-sug-title">{s.title}</span>
                        <span className="sb-sug-desc">{s.desc}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, msgIdx) => (
              <div key={msg.id}>
                <div className={`sb-msg sb-msg--${msg.role}${msg.isError ? ' sb-msg--error' : ''}`}>
                  <div className="sb-msg-header">
                    <span className="sb-msg-avatar">{msg.role === 'user' ? 'U' : '\u2728'}</span>
                    <span className="sb-msg-role">{msg.role === 'user' ? 'You' : 'Skill Builder'}</span>
                    <span className="sb-msg-ts">{timeAgo(msg.timestamp)}</span>
                  </div>
                  <div className="sb-msg-text">{msg.text}</div>
                  {msg.isError && msgIdx === messages.length - 1 && !generating && (
                    <button className="sb-retry-btn" onClick={retryLast} type="button">
                      {'\u21BB'} Retry
                    </button>
                  )}
                </div>

                {msg.events && msg.events.length > 0 && (
                  <div className="sb-activity">
                    <div className="sb-activity-body">
                      <div className="sb-activity-events">
                        {msg.events.map((evt, idx) => (
                          <EventItem key={`${msg.id}-${idx}`} evt={evt} eventKey={`${msg.id}-${idx}`} expandedTools={expandedTools} toggleTool={toggleTool} />
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {msg.validation && (
                  <div className="sb-success">
                    <span className="sb-success-icon">{'\u2713'}</span>
                    <div className="sb-success-body">
                      <div className="sb-success-title">Validation Passed</div>
                      <div className="sb-success-text">
                        {msg.validation.length > 300 ? `${msg.validation.slice(0, 300)}...` : msg.validation}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {generating && (
              <>
                <PipelineProgress currentAgent={currentAgent} completed={pipelineCompleted} hasError={hasError} events={liveEvents} />
                {liveEvents.length > 0 && (
                  <div className="sb-activity">
                    <div className="sb-activity-header">
                      <span className="sb-activity-label">Agent Activity</span>
                    </div>
                    <div className="sb-activity-body">
                      <div className="sb-activity-events">
                        {liveEvents.map((evt, idx) => (
                          <EventItem key={`live-${idx}`} evt={evt} eventKey={`live-${idx}`} expandedTools={expandedTools} toggleTool={toggleTool} />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                {liveEvents.length === 0 && (
                  <div className="sb-msg sb-msg--agent">
                    <div className="sb-msg-header"><span className="sb-msg-role">Skill Builder</span></div>
                    <div className="sb-msg-text sb-typing">Starting pipeline...</div>
                  </div>
                )}
              </>
            )}

            <div ref={messagesEndRef} />
          </div>

          <div className="sb-input-bar">
            <div className="sb-composer">
              <textarea
                ref={textareaRef}
                className="sb-input"
                value={input}
                onChange={e => { setInput(e.target.value); autoGrow(); }}
                onKeyDown={handleKeyDown}
                placeholder={generatedContent ? 'Describe changes to refine the skill...' : 'Describe the skill you want to create...'}
                rows={2}
                disabled={generating}
                aria-label={generatedContent ? 'Refine skill description' : 'Skill description'}
              />
              <div className="sb-composer-footer">
                <div className="sb-composer-left">
                  <span className="sb-kbd-hint">
                    {'\u21B5'} Send {'\u00B7'} Shift+{'\u21B5'} New line
                  </span>
                  {!generatedContent && (
                    <button className="sb-advanced-toggle" onClick={() => setShowAdvanced(v => !v)} type="button">
                      {showAdvanced ? 'Hide options' : 'Options'}
                    </button>
                  )}
                  {messages.length > 0 && (
                    <button className="sb-clear-btn" onClick={clearChat} type="button" aria-label="Clear conversation">
                      {'\u{1F5D1}'} Clear
                    </button>
                  )}
                </div>
                <div className="sb-composer-actions">
                  {generating ? (
                    <button className="sb-stop-btn" onClick={abortStream} type="button">
                      {'\u25A0'} Stop
                    </button>
                  ) : (
                    <button
                      className="sb-send-btn"
                      onClick={() => sendMessage()}
                      disabled={!input.trim()}
                      type="button"
                    >
                      {generatedContent ? 'Refine' : 'Generate'} {'\u2192'}
                    </button>
                  )}
                </div>
              </div>
              {showAdvanced && !generatedContent && (
                <div className="sb-advanced-fields">
                  <div className="sb-advanced-field">
                    <label htmlFor="sb-complexity">Complexity</label>
                    <select
                      id="sb-complexity"
                      value={advancedOpts.complexity}
                      onChange={e => setAdvancedOpts(prev => ({ ...prev, complexity: e.target.value as typeof prev.complexity }))}
                    >
                      <option value="">Auto-detect</option>
                      <option value="simple">Simple</option>
                      <option value="moderate">Moderate</option>
                      <option value="complex">Complex</option>
                    </select>
                  </div>
                  <div className="sb-advanced-field">
                    <label htmlFor="sb-category">Category</label>
                    <select
                      id="sb-category"
                      value={advancedOpts.category}
                      onChange={e => setAdvancedOpts(prev => ({ ...prev, category: e.target.value as typeof prev.category }))}
                    >
                      <option value="">Auto-detect</option>
                      <option value="code-review">Code Review</option>
                      <option value="documentation">Documentation</option>
                      <option value="testing">Testing</option>
                      <option value="devops">DevOps</option>
                      <option value="data-processing">Data Processing</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div className="sb-advanced-field">
                    <label htmlFor="sb-tools">Allowed Tools</label>
                    <input
                      id="sb-tools"
                      value={advancedOpts.tools}
                      onChange={e => setAdvancedOpts(prev => ({ ...prev, tools: e.target.value }))}
                      placeholder="e.g. exec, read_file, web_fetch"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ---- Right: Artifact panel ---- */}
        <div className="sb-artifact">
          {!generatedContent && !generating ? (
            <div className="sb-artifact-empty">
              <div className="sb-artifact-empty-icon">{'\u{1F4C4}'}</div>
              <h4>SKILL.md Preview</h4>
              <p>Your generated skill will appear here as the agent builds it in real time.</p>
            </div>
          ) : (
            <>
              <div className="sb-preview">
                <div className="sb-preview-toolbar">
                  <div className="sb-preview-status">
                    {generating && <span className="sb-preview-dot" />}
                    <span>{generating ? 'Generating...' : 'SKILL.md'}</span>
                    {!generating && generatedContent && (
                      <span className="sb-preview-badge">{lineCount} lines</span>
                    )}
                  </div>
                  <div className="sb-preview-actions">
                    {!generating && generatedContent && (
                      <div className="sb-mode-toggle" role="tablist" aria-label="Preview mode">
                        {(['rendered', 'raw', ...(previousContent ? ['diff' as const] : [])] as const).map(m => (
                          <button
                            key={m}
                            className={`sb-mode-btn${previewMode === m ? ' sb-mode-btn--active' : ''}`}
                            onClick={() => setPreviewMode(m)}
                            type="button"
                            role="tab"
                            aria-selected={previewMode === m}
                          >
                            {m === 'rendered' ? 'Preview' : m === 'raw' ? 'Raw' : 'Diff'}
                          </button>
                        ))}
                      </div>
                    )}
                    {generatedContent && !generating && (
                      <button className="sb-copy-btn" onClick={handleCopy} type="button">
                        {copied ? 'Copied!' : 'Copy'}
                      </button>
                    )}
                  </div>
                </div>
                <div className="sb-preview-body" ref={previewBodyRef}>
                  {generatedContent ? (
                    previewMode === 'diff' && previousContent ? (
                      <DiffView oldText={previousContent} newText={generatedContent} />
                    ) : (
                      <SkillPreview
                        content={generatedContent}
                        streaming={generating}
                        mode={previewMode === 'diff' ? 'raw' : previewMode}
                      />
                    )
                  ) : (
                    <div className="sb-preview-placeholder">
                      <div className="sb-skeleton-line sb-skeleton-line--long" />
                      <div className="sb-skeleton-line sb-skeleton-line--medium" />
                      <div className="sb-skeleton-line sb-skeleton-line--short" />
                      <div className="sb-skeleton-line sb-skeleton-line--long" />
                      <div className="sb-skeleton-line sb-skeleton-line--medium" />
                    </div>
                  )}
                </div>
              </div>

              {generatedContent && !generating && (
                <div className="sb-publish">
                  <PublishForm onPublish={handlePublish} prefill={extractSkillMetadata(generatedContent)} />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
