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
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { InteractiveNvlWrapper } from '@neo4j-nvl/react';
import type { Node, Relationship, HitTargets, NVL } from '@neo4j-nvl/base';
import { useApi } from '@backstage/core-plugin-api';
import { skillMarketplaceApiRef } from '../../api';
import { useGraphData } from '../../hooks';
import type {
  NvlNode,
  NvlRelationship,
  PluginGroup,
} from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import LoadingSpinner from '../shared/LoadingSpinner';
import ErrorMessage from '../shared/ErrorMessage';
import AgenticPanel from './AgenticPanel';

type LayoutMode = 'forceDirected' | 'hierarchical';

const GRAPH_DEFAULTS = {
  AUTO_REFRESH_MS: 30_000,
  SEARCH_DEBOUNCE_MS: 400,
  NEIGHBORHOOD_DEPTH: 2,
  NEIGHBORHOOD_LIMIT: 50,
  INITIAL_GRAPH_LIMIT: 500,
  MIN_SEARCH_LENGTH: 2,
} as const;

const REL_COLORS: Record<string, string> = {
  SAME_PLUGIN: '#06b6d4',
  USES_AUTH: '#ef4444',
  SAME_DOMAIN: '#8b5cf6',
  COMPLEMENTS: '#10b981',
  CROSS_LANGUAGE: '#f59e0b',
  DEPENDS_ON: '#ef4444',
  ALTERNATIVE_TO: '#f59e0b',
  EXTENDS: '#8b5cf6',
  PRECEDES: '#06b6d4',
};

const HIDDEN_PROPS = new Set([
  'embedding',
  'assetContent',
  'body',
  'pluginColor',
]);

