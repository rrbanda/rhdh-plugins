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

/** A capability declared by an agent via its AgentCard. @public */
export interface AgentCapabilityNode {
  skillId: string;
  agentName: string;
  agentNamespace: string;
  name: string;
  description: string;
  tags: string[];
  examples: string[];
  inputModes: string[];
  outputModes: string[];
  matchConfidence: number | null;
  matchType: string | null;
  matchedSkillName: string | null;
  completeness: number;
}

/** A shared taxonomy tag used by both SkillCards and AgentCard capabilities. @public */
export interface TagNode {
  name: string;
  skillCount: number;
  capabilityCount: number;
}

/** Enriched Tool node from the knowledge graph. @public */
export interface ToolNode {
  name: string;
  description: string;
  docsUrl: string;
  version: string;
  deprecated: boolean;
  usedByCount: number;
}

/** Enriched Domain node with hierarchy support. @public */
export interface DomainNode {
  name: string;
  description: string;
  owner: string;
  color: string;
  parent: string | null;
  skillCount: number;
}

/** Audit record for a graph sync cycle. @public */
export interface SyncEventRecord {
  timestamp: string;
  skillsUpserted: number;
  capabilitiesCreated: number;
  matchesCreated: number;
  gapsFound: number;
  durationMs: number;
}

/** An edge from AgentCapability to Skill representing implementation. @public */
export interface ImplementedByEdge {
  capabilitySkillId: string;
  agentName: string;
  agentNamespace: string;
  skillName: string;
  confidence: number;
  matchType:
    | 'name'
    | 'name_fuzzy'
    | 'tag'
    | 'semantic'
    | 'semantic_weak'
    | 'manual';
  verified: boolean;
  verifiedBy: string | null;
  matchedAt: string | null;
  matchCount: number;
}

/** @public */
export interface GraphSyncResult {
  ok: boolean;
  nodesUpserted: number;
  relationshipsCreated: number;
  nodesRemoved: number;
  durationMs: number;
  embeddingsGenerated: number;
  agentCapabilitiesCreated: number;
  tagsCreated: number;
  implementedByEdges: number;
}

/** @public */
export interface SkillGraphSyncStatus {
  status: 'idle' | 'running' | 'error';
  lastSyncAt: string | null;
  staleSinceMs: number | null;
  lastSyncDurationMs: number | null;
  lastError: string | null;
  skillCount: number;
  nextSyncAt: string | null;
  embeddingCoverage: { total: number; withEmbeddings: number };
}

/** @public */
export interface GraphLabel {
  name: string;
  color: string;
  count: number;
}

/** @public */
export interface GraphRelType {
  type: string;
  count: number;
}

/** @public */
export interface PluginGroup {
  name: string;
  color: string;
  count: number;
}

/** @public */
export interface GraphSchema {
  labels: GraphLabel[];
  relationshipTypes: GraphRelType[];
  pluginGroups: PluginGroup[];
  totalNodes: number;
  totalRelationships: number;
}

/** @public */
export interface NvlNode {
  id: string;
  caption: string;
  color: string;
  size: number;
  labels: string[];
  properties: Record<string, unknown>;
}

/** @public */
export interface NvlRelationship {
  id: string;
  from: string;
  to: string;
  caption: string;
  color: string;
  type: string;
  properties: Record<string, unknown>;
}

/** @public */
export interface NvlGraphData {
  nodes: NvlNode[];
  relationships: NvlRelationship[];
  schema: GraphSchema;
}
