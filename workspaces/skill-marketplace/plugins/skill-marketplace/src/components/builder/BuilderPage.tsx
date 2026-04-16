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
import { builderStyles } from './builder-styles';

let msgIdCounter = 0;
function nextMsgId(): string {
  msgIdCounter += 1;
  return `msg-${Date.now()}-${msgIdCounter}`;
}

function stageLabel(agentName: string): string {
  return PIPELINE_STAGES.find(s => s.key === agentName)?.label || agentName;
}

export default function BuilderPage() {
  const api = useApi(skillMarketplaceApiRef);

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [generating, setGenerating] = useState(false);

  // Agent / generation state
  const [contextId, setContextId] = useState('');
  const [generatedContent, setGeneratedContent] = useState('');
  const [currentAgent, setCurrentAgent] = useState('');
  const [liveEvents, setLiveEvents] = useState<BuilderEvent[]>([]);

  // Publish state
  const [skillName, setSkillName] = useState('');
  const [skillVersion, setSkillVersion] = useState('0.1.0');
  const [skillAuthor, setSkillAuthor] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<{
    ociReference: string;
  } | null>(null);
  const [showPublish, setShowPublish] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  // Preview state
  const [copied, setCopied] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewBodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, liveEvents]);

  useEffect(() => {
    if (generating && previewBodyRef.current) {
      previewBodyRef.current.scrollTop = previewBodyRef.current.scrollHeight;
    }
  }, [generatedContent, generating]);

  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());

  const toggleTool = useCallback((key: string) => {
    setExpandedTools(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const readSSEStream = useCallback(
    async (response: Response) => {
      const reader = response.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let buffer = '';
      let content = '';
      let lastEventType = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            lastEventType = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            try {
              const payload = JSON.parse(line.slice(6));
              const ts = Date.now();

              switch (lastEventType) {
                case 'agent_start':
                  if (payload.agent) {
                    setCurrentAgent(payload.agent);
                    setLiveEvents(prev => [
                      ...prev,
                      { type: 'agent_start', agent: payload.agent, ts },
                    ]);
                  }
                  break;

                case 'tool_call':
                  setLiveEvents(prev => [
                    ...prev,
                    {
                      type: 'tool_call',
                      agent: payload.agent || '',
                      tool: payload.tool || 'unknown',
                      args: payload.args || {},
                      ts,
                    },
                  ]);
                  break;

                case 'agent_output':
                  if (payload.text) {
                    content += payload.text;
                    setGeneratedContent(content);
                  }
                  break;

                case 'complete':
                  if (payload.skill_content) {
                    content = payload.skill_content;
                    setGeneratedContent(content);
                  }
                  setLiveEvents(prev => [
                    ...prev,
                    {
                      type: 'complete',
                      skillContent: payload.skill_content || '',
                      validation: payload.validation || '',
                      ts,
                    },
                  ]);
                  break;

                case 'error':
                  if (payload.error) {
                    setLiveEvents(prev => [
                      ...prev,
                      { type: 'error', error: payload.error, ts },
                    ]);
                  }
                  break;

                default:
                  if (payload.text) {
                    content += payload.text;
                    setGeneratedContent(content);
                  }
                  if (payload.skill_content) {
                    content = payload.skill_content;
                    setGeneratedContent(content);
                  }
                  break;
              }
              lastEventType = '';
            } catch {
              // partial JSON chunk
            }
          }
        }
      }

      if (content) setGeneratedContent(content);
    },
    [],
  );

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || generating) return;

    setMessages(prev => [
      ...prev,
      { id: nextMsgId(), role: 'user', text, timestamp: Date.now() },
    ]);
    setInput('');
    setGenerating(true);
    setLiveEvents([]);
    setCurrentAgent('');
    setPublishResult(null);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    const isRefine = !!contextId && !!generatedContent;
    let errorMsg: string | null = null;

    try {
      if (isRefine) {
        const response = await api.refineSkill({
          feedback: text,
          context_id: contextId,
        });
        await readSSEStream(response);
      } else {
        const cid = contextId || `builder-${Date.now()}`;
        if (!contextId) setContextId(cid);
        const response = await api.generateSkill({
          description: text,
          context_id: cid,
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
          {
            id: nextMsgId(),
            role: 'agent',
            text: errorMsg!,
            timestamp: Date.now(),
            isError: true,
            events: finalEvents,
          },
        ]);
      } else if (streamError) {
        setMessages(prev => [
          ...prev,
          {
            id: nextMsgId(),
            role: 'agent',
            text: streamError.error,
            timestamp: Date.now(),
            isError: true,
            events: finalEvents,
          },
        ]);
      } else if (hasCompletion) {
        const completeEvt = finalEvents.find(e => e.type === 'complete');
        setMessages(prev => [
          ...prev,
          {
            id: nextMsgId(),
            role: 'agent',
            text: isRefine
              ? 'Skill refined successfully. Check the updated preview.'
              : 'Skill generated successfully. Review the preview and publish when ready.',
            timestamp: Date.now(),
            events: finalEvents,
            validation:
              completeEvt?.type === 'complete'
                ? completeEvt.validation
                : undefined,
          },
        ]);
      } else {
        setMessages(prev => [
          ...prev,
          {
            id: nextMsgId(),
            role: 'agent',
            text: 'Generation completed.',
            timestamp: Date.now(),
            events: finalEvents,
          },
        ]);
      }

      return [];
    });
  }, [api, input, generating, contextId, generatedContent, readSSEStream]);

  const handlePublish = useCallback(async () => {
    if (!generatedContent || !skillName.trim()) return;
    setPublishing(true);
    setPublishError(null);

    try {
      const result = (await api.publishSkill({
        skillName: skillName.trim(),
        version: skillVersion.trim() || '0.1.0',
        description: '',
        author: skillAuthor.trim() || 'skill-marketplace',
        content: generatedContent,
      })) as { ociReference: string };
      setPublishResult(result);
      setMessages(prev => [
        ...prev,
        {
          id: nextMsgId(),
          role: 'agent',
          text: `Skill published to OCI registry: ${result.ociReference}`,
          timestamp: Date.now(),
        },
      ]);
    } catch (err) {
      setPublishError(
        err instanceof Error ? err.message : 'Publish failed',
      );
    } finally {
      setPublishing(false);
    }
  }, [api, generatedContent, skillName, skillVersion, skillAuthor]);

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
    navigator.clipboard.writeText(generatedContent).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [generatedContent]);

  const clearChat = useCallback(() => {
    setMessages([]);
    setContextId('');
    setGeneratedContent('');
    setCurrentAgent('');
    setLiveEvents([]);
    setPublishResult(null);
    setShowPublish(false);
    setSkillName('');
    setSkillVersion('0.1.0');
    setSkillAuthor('');
    setPublishError(null);
  }, []);

  const pipelineCompleted =
    !generating && liveEvents.some(e => e.type === 'complete');
  const hasError = liveEvents.some(e => e.type === 'error');

  const lineCount = generatedContent
    ? generatedContent.split('\n').length
    : 0;

  return (
    <>
      <style>{builderStyles}</style>
      <div className="sb-page">
        {/* ---- Left: Chat panel ---- */}
        <div className="sb-chat">
          <div className="sb-messages">
            {messages.length === 0 && !generating && (
              <div className="sb-empty">
                <h3>Skill Builder</h3>
                <p>
                  Describe the skill you want to create in natural language. The
                  AI pipeline will analyze requirements, research examples,
                  generate, and validate your skill.
                </p>
                <div className="sb-suggestions">
                  {[
                    {
                      icon: '\u{1F50D}',
                      text: 'Create a skill that reviews code for security vulnerabilities',
                    },
                    {
                      icon: '\u{1F4C4}',
                      text: 'Build a skill that summarizes PDF documents into key bullet points',
                    },
                    {
                      icon: '\u{1F310}',
                      text: 'Create a URL summary skill that extracts and structures web page content',
                    },
                  ].map((s, i) => (
                    <button
                      key={i}
                      className="sb-suggestion"
                      onClick={() => setInput(s.text)}
                    >
                      <span className="sb-sug-icon">{s.icon}</span>
                      <span>{s.text}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map(msg => (
              <div key={msg.id}>
                {/* User or agent text message */}
                <div
                  className={`sb-msg sb-msg--${msg.role}${msg.isError ? ' sb-msg--error' : ''}`}
                >
                  <div className="sb-msg-header">
                    <span className="sb-msg-role">
                      {msg.role === 'user' ? 'You' : 'Skill Builder'}
                    </span>
                    <span className="sb-msg-ts">
                      {timeAgo(msg.timestamp)}
                    </span>
                  </div>
                  <div className="sb-msg-text">{msg.text}</div>
                </div>

                {/* Inline agent activity for this message */}
                {msg.events && msg.events.length > 0 && (
                  <div className="sb-activity">
                    <div className="sb-activity-body">
                      <div className="sb-activity-events">
                        {msg.events.map((evt, idx) =>
                          renderEvent(
                            evt,
                            `${msg.id}-${idx}`,
                            expandedTools,
                            toggleTool,
                          ),
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Validation summary */}
                {msg.validation && (
                  <div className="sb-success">
                    <span className="sb-success-icon">{'\u2713'}</span>
                    <div className="sb-success-body">
                      <div className="sb-success-title">
                        Validation Passed
                      </div>
                      <div className="sb-success-text">
                        {msg.validation.length > 300
                          ? `${msg.validation.slice(0, 300)}...`
                          : msg.validation}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Live streaming activity */}
            {generating && (
              <>
                <PipelineProgress
                  currentAgent={currentAgent}
                  completed={pipelineCompleted}
                  hasError={hasError}
                />
                {liveEvents.length > 0 && (
                  <div className="sb-activity">
                    <div className="sb-activity-header">
                      <span className="sb-activity-label">
                        Agent Activity
                      </span>
                    </div>
                    <div className="sb-activity-body">
                      <div className="sb-activity-events">
                        {liveEvents.map((evt, idx) =>
                          renderEvent(
                            evt,
                            `live-${idx}`,
                            expandedTools,
                            toggleTool,
                          ),
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {liveEvents.length === 0 && (
                  <div className="sb-msg sb-msg--agent">
                    <div className="sb-msg-header">
                      <span className="sb-msg-role">Skill Builder</span>
                    </div>
                    <div className="sb-msg-text sb-typing">
                      Starting pipeline...
                    </div>
                  </div>
                )}
              </>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input bar */}
          <div className="sb-input-bar">
            <div className="sb-input-wrap">
              <textarea
                ref={textareaRef}
                className="sb-input"
                value={input}
                onChange={e => {
                  setInput(e.target.value);
                  autoGrow();
                }}
                onKeyDown={handleKeyDown}
                placeholder={
                  generatedContent
                    ? 'Describe changes to refine the skill...'
                    : 'Describe the skill you want to create...'
                }
                rows={2}
                disabled={generating}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="sb-kbd-hint">
                  Enter to send &middot; Shift+Enter for new line
                </span>
                {messages.length > 0 && (
                  <button
                    className="sb-clear-btn"
                    onClick={clearChat}
                    type="button"
                  >
                    Clear conversation
                  </button>
                )}
              </div>
            </div>
            <button
              className="sb-send-btn"
              onClick={sendMessage}
              disabled={!input.trim() || generating}
            >
              {generating
                ? '...'
                : generatedContent
                  ? 'Refine'
                  : 'Generate'}
            </button>
          </div>
        </div>

        {/* ---- Right: Artifact panel ---- */}
        <div className="sb-artifact">
          {!generatedContent && !generating ? (
            <div className="sb-artifact-empty">
              <div className="sb-artifact-empty-icon">{'\u{1F4DD}'}</div>
              <h4>SKILL.md Preview</h4>
              <p>
                Your generated skill will appear here as the agent builds it in
                real time.
              </p>
            </div>
          ) : (
            <>
              {/* Preview */}
              <div className="sb-preview">
                <div className="sb-preview-toolbar">
                  <div className="sb-preview-status">
                    {generating && (
                      <span
                        className="sb-preview-dot"
                        style={{
                          backgroundColor:
                            'var(--pf-t--global--color--brand--default, #0066cc)',
                        }}
                      />
                    )}
                    <span>
                      {generating
                        ? 'Generating SKILL.md...'
                        : `SKILL.md \u00B7 ${lineCount} lines`}
                    </span>
                  </div>
                  {generatedContent && !generating && (
                    <button
                      className="sb-copy-btn"
                      onClick={handleCopy}
                      type="button"
                    >
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  )}
                </div>
                <div className="sb-preview-body" ref={previewBodyRef}>
                  {generatedContent ? (
                    <>
                      {generatedContent}
                      {generating && <span className="sb-cursor" />}
                    </>
                  ) : (
                    <div className="sb-preview-empty-body">
                      Waiting for output...
                    </div>
                  )}
                </div>
              </div>

              {/* Publish */}
              {generatedContent && !generating && (
                <div className="sb-publish">
                  {publishResult ? (
                    <div className="sb-publish-success">
                      <div className="sb-publish-success-title">
                        {'\u2713'} Published to OCI Registry
                      </div>
                      <div className="sb-oci-ref">
                        {publishResult.ociReference}
                      </div>
                      <a
                        className="sb-publish-link"
                        href="/skill-marketplace/skills"
                      >
                        View in Skills Catalog
                      </a>
                    </div>
                  ) : (
                    <>
                      <button
                        className="sb-publish-toggle"
                        onClick={() => setShowPublish(prev => !prev)}
                        type="button"
                      >
                        {showPublish ? '\u25BC' : '\u25B6'} Publish to OCI
                        Registry
                      </button>
                      {showPublish && (
                        <div className="sb-publish-form">
                          {publishError && (
                            <div
                              style={{
                                fontSize: 13,
                                color: '#c9190b',
                                marginBottom: 4,
                              }}
                            >
                              {publishError}
                            </div>
                          )}
                          <div className="sb-field">
                            <label className="sb-field-label">
                              Skill Name *
                            </label>
                            <input
                              className="sb-field-input"
                              value={skillName}
                              onChange={e => setSkillName(e.target.value)}
                              placeholder="e.g. my-new-skill"
                            />
                          </div>
                          <div className="sb-field">
                            <label className="sb-field-label">Version</label>
                            <input
                              className="sb-field-input"
                              value={skillVersion}
                              onChange={e =>
                                setSkillVersion(e.target.value)
                              }
                              placeholder="0.1.0"
                            />
                          </div>
                          <div className="sb-field">
                            <label className="sb-field-label">Author</label>
                            <input
                              className="sb-field-input"
                              value={skillAuthor}
                              onChange={e =>
                                setSkillAuthor(e.target.value)
                              }
                              placeholder="your-name or team"
                            />
                          </div>
                          <button
                            className="sb-publish-btn"
                            onClick={handlePublish}
                            disabled={
                              publishing || !skillName.trim()
                            }
                            type="button"
                          >
                            {publishing
                              ? 'Publishing...'
                              : 'Publish'}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 10) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function renderEvent(
  evt: BuilderEvent,
  key: string,
  expandedTools: Set<string>,
  toggleTool: (k: string) => void,
): JSX.Element | null {
  switch (evt.type) {
    case 'agent_start':
      return (
        <div key={key} className="sb-evt">
          <div className="sb-evt-icon sb-evt-icon--agent">{'\u25B6'}</div>
          <span className="sb-evt-text">
            <strong>{stageLabel(evt.agent)}</strong>
          </span>
        </div>
      );

    case 'tool_call':
      return (
        <div key={key}>
          <div className="sb-evt">
            <div className="sb-evt-icon sb-evt-icon--tool">{'\u2699'}</div>
            <button
              className="sb-tool-chip"
              onClick={() => toggleTool(key)}
              type="button"
            >
              {'\u{1F527}'} {evt.tool}
            </button>
          </div>
          {expandedTools.has(key) && (
            <div className="sb-tool-args">
              {JSON.stringify(evt.args, null, 2)}
            </div>
          )}
        </div>
      );

    case 'complete':
      return (
        <div key={key} className="sb-evt">
          <div className="sb-evt-icon sb-evt-icon--complete">{'\u2713'}</div>
          <span className="sb-evt-text">
            <strong>Pipeline Complete</strong>
          </span>
        </div>
      );

    case 'error':
      return (
        <div key={key} className="sb-evt">
          <div className="sb-evt-icon sb-evt-icon--error">{'\u2717'}</div>
          <span className="sb-evt-text">{evt.error}</span>
        </div>
      );

    default:
      return null;
  }
}
