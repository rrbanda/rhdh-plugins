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

import type {
  LifecycleState,
  ParsedSections,
  SkillAssets,
  PluginEntry,
} from './skill';

/** @public */
export interface MarketplaceData {
  name: string;
  owner: { name: string; email: string };
  metadata: { description: string; version: string };
  plugins: PluginEntry[];
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
  wordCount?: number;
  compatibility?: string;
  license?: string;
  created?: string;
  bundle?: boolean;
  bundleSkills?: string[];
  tag?: string;
  digest?: string;
  syncedAt?: string;
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
