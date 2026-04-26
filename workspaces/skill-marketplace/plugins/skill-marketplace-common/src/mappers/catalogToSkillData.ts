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

import type { CatalogSkill, SkillData, LifecycleState } from '../types';
import { LIFECYCLE_STATES, getPluginColor, humanize } from '../types';

/**
 * Validate and coerce a status string to a known LifecycleState.
 * Falls back to 'draft' for unrecognized values.
 */
function toLifecycleState(status: string | undefined): LifecycleState {
  if (!status) return 'draft';
  const lower = status.toLocaleLowerCase('en-US') as LifecycleState;
  return (LIFECYCLE_STATES as readonly string[]).includes(lower)
    ? lower
    : 'draft';
}

/**
 * Parse the tags_json field from the Catalog API into a string array.
 * Returns an empty array on invalid JSON.
 */
function parseTags(tagsJson: string | undefined): string[] {
  if (!tagsJson) return [];
  try {
    const parsed = JSON.parse(tagsJson);
    return Array.isArray(parsed)
      ? parsed.filter((t): t is string => typeof t === 'string')
      : [];
  } catch {
    return [];
  }
}

/**
 * Transform a Catalog API skill into the canonical SkillData format.
 *
 * Fields that require content loading (body, rawContent, sections) are populated
 * with summary placeholders. Full content should be fetched separately via
 * getCatalogSkillContent.
 *
 * Slug format: `${namespace}-${name}` — aligned with OCI slug strategy.
 *
 * @public
 */
export function catalogToSkillData(cs: CatalogSkill): SkillData {
  const tags = parseTags(cs.tags_json);
  const slug = `${cs.namespace}-${cs.name}`;
  const displayName = cs.display_name || humanize(cs.name);

  return {
    slug,
    pluginName: cs.namespace,
    skillName: cs.name,
    name: cs.name,
    description: cs.description || '',
    version: cs.version,
    body: cs.description || '',
    rawContent: '',
    sections: { title: displayName, workflow: [], relatedSkills: [] },
    assets: { references: [], templates: [], examples: [] },
    plugin: {
      name: cs.namespace,
      source: cs.repository,
      description: `${cs.namespace} skills`,
      version: cs.version,
      tags,
      icon: 'cube',
      color: getPluginColor(cs.namespace),
    },
    gitPath: cs.repository,
    lifecycleState: toLifecycleState(cs.status),
    tags,
    authors: cs.authors,
    displayName,
    wordCount: cs.word_count,
    compatibility: cs.compatibility || undefined,
    license: cs.license || undefined,
    created: cs.created || undefined,
    bundle: cs.bundle,
    bundleSkills: cs.bundle_skills
      ? cs.bundle_skills
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
      : undefined,
    tag: cs.tag || undefined,
    digest: cs.digest || undefined,
    syncedAt: cs.synced_at || undefined,
  };
}
