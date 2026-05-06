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
import React, { useState, useCallback, useMemo, useRef } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { skillMarketplaceApiRef } from '../../api';
import { useSkills } from '../../hooks/useSkills';
import { useSkillCatalog } from '../../hooks/useSkillCatalog';
import SkillPickerList, { type PickerSkill } from './SkillPickerList';
import SkillContextCard from './SkillContextCard';
import ResponsePanel from './ResponsePanel';
import { ChatMessageList } from '../chat/ChatMessageList';
import { ChatComposer } from '../chat/ChatComposer';
import type { ChatMessageBase } from '../chat/types';
import styles from './SkillsPlayground.module.css';

export default function SkillsPlayground() {
  const api = useApi(skillMarketplaceApiRef);
  const { skills } = useSkills();
  const catalog = useSkillCatalog(100);

  const [selectedSkillId, setSelectedSkillId] = useState('');
  const [messages, setMessages] = useState<ChatMessageBase[]>([]);
  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [lastLatency, setLastLatency] = useState<number | null>(null);
  const [skillContextProvided, setSkillContextProvided] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  const pickerSkills: PickerSkill[] = useMemo(() => {
    if (catalog.available && catalog.skills.length > 0) {
      return catalog.skills.map(s => ({
        id: s.tag ? s.tag.replace(/-\d+\.\d+\.\d+.*$/, '') : s.name,
        name: s.name,
        displayName: s.display_name || s.name,
        namespace: s.namespace,
        status: s.status,
        description: s.description || '',
      }));
    }
    return skills.map(s => ({
      id: (s as any).skillName || (s as any).name || '',
      name: (s as any).name || '',
      displayName: (s as any).displayName || (s as any).name || '',
      namespace: (s as any).pluginName || 'general',
      status: (s as any).lifecycleState || 'published',
      description: (s as any).description || '',
    }));
  }, [catalog, skills]);

  const selectedSkill = useMemo(
    () => pickerSkills.find(s => s.id === selectedSkillId) || null,
    [pickerSkills, selectedSkillId],
  );

  const lastResponse = useMemo(() => {
    const last = [...messages].reverse().find(m => m.role === 'assistant');
    return last?.content || null;
  }, [messages]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || sending) return;

      const userMsg: ChatMessageBase = {
        id: `msg-${Date.now()}-user`,
        role: 'user',
        content: text,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, userMsg]);
      setSending(true);

      const start = Date.now();
      const controller = new AbortController();
      controllerRef.current = controller;

      try {
        const result = (await api.chatWithAgent(
          text,
          sessionId || undefined,
          undefined,
          selectedSkillId ? 'playground' : undefined,
          selectedSkillId || undefined,
          controller.signal,
        )) as any;

        const content =
          result?.content ||
          result?.response ||
          result?.message ||
          JSON.stringify(result);
        const newSessionId =
          result?.session_id || result?.sessionId || sessionId;
        setSessionId(newSessionId);
        setLastLatency(Date.now() - start);
        setSkillContextProvided(!result?.headers?.['x-skill-context-warning']);

        const assistantMsg: ChatMessageBase = {
          id: `msg-${Date.now()}-assistant`,
          role: 'assistant',
          content,
          timestamp: Date.now(),
        };
        setMessages(prev => [...prev, assistantMsg]);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          const errorMsg: ChatMessageBase = {
            id: `msg-${Date.now()}-error`,
            role: 'assistant',
            content: `Error: ${(err as Error).message}`,
            timestamp: Date.now(),
          };
          setMessages(prev => [...prev, errorMsg]);
        }
      } finally {
        setSending(false);
        controllerRef.current = null;
      }
    },
    [api, sending, sessionId, selectedSkillId],
  );

  const clearConversation = useCallback(() => {
    setMessages([]);
    setSessionId(null);
    setLastLatency(null);
  }, []);

  return (
    <div className={styles.playground}>
      <SkillPickerList
        skills={pickerSkills}
        selectedSkillId={selectedSkillId}
        onSelect={id => {
          setSelectedSkillId(id);
          clearConversation();
        }}
      />

      <div className={styles.center}>
        <SkillContextCard
          skill={selectedSkill}
          onSendPrompt={sendMessage}
          onDeselect={() => {
            setSelectedSkillId('');
            clearConversation();
          }}
        />

        <div className={styles.chatArea}>
          <ChatMessageList
            messages={messages}
            isLoading={sending}
            agentName="Playground Agent"
            emptyState={
              <div className={styles.chatEmpty}>
                <p className={styles.chatEmptyText}>
                  {selectedSkillId
                    ? 'Send a message to test this skill against the agent.'
                    : 'Select a skill and send a prompt to begin testing.'}
                </p>
              </div>
            }
          />
          <div className={styles.composerWrap}>
            {messages.length > 0 && (
              <button
                type="button"
                className={styles.clearBtn}
                onClick={clearConversation}
              >
                Clear
              </button>
            )}
            <ChatComposer
              onSend={sendMessage}
              disabled={sending}
              placeholder={
                selectedSkillId
                  ? `Test ${selectedSkill?.displayName || 'skill'}...`
                  : 'Select a skill first, or ask a general question...'
              }
            />
          </div>
        </div>
      </div>

      <ResponsePanel
        latencyMs={lastLatency}
        sessionId={sessionId}
        skillContextProvided={skillContextProvided}
        lastResponse={lastResponse}
      />
    </div>
  );
}
