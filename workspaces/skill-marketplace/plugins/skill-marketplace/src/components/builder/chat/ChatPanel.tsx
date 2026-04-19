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
import { useRef, useEffect, useMemo } from 'react';
import type { ChatMessage, BuilderEvent } from '../types';
import { WelcomeHero } from './WelcomeHero';
import { MessageBubble } from './MessageBubble';
import { AgentThinkingCard } from './AgentThinkingCard';
import { Composer } from './Composer';
import { AgentActivityFeed } from './AgentActivityFeed';

const chatPanelStyles = `
.bld-chat {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  background: var(--pf-t--global--background--color--primary--default, #fff);
}

.bld-messages {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 8px 0;
}
`;

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
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, events]);

  return (
    <>
      <style>{chatPanelStyles}</style>
      <div className="bld-chat">
        <div className="bld-messages">
          {messages.length === 0 && !isGenerating && (
            <WelcomeHero onSuggestionClick={onSend} />
          )}

          {messages.map((msg, idx) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              isLast={idx === messages.length - 1}
              isGenerating={isGenerating}
              onRetry={onRetry}
            />
          ))}

          {isGenerating && events.length === 0 && (
            <AgentThinkingCard agentName={currentAgent} />
          )}

          {showFeed && (
            <AgentActivityFeed events={feedEvents} currentAgent={currentAgent} />
          )}

          <div ref={messagesEndRef} />
        </div>

        <Composer
          isGenerating={isGenerating}
          hasContent={hasContent}
          hasMessages={messages.length > 0}
          onSend={onSend}
          onStop={onAbort}
          onClear={onClear}
        />
      </div>
    </>
  );
}
