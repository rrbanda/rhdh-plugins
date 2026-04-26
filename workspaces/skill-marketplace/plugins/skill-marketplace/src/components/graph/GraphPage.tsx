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
import { InteractiveNvlWrapper } from '@neo4j-nvl/react';
import LoadingSpinner from '../shared/LoadingSpinner';
import { useAgenticSearch } from '../../hooks';
import GraphInsightsBar from './GraphInsightsBar';
import AgenticPanel from './AgenticPanel';
import { GraphFocusOverlay } from './GraphFocusOverlay';
import { DetailPanel } from './DetailPanel';
import { GraphControls } from './GraphControls';
import { GraphPageHeader } from './GraphPageHeader';
import { GraphRelationshipLegend } from './GraphRelationshipLegend';
import {
  GraphEmptyStateView,
  GraphLoadErrorView,
  GraphNoDataView,
} from './GraphPageStatusViews';
import { useGraphPage } from './useGraphPage';
import styles from './GraphPage.module.css';

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
  const hasRelTypes = g.data.schema.relationshipTypes.length > 0;
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

  return (
    <div className={styles.graphPageRoot}>
      <GraphPageHeader
        totalNodes={g.data.schema.totalNodes}
        totalRelationships={g.data.schema.totalRelationships}
        pluginGroupCount={g.data.schema.pluginGroups.length}
      />

      <GraphInsightsBar />

      <div className={styles.graphBody}>
        <div
          className={`${styles.graphMain} ${
            g.detailNode || g.aiPanelOpen ? styles.graphMainWithDetail : ''
          }`}
        >
          <GraphControls
            layout={g.layout}
            onSetLayout={g.setLayout}
            schemaLabels={g.data.schema.labels}
            enabledLabels={g.enabledLabels}
            onToggleLabel={g.toggleLabel}
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
            agenticAvailable={g.agenticAvailable}
            aiPanelOpen={g.aiPanelOpen}
            onToggleAiPanel={g.handleToggleAiPanel}
            onFitToScreen={g.fitToScreen}
            onResetView={g.resetView}
          />

          {hasRelTypes && (
            <GraphRelationshipLegend
              relationshipTypes={g.data.schema.relationshipTypes}
            />
          )}

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
                offsetForLegend={hasRelTypes}
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
    </div>
  );
}
