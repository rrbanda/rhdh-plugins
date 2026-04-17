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
import { useSearchParams } from 'react-router-dom';
import { skillMarketplaceApiRef } from '../../api';
import { useSkills } from '../../hooks';
import { humanize } from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';

interface ChatMessage {
  role: 'user' | 'agent';
  text: string;
  skill?: string;
  timestamp: number;
  isError?: boolean;
}

export default function AgentsPage() {
  const api = useApi(skillMarketplaceApiRef);
  const { skills } = useSkills();
  const [searchParams] = useSearchParams();

  const preloadSkill = searchParams.get('skill') || '';
  const [selectedSkill, setSelectedSkill] = useState(preloadSkill);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [agentStatus, setAgentStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [agentNs, setAgentNs] = useState<string | undefined>();
  const [agentName, setAgentName] = useState<string | undefined>();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    let cancelled = false;
    api.getHealth().then((health: { kagenti?: { namespace: string; agentName: string } }) => {
      if (cancelled) return;
      const ns = health.kagenti?.namespace;
      const name = health.kagenti?.agentName;
      setAgentNs(ns);
      setAgentName(name);
      return api.getAgentCard(ns, name);
    }).then(data => {
      if (!cancelled) {
        setAgentStatus(data && typeof data === 'object' ? 'online' : 'offline');
      }
    }).catch(() => {
      if (!cancelled) setAgentStatus('offline');
    });
    return () => { cancelled = true; };
  }, [api]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;

    const prompt = selectedSkill
      ? `[Using skill: ${selectedSkill}] First load_skill("${selectedSkill}"), then: ${text}`
      : text;

    setMessages(prev => [...prev, { role: 'user', text, skill: selectedSkill || undefined, timestamp: Date.now() }]);
    setInput('');
    setSending(true);
    if (textareaRef.current) { textareaRef.current.style.height = 'auto'; }

    try {
      const result = (await api.chatWithAgent(
        prompt,
        sessionId,
        agentNs,
        agentName,
      )) as {
        session_id?: string;
        sessionId?: string;
        content?: string;
        response?: string;
        message?: string;
      };

      const sid = result.session_id ?? result.sessionId;
      if (sid) setSessionId(sid);

      const agentText =
        result.content ??
        result.response ??
        result.message ??
        JSON.stringify(result, null, 2);

      setMessages(prev => [
        ...prev,
        { role: 'agent', text: agentText, timestamp: Date.now() },
      ]);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Failed to reach agent';
      setMessages(prev => [
        ...prev,
        {
          role: 'agent',
          text: `Error: ${msg}`,
          timestamp: Date.now(),
          isError: true,
        },
      ]);
    } finally {
      setSending(false);
    }
  }, [api, input, selectedSkill, sending, sessionId, agentNs, agentName]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    setMessages([]);
    setSessionId(undefined);
  };

  const autoGrow = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const maxH = 6 * 24;
    ta.style.height = `${Math.min(ta.scrollHeight, maxH)}px`;
  }, []);

  const relativeTime = (ts: number) => {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 10) return 'just now';
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  };

  const selectedSkillData = skills.find(s => s.skillName === selectedSkill);

  const statusColor = agentStatus === 'online' ? '#10b981' : agentStatus === 'offline' ? '#ef4444' : '#f59e0b';

  return (
    <div className="pg-page">
      <style>{playgroundStyles}</style>

      <div className="pg-sidebar">
        <div className="pg-agent-card">
          <div className="pg-agent-header">
            <span className={`pg-agent-dot${agentStatus === 'online' ? ' pg-pulse' : ''}`} style={{ backgroundColor: statusColor }} />
            <div>
              <h3 className="pg-agent-name">Skills Agent</h3>
              <span className="pg-agent-ns">{agentNs || 'default'} &middot; {agentStatus}</span>
            </div>
          </div>
          <p className="pg-agent-desc">
            Enterprise skills agent with tool-use capabilities. Select a skill and test it interactively.
          </p>
        </div>

        <div className="pg-skill-picker">
          <label className="pg-label">Active Skill</label>
          <select
            className="pg-select"
            value={selectedSkill}
            onChange={e => setSelectedSkill(e.target.value)}
          >
            <option value="">No skill (general chat)</option>
            {skills.map(s => (
              <option key={s.slug} value={s.skillName}>{humanize(s.name)}</option>
            ))}
          </select>
          {selectedSkill && (
            <span className="pg-skill-hint">
              Agent will load &ldquo;{selectedSkill}&rdquo; before responding
            </span>
          )}
          {selectedSkillData && (
            <p className="pg-skill-desc">{selectedSkillData.description || selectedSkillData.body?.slice(0, 120)}</p>
          )}
        </div>

        <div className="pg-tools">
          <label className="pg-label">Agent Tools</label>
          <div className="pg-tool-list">
            {['load_skill', 'exec', 'web_fetch', 'read_file', 'write_file'].map(t => (
              <span key={t} className="pg-tool-badge">{t}</span>
            ))}
          </div>
        </div>

        <button className="pg-clear-btn" onClick={clearChat} disabled={messages.length === 0}>
          Clear Conversation
        </button>
      </div>

      <div className="pg-chat">
        <div className="pg-messages">
          {messages.length === 0 && (
            <div className="pg-empty">
              <h3>Skill Playground</h3>
              <p>Select a skill from the sidebar and send a message to test it with the live agent.</p>
              <div className="pg-suggestions">
                {[
                  { skill: 'url-summary', text: 'Summarize https://go.dev/blog/go1.24' },
                  { skill: 'code-review', text: 'Review this: func add(a,b int) { return a + b }' },
                  { skill: '', text: 'What skills do you have available?' },
                ].map((s, i) => (
                  <button
                    key={i}
                    className="pg-suggestion"
                    onClick={() => { setSelectedSkill(s.skill); setInput(s.text); }}
                  >
                    {s.skill && <span className="pg-sug-skill">{s.skill}</span>}
                    <span>{s.text}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`pg-msg pg-msg-${msg.role}${msg.isError ? ' pg-msg-error' : ''}`}>
              <div className="pg-msg-header">
                <span className="pg-msg-role">{msg.role === 'user' ? 'You' : 'Agent'}</span>
                {msg.skill && <span className="pg-msg-skill">{msg.skill}</span>}
                <span className="pg-msg-ts">{relativeTime(msg.timestamp)}</span>
              </div>
              <div className="pg-msg-text">{msg.text}</div>
            </div>
          ))}
          {sending && (
            <div className="pg-msg pg-msg-agent">
              <div className="pg-msg-header">
                <span className="pg-msg-role">Agent</span>
              </div>
              <div className="pg-msg-text pg-typing">Thinking...</div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="pg-input-bar">
          <div className="pg-input-wrap">
            <textarea
              ref={textareaRef}
              className="pg-input"
              value={input}
              onChange={e => { setInput(e.target.value); autoGrow(); }}
              onKeyDown={handleKeyDown}
              placeholder={selectedSkill ? `Test "${selectedSkill}" skill...` : 'Send a message to the agent...'}
              rows={2}
              disabled={sending || agentStatus === 'offline'}
            />
            <span className="pg-kbd-hint">Enter to send &middot; Shift+Enter for new line</span>
          </div>
          <button
            className="pg-send-btn"
            onClick={sendMessage}
            disabled={!input.trim() || sending || agentStatus === 'offline'}
          >
            {sending ? '...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}

const playgroundStyles = `
  .pg-page {
    display: flex;
    height: calc(100vh - 112px);
    overflow: hidden;
  }

  .pg-sidebar {
    width: 280px;
    flex-shrink: 0;
    padding: 20px;
    border-right: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
    display: flex;
    flex-direction: column;
    gap: 20px;
    overflow-y: auto;
  }

  .pg-agent-card {
    padding: 16px;
    border-radius: 12px;
    background: linear-gradient(135deg, #f0f7ff 0%, #fff 100%);
    border: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
  }
  .pg-agent-header { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
  .pg-agent-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; transition: box-shadow 0.3s; }
  .pg-pulse { animation: pg-pulse-anim 2s ease-in-out infinite; }
  @keyframes pg-pulse-anim {
    0%, 100% { box-shadow: 0 0 0 0 rgba(16,185,129,0.5); }
    50% { box-shadow: 0 0 0 6px rgba(16,185,129,0); }
  }
  .pg-agent-name { font-size: 15px; font-weight: 700; margin: 0; }
  .pg-agent-ns { font-size: 13px; color: var(--pf-t--global--text--color--subtle, #6a6e73); }
  .pg-agent-desc { font-size: 13px; color: var(--pf-t--global--text--color--subtle, #6a6e73); margin: 0; line-height: 1.5; }

  .pg-label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--pf-t--global--text--color--subtle, #6a6e73); }
  .pg-select {
    width: 100%;
    padding: 8px 12px;
    border-radius: 8px;
    border: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
    font-size: 13px;
    background: #fff;
    cursor: pointer;
  }
  .pg-skill-hint { font-size: 13px; color: var(--pf-t--global--color--brand--default, #0066cc); margin-top: 4px; display: block; }
  .pg-skill-desc { font-size: 13px; color: var(--pf-t--global--text--color--subtle, #6a6e73); margin: 6px 0 0; line-height: 1.5; }

  .pg-tool-list { display: flex; flex-wrap: wrap; gap: 4px; }
  .pg-tool-badge {
    display: inline-flex;
    padding: 3px 8px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    font-family: monospace;
    background: var(--pf-t--global--background--color--secondary--default, #f0f0f0);
    color: var(--pf-t--global--text--color--subtle, #6a6e73);
  }

  .pg-clear-btn {
    margin-top: auto;
    padding: 8px 16px;
    border-radius: 8px;
    border: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
    background: #fff;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }
  .pg-clear-btn:hover:not(:disabled) { background: var(--pf-t--global--background--color--secondary--default, #f5f5f5); }
  .pg-clear-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .pg-chat {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .pg-messages {
    flex: 1;
    overflow-y: auto;
    padding: 24px 32px;
  }

  .pg-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    text-align: center;
    color: var(--pf-t--global--text--color--subtle, #6a6e73);
  }
  .pg-empty h3 { font-size: 20px; font-weight: 700; margin: 0 0 4px; color: var(--pf-t--global--text--color--regular, #151515); }
  .pg-empty p { margin: 0 0 24px; font-size: 14px; max-width: 400px; line-height: 1.6; }

  .pg-suggestions { display: flex; flex-direction: column; gap: 8px; width: 100%; max-width: 500px; }
  .pg-suggestion {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    border-radius: 10px;
    border: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
    background: #fff;
    font-size: 13px;
    text-align: left;
    cursor: pointer;
    transition: all 0.15s;
  }
  .pg-suggestion:hover {
    border-color: var(--pf-t--global--color--brand--default, #0066cc);
    box-shadow: 0 2px 8px rgba(0,0,0,0.05);
  }
  .pg-sug-skill {
    flex-shrink: 0;
    padding: 2px 8px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    background: #0066cc15;
    color: var(--pf-t--global--color--brand--default, #0066cc);
    font-family: monospace;
  }

  .pg-msg {
    margin-bottom: 16px;
    max-width: 85%;
  }
  .pg-msg-user {
    margin-left: auto;
  }
  .pg-msg-agent {
    margin-right: auto;
  }
  .pg-msg-header { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
  .pg-msg-role { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--pf-t--global--text--color--subtle, #6a6e73); }
  .pg-msg-skill { font-size: 12px; padding: 2px 8px; border-radius: 4px; background: #0066cc15; color: var(--pf-t--global--color--brand--default, #0066cc); font-family: monospace; }
  .pg-msg-ts { font-size: 12px; color: var(--pf-t--global--text--color--subtle, #6a6e73); opacity: 0.6; margin-left: auto; }

  .pg-msg-text {
    padding: 14px 18px;
    border-radius: 14px;
    font-size: 14px;
    line-height: 1.7;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .pg-msg-user .pg-msg-text {
    background: var(--pf-t--global--color--brand--default, #0066cc);
    color: #fff;
    border-bottom-right-radius: 4px;
  }
  .pg-msg-agent .pg-msg-text {
    background: var(--pf-t--global--background--color--secondary--default, #f5f5f5);
    border: 1px solid var(--pf-t--global--border--color--default, #e0e0e0);
    border-bottom-left-radius: 4px;
  }
  .pg-msg-error .pg-msg-text {
    background: rgba(239,68,68,0.06);
    border: 1px solid rgba(239,68,68,0.3);
    color: #b91c1c;
  }

  .pg-typing { color: var(--pf-t--global--text--color--subtle, #6a6e73); font-style: italic; }

  .pg-input-bar {
    display: flex;
    gap: 10px;
    padding: 16px 32px 20px;
    border-top: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
    background: var(--pf-t--global--background--color--primary--default, #fff);
    align-items: flex-end;
  }
  .pg-input-wrap {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .pg-input {
    width: 100%;
    padding: 12px 16px;
    border-radius: 12px;
    border: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
    font-size: 14px;
    resize: none;
    outline: none;
    font-family: inherit;
    min-height: 56px;
    max-height: 144px;
    overflow-y: auto;
    box-sizing: border-box;
  }
  .pg-input:focus { border-color: var(--pf-t--global--color--brand--default, #0066cc); }
  .pg-kbd-hint { font-size: 12px; color: var(--pf-t--global--text--color--subtle, #6a6e73); opacity: 0.7; }
  .pg-send-btn {
    padding: 12px 24px;
    border-radius: 12px;
    border: none;
    background: var(--pf-t--global--color--brand--default, #0066cc);
    color: #fff;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
    align-self: flex-end;
  }
  .pg-send-btn:hover:not(:disabled) { background: var(--pf-t--global--color--brand--hover, #004080); }
  .pg-send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
`;
