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
import { useMemo } from 'react';
import type { ChatMessage, BuilderEvent } from '../types';
import type { ChatMessageBase, ToolCall } from '../../chat/types';
import { ChatMessageList, ChatComposer } from '../../chat';
import { WelcomeHero } from './WelcomeHero';
import { AgentActivityFeed } from './AgentActivityFeed';
import styles from './ChatPanel.module.css';

interface ChatPanelProps {
  messages: ChatMessage[];
  events: BuilderEvent[];
  currentAgent: string;
  isGenerating: boolean;
  hasContent: boolean;
  onSend: (text: string) => void;
  onRetry: () => void;
  onClear: () => void;
  onAbort: () => void;
}

function builderEventsToToolCalls(events?: BuilderEvent[]): ToolCall[] {
  if (!events) return [];
  const results = new Map<
    string,
    Extract<BuilderEvent, { type: 'tool_result' }>
  >();
  for (const e of events) {
    if (e.type === 'tool_result') results.set(`${e.agent}:${e.tool}`, e);
  }
  return events
    .filter(
      (e): e is Extract<BuilderEvent, { type: 'tool_call' }> =>
        e.type === 'tool_call',
    )
    .map(tc => {
      const result = results.get(`${tc.agent}:${tc.tool}`);
      return {
        name: tc.tool,
        agent: tc.agent,
        args: tc.args,
        result: result?.result,
        status: result ? ('complete' as const) : ('running' as const),
        elapsed: result ? result.ts - tc.ts : undefined,
      };
    });
}

function toSharedMessages(messages: ChatMessage[]): ChatMessageBase[] {
  return messages.map(msg => ({
    id: msg.id,
    role: msg.role,
    text: msg.text,
    timestamp: msg.timestamp,
    isError: msg.isError,
    agentName: msg.role === 'agent' ? 'Skill Builder' : undefined,
    validation: msg.validation,
    toolCalls: builderEventsToToolCalls(msg.events),
  }));
}

export function ChatPanel({
  messages,
  events,
  currentAgent,
  isGenerating,
  hasContent,
  onSend,
  onRetry,
  onClear,
  onAbort,
}: ChatPanelProps) {
  const sharedMessages = useMemo(() => toSharedMessages(messages), [messages]);

  const lastAgentEvents = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'agent' && messages[i].events?.length) {
        return messages[i].events!;
      }
    }
    return [];
  }, [messages]);

  const feedEvents = isGenerating ? events : lastAgentEvents;
  const showFeed = feedEvents.some(e => e.type === 'agent_start');

  const emptyState = <WelcomeHero onSuggestionClick={onSend} />;

  return (
    <div className={styles.chat}>
      <ChatMessageList
        messages={sharedMessages}
        isLoading={isGenerating && events.length === 0}
        agentName={currentAgent}
        onRetry={onRetry}
        isGenerating={isGenerating}
        emptyState={emptyState}
      />

      {showFeed && (
        <div className={styles.feedContainer}>
          <AgentActivityFeed events={feedEvents} currentAgent={currentAgent} />
        </div>
      )}

      <ChatComposer
        onSend={onSend}
        onStop={onAbort}
        onClear={onClear}
        isGenerating={isGenerating}
        hasMessages={messages.length > 0}
        placeholder={
          hasContent
            ? 'Describe changes to refine the skill...'
            : 'Describe the skill you want to create...'
        }
        sendLabel={hasContent ? 'Refine' : 'Generate'}
      />
    </div>
  );
}
