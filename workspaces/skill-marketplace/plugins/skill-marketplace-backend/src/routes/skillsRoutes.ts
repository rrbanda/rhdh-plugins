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
import { Router } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import type { OciRegistryService } from '../services';
import type {
  SkillData,
  Skill,
  MarketplaceData,
  PluginEntry,
  ParsedSections,
  WorkflowStep,
} from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import { getPluginColor } from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';

const CATEGORY_KEYWORDS: [string, string[]][] = [
  ['human-resources', ['resume', 'hr', 'candidate', 'hiring', 'recruit']],
  ['operations', ['checklist', 'audit', 'compliance', 'ops', 'process', 'policy']],
  ['engineering', ['code', 'review', 'pull-request', 'pr-', 'lint', 'build', 'ci']],
  ['research', ['summary', 'pdf', 'url', 'research', 'fetch', 'web', 'document']],
];

function categoryOf(skill: Skill): string {
  const explicit = skill.card.metadata.metadata?.category;
  if (explicit) return explicit;

  const haystack = `${skill.card.metadata.name} ${skill.card.metadata.description ?? ''}`.toLowerCase();
  for (const [cat, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some(kw => haystack.includes(kw))) return cat;
  }
  return 'general';
}

const SKILL_SEARCH_DIRS = [
  '/tmp/docsclaw/examples/skills',
  '/tmp/docsclaw/testdata/standalone/skills',
  '/tmp/docsclaw/testdata/research-agent/skills',
];

function findSkillContent(skillName: string): string | null {
  for (const dir of SKILL_SEARCH_DIRS) {
    const filePath = path.join(dir, skillName, 'SKILL.md');
    try {
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, 'utf-8');
      }
    } catch { /* not found */ }
  }
  return null;
}

function parseWorkflow(md: string): WorkflowStep[] {
  const steps: WorkflowStep[] = [];
  const body = md.replace(/^---[\s\S]*?---\s*/, '');
  const lines = body.split('\n');
  const stepRegex = /^\d+\.\s+(.+)/;

  let stepNum = 0;
  for (const line of lines) {
    const match = stepRegex.exec(line);
    if (match) {
      stepNum++;
      steps.push({ step: stepNum, title: match[1].replace(/\*\*/g, '').trim(), content: '' });
    } else if (steps.length > 0 && line.startsWith('   ') && line.trim()) {
      steps[steps.length - 1].content += (steps[steps.length - 1].content ? '\n' : '') + line.trim();
    }
  }
  return steps;
}

function parsePrerequisites(md: string): string[] {
  const prereqs: string[] = [];
  const body = md.replace(/^---[\s\S]*?---\s*/, '');
  const guidelinesMatch = body.match(/## (?:Important guidelines|Prerequisites|Requirements)\s*\n([\s\S]*?)(?:\n##|\n$|$)/i);
  if (guidelinesMatch) {
    const lines = guidelinesMatch[1].split('\n');
    for (const line of lines) {
      const cleaned = line.replace(/^[-*]\s*/, '').trim();
      if (cleaned) prereqs.push(cleaned);
    }
  }
  return prereqs;
}

function ociToSkillData(skill: Skill): SkillData {
  const m = skill.card.metadata;
  const cat = categoryOf(skill);
  const slug = `${cat}-${m.name}`;
  const tools = skill.card.spec.tools?.required ?? [];

  const localContent = findSkillContent(m.name);

  const bodyParts = [
    `# ${m.name}`,
    '',
    m.description || '',
    '',
    tools.length > 0 ? `**Tools:** ${tools.join(', ')}` : '',
    skill.card.spec.resources?.estimatedMemory
      ? `**Memory:** ${skill.card.spec.resources.estimatedMemory}`
      : '',
    skill.card.spec.resources?.estimatedCPU
      ? `**CPU:** ${skill.card.spec.resources.estimatedCPU}`
      : '',
  ].filter(Boolean).join('\n');

  const body = localContent || skill.content || bodyParts;

  const workflow = localContent ? parseWorkflow(localContent) : [];
  const prerequisites = localContent ? parsePrerequisites(localContent) : [];

  const sections: ParsedSections = {
    title: m.name,
    workflow,
    prerequisites,
    relatedSkills: [],
  };

  const plugin: PluginEntry = {
    name: cat,
    source: skill.ociReference,
    description: `${cat} skills`,
    version: m.version || '1.0.0',
    tags: tools,
    icon: 'cube',
    color: getPluginColor(cat),
  };

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
  };
}

