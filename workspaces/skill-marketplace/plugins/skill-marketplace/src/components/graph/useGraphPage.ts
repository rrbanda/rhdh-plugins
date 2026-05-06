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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Node, Relationship, HitTargets, NVL } from '@neo4j-nvl/base';
import { useApi } from '@backstage/core-plugin-api';
import { skillMarketplaceApiRef } from '../../api';
import { useGraphData, useAgenticAvailable } from '../../hooks';
import type {
  NvlNode,
  NvlRelationship,
} from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import {
  AI_HIGHLIGHT_GLOW_STOPS,
  getNodeTypeColor,
  GRAPH_DEFAULTS,
  type LayoutMode,
} from './graphConstants';

export interface UseGraphPageOptions {
  /** From `useAgenticSearch` — used for “Ask AI” on a node from the detail panel */
  sendQuery?: (query: string, context?: string) => void | Promise<void>;
}

export function useGraphPage(options?: UseGraphPageOptions) {
  const { sendQuery } = options ?? {};
  const api = useApi(skillMarketplaceApiRef);
  const graphInteractionBlockingRef = useRef(false);
  const { data, loading, error, refetch } = useGraphData(
    GRAPH_DEFAULTS.INITIAL_GRAPH_LIMIT,
    {
      interactionBlockingRef: graphInteractionBlockingRef,
    },
  );
  const agenticAvailable = useAgenticAvailable();
  const nvlRef = useRef<NVL | null>(null);
  const triggerSync = useCallback(() => {
    api.triggerSync().catch(() => {});
  }, [api]);

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
  const [highlightedNodes, setHighlightedNodes] = useState<Set<string>>(
    new Set(),
  );
  const [focusQuery, setFocusQuery] = useState<string | null>(null);
  const [focusNodes, setFocusNodes] = useState<NvlNode[]>([]);
  const focusNodesRef = useRef(focusNodes);
  focusNodesRef.current = focusNodes;
  const [focusRels, setFocusRels] = useState<NvlRelationship[]>([]);
  const [exploringNodeId, setExploringNodeId] = useState<string | null>(null);
  const [exploreFeedback, setExploreFeedback] = useState<{
    type: 'info' | 'error';
    message: string;
  } | null>(null);
  /** Cycles 0..length-1 when AI highlight set changes; drives brief glow on highlighted nodes. */
  const [aiHighlightGlowFrame, setAiHighlightGlowFrame] = useState(0);
  const highlightSigRef = useRef('');

  const aiHighlightKey = useMemo(
    () => [...highlightedNodes].sort().join('\0'),
    [highlightedNodes],
  );

  useEffect(() => {
    if (aiHighlightKey === '') {
      highlightSigRef.current = '';
      setAiHighlightGlowFrame(0);
      return undefined;
    }
    if (aiHighlightKey === highlightSigRef.current) {
      return undefined;
    }
    highlightSigRef.current = aiHighlightKey;
    setAiHighlightGlowFrame(0);
    const stops = AI_HIGHLIGHT_GLOW_STOPS.length;
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i < stops; i += 1) {
      const idx = i;
      timeouts.push(setTimeout(() => setAiHighlightGlowFrame(idx), idx * 90));
    }
    return () => {
      timeouts.forEach(clearTimeout);
    };
  }, [aiHighlightKey]);

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(
      () => setDebouncedSearch(searchQuery),
      300,
    );
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchQuery]);

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!exploreFeedback) return undefined;
    const timer = setTimeout(() => setExploreFeedback(null), 4000);
    return () => clearTimeout(timer);
  }, [exploreFeedback]);

  const handleExploreNeighborhood = useCallback(
    async (nodeId: string) => {
      setExploringNodeId(nodeId);
      setExploreFeedback(null);
      try {
        const result = await api.getNeighborhood(
          nodeId,
          GRAPH_DEFAULTS.NEIGHBORHOOD_DEPTH,
          GRAPH_DEFAULTS.NEIGHBORHOOD_LIMIT,
        );
        if (result.nodes.length === 0) {
          setExploreFeedback({
            type: 'info',
            message: 'No additional connections found.',
          });
          return;
        }

        let addedNodes = 0;
        let addedRels = 0;
        setOverlayNodes(prev => {
          const existingIds = new Set([
            ...(dataRef.current?.nodes.map(n => n.id) ?? []),
            ...prev.map(n => n.id),
          ]);
          const newNodes = result.nodes.filter(n => !existingIds.has(n.id));
          addedNodes = newNodes.length;
          return newNodes.length > 0 ? [...prev, ...newNodes] : prev;
        });
        setOverlayRels(prev => {
          const existingIds = new Set([
            ...(dataRef.current?.relationships.map(r => r.id) ?? []),
            ...prev.map(r => r.id),
          ]);
          const newRels = result.relationships.filter(
            r => !existingIds.has(r.id),
          );
          addedRels = newRels.length;
          return newRels.length > 0 ? [...prev, ...newRels] : prev;
        });

        if (addedNodes === 0 && addedRels === 0) {
          setExploreFeedback({
            type: 'info',
            message: 'All neighbors already visible.',
          });
        }
      } catch {
        setExploreFeedback({
          type: 'error',
          message: 'Failed to load neighborhood.',
        });
      } finally {
        setExploringNodeId(null);
      }
    },
    [api],
  );

  useEffect(() => {
    if (data && !labelsInitialized.current) {
      setEnabledLabels(new Set(data.schema.labels.map(l => l.name)));
      labelsInitialized.current = true;
    }
  }, [data]);

  useEffect(() => {
    if (!filterOpen) {
      return undefined;
    }
    const handler = (e: MouseEvent) => {
      if (
        filterRef.current &&
        !filterRef.current.contains(e.target as globalThis.Node)
      ) {
        setFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [filterOpen]);

  const isFocusMode = focusNodes.length > 0;

  const { nodes, rels } = useMemo(() => {
    if (isFocusMode) {
      const allNodes = focusNodes;
      const allRelationships = focusRels;
      // In focus mode (AI highlight), show all focus nodes without substring filtering.
      // Only apply label/plugin visibility filters.
      const filteredNodes = allNodes.filter(n => {
        if (
          enabledLabels.size > 0 &&
          !n.labels.some(l => enabledLabels.has(l))
        ) {
          return false;
        }
        return true;
      });
      const nodeIds = new Set(filteredNodes.map(n => n.id));
      const filteredRels = allRelationships.filter(
        r => nodeIds.has(r.from) && nodeIds.has(r.to),
      );
      const isHighlighted = (node: NvlNode) =>
        highlightedNodes.has(node.caption) ||
        highlightedNodes.has(String(node.properties.name));
      const nvlNodes: Node[] = filteredNodes.map(n => {
        const hi = isHighlighted(n);
        const baseColor = getNodeTypeColor(n);
        const hiColor =
          AI_HIGHLIGHT_GLOW_STOPS[
            Math.min(aiHighlightGlowFrame, AI_HIGHLIGHT_GLOW_STOPS.length - 1)
          ];
        return {
          id: n.id,
          caption: n.caption,
          color: n.id === selectedNodeId ? '#60a5fa' : hi ? hiColor : baseColor,
          size: hi ? n.size * 1.35 : n.size,
          selected: n.id === selectedNodeId || hi,
          activated: hi && n.id !== selectedNodeId,
          captionSize: 2,
        };
      });
      const nvlRels: Relationship[] = filteredRels.map(r => ({
        id: r.id,
        from: r.from,
        to: r.to,
        caption: r.caption,
        color: r.color,
      }));
      return { nodes: nvlNodes, rels: nvlRels };
    }

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

    const nvlNodes: Node[] = filteredNodes.map(n => {
      const hi = isHighlighted(n);
      const baseColor = getNodeTypeColor(n);
      const hiColor =
        AI_HIGHLIGHT_GLOW_STOPS[
          Math.min(aiHighlightGlowFrame, AI_HIGHLIGHT_GLOW_STOPS.length - 1)
        ];
      return {
        id: n.id,
        caption: n.caption,
        color: n.id === selectedNodeId ? '#60a5fa' : hi ? hiColor : baseColor,
        size: hi ? n.size * 1.35 : n.size,
        selected: n.id === selectedNodeId || hi,
        activated: hi && n.id !== selectedNodeId,
        captionSize: 2,
      };
    });

    const nvlRels: Relationship[] = filteredRels.map(r => ({
      id: r.id,
      from: r.from,
      to: r.to,
      caption: r.caption,
      color: r.color,
    }));

    return { nodes: nvlNodes, rels: nvlRels };
  }, [
    data,
    focusNodes,
    focusRels,
    isFocusMode,
    overlayNodes,
    overlayRels,
    enabledLabels,
    enabledPlugins,
    debouncedSearch,
    selectedNodeId,
    highlightedNodes,
    aiHighlightGlowFrame,
  ]);

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
        defaultNodeColor: '#6366f1',
        defaultRelationshipColor: '#64748b',
        selectedBorderColor: '#a5b4fc',
        selectedInnerBorderColor: '#6366f1',
        nodeDefaultBorderColor: '#475569',
        dropShadowColor: 'rgba(99, 102, 241, 0.4)',
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
          ...focusNodesRef.current,
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
      onDragStart: () => {
        graphInteractionBlockingRef.current = true;
      },
      onDragEnd: () => {
        graphInteractionBlockingRef.current = false;
      },
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
    setFocusQuery(null);
    setFocusNodes([]);
    setFocusRels([]);
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

  const clearFocus = useCallback(() => {
    setFocusQuery(null);
    setFocusNodes([]);
    setFocusRels([]);
    setHighlightedNodes(new Set());
  }, []);

  const handleAiHighlight = useCallback(
    async (nodeNames: string[], meta?: { userQuery?: string | null }) => {
      // Clear toolbar search so it doesn't filter out AI-loaded focus nodes
      setSearchQuery('');
      setDebouncedSearch('');

      setHighlightedNodes(new Set(nodeNames));
      setFocusQuery(meta?.userQuery ?? null);

      if (nodeNames.length === 0) {
        setFocusNodes([]);
        setFocusRels([]);
        return;
      }

      const names = nodeNames.slice(0, 5);
      const mergedNodes: NvlNode[] = [];
      let mergedRels: NvlRelationship[] = [];
      const seenN = new Set<string>();
      const seenR = new Set<string>();
      const baseNodes = [...(dataRef.current?.nodes ?? []), ...overlayNodes];

      const resolveNodeId = (name: string): string => {
        const m = baseNodes.find(
          n => n.caption === name || String(n.properties.name) === name,
        );
        return m?.id ?? name;
      };

      for (const name of names) {
        const nodeId = resolveNodeId(name);
        try {
          const result = await api.getNeighborhood(nodeId, 1, 20);
          for (const n of result.nodes) {
            if (!seenN.has(n.id)) {
              seenN.add(n.id);
              mergedNodes.push(n);
            }
          }
          for (const r of result.relationships) {
            if (!seenR.has(r.id)) {
              seenR.add(r.id);
              mergedRels.push(r);
            }
          }
        } catch {
          /* per-source failure: try to keep at least the source node if present */
        }
      }

      if (mergedNodes.length === 0) {
        for (const name of names) {
          const m = baseNodes.find(
            n => n.caption === name || String(n.properties.name) === name,
          );
          if (m && !seenN.has(m.id)) {
            seenN.add(m.id);
            mergedNodes.push(m);
          }
        }
        const nids = new Set(mergedNodes.map(n => n.id));
        const relPool = [
          ...(dataRef.current?.relationships ?? []),
          ...overlayRels,
        ];
        for (const r of relPool) {
          if (nids.has(r.from) && nids.has(r.to) && !seenR.has(r.id)) {
            seenR.add(r.id);
            mergedRels.push(r);
          }
        }
      } else {
        const nids = new Set(mergedNodes.map(n => n.id));
        mergedRels = mergedRels.filter(r => nids.has(r.from) && nids.has(r.to));
      }

      setFocusNodes(mergedNodes);
      setFocusRels(mergedRels);

      if (nvlRef.current && mergedNodes.length > 0) {
        nvlRef.current.fit(mergedNodes.map(n => n.id));
      } else if (nvlRef.current && nodeNames.length > 0) {
        const matchIds = baseNodes
          .filter(
            n =>
              nodeNames.includes(n.caption) ||
              nodeNames.includes(String(n.properties.name)),
          )
          .map(n => n.id);
        if (matchIds.length > 0) {
          nvlRef.current.fit(matchIds);
        }
      }
    },
    [api, overlayNodes, overlayRels],
  );

  const handleAskAi = useCallback(
    (nodeName: string) => {
      if (!sendQuery || agenticAvailable === false) return;
      setAiPanelOpen(true);
      setSelectedNodeId(null);
      setDetailNode(null);
      void sendQuery(
        `Tell me about ${nodeName} and its relationships in the knowledge graph`,
      );
    },
    [sendQuery, agenticAvailable],
  );

  const handleAiSelectNode = useCallback(
    (nodeName: string) => {
      const allNodes = [
        ...(dataRef.current?.nodes ?? []),
        ...overlayNodes,
        ...focusNodes,
      ];
      const match = allNodes.find(
        n => n.caption === nodeName || String(n.properties.name) === nodeName,
      );
      if (match) {
        setSelectedNodeId(match.id);
        setDetailNode(match);
        setAiPanelOpen(false);
      }
    },
    [overlayNodes, focusNodes],
  );

  const navigateToNode = useCallback(
    (nodeId: string) => {
      const allNodes = [
        ...(dataRef.current?.nodes ?? []),
        ...overlayNodes,
        ...focusNodes,
      ];
      const match = allNodes.find(n => n.id === nodeId);
      if (match) {
        setSelectedNodeId(match.id);
        setDetailNode(match);
      }
    },
    [overlayNodes, focusNodes],
  );

  const togglePlugin = useCallback((plugin: string) => {
    setEnabledPlugins(prev => {
      const next = new Set(prev);
      if (next.has(plugin)) next.delete(plugin);
      else next.add(plugin);
      return next;
    });
  }, []);

  const handleSearchInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
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
                const newNodes = result.nodes.filter(
                  n => !existingIds.has(n.id),
                );
                return newNodes.length > 0 ? [...prev, ...newNodes] : prev;
              });
            }
          } catch {
            /* fallback to client-side filter */
          }
        }, GRAPH_DEFAULTS.SEARCH_DEBOUNCE_MS);
      }
    },
    [api],
  );

  const handleToggleAiPanel = useCallback(() => {
    if (agenticAvailable === false) return;
    setAiPanelOpen(v => !v);
    if (!aiPanelOpen) {
      setDetailNode(null);
      setSelectedNodeId(null);
    }
  }, [agenticAvailable, aiPanelOpen]);

  const onClearPluginFilters = useCallback(() => {
    setEnabledPlugins(new Set());
    setFilterOpen(false);
  }, []);

  const mergedRels = useMemo(
    () => [...(data?.relationships ?? []), ...overlayRels],
    [data?.relationships, overlayRels],
  );
  const mergedNodes = useMemo(
    () => [...(data?.nodes ?? []), ...overlayNodes],
    [data?.nodes, overlayNodes],
  );

  const closeDetail = useCallback(() => {
    setSelectedNodeId(null);
    setDetailNode(null);
  }, []);

  const closeAiPanel = useCallback(() => {
    setAiPanelOpen(false);
    clearFocus();
  }, [clearFocus]);

  return {
    data,
    loading,
    error,
    refetch,
    triggerSync,
    nvlRef,
    layout,
    setLayout,
    agenticAvailable,
    enabledLabels,
    enabledPlugins,
    detailNode,
    filterOpen,
    setFilterOpen,
    filterRef,
    searchQuery,
    aiPanelOpen,
    nodes,
    rels,
    nvlOptions,
    mouseCallbacks,
    exploringNodeId,
    exploreFeedback,
    mergedRels,
    mergedNodes,
    handleExploreNeighborhood,
    fitToScreen,
    resetView,
    toggleLabel,
    togglePlugin,
    handleSearchInputChange,
    handleToggleAiPanel,
    onClearPluginFilters,
    handleAiHighlight,
    handleAiSelectNode,
    navigateToNode,
    closeDetail,
    closeAiPanel,
    focusQuery,
    isFocusMode,
    clearFocus,
    focusNodeCount: focusNodes.length,
    focusRelCount: focusRels.length,
    handleAskAi,
  };
}
