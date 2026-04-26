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
import React, { useCallback, useRef, useState } from 'react';
import { InteractiveNvlWrapper } from '@neo4j-nvl/react';
import LoadingSpinner from '../shared/LoadingSpinner';
import { useAgenticSearch } from '../../hooks';
import GraphInsightsBar from './GraphInsightsBar';
import AgenticPanel from './AgenticPanel';
import { GraphFocusOverlay } from './GraphFocusOverlay';
import { DetailPanel } from './DetailPanel';
import { GraphControls } from './GraphControls';
import { GraphPageHeader } from './GraphPageHeader';
import { GraphLegendBar } from './GraphLegendBar';
import {
  GraphEmptyStateView,
  GraphLoadErrorView,
  GraphNoDataView,
} from './GraphPageStatusViews';
import { useGraphPage } from './useGraphPage';
import styles from './GraphPage.module.css';

function GraphChatBar({
  agenticAvailable,
  isLoading,
  messageCount,
  aiPanelOpen,
  onSubmit,
  onTogglePanel,
}: {
  agenticAvailable: boolean | null;
  isLoading: boolean;
  messageCount: number;
  aiPanelOpen: boolean;
  onSubmit: (query: string) => void;
  onTogglePanel: () => void;
}) {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!input.trim() || isLoading) return;
      onSubmit(input.trim());
      setInput('');
    },
    [input, isLoading, onSubmit],
  );

  if (agenticAvailable === false) return null;

  return (
    <form className={styles.graphChatBar} onSubmit={handleSubmit}>
      <svg
        className={styles.chatBarIcon}
        viewBox="0 0 24 24"
        width={20}
        height={20}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        aria-hidden
      >
        <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
        <path d="M18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
      </svg>
      <div className={styles.chatBarInputWrap}>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask about skills, tools, dependencies..."
          aria-label="Ask the knowledge graph"
          className={styles.chatBarInput}
          disabled={isLoading}
        />
      </div>
      <button
        type="submit"
        className={styles.chatBarSend}
        aria-label="Send query"
        disabled={isLoading || !input.trim()}
      >
        <svg
          viewBox="0 0 16 16"
          width={14}
          height={14}
          fill="currentColor"
          aria-hidden
        >
          <path d="M15.854.146a.5.5 0 01.11.54l-5.819 14.547a.75.75 0 01-1.329.124l-3.178-4.995L.643 7.184a.75.75 0 01.124-1.33L15.315.037a.5.5 0 01.539.11zM6.636 10.07l2.761 4.338L14.13 2.576 6.636 10.07zm6.787-8.201L1.591 6.602l4.339 2.76 7.494-7.493z" />
        </svg>
      </button>
      {messageCount > 0 && (
        <button
          type="button"
          className={styles.chatBarMsgCount}
          onClick={onTogglePanel}
          aria-label={`${messageCount} messages — ${aiPanelOpen ? 'close' : 'open'} chat panel`}
        >
          {messageCount} msg{messageCount !== 1 ? 's' : ''}
        </button>
      )}
    </form>
  );
}

