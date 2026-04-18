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
import type { LoggerService } from '@backstage/backend-plugin-api';
import type { OciRegistryService } from './OciRegistryService';

const CATALOG_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_SKILL_CONTENT_CHARS = 6000;

interface CatalogEntry {
  name: string;
  category: string;
  description: string;
  ociReference: string;
}

export class SkillContextBuilder {
  private readonly ociRegistry: OciRegistryService;
  private readonly logger: LoggerService;

  private catalogCache: { entries: CatalogEntry[]; expiresAt: number } | null = null;

  constructor(options: {
    ociRegistry: OciRegistryService;
    logger: LoggerService;
  }) {
    this.ociRegistry = options.ociRegistry;
    this.logger = options.logger;
  }

  private async getCatalog(): Promise<CatalogEntry[]> {
    if (this.catalogCache && Date.now() < this.catalogCache.expiresAt) {
      return this.catalogCache.entries;
    }

    try {
      const skills = await this.ociRegistry.listSkills();
      const entries: CatalogEntry[] = skills.map(s => ({
        name: s.card.metadata.name,
        category: s.card.metadata.namespace || 'general',
        description: s.card.metadata.description?.slice(0, 120) || '',
        ociReference: s.ociReference,
      }));
      this.catalogCache = { entries, expiresAt: Date.now() + CATALOG_CACHE_TTL_MS };
      return entries;
    } catch (err) {
      this.logger.warn(`Failed to build skills catalog: ${err instanceof Error ? err.message : err}`);
      return this.catalogCache?.entries ?? [];
    }
  }

  async buildCatalogContext(): Promise<string> {
    const entries = await this.getCatalog();
    if (entries.length === 0) return '';

    const lines = entries.map(e => `- ${e.name} (${e.category}): ${e.description}`);
    return `[SKILL MARKETPLACE CONTEXT]\nYou have access to ${entries.length} skills from the enterprise skill marketplace. When asked about available skills, list these:\n${lines.join('\n')}\n`;
  }

  async getSkillContent(skillName: string): Promise<string | null> {
    const entries = await this.getCatalog();
    const match = entries.find(
      e => e.name === skillName || e.name === skillName.replace(/^[^:]+:/, ''),
    );
    if (!match) {
      this.logger.debug(`Skill "${skillName}" not found in catalog`);
      return null;
    }

    try {
      const content = await this.ociRegistry.getSkillContent(match.ociReference);
      if (!content) return null;
      return content.length > MAX_SKILL_CONTENT_CHARS
        ? `${content.slice(0, MAX_SKILL_CONTENT_CHARS)}\n... (truncated)`
        : content;
    } catch (err) {
      this.logger.warn(`Failed to fetch skill content for "${skillName}": ${err instanceof Error ? err.message : err}`);
      return null;
    }
  }

  async enrichMessage(userMessage: string, activeSkill?: string): Promise<string> {
    const parts: string[] = [];

    const catalog = await this.buildCatalogContext();
    if (catalog) {
      parts.push(catalog);
    }

    if (activeSkill) {
      const content = await this.getSkillContent(activeSkill);
      if (content) {
        parts.push(`[ACTIVE SKILL: ${activeSkill}]\nBelow is the full skill specification. Apply this skill to the user's request:\n---\n${content}\n---\n`);
      } else {
        parts.push(`[ACTIVE SKILL: ${activeSkill}]\nNote: Could not load the full specification for "${activeSkill}". Answer using your general knowledge.\n`);
      }
    }

    parts.push(userMessage);
    return parts.join('\n');
  }

  get catalogSize(): number {
    return this.catalogCache?.entries.length ?? 0;
  }
}
