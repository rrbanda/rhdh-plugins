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
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApi } from '@backstage/core-plugin-api';
import { skillMarketplaceApiRef } from '../../api';
import LoadingSpinner from '../shared/LoadingSpinner';
import ErrorMessage from '../shared/ErrorMessage';

interface AgentDetail {
  metadata?: { name: string; namespace: string; labels: Record<string, string> };
  status?: Record<string, unknown> | string;
  readyStatus?: string;
  spec?: {
    template?: {
      spec?: {
        containers?: Array<{
          name?: string;
          image?: string;
          image_pull_policy?: string;
          env?: Array<{ name: string; value?: string; value_from?: unknown }>;
          env_from?: Array<{ config_map_ref?: { name: string }; secret_ref?: { name: string } }>;
          args?: string[];
          ports?: Array<{ container_port?: number; name?: string }>;
        }>;
      };
    };
  };
}

interface ChatMessage {
  role: 'user' | 'agent';
  content: string;
  timestamp: Date;
}

export default function AgentDetailPage() {
  const { namespace, name } = useParams<{ namespace: string; name: string }>();
  const navigate = useNavigate();
  const api = useApi(skillMarketplaceApiRef);
  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'chat' | 'logs'>('overview');

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [logs, setLogs] = useState<string>('');
  const [logsLoading, setLogsLoading] = useState(false);

  useEffect(() => {
    if (!namespace || !name) return;
    let cancelled = false;
    setLoading(true);
    api
      .getAgentDetail(namespace, name)
      .then(data => {
        if (!cancelled) {
          setAgent(data as AgentDetail);
          setLoading(false);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err.message || 'Failed to load agent');
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [api, namespace, name]);

  const sendChat = useCallback(async () => {
    if (!chatInput.trim() || !namespace || !name) return;
    const msg = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [
      ...prev,
      { role: 'user', content: msg, timestamp: new Date() },
    ]);
    setChatLoading(true);

    try {
      const result = await api.chatWithAgent(msg, sessionId, namespace, name);
      const data = result as { content?: string; response?: string; message?: string; session_id?: string; sessionId?: string };
      const sid = data.session_id ?? data.sessionId;
      if (sid) setSessionId(sid);
      const agentContent = data.content ?? data.response ?? data.message ?? JSON.stringify(data);
      setChatMessages(prev => [
        ...prev,
        {
          role: 'agent',
          content: agentContent,
          timestamp: new Date(),
        },
      ]);
    } catch (err) {
      setChatMessages(prev => [
        ...prev,
        {
          role: 'agent',
          content: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  }, [api, chatInput, namespace, name, sessionId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const loadLogs = useCallback(async () => {
    if (!namespace || !name) return;
    setLogsLoading(true);
    try {
      const result = (await api.getAgentLogs(namespace, name, 200)) as {
        logs?: string;
        raw?: string;
      };
      setLogs(result.logs || result.raw || JSON.stringify(result, null, 2));
    } catch (err) {
      setLogs(`Error loading logs: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLogsLoading(false);
    }
  }, [api, namespace, name]);

  useEffect(() => {
    if (activeTab === 'logs') loadLogs();
  }, [activeTab, loadLogs]);

  if (loading) return <LoadingSpinner message="Loading agent details..." />;
  if (error) return <ErrorMessage message={error} />;
  if (!agent) return <ErrorMessage message="Agent not found" />;

  const containers = agent.spec?.template?.spec?.containers ?? [];
  const allEnvVars = containers.flatMap(c => (c.env ?? []).filter(e => e.value != null));
  const primaryContainer = containers[0];
  const llmProvider = allEnvVars.find(e => e.name === 'LLM_PROVIDER')?.value || 'N/A';
  const llmModel = allEnvVars.find(e => e.name === 'LLM_MODEL')?.value || 'N/A';

  return (
    <div className="ad-page">
      <style>{detailStyles}</style>

      <div className="ad-back-row">
        <button className="ad-back-btn" onClick={() => navigate('..')}>
          &larr; Back to Agents
        </button>
      </div>

      <div className="ad-header">
        <div>
          <h1 className="ad-name">{name}</h1>
          <span className="ad-ns">{namespace}</span>
        </div>
        <span
          className="ad-status"
          style={{
            backgroundColor: (agent.status ?? agent.readyStatus) === 'Ready' ? '#10b98120' : '#f59e0b20',
            color: (agent.status ?? agent.readyStatus) === 'Ready' ? '#059669' : '#d97706',
          }}
        >
          {agent.status ?? agent.readyStatus ?? 'Unknown'}
        </span>
      </div>

      <div className="ad-tabs">
        {(['overview', 'chat', 'logs'] as const).map(tab => (
          <button
            key={tab}
            className={`ad-tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="ad-overview">
          <div className="ad-info-grid">
            <div className="ad-info-card">
              <h4>Container Image</h4>
              <code>{primaryContainer?.image || 'N/A'}</code>
            </div>
            <div className="ad-info-card">
              <h4>LLM Provider</h4>
              <span>{llmProvider}</span>
            </div>
            <div className="ad-info-card">
              <h4>LLM Model</h4>
              <span>{llmModel}</span>
            </div>
            <div className="ad-info-card">
              <h4>Containers</h4>
              <span>{containers.map(c => c.name).filter(Boolean).join(', ') || 'N/A'}</span>
            </div>
          </div>

          {allEnvVars.length > 0 && (
            <div className="ad-env-section">
              <h3>Environment Variables</h3>
              <div className="ad-env-table">
                {allEnvVars
                  .filter(e => !/KEY|PASSWORD|TOKEN|SECRET|BEARER|CREDENTIAL/i.test(e.name))
                  .map(e => (
                    <div key={e.name} className="ad-env-row">
                      <code className="ad-env-name">{e.name}</code>
                      <span className="ad-env-value">{e.value || '(from secret)'}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'chat' && (
        <div className="ad-chat">
          <div className="ad-chat-messages">
            {chatMessages.length === 0 && (
              <div className="ad-chat-empty">
                Send a message to start chatting with <strong>{name}</strong>
              </div>
            )}
            {chatMessages.map((msg, i) => (
              <div
                key={i}
                className={`ad-chat-msg ${msg.role === 'user' ? 'ad-chat-user' : 'ad-chat-agent'}`}
              >
                <div className="ad-chat-role">
                  {msg.role === 'user' ? 'You' : name}
                </div>
                <div className="ad-chat-content">{msg.content}</div>
              </div>
            ))}
            {chatLoading && (
              <div className="ad-chat-msg ad-chat-agent">
                <div className="ad-chat-role">{name}</div>
                <div className="ad-chat-content ad-chat-typing">Thinking...</div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          <div className="ad-chat-input-row">
            <input
              type="text"
              className="ad-chat-input"
              placeholder="Type a message..."
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendChat()}
              disabled={chatLoading}
            />
            <button
              className="ad-chat-send"
              onClick={sendChat}
              disabled={chatLoading || !chatInput.trim()}
            >
              Send
            </button>
          </div>
        </div>
      )}

      {activeTab === 'logs' && (
        <div className="ad-logs">
          <div className="ad-logs-header">
            <h3>Pod Logs</h3>
            <button className="ad-refresh-btn" onClick={loadLogs} disabled={logsLoading}>
              {logsLoading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
          <pre className="ad-logs-pre">{logs || 'No logs available'}</pre>
        </div>
      )}
    </div>
  );
}

const detailStyles = `
  .ad-page { padding: 24px 32px 40px; max-width: 1200px; }
  .ad-back-row { margin-bottom: 16px; }
  .ad-back-btn {
    background: none; border: none; color: var(--pf-t--global--color--brand--default, #0066cc);
    font-size: 14px; cursor: pointer; padding: 0; font-weight: 500;
  }
  .ad-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
  .ad-name { font-size: 28px; font-weight: 700; margin: 0; }
  .ad-ns { font-size: 13px; color: var(--pf-t--global--text--color--subtle, #6a6e73); font-family: monospace; }
  .ad-status {
    display: inline-flex; padding: 4px 14px; border-radius: 999px;
    font-size: 13px; font-weight: 600;
  }

  .ad-tabs { display: flex; gap: 4px; margin-bottom: 24px; border-bottom: 1px solid var(--pf-t--global--border--color--default, #d2d2d2); }
  .ad-tab {
    padding: 8px 20px; background: none; border: none;
    border-bottom: 2px solid transparent; font-size: 14px; font-weight: 500;
    color: var(--pf-t--global--text--color--subtle, #6a6e73); cursor: pointer;
  }
  .ad-tab.active {
    color: var(--pf-t--global--color--brand--default, #0066cc);
    border-bottom-color: var(--pf-t--global--color--brand--default, #0066cc);
    font-weight: 600;
  }

  .ad-info-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; margin-bottom: 24px; }
  .ad-info-card {
    padding: 16px; border-radius: 8px;
    border: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
    background: var(--pf-t--global--background--color--primary--default, #fff);
  }
  .ad-info-card h4 { margin: 0 0 8px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--pf-t--global--text--color--subtle, #6a6e73); }
  .ad-info-card code, .ad-info-card span { font-size: 14px; word-break: break-all; }

  .ad-env-section h3 { font-size: 16px; font-weight: 600; margin: 0 0 12px; }
  .ad-env-table { border: 1px solid var(--pf-t--global--border--color--default, #d2d2d2); border-radius: 8px; overflow: hidden; }
  .ad-env-row { display: flex; padding: 8px 16px; border-bottom: 1px solid var(--pf-t--global--border--color--default, #f0f0f0); }
  .ad-env-row:last-child { border-bottom: none; }
  .ad-env-name { flex: 0 0 260px; font-size: 13px; font-weight: 600; color: var(--pf-t--global--text--color--regular, #151515); }
  .ad-env-value { font-size: 13px; color: var(--pf-t--global--text--color--subtle, #6a6e73); word-break: break-all; }

  .ad-chat { display: flex; flex-direction: column; height: 500px; border: 1px solid var(--pf-t--global--border--color--default, #d2d2d2); border-radius: 12px; overflow: hidden; }
  .ad-chat-messages { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
  .ad-chat-empty { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--pf-t--global--text--color--subtle, #6a6e73); font-size: 14px; }
  .ad-chat-msg { max-width: 80%; padding: 10px 16px; border-radius: 12px; font-size: 14px; line-height: 1.5; }
  .ad-chat-user { align-self: flex-end; background: var(--pf-t--global--color--brand--default, #0066cc); color: #fff; }
  .ad-chat-agent { align-self: flex-start; background: var(--pf-t--global--background--color--secondary--default, #f0f0f0); }
  .ad-chat-role { font-size: 11px; font-weight: 600; margin-bottom: 4px; opacity: 0.7; }
  .ad-chat-typing { font-style: italic; opacity: 0.6; }
  .ad-chat-input-row { display: flex; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--pf-t--global--border--color--default, #d2d2d2); }
  .ad-chat-input {
    flex: 1; padding: 10px 16px; border-radius: 8px;
    border: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
    font-size: 14px; outline: none;
  }
  .ad-chat-input:focus { border-color: var(--pf-t--global--color--brand--default, #0066cc); }
  .ad-chat-send {
    padding: 10px 24px; border-radius: 8px; border: none;
    background: var(--pf-t--global--color--brand--default, #0066cc); color: #fff;
    font-size: 14px; font-weight: 600; cursor: pointer;
  }
  .ad-chat-send:disabled { opacity: 0.5; cursor: not-allowed; }

  .ad-logs { border: 1px solid var(--pf-t--global--border--color--default, #d2d2d2); border-radius: 12px; overflow: hidden; }
  .ad-logs-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--pf-t--global--border--color--default, #d2d2d2); }
  .ad-logs-header h3 { margin: 0; font-size: 16px; }
  .ad-refresh-btn {
    padding: 6px 16px; border-radius: 6px; border: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
    background: var(--pf-t--global--background--color--primary--default, #fff);
    font-size: 13px; font-weight: 500; cursor: pointer;
  }
  .ad-refresh-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .ad-logs-pre {
    padding: 16px; margin: 0; font-size: 12px; font-family: monospace;
    background: #1e1e1e; color: #d4d4d4; overflow-x: auto; max-height: 500px; overflow-y: auto;
    white-space: pre-wrap; word-break: break-all; line-height: 1.6;
  }
`;
