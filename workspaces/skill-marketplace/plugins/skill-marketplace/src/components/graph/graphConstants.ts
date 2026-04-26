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

import type { NvlNode } from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';

export type LayoutMode = 'forceDirected' | 'hierarchical';

/**
 * Refined node-type palette. Mirror these in `GraphPage.module.css` as `--sm-graph-node-*`
 * for non-NVL UI; NVL uses resolved hex from {@link getNodeTypeColor}.
 */
export const NODE_TYPE_COLORS: Record<string, string> = {
  Skill: '#6366f1',
  Tool: '#06b6d4',
  Domain: '#8b5cf6',
  Agent: '#f59e0b',
  AgentCapability: '#f59e0b',
  Tag: '#10b981',
  Bundle: '#ec4899',
};

/** Brief highlight ramp when AI sources select nodes (canvas nodes use hex, not CSS vars). */
export const AI_HIGHLIGHT_GLOW_STOPS: readonly string[] = [
  '#e9d5ff',
  '#ddd6fe',
  '#c4b5fd',
  '#a78bfa',
  '#8b5cf6',
  '#7c3aed',
  '#6d28d9',
];

export function getNodeTypeColor(node: NvlNode): string {
  for (const name of node.labels) {
    const c = NODE_TYPE_COLORS[name];
    if (c) return c;
  }
  return node.color;
}

export const GRAPH_DEFAULTS = {
  AUTO_REFRESH_MS: 30_000,
  SEARCH_DEBOUNCE_MS: 400,
  NEIGHBORHOOD_DEPTH: 2,
  NEIGHBORHOOD_LIMIT: 50,
  INITIAL_GRAPH_LIMIT: 500,
  MIN_SEARCH_LENGTH: 2,
} as const;

export const REL_COLORS: Record<string, string> = {
  USES_TOOL: '#3b82f6',
  BELONGS_TO: '#10b981',
  DEPENDS_ON: '#ef4444',
  RELATED_TO: '#8b5cf6',
  SIMILAR_TO: '#06b6d4',
  EXPOSES: '#f59e0b',
  IMPLEMENTED_BY: '#22c55e',
  TAGGED_WITH: '#a855f7',
  PARENT_OF: '#64748b',
};

export const REL_TIPS: Record<string, string> = {
  USES_TOOL: 'Skill depends on this tool at runtime',
  BELONGS_TO: 'Skill is classified under this domain',
  DEPENDS_ON: 'Skill requires another skill as a prerequisite',
  RELATED_TO: 'Skills are topically related by keyword overlap',
  SIMILAR_TO: 'Skills have high semantic similarity (vector match)',
  EXPOSES: 'Agent declares this capability',
  IMPLEMENTED_BY: 'Agent capability is fulfilled by this skill',
  TAGGED_WITH: 'Node is annotated with this tag',
  PARENT_OF: 'Domain has this subdomain',
};

export const HIDDEN_PROPS = new Set([
  'embedding',
  'assetContent',
  'body',
  'pluginColor',
]);
