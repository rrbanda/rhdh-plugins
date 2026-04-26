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

import type { Skill, SkillData, PluginEntry } from '../types';
import { getPluginColor } from '../types';
import { parseSkillContent } from '../parseSkillContent';
import { categoryOf } from '../categories';

/**
 * Transform an OCI registry Skill into the canonical SkillData format.
 *
 * Slug format: `${category}-${name}` where category is inferred from
 * tags/name/description via keyword matching.
 *
 * @public
 */
export function ociToSkillData(skill: Skill): SkillData {
  const m = skill.card.metadata;
  const cat = categoryOf(skill);
  const slug = `${cat}-${m.name}`;
  const toolsStr = m['allowed-tools'] || '';
  const tools = toolsStr ? toolsStr.split(/\s+/).filter(Boolean) : [];

  const bodyParts = [
    `# ${m['display-name'] || m.name}`,
    '',
    m.description || '',
    '',
    tools.length > 0 ? `**Tools:** ${tools.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const body = skill.content || bodyParts;

  const sections = parseSkillContent(body);
  if (!sections.title) {
    sections.title = m['display-name'] || m.name;
  }

  const plugin: PluginEntry = {
    name: cat,
    source: skill.ociReference,
    description: `${cat} skills`,
    version: m.version || '1.0.0',
    tags: tools,
    icon: 'cube',
    color: getPluginColor(cat),
  };

  const authorsStr = m.authors
    ?.map(a => (a.email ? `${a.name} <${a.email}>` : a.name))
    .join(', ');

  const ann = skill.ociAnnotations;
  const annWc = ann?.wordCount ? parseInt(ann.wordCount, 10) : undefined;
  const wordCount = Number.isFinite(annWc) ? annWc : undefined;
  const compatibility = ann?.compatibility || m.compatibility || undefined;

  return {
    slug,
    pluginName: cat,
    skillName: m.name,
    name: m.name,
    description: m.description || '',
    version: m.version,
    body,
    rawContent: body,
    sections,
    assets: { references: [], templates: [], examples: [] },
    plugin,
    gitPath: skill.ociReference,
    lifecycleState: skill.lifecycleState,
    tags: m.tags,
    authors: authorsStr,
    displayName: m['display-name'],
    wordCount: Number.isFinite(wordCount) ? wordCount : undefined,
    compatibility,
  };
}
