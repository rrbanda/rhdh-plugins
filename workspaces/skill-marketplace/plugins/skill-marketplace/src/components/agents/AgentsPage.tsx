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
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { useSearchParams } from 'react-router-dom';
import { skillMarketplaceApiRef } from '../../api';
import {
  useSkills,
  useAgentAvailability,
  useAgenticAvailable,
} from '../../hooks';
import { ChatMessageList, ChatComposer } from '../chat';
import type { ChatMessageBase } from '../chat';
import { PlaygroundSidebar } from './PlaygroundSidebar';
import type { SkillTestStatus } from './playgroundTestStatus';
import pgStyles from './AgentsPage.module.css';

let pgMsgId = 0;
function nextId(): string {
  pgMsgId += 1;
  return `pg-${Date.now()}-${pgMsgId}`;
}

export default function SkillsPlayground() {
  const api = useApi(skillMarketplaceApiRef);
  const { skills } = useSkills();
  const [searchParams] = useSearchParams();

  const preloadSkill = searchParams.get('skill') || '';
  const preloadSkills = searchParams.get('skills') || '';
  const bundleName = searchParams.get('bundleName') || '';
  const bundleId = searchParams.get('bundleId') || '';
  const bundleSkillNames = useMemo(
    () =>
      preloadSkills
        ? preloadSkills
            .split(',')
            .map(s => s.trim())
            .filter(Boolean)
        : [],
    [preloadSkills],
  );
  const isBundleMode = bundleSkillNames.length > 1 || !!bundleName;
  const testStatusKey = bundleId
    ? `bundle-test-${bundleId}`
    : bundleName
      ? `bundle-test-${bundleName}`
      : '';

  const [selectedSkill, setSelectedSkill] = useState(
    () =>
      preloadSkill || (bundleSkillNames.length > 0 ? bundleSkillNames[0] : ''),
  );
  const [messages, setMessages] = useState<ChatMessageBase[]>([]);
  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [testStatuses, setTestStatuses] = useState<
    Record<string, SkillTestStatus>
  >({});

  useEffect(() => {
    if (!testStatusKey) {
      setTestStatuses({});
      return;
    }
    try {
      setTestStatuses(
        JSON.parse(localStorage.getItem(testStatusKey) || '{}') as Record<
          string,
          SkillTestStatus
        >,
      );
    } catch {
      setTestStatuses({});
    }
  }, [testStatusKey]);

  useEffect(() => {
    if (testStatusKey && Object.keys(testStatuses).length > 0) {
      localStorage.setItem(testStatusKey, JSON.stringify(testStatuses));
    }
  }, [testStatuses, testStatusKey]);

  const markSkillTest = useCallback(
    (skillName: string, status: SkillTestStatus) => {
      setTestStatuses(prev => ({ ...prev, [skillName]: status }));
    },
    [],
  );

  const testedCount = bundleSkillNames.filter(
    n => testStatuses[n] && testStatuses[n] !== 'untested',
  ).length;
  const testedPercent =
    bundleSkillNames.length > 0
      ? Math.round((testedCount / bundleSkillNames.length) * 100)
      : 0;

  const {
    isLoading: agentAvailabilityLoading,
    isAgentAvailable,
    kagentiDefaults,
    kagentiCapabilities,
  } = useAgentAvailability();
  const agenticAvailable = useAgenticAvailable();

  const agentNs = kagentiDefaults?.namespace;
  const agentName = kagentiDefaults?.agentName;
  const agentCapabilities = kagentiCapabilities;

  // Chat uses playground when a skill is selected, Kagenti default agent otherwise (see sendMessage).
  const kagentiAvailable = isAgentAvailable('kagenti');
  const playgroundAvailable = isAgentAvailable('playground');
  const chatPathAvailable = selectedSkill
    ? playgroundAvailable
    : kagentiAvailable;
  const agentStatus: 'checking' | 'online' | 'offline' =
    agentAvailabilityLoading
      ? 'checking'
      : chatPathAvailable
        ? 'online'
        : 'offline';

  // Composer and banner: treat as offline only when the active chat path is down AND SMP agents are not configured (health). SMP-only setups should not be blocked by Kagenti control-plane checks alone.
  const isEffectivelyOffline = agentStatus === 'offline' && !agenticAvailable;

  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text || sending) return;

      const userMsg: ChatMessageBase = {
        id: nextId(),
        role: 'user',
        text,
        skill: selectedSkill || undefined,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, userMsg]);
      setSending(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const effectiveAgent = selectedSkill ? 'playground' : agentName;
        const result = (await api.chatWithAgent(
          text,
          sessionId,
          agentNs,
          effectiveAgent,
          selectedSkill || undefined,
          controller.signal,
        )) as {
          session_id?: string;
          sessionId?: string;
          content?: string;
          response?: string;
          message?: string;
        };

        if (controller.signal.aborted) return;

        const newSessionId = result.session_id ?? result.sessionId ?? sessionId;
        if (newSessionId && newSessionId !== sessionId) {
          setSessionId(newSessionId);
        }

        const agentText =
          result.content ??
          result.response ??
          result.message ??
          JSON.stringify(result, null, 2);

        setMessages(prev => [
          ...prev,
          {
            id: nextId(),
            role: 'agent',
            text: agentText,
            timestamp: Date.now(),
          },
        ]);
      } catch (err) {
        if (controller.signal.aborted) return;
        const msg =
          err instanceof Error ? err.message : 'Failed to reach agent';
        setMessages(prev => [
          ...prev,
          {
            id: nextId(),
            role: 'agent',
            text: `Error: ${msg}`,
            timestamp: Date.now(),
            isError: true,
          },
        ]);
      } finally {
        setSending(false);
        abortRef.current = null;
      }
    },
    [api, selectedSkill, sending, sessionId, agentNs, agentName],
  );

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setSending(false);
  }, []);

  const clearChat = useCallback(() => {
    setMessages([]);
    setSessionId(undefined);
  }, []);

  const placeholder =
    isBundleMode && bundleSkillNames.length > 0
      ? `Test ${bundleSkillNames.length} skill bundle skills${selectedSkill ? ` (active: ${selectedSkill})` : ''}...`
      : selectedSkill
        ? `Test "${selectedSkill}" skill...`
        : 'Send a message to the agent...';

  const emptyState = (
    <div className={pgStyles.empty}>
      <h3 className={pgStyles.emptyTitle}>Skills Playground</h3>
      {isBundleMode && bundleSkillNames.length > 0 ? (
        <>
          <p className={pgStyles.emptyDesc}>
            Testing <strong>{bundleSkillNames.length} skills</strong> from your
            skill bundle. Select an active skill from the sidebar, then send a
            message.
          </p>
          <div className={pgStyles.suggestions}>
            {bundleSkillNames.slice(0, 3).map(name => (
              <button
                key={name}
                type="button"
                className={pgStyles.suggestion}
                onClick={() => {
                  setSelectedSkill(name);
                  sendMessage(
                    `What can you do with the ${name.split(':').pop()} skill?`,
                  );
                }}
              >
                <span className={pgStyles.sugSkill}>
                  {name.split(':').pop() || name}
                </span>
                <span>Test this skill</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className={pgStyles.emptyDesc}>
            Select a skill from the sidebar and send a message to test it with
            the live agent.
          </p>
          <div className={pgStyles.suggestions}>
            {[
              {
                skill: 'url-summary',
                text: 'Summarize https://go.dev/blog/go1.24',
              },
              {
                skill: 'code-review',
                text: 'Review this: func add(a,b int) { return a + b }',
              },
              { skill: '', text: 'What skills do you have available?' },
            ].map((s, i) => (
              <button
                key={`sug-${i}`}
                type="button"
                className={pgStyles.suggestion}
                onClick={() => {
                  if (s.skill) setSelectedSkill(s.skill);
                  sendMessage(s.text);
                }}
              >
                {s.skill && (
                  <span className={pgStyles.sugSkill}>{s.skill}</span>
                )}
                <span>{s.text}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className={pgStyles.page}>
      <PlaygroundSidebar
        agentStatus={agentStatus}
        agentNs={agentNs}
        agentCapabilities={agentCapabilities}
        selectedSkill={selectedSkill}
        onSkillChange={setSelectedSkill}
        skills={skills}
        bundleName={bundleName}
        isBundleMode={isBundleMode}
        bundleSkillNames={bundleSkillNames}
        testStatuses={testStatuses}
        testedCount={testedCount}
        onClear={clearChat}
        hasMessages={messages.length > 0}
      />

      <div className={pgStyles.chatArea}>
        {isBundleMode && bundleSkillNames.length > 0 && (
          <div className={pgStyles.bundleTestHeader}>
            <div className={pgStyles.bundleTestTitle}>
              {bundleName
                ? `Testing: ${bundleName}`
                : `Testing ${bundleSkillNames.length} skills`}
            </div>
            <div className={pgStyles.bundleTestProgress}>
              <div
                className={pgStyles.progressBar}
                role="progressbar"
                aria-valuenow={testedPercent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Skill bundle test progress"
              >
                <div
                  className={pgStyles.progressFill}
                  style={{ width: `${testedPercent}%` }}
                />
              </div>
              <span className={pgStyles.progressText}>
                {testedCount}/{bundleSkillNames.length} tested
              </span>
            </div>
          </div>
        )}

        <ChatMessageList
          messages={messages}
          isLoading={sending}
          agentName={agentName || 'Skills Agent'}
          isGenerating={sending}
          emptyState={emptyState}
        />

        {isBundleMode &&
          selectedSkill &&
          !sending &&
          messages.length > 0 &&
          messages[messages.length - 1]?.role === 'agent' && (
            <div className={pgStyles.testActions}>
              <span
                className={pgStyles.testActionsLabel}
                id="bundle-test-actions-label"
              >
                Mark test result:
              </span>
              <button
                type="button"
                className={`${pgStyles.testBtn} ${pgStyles.testBtnPass}`}
                onClick={() => markSkillTest(selectedSkill, 'passed')}
                aria-label={`Mark ${selectedSkill} as passed`}
                aria-describedby="bundle-test-actions-label"
              >
                Pass
              </button>
              <button
                type="button"
                className={`${pgStyles.testBtn} ${pgStyles.testBtnFail}`}
                onClick={() => markSkillTest(selectedSkill, 'failed')}
                aria-label={`Mark ${selectedSkill} as failed`}
                aria-describedby="bundle-test-actions-label"
              >
                Fail
              </button>
            </div>
          )}

        {isEffectivelyOffline && (
          <div className={pgStyles.offlineBar}>
            {selectedSkill
              ? 'Playground agent is currently unavailable. Check SMP agent health and playground configuration—Kagenti may still be up separately.'
              : 'Default agent (Kagenti) is currently unavailable. Select a skill to try the SMP playground path if it is healthy, or check your Kagenti connection.'}
          </div>
        )}

        <ChatComposer
          onSend={sendMessage}
          onStop={handleStop}
          isGenerating={sending}
          disabled={isEffectivelyOffline}
          placeholder={placeholder}
          hasMessages={messages.length > 0}
          onClear={clearChat}
        />
      </div>
    </div>
  );
}