export default function GraphPage() {
  const api = useApi(skillMarketplaceApiRef);
  const { data, loading, error, refetch } = useGraphData(GRAPH_DEFAULTS.INITIAL_GRAPH_LIMIT);
  const nvlRef = useRef<NVL | null>(null);

  const [layout, setLayout] = useState<LayoutMode>('forceDirected');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout>>();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [enabledLabels, setEnabledLabels] = useState<Set<string>>(new Set());
  const [enabledPlugins, setEnabledPlugins] = useState<Set<string>>(new Set());
  const [detailNode, setDetailNode] = useState<NvlNode | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const [overlayNodes, setOverlayNodes] = useState<NvlNode[]>([]);
  const [overlayRels, setOverlayRels] = useState<NvlRelationship[]>([]);
  const labelsInitialized = useRef(false);
  const dataRef = useRef(data);
  dataRef.current = data;
  const overlayNodesRef = useRef(overlayNodes);
  overlayNodesRef.current = overlayNodes;
  const nodesRef = useRef<Node[]>([]);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [highlightedNodes, setHighlightedNodes] = useState<Set<string>>(new Set());

  useEffect(() => {
    const handle = setInterval(refetch, GRAPH_DEFAULTS.AUTO_REFRESH_MS);
    return () => clearInterval(handle);
  }, [refetch]);

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
  }, [searchQuery]);

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, []);

  const handleExploreNeighborhood = useCallback(async (nodeId: string) => {
    try {
      const result = await api.getNeighborhood(
        nodeId,
        GRAPH_DEFAULTS.NEIGHBORHOOD_DEPTH,
        GRAPH_DEFAULTS.NEIGHBORHOOD_LIMIT,
      );
      if (result.nodes.length > 0) {
        setOverlayNodes(prev => {
          const existingIds = new Set([
            ...(dataRef.current?.nodes.map(n => n.id) ?? []),
            ...prev.map(n => n.id),
          ]);
          const newNodes = result.nodes.filter(n => !existingIds.has(n.id));
          return newNodes.length > 0 ? [...prev, ...newNodes] : prev;
        });
        setOverlayRels(prev => {
          const existingIds = new Set([
            ...(dataRef.current?.relationships.map(r => r.id) ?? []),
            ...prev.map(r => r.id),
          ]);
          const newRels = result.relationships.filter(r => !existingIds.has(r.id));
          return newRels.length > 0 ? [...prev, ...newRels] : prev;
        });
      }
    } catch {
      /* neighborhood expansion is best-effort */
    }
  }, [api]);

  useEffect(() => {
    if (data && !labelsInitialized.current) {
      setEnabledLabels(new Set(data.schema.labels.map(l => l.name)));
      labelsInitialized.current = true;
    }
  }, [data]);

  useEffect(() => {
    if (!filterOpen) return;
    const handler = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as globalThis.Node)) {
        setFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [filterOpen]);

  const { nodes, rels } = useMemo(() => {
    if (!data) return { nodes: [] as Node[], rels: [] as Relationship[] };

    const allNodes = [...data.nodes, ...overlayNodes];
    const allRelationships = [...data.relationships, ...overlayRels];
    const q = debouncedSearch.toLowerCase();

    const filteredNodes = allNodes.filter(n => {
      const hasEnabledLabel = n.labels.some(l => enabledLabels.has(l));
      if (!hasEnabledLabel) return false;
      if (
        enabledPlugins.size > 0 &&
        !enabledPlugins.has((n.properties.plugin as string) ?? '')
      )
        return false;
      if (!q) return true;
      return (
        n.caption.toLowerCase().includes(q) ||
        n.labels.some(l => l.toLowerCase().includes(q)) ||
        ((n.properties.plugin as string) ?? '').toLowerCase().includes(q)
      );
    });

    const nodeIds = new Set(filteredNodes.map(n => n.id));

    const filteredRels = allRelationships.filter(
      r => nodeIds.has(r.from) && nodeIds.has(r.to),
    );

    const isHighlighted = (node: NvlNode) =>
      highlightedNodes.has(node.caption) ||
      highlightedNodes.has(String(node.properties.name));

    const nvlNodes: Node[] = filteredNodes.map(n => ({
      id: n.id,
      caption: n.caption,
      color: n.id === selectedNodeId
        ? '#60a5fa'
        : isHighlighted(n)
          ? '#8b5cf6'
          : n.color,
      size: isHighlighted(n) ? n.size * 1.3 : n.size,
      selected: n.id === selectedNodeId || isHighlighted(n),
    }));

    const nvlRels: Relationship[] = filteredRels.map(r => ({
      id: r.id,
      from: r.from,
      to: r.to,
      caption: r.caption,
      color: r.color,
    }));

    return { nodes: nvlNodes, rels: nvlRels };
  }, [data, overlayNodes, overlayRels, enabledLabels, enabledPlugins, debouncedSearch, selectedNodeId, highlightedNodes]);

  const nvlOptions = useMemo(
    () => ({
      disableTelemetry: true,
      disableWebWorkers: false,
      renderer: 'canvas' as const,
      layout,
      minZoom: 0.1,
      maxZoom: 5,
      initialZoom: 1,
      styling: {
        defaultNodeColor: '#3b82f6',
        defaultRelationshipColor: '#475569',
        selectedBorderColor: '#60a5fa',
        nodeDefaultBorderColor: '#334155',
      },
    }),
    [layout],
  );

  const mouseCallbacks = useMemo(
    () => ({
      onNodeClick: (
        clickedNode: Node,
        _hitTargets: HitTargets,
        _evt: MouseEvent,
      ) => {
        const allSourceNodes = [
          ...(dataRef.current?.nodes ?? []),
          ...overlayNodesRef.current,
        ];
        const sourceNode = allSourceNodes.find(n => n.id === clickedNode.id);
        if (sourceNode) {
          setSelectedNodeId(clickedNode.id);
          setDetailNode(sourceNode);
        }
      },
      onRelationshipClick: (
        _clickedRel: Relationship,
        _hitTargets: HitTargets,
        _evt: MouseEvent,
      ) => {},
      onCanvasClick: () => {
        setSelectedNodeId(null);
        setDetailNode(null);
      },
      onHover: true,
      onZoom: true,
      onPan: true,
      onDrag: true,
    }),
    [],
  );

  nodesRef.current = nodes;
  const fitToScreen = useCallback(() => {
    nvlRef.current?.fit(nodesRef.current.map(n => n.id));
  }, []);

  const resetView = useCallback(() => {
    setSearchQuery('');
    setSelectedNodeId(null);
    setDetailNode(null);
    setEnabledPlugins(new Set());
    setOverlayNodes([]);
    setOverlayRels([]);
    setHighlightedNodes(new Set());
    setAiPanelOpen(false);
    if (data) setEnabledLabels(new Set(data.schema.labels.map(l => l.name)));
  }, [data]);

  const toggleLabel = useCallback((label: string) => {
    setEnabledLabels(prev => {
      const next = new Set(prev);
      if (next.has(label)) {
        if (next.size > 1) next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  }, []);

  const handleAiHighlight = useCallback((nodeNames: string[]) => {
    setHighlightedNodes(new Set(nodeNames));
    if (nvlRef.current && nodeNames.length > 0) {
      const allNodes = [...(dataRef.current?.nodes ?? []), ...overlayNodes];
      const matchIds = allNodes
        .filter(n => nodeNames.includes(n.caption) || nodeNames.includes(String(n.properties.name)))
        .map(n => n.id);
      if (matchIds.length > 0) {
        nvlRef.current.fit(matchIds);
      }
    }
  }, [overlayNodes]);

  const handleAiSelectNode = useCallback((nodeName: string) => {
    const allNodes = [...(dataRef.current?.nodes ?? []), ...overlayNodes];
    const match = allNodes.find(
      n => n.caption === nodeName || String(n.properties.name) === nodeName,
    );
    if (match) {
      setSelectedNodeId(match.id);
      setDetailNode(match);
      setAiPanelOpen(false);
    }
  }, [overlayNodes]);

  const togglePlugin = useCallback((plugin: string) => {
    setEnabledPlugins(prev => {
      const next = new Set(prev);
      if (next.has(plugin)) next.delete(plugin);
      else next.add(plugin);
      return next;
    });
  }, []);

  const mergedRels = useMemo(
    () => [...(data?.relationships ?? []), ...overlayRels],
    [data?.relationships, overlayRels],
  );
  const mergedNodes = useMemo(
    () => [...(data?.nodes ?? []), ...overlayNodes],
    [data?.nodes, overlayNodes],
  );

  if (loading) return <LoadingSpinner message="Loading knowledge graph..." />;
  if (error) {
    const isConnectionError = /connect|ECONNREFUSED|listening on the correct/i.test(error);
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <ErrorMessage
          message={
            isConnectionError
              ? 'Cannot reach the knowledge graph database. Please verify that the graph database service is running and accessible.'
              : error
          }
        />
        <button
          onClick={refetch}
          style={{
            marginTop: 16,
            padding: '10px 24px',
            borderRadius: 8,
            border: '1px solid #d2d2d2',
            background: '#0066cc',
            color: '#fff',
            fontWeight: 600,
            fontSize: 14,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Retry
        </button>
      </div>
    );
  }
  if (!data)
    return <ErrorMessage message="No graph data available. Is Neo4j running?" />;

  const pluginGroups: PluginGroup[] = data.schema.pluginGroups ?? [];
  const hasRelTypes = data.schema.relationshipTypes.length > 0;

  return (
    <div className="graph-page-root">
      <style>{graphPageStyles}</style>

      {/* Header */}
      <div className="graph-header">
        <h1 className="graph-title">Skill Knowledge Graph</h1>
        <span className="graph-stats">
          {data.schema.totalNodes} nodes &middot;{' '}
          {data.schema.totalRelationships} relationships
          {data.schema.pluginGroups.length > 0 && (
            <> &middot; {data.schema.pluginGroups.length} domains</>
          )}
        </span>
        <AutoSyncIndicator intervalMs={GRAPH_DEFAULTS.AUTO_REFRESH_MS} />
      </div>

      {/* Main content */}
      <div className="graph-body">
        {/* Graph area */}
        <div className={`graph-main ${detailNode || aiPanelOpen ? 'with-detail' : ''}`}>
          {/* Controls bar */}
          <div className="graph-controls">
            {/* Layout switcher */}
            <div className="layout-switcher">
              {(
                [
                  { mode: 'forceDirected' as LayoutMode, label: 'Force' },
                  { mode: 'hierarchical' as LayoutMode, label: 'Tree' },
                ] as const
              ).map(({ mode, label }) => (
                <button
                  key={mode}
                  onClick={() => setLayout(mode)}
                  className={`layout-btn ${layout === mode ? 'active' : ''}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Label filters */}
            <div className="label-filters">
              {data.schema.labels.map(label => (
                <button
                  key={label.name}
                  onClick={() => toggleLabel(label.name)}
                  className="label-chip"
                  style={{
                    backgroundColor: enabledLabels.has(label.name)
                      ? `${label.color}20`
                      : 'var(--chip-bg-off)',
                    color: enabledLabels.has(label.name)
                      ? label.color
                      : 'var(--text-muted)',
                    borderColor: enabledLabels.has(label.name)
                      ? `${label.color}40`
                      : 'var(--border)',
                    opacity: enabledLabels.has(label.name) ? 1 : 0.4,
                  }}
                >
                  <span
                    className="label-dot"
                    style={{ backgroundColor: label.color }}
                  />
                  {label.name}
                  <span className="label-count">({label.count})</span>
                </button>
              ))}
            </div>

            {/* Plugin filter dropdown */}
            {pluginGroups.length > 0 && (
              <div className="plugin-filter-wrap" ref={filterRef}>
                <button
                  onClick={() => setFilterOpen(v => !v)}
                  className={`plugin-filter-btn ${enabledPlugins.size > 0 ? 'active' : ''}`}
                >
                  <svg viewBox="0 0 16 16" width={12} height={12} fill="currentColor">
                    <path d="M1.5 1.5A.5.5 0 012 1h12a.5.5 0 01.37.835L9.5 7.586V13a.5.5 0 01-.252.434l-3 1.75A.5.5 0 015.5 14.75V7.586L.63 1.835A.5.5 0 011.5 1.5z" />
                  </svg>
                  Plugins
                  {enabledPlugins.size > 0 && (
                    <span className="plugin-badge">{enabledPlugins.size}</span>
                  )}
                </button>
                {filterOpen && (
                  <div className="plugin-popover">
                    {enabledPlugins.size > 0 && (
                      <button
                        className="plugin-clear"
                        onClick={() => {
                          setEnabledPlugins(new Set());
                          setFilterOpen(false);
                        }}
                      >
                        Clear all filters
                      </button>
                    )}
                    {pluginGroups.map(pg => {
                      const isActive = enabledPlugins.has(pg.name);
                      return (
                        <button
                          key={pg.name}
                          onClick={() => togglePlugin(pg.name)}
                          className={`plugin-item ${isActive ? 'active' : ''}`}
                          style={
                            isActive
                              ? ({ '--pg-color': pg.color } as React.CSSProperties)
                              : undefined
                          }
                        >
                          <span
                            className="plugin-dot"
                            style={{
                              background: isActive ? pg.color : 'transparent',
                              borderColor: isActive ? pg.color : '#666',
                            }}
                          />
                          {pg.name.replace(/-/g, ' ')}
                          <span className="plugin-count">{pg.count}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Spacer + right controls */}
            <div className="controls-spacer" />

            <span className="node-edge-count">
              {nodes.length}n &middot; {rels.length}e
            </span>

            {/* Search */}
            <div className="search-wrap">
              <svg
                className="search-icon"
                viewBox="0 0 16 16"
                width={12}
                height={12}
                fill="currentColor"
              >
                <path d="M11.742 10.344a6.5 6.5 0 10-1.397 1.398h-.001l3.85 3.85a1 1 0 001.415-1.414l-3.85-3.85zm-5.442.156a5 5 0 110-10 5 5 0 010 10z" />
              </svg>
              <input
                type="text"
                placeholder="Search graph..."
                aria-label="Search knowledge graph"
                value={searchQuery}
                onChange={e => {
                  const val = e.target.value;
                  setSearchQuery(val);
                  if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
                  if (val.length >= GRAPH_DEFAULTS.MIN_SEARCH_LENGTH) {
                    searchTimeoutRef.current = setTimeout(async () => {
                      try {
                        const result = await api.searchGraph(val);
                        if (result.nodes.length > 0) {
                          setOverlayNodes(prev => {
                            const existingIds = new Set([
                              ...(dataRef.current?.nodes.map(n => n.id) ?? []),
                              ...prev.map(n => n.id),
                            ]);
                            const newNodes = result.nodes.filter(n => !existingIds.has(n.id));
                            return newNodes.length > 0 ? [...prev, ...newNodes] : prev;
                          });
                        }
                      } catch { /* fallback to client-side filter */ }
                    }, GRAPH_DEFAULTS.SEARCH_DEBOUNCE_MS);
                  }
                }}
                className="search-input"
              />
            </div>

            {/* Actions */}
            <button
              onClick={() => { setAiPanelOpen(v => !v); if (!aiPanelOpen) { setDetailNode(null); setSelectedNodeId(null); } }}
              className={`action-btn ai-toggle-btn ${aiPanelOpen ? 'active' : ''}`}
              title="Ask the Knowledge Graph"
            >
              <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            </button>
            <button
              onClick={fitToScreen}
              className="action-btn"
              title="Fit to screen"
            >
              ⛶
            </button>
            <button
              onClick={resetView}
              className="action-btn"
              title="Reset view"
            >
              ↺
            </button>
          </div>

          {/* Relationship legend */}
          {hasRelTypes && (
            <div className="rel-legend">
              <span className="rel-legend-title">Edges</span>
              {data.schema.relationshipTypes.map(({ type, count }) => {
                const c = REL_COLORS[type] ?? '#475569';
                return (
                  <span key={type} className="rel-legend-item">
                    <span
                      className="rel-legend-line"
                      style={{ backgroundColor: c }}
                    />
                    {type.replace(/_/g, ' ').toLowerCase()}
                    <span className="rel-legend-count">({count})</span>
                  </span>
                );
              })}
            </div>
          )}

          {/* NVL Canvas */}
          <div
            className="nvl-canvas"
            style={{ top: hasRelTypes ? '5.5rem' : '2.75rem' }}
          >
            {nodes.length > 0 ? (
              <InteractiveNvlWrapper
                ref={nvlRef}
                nodes={nodes}
                rels={rels}
                nvlOptions={nvlOptions}
                mouseEventCallbacks={mouseCallbacks}
              />
            ) : (
              <div className="empty-state">
                No nodes match the current filters.
              </div>
            )}
          </div>
        </div>

        {/* Detail panel */}
        {detailNode && !aiPanelOpen && (
          <DetailPanel
            node={detailNode}
            relationships={mergedRels}
            allNodes={mergedNodes}
            labels={data.schema.labels}
            onClose={() => {
              setSelectedNodeId(null);
              setDetailNode(null);
            }}
            onExplore={handleExploreNeighborhood}
          />
        )}

        {/* AI panel */}
        {aiPanelOpen && (
          <AgenticPanel
            onHighlightNodes={handleAiHighlight}
            onSelectNode={handleAiSelectNode}
            onClose={() => { setAiPanelOpen(false); setHighlightedNodes(new Set()); }}
          />
        )}
      </div>
    </div>
  );
}

const AutoSyncIndicator = React.memo(function AutoSyncIndicator({
  intervalMs,
}: {
  intervalMs: number;
}) {
  const [display, setDisplay] = useState(() => new Date().toLocaleTimeString());
  useEffect(() => {
    const id = setInterval(() => setDisplay(new Date().toLocaleTimeString()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return (
    <span className="auto-sync-indicator">
      <span className="auto-sync-dot" />
      Auto-syncing &middot; last refresh {display}
    </span>
  );
});

interface DetailPanelProps {
  node: NvlNode;
  relationships: NvlRelationship[];
  allNodes: NvlNode[];
  labels: { name: string; color: string; count: number }[];
  onClose: () => void;
  onExplore: (nodeId: string) => void;
}

function DetailPanel({
  node,
  relationships,
  allNodes,
  labels,
  onClose,
  onExplore,
}: DetailPanelProps) {
  const labelColorMap = new Map(labels.map(l => [l.name, l.color]));
  const connections = relationships.filter(
    r => r.from === node.id || r.to === node.id,
  );
  const incoming = connections.filter(r => r.to === node.id);
  const outgoing = connections.filter(r => r.from === node.id);
  const getCaption = (id: string) =>
    allNodes.find(n => n.id === id)?.caption ?? id;

  const displayProps = Object.entries(node.properties).filter(
    ([key]) => !HIDDEN_PROPS.has(key),
  );

  return (
    <div className="detail-panel">
      {/* Header */}
      <div className="detail-header">
        <span className="detail-header-title">Node Details</span>
        <button onClick={onClose} className="detail-close">
          &times;
        </button>
      </div>

      {/* Body */}
      <div className="detail-body">
        {/* Title + labels */}
        <div className="detail-section">
          <h4 className="detail-name">{String(node.caption)}</h4>
          <div className="detail-labels">
            {node.labels.map(l => (
              <span
                key={l}
                className="detail-label-tag"
                style={{
                  backgroundColor: `${labelColorMap.get(l) ?? '#6b7280'}20`,
                  color: labelColorMap.get(l) ?? '#6b7280',
                }}
              >
                {l}
              </span>
            ))}
          </div>
        </div>

        {/* Description */}
        {node.properties.description ? (
          <div className="detail-section detail-description">
            {String(node.properties.description).slice(0, 300)}
          </div>
        ) : null}

        {/* Skill-specific metadata */}
        {node.labels.includes('Skill') && (
          <div className="detail-section">
            {node.properties.category ? (
              <div className="skill-meta-row">
                <span className="skill-meta-label">Domain</span>
                <span className="skill-meta-value" style={{ color: (node.properties.pluginColor as string) || '#6b7280' }}>
                  {String(node.properties.category)}
                </span>
              </div>
            ) : null}
            {node.properties.complexity ? (
              <div className="skill-meta-row">
                <span className="skill-meta-label">Complexity</span>
                <span className="skill-meta-value">{String(node.properties.complexity)}</span>
              </div>
            ) : null}
            {node.properties.version ? (
              <div className="skill-meta-row">
                <span className="skill-meta-label">Version</span>
                <span className="skill-meta-value">{String(node.properties.version)}</span>
              </div>
            ) : null}
            {node.properties.author ? (
              <div className="skill-meta-row">
                <span className="skill-meta-label">Author</span>
                <span className="skill-meta-value">{String(node.properties.author)}</span>
              </div>
            ) : null}
            <button className="explore-btn" onClick={() => onExplore(node.id)}>
              Explore Neighborhood
            </button>
          </div>
        )}

        {/* Properties */}
        {displayProps.length > 0 && (
          <div className="detail-section">
            <h5 className="detail-section-title">Properties</h5>
            <dl className="detail-props">
              {displayProps.map(([key, value]) => (
                <div key={key} className="detail-prop-row">
                  <dt className="detail-prop-key">{key}</dt>
                  <dd className="detail-prop-val">
                    {String(value).length > 200
                      ? `${String(value).slice(0, 200)}...`
                      : String(value)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {/* Connections */}
        {connections.length > 0 && (
          <div className="detail-section">
            <h5 className="detail-section-title">
              Connections ({connections.length})
            </h5>

            {outgoing.length > 0 && (
              <div className="conn-group">
                <span className="conn-group-label">
                  Outgoing ({outgoing.length})
                </span>
                <ul className="conn-list">
                  {outgoing.map(r => (
                    <li key={r.id} className="conn-item">
                      <span className="conn-arrow">→</span>
                      <span className="conn-type">{r.type}</span>
                      <span className="conn-target">
                        {getCaption(r.to)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {incoming.length > 0 && (
              <div className="conn-group">
                <span className="conn-group-label">
                  Incoming ({incoming.length})
                </span>
                <ul className="conn-list">
                  {incoming.map(r => (
                    <li key={r.id} className="conn-item">
                      <span className="conn-target">
                        {getCaption(r.from)}
                      </span>
                      <span className="conn-type-muted">{r.type}</span>
                      <span className="conn-arrow">→</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const graphPageStyles = `
  .graph-page-root {
    display: flex;
    flex-direction: column;
    height: calc(100vh - 4rem);
  }

  .graph-header {
    padding: 16px 24px 8px;
  }
  .graph-title {
    font-size: 20px;
    font-weight: 700;
    margin: 0;
    letter-spacing: -0.01em;
  }
  .graph-stats {
    font-size: 13px;
    color: var(--pf-t--global--text--color--subtle, #6a6e73);
  }

  .graph-body {
    flex: 1;
    min-height: 0;
    display: flex;
    padding: 0 16px 16px;
    gap: 0;
  }

  .graph-main {
    flex: 1;
    position: relative;
    border-radius: 12px;
    border: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
    overflow: hidden;
    background: var(--pf-t--global--background--color--secondary--default, #f5f5f5);
    transition: margin-right 0.2s;
  }
  .graph-main.with-detail {
    margin-right: 0;
  }

  /* Controls bar */
  .graph-controls {
    position: absolute;
    inset: 0 0 auto 0;
    z-index: 20;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
    background: var(--pf-t--global--background--color--primary--default, rgba(255,255,255,0.95));
    backdrop-filter: blur(8px);
    overflow-x: auto;
  }

  .layout-switcher {
    display: flex;
    gap: 2px;
    border-radius: 8px;
    border: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
    padding: 2px;
  }
  .layout-btn {
    padding: 4px 10px;
    border-radius: 6px;
    border: none;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    background: transparent;
    color: var(--pf-t--global--text--color--subtle, #6a6e73);
    transition: all 0.15s;
  }
  .layout-btn.active {
    background: var(--pf-t--global--color--brand--default, #0066cc);
    color: #fff;
  }

  .label-filters {
    display: flex;
    gap: 4px;
    align-items: center;
  }
  .label-chip {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 500;
    border: 1px solid;
    cursor: pointer;
    transition: opacity 0.15s;
    background: transparent;
  }
  .label-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .label-count {
    opacity: 0.6;
  }

  /* Plugin filter */
  .plugin-filter-wrap {
    position: relative;
  }
  .plugin-filter-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    height: 28px;
    padding: 0 10px;
    border-radius: 6px;
    border: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
    background: transparent;
    color: var(--pf-t--global--text--color--subtle, #6a6e73);
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
  }
  .plugin-filter-btn.active {
    border-color: var(--pf-t--global--color--brand--default, #0066cc);
    color: var(--pf-t--global--color--brand--default, #0066cc);
    background: rgba(0,102,204,0.06);
  }
  .plugin-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--pf-t--global--color--brand--default, #0066cc);
    color: #fff;
    font-size: 12px;
    font-weight: 700;
  }
  .plugin-popover {
    position: absolute;
    top: 34px;
    left: 0;
    width: 260px;
    max-height: 360px;
    overflow-y: auto;
    background: var(--pf-t--global--background--color--primary--default, #fff);
    border: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
    border-radius: 10px;
    padding: 6px;
    z-index: 100;
    box-shadow: 0 8px 32px rgba(0,0,0,0.12);
  }
  .plugin-clear {
    width: 100%;
    padding: 6px 10px;
    margin-bottom: 4px;
    border-radius: 6px;
    border: none;
    background: rgba(239,68,68,0.08);
    color: #ef4444;
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    text-align: left;
  }
  .plugin-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 10px;
    border-radius: 6px;
    border: none;
    background: transparent;
    color: var(--pf-t--global--text--color--regular, #151515);
    cursor: pointer;
    font-size: 13px;
    text-align: left;
    transition: background 0.1s;
  }
  .plugin-item:hover {
    background: var(--pf-t--global--background--color--secondary--default, #f0f0f0);
  }
  .plugin-item.active {
    background: color-mix(in srgb, var(--pg-color, #0066cc) 8%, transparent);
    font-weight: 600;
    color: var(--pg-color, #0066cc);
  }
  .plugin-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 1.5px solid;
    flex-shrink: 0;
  }
  .plugin-count {
    margin-left: auto;
    opacity: 0.5;
    font-size: 12px;
  }

  .controls-spacer {
    flex: 1;
  }

  .node-edge-count {
    font-size: 12px;
    color: var(--pf-t--global--text--color--subtle, #6a6e73);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .search-wrap {
    position: relative;
  }
  .search-icon {
    position: absolute;
    left: 8px;
    top: 50%;
    transform: translateY(-50%);
    opacity: 0.5;
  }
  .search-input {
    height: 28px;
    width: 140px;
    padding: 0 8px 0 26px;
    border-radius: 6px;
    border: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
    background: var(--pf-t--global--background--color--primary--default, #fff);
    font-size: 13px;
    outline: none;
    color: var(--pf-t--global--text--color--regular, #151515);
  }
  .search-input:focus {
    border-color: var(--pf-t--global--color--brand--default, #0066cc);
  }

  .action-btn {
    width: 28px;
    height: 28px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--pf-t--global--text--color--subtle, #6a6e73);
    cursor: pointer;
    font-size: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.1s;
  }
  .action-btn:hover {
    background: var(--pf-t--global--background--color--secondary--default, #f0f0f0);
  }

  /* Relationship legend */
  .rel-legend {
    position: absolute;
    left: 0;
    right: 0;
    top: 2.75rem;
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 4px 12px;
    border-bottom: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
    background: var(--pf-t--global--background--color--primary--default, rgba(255,255,255,0.9));
    backdrop-filter: blur(8px);
  }
  .rel-legend-title {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--pf-t--global--text--color--subtle, #6a6e73);
  }
  .rel-legend-item {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: var(--pf-t--global--text--color--subtle, #6a6e73);
  }
  .rel-legend-line {
    display: inline-block;
    width: 12px;
    height: 2px;
    border-radius: 1px;
  }
  .rel-legend-count {
    opacity: 0.5;
  }

  /* NVL canvas fill */
  .nvl-canvas {
    position: absolute;
    inset: 0;
    top: 2.75rem;
  }
  .nvl-canvas > div {
    width: 100% !important;
    height: 100% !important;
  }

  .empty-state {
    display: flex;
    height: 100%;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    color: var(--pf-t--global--text--color--subtle, #6a6e73);
  }

  /* Detail panel */
  .detail-panel {
    width: 320px;
    flex-shrink: 0;
    border-left: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
    background: var(--pf-t--global--background--color--primary--default, #fff);
    display: flex;
    flex-direction: column;
    border-radius: 0 12px 12px 0;
    overflow: hidden;
    animation: slideIn 0.2s ease-out;
  }
  @keyframes slideIn {
    from { transform: translateX(16px); opacity: 0.5; }
    to { transform: translateX(0); opacity: 1; }
  }

  .detail-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
  }
  .detail-header-title {
    font-size: 13px;
    font-weight: 600;
  }
  .detail-close {
    width: 24px;
    height: 24px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--pf-t--global--text--color--subtle, #6a6e73);
    cursor: pointer;
    font-size: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .detail-close:hover {
    background: var(--pf-t--global--background--color--secondary--default, #f0f0f0);
  }

  .detail-body {
    flex: 1;
    overflow-y: auto;
    padding: 0;
  }

  .detail-section {
    padding: 12px 16px;
    border-bottom: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
  }
  .detail-section:last-child {
    border-bottom: none;
  }

  .detail-name {
    font-size: 15px;
    font-weight: 700;
    margin: 0 0 6px 0;
    line-height: 1.3;
  }
  .detail-labels {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .detail-label-tag {
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 500;
  }

  .detail-description {
    font-size: 13px;
    color: var(--pf-t--global--text--color--subtle, #6a6e73);
    line-height: 1.5;
  }

  .detail-section-title {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--pf-t--global--text--color--subtle, #6a6e73);
    margin: 0 0 8px 0;
  }

  .detail-props {
    margin: 0;
  }
  .detail-prop-row {
    margin-bottom: 6px;
    font-size: 13px;
  }
  .detail-prop-key {
    font-weight: 500;
    color: var(--pf-t--global--text--color--subtle, #6a6e73);
  }
  .detail-prop-val {
    margin: 2px 0 0 0;
    word-break: break-word;
    line-height: 1.4;
  }

  .conn-group {
    margin-bottom: 12px;
  }
  .conn-group:last-child {
    margin-bottom: 0;
  }
  .conn-group-label {
    font-size: 12px;
    font-weight: 500;
    color: var(--pf-t--global--text--color--subtle, #6a6e73);
  }
  .conn-list {
    list-style: none;
    margin: 4px 0 0 0;
    padding: 0;
  }
  .conn-item {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    font-size: 13px;
    padding: 4px 6px;
    border-radius: 6px;
    transition: background 0.1s;
  }
  .conn-item:hover {
    background: var(--pf-t--global--background--color--secondary--default, #f0f0f0);
  }
  .conn-arrow {
    color: var(--pf-t--global--text--color--subtle, #6a6e73);
    flex-shrink: 0;
    margin-top: 1px;
  }
  .conn-type {
    flex-shrink: 0;
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
    background: rgba(0,102,204,0.08);
    color: var(--pf-t--global--color--brand--default, #0066cc);
  }
  .conn-type-muted {
    flex-shrink: 0;
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
    background: var(--pf-t--global--background--color--secondary--default, #f0f0f0);
    color: var(--pf-t--global--text--color--subtle, #6a6e73);
  }
  .conn-target {
    word-break: break-word;
  }

  /* Auto-sync indicator */
  .auto-sync-indicator {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-left: 12px;
    font-size: 12px;
    color: var(--pf-t--global--text--color--subtle, #6a6e73);
  }
  .auto-sync-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #10b981;
    animation: pulse 2s ease-in-out infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  /* Skill metadata in detail panel */
  .skill-meta-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 4px 0;
    font-size: 13px;
  }
  .skill-meta-label {
    color: var(--pf-t--global--text--color--subtle, #6a6e73);
    font-weight: 500;
  }
  .skill-meta-value {
    font-weight: 600;
  }

  /* AI toggle button */
  .ai-toggle-btn {
    position: relative;
  }
  .ai-toggle-btn.active {
    background: rgba(99,102,241,0.12);
    color: var(--pf-t--global--color--brand--default, #0066cc);
  }
  .ai-toggle-btn.active::after {
    content: '';
    position: absolute;
    bottom: 2px;
    left: 50%;
    transform: translateX(-50%);
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--pf-t--global--color--brand--default, #0066cc);
  }

  /* Explore button */
  .explore-btn {
    width: 100%;
    margin-top: 8px;
    padding: 6px 12px;
    border-radius: 6px;
    border: 1px solid var(--pf-t--global--color--brand--default, #0066cc);
    background: rgba(0, 102, 204, 0.06);
    color: var(--pf-t--global--color--brand--default, #0066cc);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }
  .explore-btn:hover {
    background: rgba(0, 102, 204, 0.12);
  }
`;
