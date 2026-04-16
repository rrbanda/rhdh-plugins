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
import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import type {
  MarketplaceData,
  SkillData,
  SkillAssets,
  ParsedSections,
  WorkflowStep,
  RelatedSkill,
} from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import { getPluginColor } from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import { LoggerService } from '@backstage/backend-plugin-api';

export class RegistryService {
  private readonly registryDir: string;
  private readonly logger: LoggerService;

  constructor(registryDir: string, logger: LoggerService) {
    this.registryDir = registryDir;
    this.logger = logger;
  }

  async getMarketplace(): Promise<MarketplaceData> {
    try {
      const raw = await fs.readFile(
        path.join(this.registryDir, 'marketplace.json'),
        'utf-8',
      );
      return JSON.parse(raw) as MarketplaceData;
    } catch {
      return this.defaultMarketplace();
    }
  }

  async getAllSkills(): Promise<SkillData[]> {
    const marketplace = await this.getMarketplace();
    const skills: SkillData[] = [];

    for (const plugin of marketplace.plugins) {
      const pluginDir = path.join(
        this.registryDir,
        plugin.source.replace('./', ''),
      );
      const entries = await this.safeReadDir(pluginDir);

      for (const entry of entries) {
        const skillDir = path.join(pluginDir, entry);
        const skillFile = path.join(skillDir, 'SKILL.md');
        const stat = await this.safeStat(skillDir);
        if (!stat?.isDirectory()) continue;

        try {
          const rawContent = await fs.readFile(skillFile, 'utf-8');
          const parsed = this.parseSkillMd(rawContent);
          const assets = await this.loadAssets(skillDir);

          skills.push({
            slug: `${plugin.name}-${entry}`,
            pluginName: plugin.name,
            skillName: entry,
            name: parsed.frontmatter.name || `${plugin.name}:${entry}`,
            description: parsed.frontmatter.description || '',
            version: parsed.frontmatter.version,
            model: parsed.runtimeHints.model ?? parsed.frontmatter.model,
            body: parsed.body,
            rawContent,
            sections: parsed.sections,
            assets,
            plugin: {
              ...plugin,
              color: plugin.color ?? getPluginColor(plugin.name),
            },
            gitPath: `${plugin.source}/${entry}/SKILL.md`,
          });
        } catch {
          this.logger.debug(`Skipping ${entry} in ${plugin.name}: no SKILL.md`);
        }
      }
    }

    return skills;
  }

  async getSkillBySlug(slug: string): Promise<SkillData | null> {
    const all = await this.getAllSkills();
    return all.find(s => s.slug === slug) ?? null;
  }

  private parseSkillMd(rawContent: string): {
    frontmatter: Record<string, string>;
    runtimeHints: { model?: string };
    body: string;
    sections: ParsedSections;
  } {
    const firstParse = matter(rawContent);
    const frontmatter = firstParse.data as Record<string, string>;

    let runtimeHints: { model?: string } = {};
    let body = firstParse.content;

    const remaining = firstParse.content.trimStart();
    if (remaining.startsWith('---')) {
      const secondParse = matter(remaining);
      runtimeHints = { model: secondParse.data.model as string | undefined };
      body = secondParse.content;
    }

    body = body.trim();
    const sections = this.parseSections(body, frontmatter);

    return { frontmatter, runtimeHints, body, sections };
  }

  private parseSections(
    body: string,
    frontmatter: Record<string, string>,
  ): ParsedSections {
    const lines = body.split('\n');
    const sections: ParsedSections = {
      title: this.extractTitle(lines) || (frontmatter.name as string) || '',
      workflow: this.extractWorkflowSteps(body),
      relatedSkills: this.extractRelatedSkills(body),
      prerequisites: this.extractPrerequisites(body),
      whenToUse: this.extractWhenToUse(body),
      criticalRules: this.extractCriticalRules(body),
    };
    return sections;
  }

