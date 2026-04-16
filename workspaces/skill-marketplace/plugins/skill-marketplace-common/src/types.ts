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
// SkillCard — canonical skill metadata (maps to DocsClaw's skill.yaml)
// ---------------------------------------------------------------------------

/** @public */
export interface SkillCardMeta {
  name: string;
  namespace: string;
  ref: string;
  version: string;
  description: string;
  author: string;
  license?: string;
  metadata?: Record<string, string>;
}

/** @public */
export interface ToolDeps {
  required?: string[];
  optional?: string[];
}

/** @public */
export interface ToolPackRef {
  name: string;
  ref: string;
}

/** @public */
export interface SkillDependencies {
  skills?: string[];
  toolPacks?: ToolPackRef[];
}

/** @public */
export interface ResourceHints {
  estimatedMemory?: string;
  estimatedCPU?: string;
}

/** @public */
export interface SkillCompatibility {
  minAgentVersion?: string;
  environment?: string;
}

/** @public */
export interface SkillCardSpec {
  tools?: ToolDeps;
  allowedTools?: string;
  dependencies?: SkillDependencies;
  resources?: ResourceHints;
  compatibility?: SkillCompatibility;
}

/** @public */
export interface SkillCard {
  apiVersion: string;
  kind: string;
  metadata: SkillCardMeta;
  spec: SkillCardSpec;
}

// ---------------------------------------------------------------------------
// Skill — runtime enriched skill object for the marketplace
// ---------------------------------------------------------------------------

/** @public */
export interface OciAnnotations {
  created?: string;
  version?: string;
  description?: string;
  licenses?: string;
  skillName?: string;
  resourcesMemory?: string;
  resourcesCPU?: string;
  toolsRequired?: string;
}

/** @public */
export interface Skill {
  card: SkillCard;
  content?: string;
  ociReference: string;
  ociAnnotations?: OciAnnotations;
  registryName?: string;
  tags?: string[];
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
  description?: string;
  image: string;
  llm: {
    provider: string;
    model: string;
    baseUrl: string;
    apiKey?: string;
  };
  skills?: string[];
}

/** @public */
export interface AgentSkillAssignment {
  skillRef: string;
  skillName: string;
}

// ---------------------------------------------------------------------------
// Legacy types (kept for backward compatibility with existing components)
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
  return name.replace(/:/g, '-').replace(/[^a-z0-9-]/g, '');
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

/** @public */
export interface SyncResult {
  ok: boolean;
  nodes: number;
  edges: number;
  cleaned: number;
  durationMs: number;
}
