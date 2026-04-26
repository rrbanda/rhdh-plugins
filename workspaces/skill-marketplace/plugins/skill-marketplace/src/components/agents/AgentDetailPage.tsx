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
import styles from './AgentDetailPage.module.css';

interface AgentDetail {
  metadata?: {
    name: string;
    namespace: string;
    labels: Record<string, string>;
  };
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
          env_from?: Array<{
            config_map_ref?: { name: string };
            secret_ref?: { name: string };
          }>;
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
  const [activeTab, setActiveTab] = useState<'overview' | 'chat' | 'logs'>(
    'overview',
  );
  const [agentStatus, setAgentStatus] = useState<
    'checking' | 'online' | 'offline'
  >('checking');

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [logs, setLogs] = useState<string>('');
  const [logsLoading, setLogsLoading] = useState(false);

  useEffect(() => {
    if (!namespace || !name) {
      return undefined;
    }
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
    return () => {
      cancelled = true;
    };
  }, [api, namespace, name]);

  useEffect(() => {
    let cancelled = false;
    api
      .getHealth()
      .then((health: Record<string, unknown>) => {
        if (cancelled) {
          return undefined;
        }
        const kagenti = health.kagenti as
          | { namespace?: string; agentName?: string }
          | undefined;
        return api.getAgentCard(
          (namespace || kagenti?.namespace) ?? undefined,
          (name || kagenti?.agentName) ?? undefined,
        );
      })
      .then(data => {
        if (!cancelled) {
          setAgentStatus(
            data && typeof data === 'object' ? 'online' : 'offline',
          );
        }
      })
      .catch(() => {
        if (!cancelled) setAgentStatus('offline');
      });
    return () => {
      cancelled = true;
    };
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
      const data = result as {
        content?: string;
        response?: string;
        message?: string;
        session_id?: string;
        sessionId?: string;
      };
      const sid = data.session_id ?? data.sessionId;
      if (sid) setSessionId(sid);
      const agentContent =
        data.content ?? data.response ?? data.message ?? JSON.stringify(data);
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
      setLogs(
        `Error loading logs: ${err instanceof Error ? err.message : 'Unknown error'}`,
      );
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
  const allEnvVars = containers.flatMap(c =>
    (c.env ?? []).filter(e => e.value !== null && e.value !== undefined),
  );
  const primaryContainer = containers[0];
  const llmProvider =
    allEnvVars.find(e => e.name === 'LLM_PROVIDER')?.value || 'N/A';
  const llmModel = allEnvVars.find(e => e.name === 'LLM_MODEL')?.value || 'N/A';

  return (
    <div className={styles.adPage}>
      <div className={styles.adBackRow}>
        <button
          className={styles.adBackBtn}
          onClick={() => navigate('..')}
          type="button"
        >
          &larr; Back to Agents
        </button>
      </div>

      <div className={styles.adHeader}>
        <div>
          <h1 className={styles.adName}>{name}</h1>
          <span className={styles.adNs}>{namespace}</span>
        </div>
        <span
          className={styles.adStatus}
          style={{
            backgroundColor:
              (agent.status ?? agent.readyStatus) === 'Ready'
                ? 'var(--sm-success-tint)'
                : 'var(--sm-warning-tint)',
            color:
              (agent.status ?? agent.readyStatus) === 'Ready'
                ? 'var(--sm-success)'
                : 'var(--sm-warning)',
          }}
        >
          {typeof agent.status === 'string'
            ? agent.status
            : (agent.readyStatus ?? 'Unknown')}
        </span>
      </div>

      <div className={styles.adTabs}>
        {(['overview', 'chat', 'logs'] as const).map(tab => (
          <button
            key={tab}
            className={`${styles.adTab} ${activeTab === tab ? styles.adTabActive : ''}`}
            onClick={() => setActiveTab(tab)}
            type="button"
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div>
          <div className={styles.adInfoGrid}>
            <div className={styles.adInfoCard}>
              <h4>Container Image</h4>
              <code>{primaryContainer?.image || 'N/A'}</code>
            </div>
            <div className={styles.adInfoCard}>
              <h4>LLM Provider</h4>
              <span>{llmProvider}</span>
            </div>
            <div className={styles.adInfoCard}>
              <h4>LLM Model</h4>
              <span>{llmModel}</span>
            </div>
            <div className={styles.adInfoCard}>
              <h4>Containers</h4>
              <span>
                {containers
                  .map(c => c.name)
                  .filter(Boolean)
                  .join(', ') || 'N/A'}
              </span>
            </div>
          </div>

          {allEnvVars.length > 0 && (
            <div className={styles.adEnvSection}>
              <h3>Environment Variables</h3>
              <div className={styles.adEnvTable}>
                {allEnvVars
                  .filter(
                    e =>
                      !/KEY|PASSWORD|TOKEN|SECRET|BEARER|CREDENTIAL/i.test(
                        e.name,
                      ),
                  )
                  .map(e => (
                    <div key={e.name} className={styles.adEnvRow}>
                      <code className={styles.adEnvName}>{e.name}</code>
                      <span className={styles.adEnvValue}>
                        {e.value || '(from secret)'}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'chat' && (
        <div className={styles.adChat}>
          <div className={styles.adChatMessages}>
            {chatMessages.length === 0 && (
              <div className={styles.adChatEmpty}>
                Send a message to start chatting with <strong>{name}</strong>
              </div>
            )}
            {chatMessages.map((msg, i) => (
              <div
                key={i}
                className={`${styles.adChatMsg} ${
                  msg.role === 'user' ? styles.adChatUser : styles.adChatAgent
                }`}
              >
                <div className={styles.adChatRole}>
                  {msg.role === 'user' ? 'You' : name}
                </div>
                <div className={styles.adChatContent}>{msg.content}</div>
              </div>
            ))}
            {chatLoading && (
              <div className={`${styles.adChatMsg} ${styles.adChatAgent}`}>
                <div className={styles.adChatRole}>{name}</div>
                <div
                  className={`${styles.adChatContent} ${styles.adChatTyping}`}
                >
                  Thinking...
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          {agentStatus === 'offline' && (
            <div className={styles.adOfflineBar}>
              Agent is currently offline. Check your Kagenti connection to
              enable chat.
            </div>
          )}
          <div className={styles.adChatInputRow}>
            <input
              type="text"
              className={styles.adChatInput}
              placeholder={
                agentStatus === 'offline'
                  ? 'Agent is offline...'
                  : 'Type a message...'
              }
              aria-label="Message to agent"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendChat()}
              disabled={chatLoading || agentStatus === 'offline'}
            />
            <button
              className={styles.adChatSend}
              onClick={sendChat}
              disabled={
                chatLoading || !chatInput.trim() || agentStatus === 'offline'
              }
              type="button"
            >
              Send
            </button>
          </div>
        </div>
      )}

      {activeTab === 'logs' && (
        <div className={styles.adLogs}>
          <div className={styles.adLogsHeader}>
            <h3>Pod Logs</h3>
            <button
              className={styles.adRefreshBtn}
              onClick={loadLogs}
              disabled={logsLoading}
              type="button"
            >
              {logsLoading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
          <pre className={styles.adLogsPre}>{logs || 'No logs available'}</pre>
        </div>
      )}
    </div>
  );
}
