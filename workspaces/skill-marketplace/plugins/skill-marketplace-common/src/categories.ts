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

import type { Skill } from './types';

/**
 * Canonical domain/category names used across the skill marketplace.
 * @public
 */
export type CategoryName =
  | 'human-resources'
  | 'operations'
  | 'engineering'
  | 'research'
  | 'security'
  | 'testing'
  | 'devops'
  | 'docs'
  | 'api'
  | 'general';

/**
 * Default category keyword mappings used to classify skills.
 * Skills are matched by tags first, then by name + description.
 * Keywords are matched with word-boundary awareness (see {@link matchesKeyword}).
 * @public
 */
export const DEFAULT_CATEGORY_KEYWORDS: [CategoryName, string[]][] = [
  ['human-resources', ['resume', 'hr', 'candidate', 'hiring', 'recruit']],
  ['operations', ['checklist', 'compliance', 'ops', 'process', 'policy']],
  ['engineering', ['code-review', 'pull-request', 'pr-review', 'lint', 'ci-cd', 'cicd']],
  ['research', ['summary', 'pdf', 'research', 'web-scrape', 'document-analysis']],
  ['security', ['security', 'vulnerability', 'cve', 'audit', 'threat']],
  ['testing', ['test', 'coverage', 'assertion', 'mock', 'spec']],
  ['devops', ['docker', 'k8s', 'kubernetes', 'helm', 'terraform', 'deploy']],
  ['docs', ['markdown', 'documentation', 'readme', 'changelog']],
  ['api', ['openapi', 'swagger', 'restapi', 'rest-api', 'graphql', 'grpc']],
];

/**
 * Merge custom keyword overrides with the defaults. Custom entries
 * replace default entries for the same category key.
 * @public
 */
export function buildCategoryKeywords(
  custom?: Record<string, string[]>,
): [string, string[]][] {
  if (!custom) return DEFAULT_CATEGORY_KEYWORDS;
  const merged = new Map<string, string[]>(DEFAULT_CATEGORY_KEYWORDS);
  for (const [cat, kws] of Object.entries(custom)) {
    merged.set(cat, kws);
  }
  return Array.from(merged.entries());
}

/**
 * Test whether `haystack` contains `keyword` as a distinct token.
 * Uses word-boundary-like logic: the keyword must be preceded and
 * followed by a non-alphanumeric character (or string boundary).
 * @public
 */
export function matchesKeyword(haystack: string, keyword: string): boolean {
  const idx = haystack.indexOf(keyword);
  if (idx === -1) return false;
  const before = idx === 0 || /[^a-z0-9]/.test(haystack[idx - 1]);
  const after =
    idx + keyword.length >= haystack.length ||
    /[^a-z0-9]/.test(haystack[idx + keyword.length]);
  return before && after;
}

/**
 * Classify a skill into a domain category using keyword matching.
 * Checks tags first, then falls back to name + description.
 * @public
 */
export function categoryOf(
  skill: Pick<Skill, 'card'>,
  keywords?: [string, string[]][],
): string {
  const kws = keywords ?? DEFAULT_CATEGORY_KEYWORDS;
  const tags = skill.card.metadata.tags;
  if (tags && tags.length > 0) {
    const tagStr = tags.join(' ').toLowerCase();
    for (const [cat, catKeywords] of kws) {
      if (catKeywords.some(kw => matchesKeyword(tagStr, kw))) return cat;
    }
  }
  const haystack =
    `${skill.card.metadata.name} ${skill.card.metadata.description ?? ''}`.toLowerCase();
  for (const [cat, catKeywords] of kws) {
    if (catKeywords.some(kw => matchesKeyword(haystack, kw))) return cat;
  }
  return 'general';
}
