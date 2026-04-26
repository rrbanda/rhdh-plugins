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

/** Lifecycle states matching upstream skillimage spec. @public */
export type LifecycleState =
  | 'draft'
  | 'testing'
  | 'published'
  | 'deprecated'
  | 'archived';

/** All known lifecycle states as an array for runtime validation. @public */
export const LIFECYCLE_STATES: readonly LifecycleState[] = [
  'draft',
  'testing',
  'published',
  'deprecated',
  'archived',
] as const;

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
  lifecycleStatus?: string;
  tags?: string;
  allowedTools?: string;
  displayName?: string;
  wordCount?: string;
  compatibility?: string;
  /** Present when io.skillimage.bundle is set on the manifest */
  bundleImage?: string;
  /** JSON array of skill names from io.skillimage.bundle.skills */
  bundleSkillsJson?: string;
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

/** @public */
export interface PluginEntry {
  name: string;
  source: string;
  description: string;
  version: string;
  tags: string[];
  icon: string;
  color: string;
}

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
export function slugify(name: string): string {
  return name
    .toLocaleLowerCase('en-US')
    .replace(/:/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

/** @public */
export function humanize(name: string): string {
  return name
    .split(':')
    .pop()!
    .split('-')
    .map(w => w.charAt(0).toLocaleUpperCase('en-US') + w.slice(1))
    .join(' ');
}
