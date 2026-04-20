#!/usr/bin/env npx tsx
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

/**
 * Build-time script: reads skills from agent-skills-hub (cloned locally),
 * filters + categorizes them, converts YAML frontmatter to SkillCard objects,
 * and writes a generated TypeScript module for inspection or offline use.
 *
 * NOTE: This is a development/CI tool only. The plugin does NOT bundle skills
 * at runtime. Use scripts/seed-registry.ts to push skills to an OCI registry,
 * then point the plugin at that registry as a read-only consumer.
 *
 * Usage:
 *   npx tsx scripts/generate-default-skills.ts [path-to-skills-hub]
 *
 * If no path is provided, clones agent-skills-hub to a temp directory.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const REPO_URL = 'https://github.com/agent-skills-hub/agent-skills-hub.git';
const MIN_CONTENT_WORDS = 80;
const MAX_CONTENT_CHARS = 12_000;
const MAX_SKILLS = 100;
const MIN_DESCRIPTION_LEN = 30;
const PROVENANCE_BASE = 'https://github.com/agent-skills-hub/agent-skills-hub/tree/main/skills';

interface Frontmatter {
  name?: string;
  description?: string;
  source?: string;
  risk?: string;
  version?: string;
  author?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

interface SkillEntry {
  slug: string;
  namespace: string;
  tags: string[];
  card: {
    apiVersion: string;
    kind: string;
    metadata: {
      name: string;
      namespace: string;
      version: string;
      description: string;
      'display-name': string;
      license: string;
      tags: string[];
      authors: Array<{ name: string }>;
      'allowed-tools'?: string;
    };
    provenance: {
      source: string;
    };
  };
  content: string;
}

// --- Category assignment ---

const CATEGORY_RULES: Array<{ namespace: string; keywords: string[] }> = [
  { namespace: 'security', keywords: ['security', 'vulnerability', 'owasp', 'pentest', 'penetration', 'exploit', 'cve', 'xss', 'sql-injection', 'csrf', 'secrets', 'authentication', 'authorization', 'cryptograph', 'threat', 'attack', 'burp', 'metasploit', 'reversing', 'fuzzing', 'bug-bounty'] },
  { namespace: 'testing', keywords: ['test', 'playwright', 'cypress', 'jest', 'coverage', 'assertion', 'mock', 'spec', 'e2e', 'integration-test', 'unit-test', 'bats', 'selenium'] },
  { namespace: 'devops', keywords: ['ci-cd', 'cicd', 'docker', 'kubernetes', 'k8s', 'helm', 'terraform', 'ansible', 'deploy', 'pipeline', 'github-actions', 'gitlab', 'jenkins', 'argocd', 'infrastructure', 'container', 'bazel', 'workflow-automate'] },
  { namespace: 'api', keywords: ['api-design', 'openapi', 'swagger', 'rest-api', 'graphql', 'grpc', 'api-document', 'api-pattern', 'api-testing', 'api-mock'] },
  { namespace: 'frontend', keywords: ['react', 'vue', 'angular', 'frontend', 'css', 'tailwind', 'next.js', 'nextjs', 'ui-ux', 'accessibility', 'responsive', 'svelte', 'web-component'] },
  { namespace: 'backend', keywords: ['backend', 'database', 'sql', 'nosql', 'redis', 'postgres', 'mysql', 'mongodb', 'microservice', 'server', 'express', 'fastapi', 'django', 'spring', 'node', 'bullmq', 'queue'] },
  { namespace: 'docs', keywords: ['documentation', 'markdown', 'readme', 'changelog', 'adr', 'architecture-decision', 'technical-writing', 'api-documenter', 'jsdoc'] },
  { namespace: 'observability', keywords: ['monitoring', 'observability', 'logging', 'metrics', 'tracing', 'alerting', 'sentry', 'datadog', 'grafana', 'prometheus'] },
  { namespace: 'ai-agents', keywords: ['agent', 'autonomous', 'llm', 'prompt', 'rag', 'embedding', 'langchain', 'ai-engineer', 'mcp', 'tool-calling', 'skill-creator'] },
  { namespace: 'engineering', keywords: ['code-review', 'architect', 'refactor', 'clean-code', 'solid', 'design-pattern', 'commit', 'git', 'brainstorm', 'planning', 'coding-standard', 'performance', 'debug', 'error'] },
];

function categorize(slug: string, description: string, content: string): { namespace: string; tags: string[] } {
  const haystack = `${slug} ${description} ${content.slice(0, 2000)}`.toLowerCase();
  const tags: string[] = [];

  let bestNamespace = 'general';
  let bestScore = 0;

  for (const rule of CATEGORY_RULES) {
    let score = 0;
    for (const kw of rule.keywords) {
      if (haystack.includes(kw)) {
        score++;
        if (!tags.includes(kw.replace(/[^a-z0-9-]/g, '-'))) {
          tags.push(kw.replace(/[^a-z0-9-]/g, '-'));
        }
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestNamespace = rule.namespace;
    }
  }

  if (tags.length === 0) {
    tags.push(bestNamespace);
  }

  return { namespace: bestNamespace, tags: tags.slice(0, 8) };
}

// --- Exclusion list: niche / domain-specific skills ---

const EXCLUDE_PATTERNS = [
  /^(2d|3d)-game/, /game-development/, /latex/, /biopy/, /bioserv/, /biorxiv/,
  /^alphafold/, /^chembl/, /^brenda/, /metabolom/, /^anndata/, /^gget/,
  /^astropy/, /clinical/, /treatment-plan/, /scientific/, /research-grant/,
  /^imaging-data/, /^venue-template/, /^literature-review/, /^peer-review/,
  /^citation-management/, /^iso-13485/, /protein/, /genomic/,
  /churn-prevention/, /market-research/, /^ad-creative/,
  /^app-store-optimization/, /^seo-/, /^ai-seo/, /^marketing-psychology/,
  /^startup-business/, /^ab-test-setup/, /^automate-whatsapp/,
  /^backtesting/, /^alpha-vantage/, /^binance/, /cryptocurrency/,
  /^avalonia/, /^adaptyv/, /^benchling/, /^timesfm/,
  /^loki-mode/, /^track-management/,
  /whisper/, /speech/, /^tts-/, /^voice/,
  /^customer-support$/, /^churn/, /^email-/,
  /^mobile-design$/, /^algorith.*art/,
  /^fp-ts/, /^pptx-official/, /^docx-official/, /^pdf-official/, /^xlsx-official/,
  /^document-skills/, /^internal-comms/, /^brand-guidelines/,
  /^canvas-design/, /^theme-factory/, /^web-artifacts/,
  /^hugging-face-jobs/, /^aeon$/,
];

function isExcluded(slug: string): boolean {
  return EXCLUDE_PATTERNS.some(p => p.test(slug));
}

// --- Frontmatter parser ---

function parseFrontmatter(raw: string): { frontmatter: Frontmatter; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: raw };
  }

  const yamlBlock = match[1];
  const body = match[2].trim();

  const fm: Frontmatter = {};
  let currentKey = '';
  let currentValue = '';
  let inMultiline = false;

  for (const line of yamlBlock.split('\n')) {
    if (inMultiline) {
      if (/^\s/.test(line)) {
        currentValue += ' ' + line.trim();
        continue;
      }
      fm[currentKey] = currentValue.trim();
      inMultiline = false;
    }

    const kvMatch = line.match(/^(\w[\w-]*):\s*(.*)/);
    if (kvMatch) {
      currentKey = kvMatch[1];
      const val = kvMatch[2].trim();
      if (val === '>' || val === '|') {
        inMultiline = true;
        currentValue = '';
      } else if (val.startsWith('"') && val.endsWith('"')) {
        fm[currentKey] = val.slice(1, -1);
      } else {
        fm[currentKey] = val;
      }
    }
  }
  if (inMultiline) {
    fm[currentKey] = currentValue.trim();
  }

  return { frontmatter: fm, body };
}

// --- Slug sanitizer ---

function sanitizeSlug(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
}

function toDisplayName(slug: string): string {
  return slug
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// --- Tools inference ---

function inferTools(content: string): string | undefined {
  const tools: string[] = [];
  const lower = content.toLowerCase();
  if (lower.includes('read_file') || lower.includes('read file') || lower.includes('analyze') || lower.includes('review')) {
    tools.push('read_file');
  }
  if (lower.includes('write_file') || lower.includes('write file') || lower.includes('create') || lower.includes('generate')) {
    tools.push('write_file');
  }
  if (lower.includes('exec') || lower.includes('bash') || lower.includes('command') || lower.includes('terminal') || lower.includes('shell')) {
    tools.push('exec');
  }
  if (lower.includes('web_fetch') || lower.includes('fetch') || lower.includes('http') || lower.includes('api call')) {
    tools.push('web_fetch');
  }
  return tools.length > 0 ? tools.join(' ') : undefined;
}

// --- Quality scoring ---

function scoreSkill(entry: SkillEntry): number {
  let score = 0;
  const content = entry.content;
  const words = content.split(/\s+/).filter(Boolean).length;

  // Content depth: prefer 200-2000 words (not too short, not bloated)
  if (words >= 200 && words <= 2000) score += 30;
  else if (words >= 100) score += 15;
  else score += 5;

  // Structured content: has headings, steps, lists
  const headings = (content.match(/^#+\s/gm) || []).length;
  score += Math.min(headings * 3, 20);

  const listItems = (content.match(/^[-*]\s/gm) || []).length;
  score += Math.min(listItems, 15);

  // Has code examples
  const codeBlocks = (content.match(/```/g) || []).length / 2;
  score += Math.min(Math.floor(codeBlocks) * 5, 15);

  // Has clear sections (## When to use, ## Instructions, etc.)
  if (/when to use/i.test(content)) score += 5;
  if (/instruction/i.test(content)) score += 5;
  if (/do not use/i.test(content)) score += 3;
  if (/example/i.test(content)) score += 3;

  // Description quality
  if (entry.card.metadata.description.length > 80) score += 5;

  // Penalize very generic names
  if (['skill', 'tool', 'helper'].includes(entry.slug)) score -= 20;

  return score;
}

function selectBalanced(
  scored: Array<SkillEntry & { score: number }>,
  maxTotal: number,
): SkillEntry[] {
  const selected: SkillEntry[] = [];
  const byCategory = new Map<string, Array<SkillEntry & { score: number }>>();

  for (const s of scored) {
    const cat = s.namespace;
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(s);
  }

  const categories = [...byCategory.keys()];
  const minPerCategory = Math.max(2, Math.floor(maxTotal / categories.length / 2));
  const maxPerCategory = Math.ceil(maxTotal / categories.length * 1.8);

  // First pass: guarantee minimum per category
  for (const cat of categories) {
    const pool = byCategory.get(cat)!;
    const take = Math.min(minPerCategory, pool.length);
    for (let i = 0; i < take; i++) {
      selected.push(pool[i]);
    }
  }

  // Second pass: fill remaining slots from best remaining, capped per category
  const selectedSlugs = new Set(selected.map(s => s.slug));
  const catCounts = new Map<string, number>();
  for (const s of selected) {
    catCounts.set(s.namespace, (catCounts.get(s.namespace) || 0) + 1);
  }

  for (const s of scored) {
    if (selected.length >= maxTotal) break;
    if (selectedSlugs.has(s.slug)) continue;
    const catCount = catCounts.get(s.namespace) || 0;
    if (catCount >= maxPerCategory) continue;

    selected.push(s);
    selectedSlugs.add(s.slug);
    catCounts.set(s.namespace, catCount + 1);
  }

  return selected;
}

// --- Main ---

function main() {
  const hubPath = process.argv[2] || cloneRepo();

  const skillsDir = path.join(hubPath, 'skills');
  if (!fs.existsSync(skillsDir)) {
    console.error(`Skills directory not found: ${skillsDir}`);
    process.exit(1);
  }

  const entries: SkillEntry[] = [];
  const seen = new Set<string>();

  processDirectory(skillsDir, entries, seen);

  console.log(`Candidates before quality filter: ${entries.length}`);

  // Score each skill for quality ranking
  for (const e of entries) {
    (e as SkillEntry & { score: number }).score = scoreSkill(e);
  }

  // Sort by score descending, then pick top MAX_SKILLS with category balance
  const scored = entries as Array<SkillEntry & { score: number }>;
  scored.sort((a, b) => b.score - a.score);

  const selected = selectBalanced(scored, MAX_SKILLS);
  selected.sort((a, b) => a.slug.localeCompare(b.slug));

  entries.length = 0;
  entries.push(...selected);

  console.log(`\nSelected ${entries.length} skills across categories:`);
  const byCat = new Map<string, number>();
  for (const e of entries) {
    byCat.set(e.namespace, (byCat.get(e.namespace) || 0) + 1);
  }
  for (const [cat, count] of [...byCat.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat}: ${count}`);
  }

  const outDir = path.join(__dirname, '..', 'src', 'services', 'default-skills');
  fs.mkdirSync(outDir, { recursive: true });

  const outPath = path.join(outDir, 'index.ts');
  writeGeneratedModule(outPath, entries);

  console.log(`\nWrote ${entries.length} skills to ${outPath}`);
}

function cloneRepo(): string {
  const tmpDir = path.join('/tmp', `skills-hub-${Date.now()}`);
  console.log(`Cloning agent-skills-hub to ${tmpDir}...`);
  execSync(`git clone --depth 1 ${REPO_URL} ${tmpDir}`, { stdio: 'pipe' });
  return tmpDir;
}

function processDirectory(dir: string, entries: SkillEntry[], seen: Set<string>) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const subDir = path.join(dir, entry.name);
    const skillFile = path.join(subDir, 'SKILL.md');

    if (fs.existsSync(skillFile)) {
      const licenseFile = fs.readdirSync(subDir).find(f => f.startsWith('LICENSE'));
      if (licenseFile) continue;

      processSkill(subDir, entry.name, entries, seen);
    } else {
      processDirectory(subDir, entries, seen);
    }
  }
}

function processSkill(dir: string, dirName: string, entries: SkillEntry[], seen: Set<string>) {
  const skillFile = path.join(dir, 'SKILL.md');
  const raw = fs.readFileSync(skillFile, 'utf-8');
  const { frontmatter, body } = parseFrontmatter(raw);

  const rawName = (frontmatter.name as string) || dirName;
  const slug = sanitizeSlug(rawName);

  if (seen.has(slug)) return;
  if (isExcluded(slug)) return;

  const wordCount = body.split(/\s+/).filter(Boolean).length;
  if (wordCount < MIN_CONTENT_WORDS) return;

  const content = body.slice(0, MAX_CONTENT_CHARS);
  const description = ((frontmatter.description as string) || '').trim();
  if (!description || description.length < MIN_DESCRIPTION_LEN) return;

  const { namespace, tags } = categorize(slug, description, content);
  const tools = inferTools(content);

  const entry: SkillEntry = {
    slug,
    namespace,
    tags,
    card: {
      apiVersion: 'skillimage.io/v1alpha1',
      kind: 'SkillCard',
      metadata: {
        name: slug,
        namespace,
        version: '1.0.0',
        description: description.slice(0, 256),
        'display-name': toDisplayName(slug),
        license: 'MIT',
        tags,
        authors: [{ name: 'agent-skills-hub community' }],
        ...(tools ? { 'allowed-tools': tools } : {}),
      },
      provenance: {
        source: `${PROVENANCE_BASE}/${dirName}`,
      },
    },
    content,
  };

  seen.add(slug);
  entries.push(entry);
}

function writeGeneratedModule(outPath: string, entries: SkillEntry[]) {
  const lines: string[] = [
    '/*',
    ' * AUTO-GENERATED by scripts/generate-default-skills.ts',
    ' * Do not edit manually. Re-run the generator to update.',
    ' *',
    ` * Source: agent-skills-hub (MIT license)`,
    ` * Generated: ${new Date().toISOString()}`,
    ` * Total skills: ${entries.length}`,
    ' */',
    '',
    `import type { SkillCard } from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';`,
    '',
    'export interface BundledSkill {',
    '  card: SkillCard;',
    '  content: string;',
    '}',
    '',
    'export const defaultSkills: BundledSkill[] = [',
  ];

  for (const entry of entries) {
    lines.push('  {');
    lines.push(`    card: ${JSON.stringify(entry.card, null, 6).replace(/\n/g, '\n    ')},`);
    lines.push(`    content: ${JSON.stringify(entry.content)},`);
    lines.push('  },');
  }

  lines.push('];');
  lines.push('');

  fs.writeFileSync(outPath, lines.join('\n'), 'utf-8');
}

main();
