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

// ---------------------------------------------------------------------------
// SkillCard — canonical skill metadata (maps to skillimage.io/v1alpha1)
// ---------------------------------------------------------------------------

/** Lifecycle states matching upstream skillimage spec. @public */
export type LifecycleState =
  | 'draft'
  | 'testing'
  | 'published'
  | 'deprecated'
  | 'archived';

/** Valid lifecycle transitions per the upstream spec. @public */
export const LIFECYCLE_TRANSITIONS: Record<LifecycleState, LifecycleState[]> = {
  draft: ['testing', 'archived'],
  testing: ['draft', 'published', 'archived'],
  published: ['deprecated'],
  deprecated: ['archived', 'published'],
  archived: [],
};

/** @public */
export function isValidLifecycleTransition(
  from: LifecycleState,
  to: LifecycleState,
): boolean {
  return LIFECYCLE_TRANSITIONS[from]?.includes(to) ?? false;
}

/** @public */
export interface Author {
  name: string;
  email?: string;
}

/** @public */
export interface SkillCardMeta {
  name: string;
  namespace: string;
  version: string;
  description: string;
  'display-name'?: string;
  license?: string;
  compatibility?: string;
  tags?: string[];
  authors?: Author[];
  'allowed-tools'?: string;
}

/** @public */
export interface SkillExample {
  input?: string;
  output?: string;
}

/** @public */
export interface SkillDependency {
  name: string;
  version: string;
}

/** @public */
export interface SkillCardSpec {
  prompt?: string;
  examples?: SkillExample[];
  dependencies?: SkillDependency[];
}

/** @public */
export interface SkillProvenance {
  source?: string;
  commit?: string;
  path?: string;
}

/** @public */
export interface SkillCard {
  apiVersion: string;
  kind: string;
  metadata: SkillCardMeta;
  provenance?: SkillProvenance;
  spec?: SkillCardSpec;
}

// ---------------------------------------------------------------------------
// Skill — runtime enriched skill object for the marketplace
// ---------------------------------------------------------------------------

/** Standard OCI annotations aligned with upstream skillimage spec. @public */
export interface OciAnnotations {
  created?: string;
  version?: string;
  title?: string;
  description?: string;
  licenses?: string;
  authors?: string;
  vendor?: string;
  source?: string;
  revision?: string;
  /** io.skillimage.status — lifecycle state annotation */
  lifecycleStatus?: string;
  /** io.skillimage.tags — comma-separated skill tags */
  tags?: string;
  /** io.skillimage.allowed-tools — space-separated tool names */
  allowedTools?: string;
  /** io.skillimage.display-name — human-friendly display name */
  displayName?: string;
}

/** @public */
export interface Skill {
  card: SkillCard;
  content?: string;
  ociReference: string;
  ociAnnotations?: OciAnnotations;
  registryName?: string;
  tags?: string[];
  lifecycleState?: LifecycleState;
}

// ---------------------------------------------------------------------------
// OCI Registry configuration
// ---------------------------------------------------------------------------

/** @public */
export interface OciRegistryConfig {
  url: string;
  name: string;
  auth?: {
    username?: string;
    password?: string;
    token?: string;
  };
}

// ---------------------------------------------------------------------------
// Kagenti Agent types
// ---------------------------------------------------------------------------

/** @public */
export type AgentStatus = 'Ready' | 'Deploying' | 'Error' | 'Unknown';

/** @public */
export interface KagentiAgent {
  name: string;
  namespace: string;
  description: string;
  status: AgentStatus;
  labels: {
    protocol: string[];
    framework: string;
    type: string;
  };
  workloadType: string;
  createdAt: string;
  skills?: string[];
  image?: string;
  endpoints?: {
    agent?: string;
    health?: string;
  };
}

/** @public */
export interface AgentDeployRequest {
  name: string;
  namespace: string;
  protocol?: string;
  framework?: string;
  workloadType?: string;
  deploymentMethod?: 'source' | 'image';
  containerImage?: string;
  envVars?: Array<{ name: string; value: string }>;
  servicePorts?: Array<{ name: string; port: number; targetPort: number; protocol?: string }>;
  gitUrl?: string;
  gitPath?: string;
  gitBranch?: string;
  imageTag?: string;
  createHttpRoute?: boolean;
  authBridgeEnabled?: boolean;
}

/** @public */
export interface AgentSkillAssignment {
  skillRef: string;
  skillName: string;
}

// ---------------------------------------------------------------------------
// Marketplace data types
// ---------------------------------------------------------------------------

/** @public */
export interface MarketplaceData {
  name: string;
  owner: { name: string; email: string };
  metadata: { description: string; version: string };
  plugins: PluginEntry[];
}