function buildMarketplace(skills: SkillData[]): MarketplaceData {
  const pluginMap = new Map<string, PluginEntry>();
  for (const s of skills) {
    if (!pluginMap.has(s.pluginName)) {
      pluginMap.set(s.pluginName, s.plugin);
    }
  }

  return {
    name: 'skills-marketplace',
    owner: {
      name: 'DocsClaw Skills',
      email: 'docsclaw@redhat.com',
    },
    metadata: {
      description: 'Enterprise Agent Skills Marketplace — OCI Registry',
      version: '1.0.0',
    },
    plugins: [...pluginMap.values()],
  };
}

export function registerSkillsRoutes(
  router: Router,
  ociRegistry?: OciRegistryService,
) {
  router.get('/skills', async (_req, res) => {
    if (!ociRegistry) {
      res.json({ skills: [], marketplace: buildMarketplace([]) });
      return;
    }
    try {
      const ociSkills = await ociRegistry.listSkills();
      const skills = ociSkills.map(ociToSkillData);
      res.json({ skills, marketplace: buildMarketplace(skills) });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(502).json({ error: `OCI registry error: ${message}` });
    }
  });

  router.get('/skills/:slug', async (req, res) => {
    if (!ociRegistry) {
      res.status(404).json({ error: 'Skill not found' });
      return;
    }
    try {
      const ociSkills = await ociRegistry.listSkills();
      const all = ociSkills.map(ociToSkillData);
      const match = all.find(s => s.slug === req.params.slug);
      if (!match) {
        res.status(404).json({ error: 'Skill not found' });
        return;
      }
      const content = await ociRegistry.getSkillContent(match.gitPath);
      if (content) {
        match.rawContent = content;
        match.body = content;
      }
      res.json(match);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(502).json({ error: `OCI registry error: ${message}` });
    }
  });

  router.get('/oci/skills', async (req, res) => {
    if (!ociRegistry) {
      res.status(503).json({ error: 'OCI registry not configured' });
      return;
    }
    try {
      const registryUrl = req.query.registry as string | undefined;
      const skills = await ociRegistry.listSkills(registryUrl);
      res.json({ skills, registries: ociRegistry.getRegistries() });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(502).json({ error: `OCI registry error: ${message}` });
    }
  });

  router.get('/oci/skill-content', async (req, res) => {
    if (!ociRegistry) {
      res.status(503).json({ error: 'OCI registry not configured' });
      return;
    }
    try {
      const ref = req.query.ref as string;
      if (!ref) {
        res.status(400).json({ error: 'ref query parameter required' });
        return;
      }
      const content = await ociRegistry.getSkillContent(ref);
      if (!content) {
        res.status(404).json({ error: 'Skill content not found' });
        return;
      }
      res.json({ content });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(502).json({ error: `OCI registry error: ${message}` });
    }
  });

  router.get('/oci/skill', async (req, res) => {
    if (!ociRegistry) {
      res.status(503).json({ error: 'OCI registry not configured' });
      return;
    }
    try {
      const ref = req.query.ref as string;
      if (!ref) {
        res.status(400).json({ error: 'ref query parameter required' });
        return;
      }
      const skill = await ociRegistry.getSkill(ref);
      if (!skill) {
        res.status(404).json({ error: 'Skill not found' });
        return;
      }
      res.json(skill);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(502).json({ error: `OCI registry error: ${message}` });
    }
  });

  router.get('/oci/search', async (req, res) => {
    if (!ociRegistry) {
      res.status(503).json({ error: 'OCI registry not configured' });
      return;
    }
    try {
      const query = req.query.q as string;
      if (!query) {
        res.status(400).json({ error: 'q query parameter required' });
        return;
      }
      const skills = await ociRegistry.searchSkills(query);
      res.json({ skills });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(502).json({ error: `OCI registry error: ${message}` });
    }
  });

  router.get('/oci/registries', async (_req, res) => {
    if (!ociRegistry) {
      res.status(503).json({ error: 'OCI registry not configured' });
      return;
    }
    res.json({ registries: ociRegistry.getRegistries() });
  });
}