export default function GraphPage() {
  const agentic = useAgenticSearch();
  const g = useGraphPage({ sendQuery: agentic.sendQuery });

  if (g.loading) return <LoadingSpinner message="Loading knowledge graph..." />;
  if (g.error) {
    const isConnectionError =
      /connect|ECONNREFUSED|listening on the correct/i.test(g.error);
    return (
      <GraphLoadErrorView
        message={g.error}
        isConnectionError={isConnectionError}
        onRetry={g.refetch}
      />
    );
  }
  if (!g.data) {
    return <GraphNoDataView onRetry={g.refetch} />;
  }

  const pluginGroups = g.data.schema.pluginGroups ?? [];
  if (g.data.schema.totalNodes === 0) {
    return (
      <GraphEmptyStateView
        onTriggerSync={() => {
          g.triggerSync();
          g.refetch();
        }}
      />
    );
  }

  const handleChatSubmit = (query: string) => {
    if (!g.aiPanelOpen) {
      g.handleToggleAiPanel();
    }
    void agentic.sendQuery(query);
  };

  return (
    <div className={styles.graphPageRoot}>
      <div className={styles.graphHeaderRow}>
        <GraphPageHeader
          totalNodes={g.data.schema.totalNodes}
          totalRelationships={g.data.schema.totalRelationships}
          pluginGroupCount={g.data.schema.pluginGroups.length}
        />
        <GraphControls
          layout={g.layout}
          onSetLayout={g.setLayout}
          pluginGroups={pluginGroups}
          filterOpen={g.filterOpen}
          onToggleFilterOpen={() => g.setFilterOpen(v => !v)}
          filterRef={g.filterRef}
          enabledPlugins={g.enabledPlugins}
          onTogglePlugin={g.togglePlugin}
          onClearPluginFilters={g.onClearPluginFilters}
          nodeCount={g.nodes.length}
          relCount={g.rels.length}
          searchQuery={g.searchQuery}
          onSearchChange={g.handleSearchInputChange}
          onFitToScreen={g.fitToScreen}
          onResetView={g.resetView}
        />
      </div>

      <GraphInsightsBar />

      <div className={styles.graphBody}>
        <GraphLegendBar
          schemaLabels={g.data.schema.labels}
          enabledLabels={g.enabledLabels}
          onToggleLabel={g.toggleLabel}
          relationshipTypes={g.data.schema.relationshipTypes}
        />

        <div className={styles.canvasRow}>
          <div
            className={`${styles.graphMain} ${
              g.detailNode || g.aiPanelOpen ? styles.graphMainWithDetail : ''
            }`}
          >
            <div
              className={`${styles.nvlCanvas} ${
                agentic.isLoading ? styles.graphCanvasPulse : ''
              }`}
            >
              {g.isFocusMode && (
                <GraphFocusOverlay
                  focusQuery={g.focusQuery}
                  nodeCount={g.focusNodeCount}
                  relCount={g.focusRelCount}
                  onClear={g.clearFocus}
                />
              )}
              {g.nodes.length > 0 ? (
                <InteractiveNvlWrapper
                  ref={g.nvlRef}
                  nodes={g.nodes}
                  rels={g.rels}
                  nvlOptions={g.nvlOptions}
                  mouseEventCallbacks={g.mouseCallbacks}
                />
              ) : (
                <div className={styles.emptyState}>
                  No nodes match the current filters.
                </div>
              )}
            </div>
          </div>

          {g.detailNode && !g.aiPanelOpen && (
            <DetailPanel
              key={g.detailNode.id}
              node={g.detailNode}
              relationships={g.mergedRels}
              allNodes={g.mergedNodes}
              labels={g.data.schema.labels}
              onClose={g.closeDetail}
              onExplore={g.handleExploreNeighborhood}
              exploringNodeId={g.exploringNodeId}
              exploreFeedback={g.exploreFeedback}
              agenticAvailable={g.agenticAvailable}
              onAskAI={g.handleAskAi}
              onNavigateToNode={g.navigateToNode}
            />
          )}

          {g.aiPanelOpen && (
            <AgenticPanel
              messages={agentic.messages}
              streaming={agentic.streaming}
              isLoading={agentic.isLoading}
              sendQuery={agentic.sendQuery}
              clearHistory={agentic.clearHistory}
              onHighlightNodes={g.handleAiHighlight}
              onSelectNode={g.handleAiSelectNode}
              onClose={g.closeAiPanel}
            />
          )}
        </div>

        <GraphChatBar
          agenticAvailable={g.agenticAvailable}
          isLoading={agentic.isLoading}
          messageCount={agentic.messages.length}
          aiPanelOpen={g.aiPanelOpen}
          onSubmit={handleChatSubmit}
          onTogglePanel={g.handleToggleAiPanel}
        />
      </div>
    </div>
  );
}
