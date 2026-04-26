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
import { useState, useCallback, useMemo } from 'react';
import type { ChatMessage } from './types';
import { useBuilderChat } from './hooks/useBuilderChat';
import { useBuilderSession } from './hooks/useBuilderSession';
import { ChatPanel } from './chat/ChatPanel';
import { ArtifactPanel } from './artifact/ArtifactPanel';
import { InspectorDrawer } from './inspector/InspectorDrawer';
import styles from './BuilderStudio.module.css';

export default function BuilderStudio() {
  const chat = useBuilderChat();
  const [inspectorOpen, setInspectorOpen] = useState(false);

  const handleRestore = useCallback(
    (state: {
      contextId: string;
      messages: ChatMessage[];
      generatedContent: string;
    }) => {
      chat.restore(state);
    },
    [chat],
  );

  useBuilderSession({
    contextId: chat.contextId,
    messages: chat.messages,
    generatedContent: chat.generatedContent,
    isGenerating: chat.isGenerating,
    onRestore: handleRestore,
  });

  const allEvents = useMemo(() => {
    const fromMessages = chat.messages.flatMap(m => m.events ?? []);
    const liveEvents = chat.events;
    const seen = new Set<number>();
    const combined = [...fromMessages, ...liveEvents].filter(e => {
      if (seen.has(e.ts)) return false;
      seen.add(e.ts);
      return true;
    });
    return combined;
  }, [chat.messages, chat.events]);

  return (
    <div className={styles.studio}>
      <div className={styles.toolbar}>
        <button
          className={`${styles.inspectorToggle} ${inspectorOpen ? styles.inspectorToggleActive : ''}`}
          onClick={() => setInspectorOpen(prev => !prev)}
          type="button"
          title={inspectorOpen ? 'Close inspector' : 'Open inspector'}
          aria-label={
            inspectorOpen ? 'Close inspector panel' : 'Open inspector panel'
          }
          aria-pressed={inspectorOpen}
        >
          {'\u2630'}
        </button>
      </div>

      <div className={styles.chat}>
        <ChatPanel
          messages={chat.messages}
          events={chat.events}
          currentAgent={chat.currentAgent}
          isGenerating={chat.isGenerating}
          hasContent={!!chat.generatedContent}
          onSend={chat.send}
          onRetry={chat.retry}
          onClear={chat.clear}
          onAbort={chat.abort}
        />
      </div>

      {(chat.generatedContent || chat.isGenerating) && (
        <div className={styles.artifact}>
          <ArtifactPanel
            generatedContent={chat.generatedContent}
            publishContent={chat.publishContent}
            previousContent={chat.previousContent}
            isGenerating={chat.isGenerating}
          />
        </div>
      )}

      <InspectorDrawer
        open={inspectorOpen}
        onClose={() => setInspectorOpen(false)}
        events={allEvents}
        contextId={chat.contextId}
        messageCount={chat.messages.length}
      />
    </div>
  );
}