  private extractTitle(lines: string[]): string {
    const h1 = lines.find(l => /^# [^#]/.test(l));
    return h1 ? h1.replace(/^# /, '').trim() : '';
  }

  private extractPrerequisites(body: string): string[] | undefined {
    const match = body.match(
      /## (?:What You'll Need Before Starting|Prerequisites)\s*\n([\s\S]*?)(?=\n## |\n$)/,
    );
    if (!match?.[1]) return undefined;
    return match[1]
      .split('\n')
      .filter(l => l.startsWith('- '))
      .map(l => l.replace(/^- /, '').trim());
  }

  private extractWhenToUse(body: string): string | undefined {
    const match = body.match(/## When to Use\s*\n([\s\S]*?)(?=\n## )/);
    return match?.[1]?.trim() || undefined;
  }

  private extractCriticalRules(body: string): string[] | undefined {
    const match = body.match(
      /\*\*CRITICAL RULES\*\*\s*\n([\s\S]*?)(?=\n### |\n## )/,
    );
    if (!match?.[1]) return undefined;
    return match[1]
      .split('\n')
      .filter(l => /^\d+\./.test(l.trim()))
      .map(l => l.replace(/^\d+\.\s*/, '').trim());
  }

  private extractWorkflowSteps(body: string): WorkflowStep[] {
    const steps: WorkflowStep[] = [];
    const stepRegex =
      /### Step (\d+):?\s*(.+)\n([\s\S]*?)(?=\n### Step \d|## |$)/g;
    let m;
    while ((m = stepRegex.exec(body)) !== null) {
      steps.push({
        step: parseInt(m[1]!, 10),
        title: m[2]!.trim(),
        content: m[3]!.trim(),
      });
    }
    return steps;
  }

  private extractRelatedSkills(body: string): RelatedSkill[] {
    const section = body.match(
      /## Related Skills\s*\n([\s\S]*?)(?=\n## |$)/,
    );
    if (!section?.[1]) return [];
    const linkRegex = /- \[([^\]]+)\]\(([^)]+)\)(?:\s*[-–]\s*(.+))?/g;
    const skills: RelatedSkill[] = [];
    let m;
    while ((m = linkRegex.exec(section[1])) !== null) {
      skills.push({
        name: m[1]!,
        path: m[2]!,
        slug: m[1]!
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, ''),
        description: m[3]?.trim(),
      } as RelatedSkill);
    }
    return skills;
  }

  private async loadAssets(skillDir: string): Promise<SkillAssets> {
    return {
      references: await this.loadAssetDir(path.join(skillDir, 'references')),
      templates: await this.loadAssetDir(path.join(skillDir, 'templates')),
      examples: await this.loadAssetDir(path.join(skillDir, 'examples')),
    };
  }

  private async loadAssetDir(dir: string) {
    const entries = await this.safeReadDir(dir);
    const files = [];
    for (const name of entries) {
      try {
        const content = await fs.readFile(path.join(dir, name), 'utf-8');
        files.push({ path: name, name, content });
      } catch {
        // binary or unreadable, skip
      }
    }
    return files;
  }

  private async safeReadDir(dir: string): Promise<string[]> {
    try {
      return await fs.readdir(dir);
    } catch {
      return [];
    }
  }

  private async safeStat(p: string) {
    try {
      return await fs.stat(p);
    } catch {
      return null;
    }
  }

  private defaultMarketplace(): MarketplaceData {
    return {
      name: 'skills-marketplace',
      owner: {
        name: 'Skills Marketplace',
        email: 'hello@skills-marketplace.dev',
      },
      metadata: {
        description: 'AI Agent Skills Marketplace',
        version: '1.0.0',
      },
      plugins: [
        {
          name: 'docs',
          source: './docs',
          description: 'Documentation skills',
          version: '1.0.0',
          tags: ['documentation', 'markdown'],
          icon: 'file-text',
          color: '#3b82f6',
        },
        {
          name: 'devops',
          source: './devops',
          description: 'DevOps skills',
          version: '1.0.0',
          tags: ['docker', 'kubernetes'],
          icon: 'container',
          color: '#10b981',
        },
        {
          name: 'api',
          source: './api',
          description: 'API skills',
          version: '1.0.0',
          tags: ['api', 'openapi'],
          icon: 'globe',
          color: '#8b5cf6',
        },
        {
          name: 'testing',
          source: './testing',
          description: 'Testing skills',
          version: '1.0.0',
          tags: ['testing', 'jest'],
          icon: 'test-tube',
          color: '#f59e0b',
        },
        {
          name: 'security',
          source: './security',
          description: 'Security skills',
          version: '1.0.0',
          tags: ['security', 'audit'],
          icon: 'shield',
          color: '#ef4444',
        },
      ],
    };
  }
}
