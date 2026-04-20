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

const studioStyles = `
.bld-studio {
  display: flex;
  height: calc(100vh - 112px);
  min-height: 0;
  overflow: hidden;
  background: var(--pf-t--global--background--color--primary--default, #fff);
}

@media (max-width: 900px) {
  .bld-studio { flex-direction: column; }
  .bld-studio-splitter { display: none; }
}

.bld-studio-chat {
  flex: 1;
  min-width: 0;
  display: flex;
}
.bld-studio-artifact {
  width: 480px;
  min-width: 360px;
  max-width: 60vw;
  border-left: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
  overflow: hidden;
  display: flex;
}
@media (max-width: 900px) {
  .bld-studio-artifact {
    width: 100%;
    min-width: 0;
    max-width: 100%;
    border-left: none;
    border-top: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
    max-height: 50vh;
  }
}

.bld-studio-splitter {
  width: 6px;
  cursor: col-resize;
  background: transparent;
  border: none;
  padding: 0;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}
.bld-studio-splitter::after {
  content: '';
  width: 2px;
  height: 32px;
  border-radius: 2px;
  background: var(--pf-t--global--border--color--default, #d2d2d2);
  transition: background 0.15s;
}
.bld-studio-splitter:hover::after {
  background: var(--pf-t--global--color--brand--default, #0066cc);
}

.bld-studio-toolbar {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 10;
}
.bld-inspector-toggle {
  width: 32px;
  height: 32px;
  border: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
  border-radius: 6px;
  background: var(--pf-t--global--background--color--primary--default, #fff);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
}
.bld-inspector-toggle:hover {
  background: var(--pf-t--global--background--color--secondary--default, #f0f0f0);
  border-color: var(--pf-t--global--color--brand--default, #0066cc);
}
.bld-inspector-toggle--active {
  background: var(--pf-t--global--color--brand--default, #0066cc)11;
  border-color: var(--pf-t--global--color--brand--default, #0066cc);
  color: var(--pf-t--global--color--brand--default, #0066cc);
}
.bld-inspector-toggle:focus-visible {
  outline: 2px solid var(--pf-t--global--color--brand--default, #0066cc);
  outline-offset: 2px;
}
`;

export default function BuilderStudio() {
  const chat = useBuilderChat();
  const [inspectorOpen, setInspectorOpen] = useState(false);

  // Session persistence with restore callback
  const handleRestore = useCallback(
    (_state: { contextId: string; messages: ChatMessage[]; generatedContent: string }) => {
      // Session restore is handled at the chat hook level
    },
    [],
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
    <>
      <style>{studioStyles}</style>
      <div className="bld-studio" style={{ position: 'relative' }}>
        <div className="bld-studio-toolbar">
          <button
            className={`bld-inspector-toggle ${inspectorOpen ? 'bld-inspector-toggle--active' : ''}`}
            onClick={() => setInspectorOpen(prev => !prev)}
            type="button"
            title={inspectorOpen ? 'Close inspector' : 'Open inspector'}
            aria-label={inspectorOpen ? 'Close inspector panel' : 'Open inspector panel'}
            aria-pressed={inspectorOpen}
          >
            &#9776;
          </button>
        </div>

        <div className="bld-studio-chat">
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
          <div className="bld-studio-artifact">
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
    </>
  );
}
