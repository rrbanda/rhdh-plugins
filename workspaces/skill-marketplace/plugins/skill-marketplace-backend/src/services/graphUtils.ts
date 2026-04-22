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
import * as crypto from 'crypto';
import type { Skill } from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';

export interface DomainTaxonomyEntry {
  description?: string;
  owner?: string;
  parent?: string;
}

export interface CategoryAssignment {
  domain: string;
  primary: boolean;
}

export function categoriesOf(
  skill: Skill,
  keywords: [string, string[]][],
  taxonomy?: Record<string, DomainTaxonomyEntry>,
): CategoryAssignment[] {
  const tags = (skill.card.metadata.tags ?? []).map(t => t.toLowerCase());
  const domainNames = new Set(keywords.map(([cat]) => cat));
  if (taxonomy) {
    for (const name of Object.keys(taxonomy)) domainNames.add(name);
  }

  const exactMatches = tags.filter(t => domainNames.has(t));
  if (exactMatches.length > 0) {
    return exactMatches.map((d, i) => ({ domain: d, primary: i === 0 }));
  }

  const haystack =
    `${skill.card.metadata.name} ${skill.card.metadata.description ?? ''} ${tags.join(' ')}`.toLowerCase();
  const scores: [string, number][] = [];
  for (const [cat, kws] of keywords) {
    let score = 0;
    for (const kw of kws) {
      if (haystack.includes(kw)) score++;
    }
    if (score > 0) scores.push([cat, score]);
  }

  if (scores.length === 0) return [{ domain: 'general', primary: true }];
  scores.sort((a, b) => b[1] - a[1]);
  const threshold = scores[0][1] * 0.6;
  const results = scores.filter(([, s]) => s >= threshold);
  return results.map(([d], i) => ({ domain: d, primary: i === 0 }));
}

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[-_\s]+/g, '')
    .replace(/skill$|tool$/g, '');
}

export function computeSkillCompleteness(skill: Skill, hasContent: boolean): number {
  let score = 0;
  const m = skill.card.metadata;
  if (m.description && m.description.length > 30) score += 0.20;
  if (m.tags && m.tags.length >= 2) score += 0.15;
  if (skill.card.spec?.prompt && skill.card.spec.prompt.length > 20) score += 0.15;
  if (skill.card.spec?.examples && skill.card.spec.examples.length >= 1) score += 0.10;
  if (m.authors && m.authors.length >= 1) score += 0.05;
  if (m.license) score += 0.05;
  if (m.version && m.version !== '0.0.0') score += 0.05;
  if (m['display-name']) score += 0.05;
  if (skill.card.spec?.dependencies !== undefined) score += 0.05;
  if (m['allowed-tools']) score += 0.05;
  if (skill.card.provenance?.source && skill.card.provenance?.commit) score += 0.05;
  if (hasContent) score += 0.05;
  return Math.round(score * 100) / 100;
}

export function computeAgentCompleteness(agent: {
  description?: string;
  agentCard?: {
    description?: string;
    url?: string;
    version?: string;
    provider?: { organization?: string };
    documentationUrl?: string;
    skills?: unknown[];
    authentication?: { schemes?: string[] };
    capabilities?: { streaming?: boolean; pushNotifications?: boolean; stateTransitionHistory?: boolean };
  };
}): number {
  let score = 0;
  const card = agent.agentCard;
  if ((card?.description || agent.description || '').length > 20) score += 0.20;
  if (card?.url) score += 0.15;
  if (card?.version) score += 0.10;
  if (card?.provider?.organization) score += 0.10;
  if (card?.documentationUrl) score += 0.10;
  if (card?.skills && card.skills.length >= 1) score += 0.20;
  if (card?.authentication?.schemes && card.authentication.schemes.length >= 1) score += 0.10;
  if (card?.capabilities?.streaming || card?.capabilities?.pushNotifications || card?.capabilities?.stateTransitionHistory) score += 0.05;
  return Math.round(score * 100) / 100;
}

export function computeCapabilityCompleteness(
  cap: { description?: string; tags?: string[]; examples?: string[]; inputModes?: string[]; outputModes?: string[] },
): number {
  let score = 0;
  if (cap.description && cap.description.length > 20) score += 0.30;
  if (cap.tags && cap.tags.length >= 2) score += 0.25;
  if (cap.examples && cap.examples.length >= 1) score += 0.25;
  if (cap.inputModes && cap.inputModes.length >= 1) score += 0.10;
  if (cap.outputModes && cap.outputModes.length >= 1) score += 0.10;
  return Math.round(score * 100) / 100;
}

export function contentHash(skill: Skill, content?: string): string {
  const data = JSON.stringify({
    card: skill.card,
    content: content ?? '',
    ociReference: skill.ociReference,
  });
  return crypto.createHash('sha256').update(data).digest('hex').slice(0, 16);
}