/** @public */
export interface PluginEntry {
  name: string;
  source: string;
  description: string;
  version: string;
  tags: string[];
  icon?: string;
  color?: string;
}

/** @public */
export interface SkillData {
  slug: string;
  pluginName: string;
  skillName: string;
  name: string;
  description: string;
  version?: string;
  model?: string;
  body: string;
  rawContent: string;
  sections: ParsedSections;
  assets: SkillAssets;
  plugin: PluginEntry;
  gitPath: string;
  lifecycleState?: LifecycleState;
  tags?: string[];
  authors?: string;
  displayName?: string;
}

/** @public */
export interface ParsedSections {
  title: string;
  prerequisites?: string[];
  whenToUse?: string;
  criticalRules?: string[];
  workflow: WorkflowStep[];
  relatedSkills: RelatedSkill[];
  sharedRulesRef?: string;
}

/** @public */
export interface WorkflowStep {
  step: number;
  title: string;
  content: string;
}

/** @public */
export interface RelatedSkill {
  name: string;
  path: string;
  slug: string;
  description?: string;
}

/** @public */
export interface SkillAssets {
  references: AssetFile[];
  templates: AssetFile[];
  examples: AssetFile[];
}

/** @public */
export interface AssetFile {
  path: string;
  name: string;
  content: string;
}

/** @public */
export type ComplexityLevel = 'Simple' | 'Medium' | 'Complex' | 'Advanced';

/** @public */
export function getComplexity(lineCount: number): ComplexityLevel {
  if (lineCount < 100) return 'Simple';
  if (lineCount < 250) return 'Medium';
  if (lineCount < 500) return 'Complex';
  return 'Advanced';
}

/** @public */
export function getPluginColor(pluginName: string): string {
  const colors: Record<string, string> = {
    docs: '#3b82f6',
    devops: '#10b981',
    api: '#8b5cf6',
    testing: '#f59e0b',
    security: '#ef4444',
    'human-resources': '#ec4899',
    operations: '#f97316',
    engineering: '#06b6d4',
    research: '#a855f7',
    general: '#6b7280',
  };
  return colors[pluginName] ?? '#6b7280';
}

/** @public */
export function slugify(name: string): string {
  return name.toLowerCase().replace(/:/g, '-').replace(/[^a-z0-9-]/g, '');
}

/** @public */
export function humanize(name: string): string {
  return name
    .split(':')
    .pop()!
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ---------------------------------------------------------------------------
// Graph sync result
// ---------------------------------------------------------------------------

/** @public */
export interface GraphSyncResult {
  ok: boolean;
  nodesUpserted: number;
  relationshipsCreated: number;
  nodesRemoved: number;
  durationMs: number;
  embeddingsGenerated: number;
}

// ---------------------------------------------------------------------------
// GraphRAG retrieval types
// ---------------------------------------------------------------------------

/** @public */
export interface GraphRAGQuery {
  query: string;
  context?: string;
  maxResults?: number;
  includeRelated?: boolean;
  filters?: {
    domain?: string;
    tools?: string[];
    minSimilarity?: number;
  };
}

/** @public */
export interface RagSkillHit {
  name: string;
  description: string;
  category: string;
  version: string;
  author: string;
  ociReference: string;
}

/** @public */
export interface GraphRAGSkill {
  skill: RagSkillHit;
  score: number;
  matchType: 'semantic' | 'fulltext' | 'graph';
  reason: string;
  related: RagSkillHit[];
  tools: string[];
  domain: string;
}

/** @public */
export interface GraphRAGResult {
  skills: GraphRAGSkill[];
  graphContext: {
    totalSkills: number;
    domainsSearched: string[];
    queryEmbeddingUsed: boolean;
  };
}

// ---------------------------------------------------------------------------
// Agentic GraphRAG types
// ---------------------------------------------------------------------------

/** @public */
export interface AgenticQuery {
  query: string;
  context?: string;
  sessionId?: string;
  maxIterations?: number;
}

/** @public */
export interface ReasoningStep {
  tool: string;
  input: Record<string, unknown>;
  output: unknown;
  durationMs: number;
}

/** @public */
export interface AgenticResult {
  answer: string;
  steps: ReasoningStep[];
  iterations: number;
  sources: string[];
  durationMs: number;
}

/** @public */
export interface AgenticStreamEvent {
  type: 'thinking' | 'tool_call' | 'tool_result' | 'answer' | 'error' | 'done';
  data: unknown;
}

// ---------------------------------------------------------------------------
// Graph types (Neo4j visualization)
// ---------------------------------------------------------------------------

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

