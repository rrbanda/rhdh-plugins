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
 * Standalone CLI seeder: clones multiple skill repos, parses SKILL.md files,
 * and pushes them directly to an OCI registry.
 *
 * Usage:
 *   npx tsx scripts/seed-skills.ts --registry http://localhost:5001
 *   npx tsx scripts/seed-skills.ts --dry-run
 *   npx tsx scripts/seed-skills.ts --registry http://localhost:5001 --sources local-registry,agent-skills-hub
 *   npx tsx scripts/seed-skills.ts --registry http://localhost:5001 --parallel 20
 *   npx tsx scripts/seed-skills.ts --registry http://localhost:5001 --max 500
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as zlib from 'zlib';
import { execSync } from 'child_process';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SkillSource {
  name: string;
  type: 'git' | 'local';
  url?: string;
  localPath?: string;
  license: string;
  skillsSubdir?: string;
  provenanceBase?: string;
  minScore?: number;
  maxSkills?: number;
}

interface SkillEntry {
  slug: string;
  namespace: string;
  tags: string[];
  source: string;
  card: SkillCardData;
  content: string;
  score: number;
}

interface SkillCardData {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace: string;
    version: string;
    description: string;
    'display-name'?: string;
    license?: string;
    tags?: string[];
    authors?: Array<{ name: string; email?: string }>;
    'allowed-tools'?: string;
  };
  provenance?: {
    source?: string;
    commit?: string;
  };
}

interface Frontmatter {
  name?: string;
  description?: string;
  version?: string;
  license?: string;
  author?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

interface CLIArgs {
  registry?: string;
  sources?: string[];
  max?: number;
  dryRun: boolean;
  parallel: number;
  auth?: { username: string; password: string } | { token: string };
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

const SOURCES: SkillSource[] = [
  {
    name: 'local-registry',
    type: 'local',
    localPath: path.resolve(__dirname, '..', '..', '..', '..', 'registry'),
    license: 'Apache-2.0',
    provenanceBase: 'local://workspaces/registry',
  },
  {
    name: 'agent-skills-hub',
    type: 'git',
    url: 'https://github.com/agent-skills-hub/agent-skills-hub.git',
    license: 'MIT',
    skillsSubdir: 'skills',
    provenanceBase: 'https://github.com/agent-skills-hub/agent-skills-hub/tree/main/skills',
  },
  {
    name: 'addyosmani-agent-skills',
    type: 'git',
    url: 'https://github.com/addyosmani/agent-skills.git',
    license: 'MIT',
    skillsSubdir: 'skills',
    provenanceBase: 'https://github.com/addyosmani/agent-skills/tree/main/skills',
  },
  {
    name: 'kubectl-mcp-k8s',
    type: 'git',
    url: 'https://github.com/rohitg00/kubectl-mcp-server.git',
    license: 'Apache-2.0',
    skillsSubdir: 'kubernetes-skills',
    provenanceBase: 'https://github.com/rohitg00/kubectl-mcp-server/tree/main/kubernetes-skills',
  },
  {
    name: 'fluxcd-agent-skills',
    type: 'git',
    url: 'https://github.com/fluxcd/agent-skills.git',
    license: 'Apache-2.0',
    provenanceBase: 'https://github.com/fluxcd/agent-skills/tree/main',
  },
  {
    name: 'tomazb-openshift',
    type: 'git',
    url: 'https://github.com/tomazb/agent-skills.git',
    license: 'MIT',
    provenanceBase: 'https://github.com/tomazb/agent-skills/tree/main',
  },
  {
    name: 'openclaw-skills',
    type: 'git',
    url: 'https://github.com/openclaw/skills.git',
    license: 'MIT',
    skillsSubdir: 'skills',
    provenanceBase: 'https://github.com/openclaw/skills/tree/main/skills',
    minScore: 40,
    maxSkills: 500,
  },
  {
    name: 'antigravity-awesome-skills',
    type: 'git',
    url: 'https://github.com/sickn33/antigravity-awesome-skills.git',
    license: 'MIT',
    provenanceBase: 'https://github.com/sickn33/antigravity-awesome-skills/tree/main',
    maxSkills: 500,
  },
  {
    name: 'awesome-agent-skills',
    type: 'git',
    url: 'https://github.com/JackyST0/awesome-agent-skills.git',
    license: 'MIT',
    provenanceBase: 'https://github.com/JackyST0/awesome-agent-skills/tree/main',
  },
];

// ---------------------------------------------------------------------------
// Category assignment (matches the common package's categoryOf for the graph)
// ---------------------------------------------------------------------------

const CATEGORY_RULES: Array<{ namespace: string; keywords: string[] }> = [
  { namespace: 'security', keywords: ['security', 'vulnerability', 'owasp', 'pentest', 'penetration', 'exploit', 'cve', 'xss', 'sql-injection', 'csrf', 'secrets', 'authentication', 'authorization', 'cryptograph', 'threat', 'attack', 'burp', 'metasploit', 'reversing', 'fuzzing', 'bug-bounty', 'sast', 'dast', 'rbac', 'pci-compliance'] },
  { namespace: 'testing', keywords: ['test', 'playwright', 'cypress', 'jest', 'coverage', 'assertion', 'mock', 'spec', 'e2e', 'integration-test', 'unit-test', 'bats', 'selenium'] },
  { namespace: 'devops', keywords: ['ci-cd', 'cicd', 'docker', 'kubernetes', 'k8s', 'helm', 'terraform', 'ansible', 'deploy', 'pipeline', 'github-actions', 'gitlab', 'jenkins', 'argocd', 'infrastructure', 'container', 'bazel', 'workflow-automate', 'openshift', 'rhel', 'operator', 'kubectl', 'gitops', 'flux', 'kustomize'] },
  { namespace: 'api', keywords: ['api-design', 'openapi', 'swagger', 'rest-api', 'graphql', 'grpc', 'api-document', 'api-pattern', 'api-testing', 'api-mock'] },
  { namespace: 'frontend', keywords: ['react', 'vue', 'angular', 'frontend', 'css', 'tailwind', 'next.js', 'nextjs', 'ui-ux', 'accessibility', 'responsive', 'svelte', 'web-component'] },
  { namespace: 'backend', keywords: ['backend', 'database', 'sql', 'nosql', 'redis', 'postgres', 'mysql', 'mongodb', 'microservice', 'server', 'express', 'fastapi', 'django', 'spring', 'node', 'bullmq', 'queue'] },
  { namespace: 'docs', keywords: ['documentation', 'markdown', 'readme', 'changelog', 'adr', 'architecture-decision', 'technical-writing', 'api-documenter', 'jsdoc'] },
  { namespace: 'observability', keywords: ['monitoring', 'observability', 'logging', 'metrics', 'tracing', 'alerting', 'sentry', 'datadog', 'grafana', 'prometheus', 'opentelemetry'] },
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
        const tag = kw.replace(/[^a-z0-9-]/g, '-');
        if (!tags.includes(tag)) tags.push(tag);
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestNamespace = rule.namespace;
    }
  }

  if (tags.length === 0) tags.push(bestNamespace);
  return { namespace: bestNamespace, tags: tags.slice(0, 8) };
}

// ---------------------------------------------------------------------------
// Exclusion list (relaxed from the bundler -- keeping only truly irrelevant)
// ---------------------------------------------------------------------------

const EXCLUDE_PATTERNS = [
  /^(2d|3d)-game/, /game-development/, /latex/, /biopy/, /bioserv/, /biorxiv/,
  /^alphafold/, /^chembl/, /^brenda/, /metabolom/, /^anndata/, /^gget/,
  /^astropy/, /clinical/, /treatment-plan/, /research-grant/,
  /^imaging-data/, /^venue-template/, /^literature-review/, /^peer-review/,
  /^citation-management/, /^iso-13485/, /protein/, /genomic/,
  /churn-prevention/, /^ad-creative/,
  /^app-store-optimization/, /^ai-seo/, /^marketing-psychology/,
  /^startup-business/, /^automate-whatsapp/,
  /^backtesting/, /^alpha-vantage/, /^binance/, /cryptocurrency/,
  /^avalonia/, /^adaptyv/, /^benchling/, /^timesfm/,
  /^loki-mode/, /^track-management/,
  /^pptx-official/, /^docx-official/, /^pdf-official/, /^xlsx-official/,
  /^document-skills/, /^internal-comms/, /^brand-guidelines/,
  /^canvas-design/, /^theme-factory/, /^web-artifacts/,
  /^hugging-face-jobs/, /^aeon$/,
];

function isExcluded(slug: string): boolean {
  return EXCLUDE_PATTERNS.some(p => p.test(slug));
}

// ---------------------------------------------------------------------------
// Quality scoring
// ---------------------------------------------------------------------------

const MIN_CONTENT_WORDS = 50;
const MAX_CONTENT_CHARS = 12_000;
const MIN_DESCRIPTION_LEN = 20;
const MIN_QUALITY_SCORE = 15;

function scoreSkill(entry: SkillEntry): number {
  let score = 0;
  const content = entry.content;
  const words = content.split(/\s+/).filter(Boolean).length;

  if (words >= 200 && words <= 2000) score += 30;
  else if (words >= 100) score += 15;
  else if (words >= 50) score += 8;
  else score += 3;

  const headings = (content.match(/^#+\s/gm) || []).length;
  score += Math.min(headings * 3, 20);

  const listItems = (content.match(/^[-*]\s/gm) || []).length;
  score += Math.min(listItems, 15);

  const codeBlocks = (content.match(/```/g) || []).length / 2;
  score += Math.min(Math.floor(codeBlocks) * 5, 15);

  if (/when to use/i.test(content)) score += 5;
  if (/instruction/i.test(content)) score += 5;
  if (/example/i.test(content)) score += 3;

  if (entry.card.metadata.description.length > 80) score += 5;
  if (['skill', 'tool', 'helper'].includes(entry.slug)) score -= 20;

  return score;
}

// ---------------------------------------------------------------------------
// Frontmatter parser
// ---------------------------------------------------------------------------

function parseFrontmatter(raw: string): { frontmatter: Frontmatter; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: raw };

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
  if (inMultiline) fm[currentKey] = currentValue.trim();

  return { frontmatter: fm, body };
}

// ---------------------------------------------------------------------------
// Slug / name helpers
// ---------------------------------------------------------------------------

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

function inferTools(content: string): string | undefined {
  const tools: string[] = [];
  const lower = content.toLowerCase();
  if (lower.includes('read_file') || lower.includes('read file') || lower.includes('analyze') || lower.includes('review')) tools.push('read_file');
  if (lower.includes('write_file') || lower.includes('write file') || lower.includes('create') || lower.includes('generate')) tools.push('write_file');
  if (lower.includes('exec') || lower.includes('bash') || lower.includes('command') || lower.includes('terminal') || lower.includes('shell')) tools.push('exec');
  if (lower.includes('web_fetch') || lower.includes('fetch') || lower.includes('http') || lower.includes('api call')) tools.push('web_fetch');
  return tools.length > 0 ? tools.join(' ') : undefined;
}

// ---------------------------------------------------------------------------
// Source processing
// ---------------------------------------------------------------------------

function cloneRepo(source: SkillSource): string {
  const tmpDir = path.join('/tmp', `seed-skills-${source.name}-${Date.now()}`);
  console.log(`  Cloning ${source.url} → ${tmpDir}`);
  execSync(`git clone --depth 1 ${source.url} ${tmpDir}`, { stdio: 'pipe' });
  return tmpDir;
}

function resolveSourceDir(source: SkillSource): string | null {
  let rootDir: string;

  if (source.type === 'local') {
    rootDir = source.localPath!;
    if (!fs.existsSync(rootDir)) {
      console.warn(`  ⚠ Local path not found: ${rootDir}`);
      return null;
    }
  } else {
    try {
      rootDir = cloneRepo(source);
    } catch (err) {
      console.warn(`  ⚠ Failed to clone ${source.url}: ${(err as Error).message}`);
      return null;
    }
  }

  if (source.skillsSubdir) {
    const subDir = path.join(rootDir, source.skillsSubdir);
    if (fs.existsSync(subDir)) return subDir;
    return rootDir;
  }

  return rootDir;
}

function processDirectory(
  dir: string,
  entries: SkillEntry[],
  seen: Set<string>,
  source: SkillSource,
  depth: number = 0,
): void {
  if (depth > 6) return;

  let dirEntries: fs.Dirent[];
  try {
    dirEntries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of dirEntries) {
    if (!entry.isDirectory()) continue;

    const subDir = path.join(dir, entry.name);
    const skillFile = path.join(subDir, 'SKILL.md');

    if (fs.existsSync(skillFile)) {
      processSkill(subDir, entry.name, entries, seen, source);
    } else {
      processDirectory(subDir, entries, seen, source, depth + 1);
    }
  }
}

function processSkill(
  dir: string,
  dirName: string,
  entries: SkillEntry[],
  seen: Set<string>,
  source: SkillSource,
): void {
  const skillFile = path.join(dir, 'SKILL.md');
  let raw: string;
  try {
    raw = fs.readFileSync(skillFile, 'utf-8');
  } catch {
    return;
  }

  const { frontmatter, body } = parseFrontmatter(raw);

  let rawName = (frontmatter.name as string) || dirName;
  let explicitNamespace: string | undefined;

  if (rawName.includes(':')) {
    const parts = rawName.split(':');
    explicitNamespace = sanitizeSlug(parts[0]);
    rawName = parts.slice(1).join(':');
  }

  const slug = sanitizeSlug(rawName);
  if (!slug) return;
  if (seen.has(slug)) return;
  if (isExcluded(slug)) return;

  const wordCount = body.split(/\s+/).filter(Boolean).length;
  if (wordCount < MIN_CONTENT_WORDS) return;

  const content = body.slice(0, MAX_CONTENT_CHARS);
  const description = ((frontmatter.description as string) || '').trim()
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ');
  if (!description || description.length < MIN_DESCRIPTION_LEN) return;

  const { namespace: detectedNamespace, tags } = categorize(slug, description, content);
  const namespace = explicitNamespace || detectedNamespace;
  const tools = inferTools(content);
  const version = (frontmatter.version as string) || '1.0.0';
  const license = (frontmatter.license as string) || source.license;

  let authorName = 'community';
  if (frontmatter.author) {
    authorName = frontmatter.author as string;
  } else if (frontmatter.metadata && (frontmatter.metadata as Record<string, unknown>).author) {
    authorName = (frontmatter.metadata as Record<string, unknown>).author as string;
  }

  const provenanceSource = source.provenanceBase
    ? `${source.provenanceBase}/${dirName}`
    : undefined;

  const entry: SkillEntry = {
    slug,
    namespace,
    tags,
    source: source.name,
    card: {
      apiVersion: 'skillimage.io/v1alpha1',
      kind: 'SkillCard',
      metadata: {
        name: slug,
        namespace,
        version,
        description: description.slice(0, 256),
        'display-name': toDisplayName(slug),
        license,
        tags,
        authors: [{ name: authorName }],
        ...(tools ? { 'allowed-tools': tools } : {}),
      },
      provenance: provenanceSource ? { source: provenanceSource } : undefined,
    },
    content,
    score: 0,
  };

  entry.score = scoreSkill(entry);

  if (!validateSkillEntry(entry)) return;

  seen.add(slug);
  entries.push(entry);
}

function validateSkillEntry(entry: SkillEntry): boolean {
  const m = entry.card.metadata;
  if (!m.name || !m.namespace || !m.version || !m.description) return false;
  if (m.name.length > 64 || m.name.length === 0) return false;
  if (entry.card.apiVersion !== 'skillimage.io/v1alpha1') return false;
  if (entry.card.kind !== 'SkillCard') return false;
  return true;
}

// ---------------------------------------------------------------------------
// OCI push (self-contained, extracted from OciRegistryService)
// ---------------------------------------------------------------------------

function sha256Digest(data: Buffer): string {
  return `sha256:${crypto.createHash('sha256').update(data).digest('hex')}`;
}

function buildTarGzipLayer(
  cardYaml: string,
  skillContent: string,
): { compressed: Buffer; uncompressedDigest: string } {
  const cardBuf = Buffer.from(cardYaml, 'utf-8');
  const contentBuf = Buffer.from(skillContent, 'utf-8');

  const entries = [
    { name: 'skill.yaml', data: cardBuf },
    { name: 'SKILL.md', data: contentBuf },
  ];

  const blocks: Buffer[] = [];
  for (const entry of entries) {
    const header = Buffer.alloc(512);
    const nameBytes = Buffer.from(entry.name, 'utf-8');
    nameBytes.copy(header, 0, 0, Math.min(nameBytes.length, 100));
    Buffer.from('0000644\0', 'utf-8').copy(header, 100);
    Buffer.from('0000000\0', 'utf-8').copy(header, 108);
    Buffer.from('0000000\0', 'utf-8').copy(header, 116);
    const sizeOctal = entry.data.length.toString(8).padStart(11, '0');
    Buffer.from(`${sizeOctal}\0`, 'utf-8').copy(header, 124);
    const mtime = Math.floor(Date.now() / 1000).toString(8).padStart(11, '0');
    Buffer.from(`${mtime}\0`, 'utf-8').copy(header, 136);
    Buffer.from('        ', 'utf-8').copy(header, 148);
    header[156] = 48;

    let checksum = 0;
    for (let i = 0; i < 512; i++) checksum += header[i];
    const checksumStr = checksum.toString(8).padStart(6, '0');
    Buffer.from(`${checksumStr}\0 `, 'utf-8').copy(header, 148);

    blocks.push(header);
    blocks.push(entry.data);
    const padding = 512 - (entry.data.length % 512);
    if (padding < 512) blocks.push(Buffer.alloc(padding));
  }
  blocks.push(Buffer.alloc(1024));

  const uncompressed = Buffer.concat(blocks);
  const uncompressedDigest = sha256Digest(uncompressed);
  return { compressed: zlib.gzipSync(uncompressed), uncompressedDigest };
}

function buildRegistryUrl(registryUrl: string, urlPath: string): string {
  const clean = registryUrl.replace(/\/$/, '');

  if (clean.includes('ghcr.io')) {
    const namespace = clean.replace(/^.*ghcr\.io\/?/, '');
    return `https://ghcr.io/v2/${namespace}${urlPath}`;
  }
  if (clean.includes('quay.io')) {
    const namespace = clean.replace(/^.*quay\.io\/?/, '');
    return `https://quay.io/v2/${namespace}${urlPath}`;
  }
  if (clean.includes('docker.io')) {
    const namespace = clean.replace(/^.*docker\.io\/?/, '');
    return `https://registry-1.docker.io/v2/${namespace}${urlPath}`;
  }

  const hasScheme = /^https?:\/\//.test(clean);
  const withScheme = hasScheme ? clean : `https://${clean}`;
  const parsed = new URL(withScheme);
  const namespace = parsed.pathname.replace(/^\//, '');
  const nsPrefix = namespace ? `/${namespace}` : '';
  return `${parsed.origin}/v2${nsPrefix}${urlPath}`;
}

function buildAuthHeaders(auth?: CLIArgs['auth']): Record<string, string> {
  if (!auth) return {};
  if ('token' in auth) return { Authorization: `Bearer ${auth.token}` };
  const encoded = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
  return { Authorization: `Basic ${encoded}` };
}

async function uploadBlob(
  repoUrl: string,
  data: Buffer,
  digest: string,
  authHeaders: Record<string, string>,
): Promise<void> {
  const existsUrl = buildRegistryUrl(repoUrl, `/blobs/${digest}`);
  const headRes = await fetch(existsUrl, {
    method: 'HEAD',
    headers: { ...authHeaders },
  });
  if (headRes.ok) return;

  const uploadUrl = buildRegistryUrl(repoUrl, '/blobs/uploads/');
  const initRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Length': '0', ...authHeaders },
  });

  if (!initRes.ok && initRes.status !== 202) {
    const body = await initRes.text();
    throw new Error(`Failed to initiate blob upload (${initRes.status}): ${body}`);
  }

  let putUrl = initRes.headers.get('location');
  if (!putUrl) throw new Error('No Location header in blob upload response');

  const registryOrigin = new URL(buildRegistryUrl(repoUrl, '')).origin;
  if (putUrl.startsWith('/')) {
    putUrl = `${registryOrigin}${putUrl}`;
  }

  const separator = putUrl.includes('?') ? '&' : '?';
  const finalUrl = `${putUrl}${separator}digest=${encodeURIComponent(digest)}`;

  const putRes = await fetch(finalUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(data.length),
      ...authHeaders,
    },
    body: data,
  });

  if (!putRes.ok && putRes.status !== 201) {
    const body = await putRes.text();
    throw new Error(`Failed to upload blob ${digest} (${putRes.status}): ${body}`);
  }
}

async function pushSkillToOci(
  registryUrl: string,
  card: SkillCardData,
  content: string,
  authHeaders: Record<string, string>,
): Promise<string> {
  const skillName = card.metadata.name;
  const repoName = skillName.startsWith('skill-') ? skillName : `skill-${skillName}`;
  const repoUrl = `${registryUrl.replace(/\/$/, '')}/${repoName}`;
  const tag = card.metadata.version || '1.0.0';

  const cardYaml = jsonToYaml(card);
  const { compressed: tarLayer, uncompressedDigest } = buildTarGzipLayer(cardYaml, content);
  const layerDigest = sha256Digest(tarLayer);

  await uploadBlob(repoUrl, tarLayer, layerDigest, authHeaders);

  const imageConfig = JSON.stringify({
    architecture: 'amd64',
    os: 'linux',
    rootfs: { type: 'layers', diff_ids: [uncompressedDigest] },
  });
  const configBuf = Buffer.from(imageConfig, 'utf-8');
  const configDigest = sha256Digest(configBuf);
  await uploadBlob(repoUrl, configBuf, configDigest, authHeaders);

  const m = card.metadata;
  const authorsStr = m.authors?.map(a => a.name).join(', ');

  const annotations: Record<string, string> = {
    'org.opencontainers.image.title': m['display-name'] || m.name,
    'org.opencontainers.image.version': m.version || tag,
    'org.opencontainers.image.description': (m.description || '').slice(0, 256),
    'org.opencontainers.image.created': new Date().toISOString(),
    'io.skillimage.status': 'published',
  };
  if (m.license) annotations['org.opencontainers.image.licenses'] = m.license;
  if (authorsStr) annotations['org.opencontainers.image.authors'] = authorsStr;
  if (m.namespace) annotations['org.opencontainers.image.vendor'] = m.namespace;
  if (card.provenance?.source) annotations['org.opencontainers.image.source'] = card.provenance.source;
  if (m.tags && m.tags.length > 0) {
    annotations['io.skillimage.tags'] = JSON.stringify(m.tags);
  }
  if (m['display-name']) {
    annotations['io.skillimage.display-name'] = m['display-name'];
  }
  if (m['allowed-tools']) {
    annotations['io.skillimage.allowed-tools'] = m['allowed-tools'];
  }
  const wc = content.split(/\s+/).filter(Boolean).length;
  if (wc > 0) {
    annotations['io.skillimage.wordcount'] = String(wc);
  }

  const manifest = {
    schemaVersion: 2,
    mediaType: 'application/vnd.oci.image.manifest.v1+json',
    config: {
      mediaType: 'application/vnd.oci.image.config.v1+json',
      digest: configDigest,
      size: configBuf.length,
    },
    layers: [{
      mediaType: 'application/vnd.oci.image.layer.v1.tar+gzip',
      digest: layerDigest,
      size: tarLayer.length,
    }],
    annotations,
  };

  const manifestUrl = buildRegistryUrl(repoUrl, `/manifests/${tag}`);
  const manifestBody = JSON.stringify(manifest);
  const res = await fetch(manifestUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/vnd.oci.image.manifest.v1+json',
      'Content-Length': String(Buffer.byteLength(manifestBody)),
      ...authHeaders,
    },
    body: manifestBody,
  });

  if (!res.ok && res.status !== 201) {
    const text = await res.text();
    throw new Error(`Failed to push manifest for ${skillName} (${res.status}): ${text}`);
  }

  return `${repoUrl}:${tag}`;
}

function jsonToYaml(obj: Record<string, unknown>, indent: number = 0): string {
  const lines: string[] = [];
  const prefix = '  '.repeat(indent);

  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;

    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${prefix}${key}: []`);
      } else if (typeof value[0] === 'object') {
        lines.push(`${prefix}${key}:`);
        for (const item of value) {
          const itemLines = jsonToYaml(item as Record<string, unknown>, indent + 1).split('\n').filter(Boolean);
          if (itemLines.length > 0) {
            lines.push(`${prefix}- ${itemLines[0].trim()}`);
            for (let i = 1; i < itemLines.length; i++) {
              lines.push(`${prefix}  ${itemLines[i].trim()}`);
            }
          }
        }
      } else {
        lines.push(`${prefix}${key}:`);
        for (const item of value) {
          lines.push(`${prefix}- ${yamlScalar(String(item))}`);
        }
      }
    } else if (typeof value === 'object') {
      lines.push(`${prefix}${key}:`);
      lines.push(jsonToYaml(value as Record<string, unknown>, indent + 1));
    } else {
      lines.push(`${prefix}${key}: ${yamlScalar(String(value))}`);
    }
  }

  return lines.join('\n');
}

function yamlScalar(s: string): string {
  if (/^[a-zA-Z0-9._/-]+$/.test(s)) return s;
  return `"${s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')}"`;
}

// ---------------------------------------------------------------------------
// Parallel batch executor
// ---------------------------------------------------------------------------

async function pushBatch(
  entries: SkillEntry[],
  registryUrl: string,
  authHeaders: Record<string, string>,
  parallel: number,
): Promise<{ pushed: number; failed: number; errors: string[] }> {
  let pushed = 0;
  let failed = 0;
  const errors: string[] = [];
  let idx = 0;
  const total = entries.length;

  while (idx < total) {
    const batch = entries.slice(idx, idx + parallel);
    const results = await Promise.allSettled(
      batch.map(entry =>
        pushSkillToOci(registryUrl, entry.card, entry.content, authHeaders),
      ),
    );

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'fulfilled') {
        pushed++;
      } else {
        failed++;
        const name = batch[i].slug;
        errors.push(`${name}: ${result.reason}`);
      }
    }

    idx += batch.length;
    if (idx % 50 === 0 || idx >= total) {
      console.log(`  Progress: ${idx}/${total} (${pushed} pushed, ${failed} failed)`);
    }
  }

  return { pushed, failed, errors };
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseArgs(): CLIArgs {
  const args = process.argv.slice(2);
  const result: CLIArgs = {
    dryRun: false,
    parallel: 10,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--registry':
        if (!args[i + 1] || args[i + 1].startsWith('--')) {
          console.error('Error: --registry requires a URL value');
          process.exit(1);
        }
        result.registry = args[++i];
        break;
      case '--sources':
        if (!args[i + 1] || args[i + 1].startsWith('--')) {
          console.error('Error: --sources requires a comma-separated list');
          process.exit(1);
        }
        result.sources = args[++i].split(',').map(s => s.trim());
        break;
      case '--max': {
        if (!args[i + 1] || args[i + 1].startsWith('--')) {
          console.error('Error: --max requires a numeric value');
          process.exit(1);
        }
        const maxVal = parseInt(args[++i], 10);
        if (isNaN(maxVal) || maxVal < 1) {
          console.error('Error: --max must be a positive integer');
          process.exit(1);
        }
        result.max = maxVal;
        break;
      }
      case '--dry-run':
        result.dryRun = true;
        break;
      case '--parallel': {
        const pVal = args[i + 1];
        if (!pVal || pVal.startsWith('-')) {
          console.warn('--parallel requires a positive integer value, using default 10');
        } else {
          i++;
          result.parallel = Math.max(1, parseInt(pVal, 10) || 10);
        }
        break;
      }
      case '--auth-token':
        if (!args[i + 1] || args[i + 1].startsWith('--')) {
          console.error('Error: --auth-token requires a token value');
          process.exit(1);
        }
        result.auth = { token: args[++i] };
        break;
      case '--auth-basic': {
        if (!args[i + 1] || args[i + 1].startsWith('--')) {
          console.error('Error: --auth-basic requires user:password value');
          process.exit(1);
        }
        const creds = args[++i];
        if (!creds.includes(':')) {
          console.error('Error: --auth-basic must be in format user:password');
          process.exit(1);
        }
        const [username, ...rest] = creds.split(':');
        result.auth = { username, password: rest.join(':') };
        break;
      }
      case '--help':
        console.log(`
Usage: npx tsx scripts/seed-skills.ts [options]

Options:
  --registry <url>       OCI registry URL (required unless --dry-run)
  --sources <list>       Comma-separated source names to include (default: all)
  --max <n>              Maximum number of skills to push
  --dry-run              Parse and report stats without pushing to OCI
  --parallel <n>         Concurrent push operations (default: 10)
  --auth-token <token>   Bearer token for OCI registry
  --auth-basic <u:p>     Basic auth credentials (user:password)
  --help                 Show this help

Available sources:
  ${SOURCES.map(s => `${s.name} (${s.type})`).join('\n  ')}
`);
        process.exit(0);
        break;
      default:
        console.warn(`Unknown argument: ${args[i]}`);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs();

  if (!args.dryRun && !args.registry) {
    console.error('Error: --registry is required unless --dry-run is set');
    console.error('Run with --help for usage');
    process.exit(1);
  }

  const activeSources = args.sources
    ? SOURCES.filter(s => args.sources!.includes(s.name))
    : SOURCES;

  if (activeSources.length === 0) {
    console.error('Error: no matching sources found');
    console.error(`Available: ${SOURCES.map(s => s.name).join(', ')}`);
    process.exit(1);
  }

  console.log(`\n=== Skill Seeder ===`);
  console.log(`Mode: ${args.dryRun ? 'DRY RUN' : 'PUSH'}`);
  if (args.registry) console.log(`Registry: ${args.registry}`);
  console.log(`Sources: ${activeSources.map(s => s.name).join(', ')}`);
  console.log(`Parallel: ${args.parallel}`);
  if (args.max) console.log(`Max skills: ${args.max}`);
  console.log('');

  const allEntries: SkillEntry[] = [];
  const seen = new Set<string>();
  const statsPerSource = new Map<string, number>();

  const tmpDirsToClean: string[] = [];

  for (const source of activeSources) {
    console.log(`[${source.name}] Processing...`);

    const dir = resolveSourceDir(source);
    if (!dir) {
      console.log(`[${source.name}] Skipped (could not resolve)\n`);
      continue;
    }

    if (source.type === 'git' && dir.startsWith('/tmp/')) {
      const cloneRoot = source.skillsSubdir
        ? dir.replace(new RegExp(`/${source.skillsSubdir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), '')
        : dir;
      if (!tmpDirsToClean.includes(cloneRoot)) {
        tmpDirsToClean.push(cloneRoot);
      }
    }

    const sourceEntries: SkillEntry[] = [];
    const sourceSeen = new Set<string>();
    processDirectory(dir, sourceEntries, sourceSeen, source);

    const effectiveMinScore = source.minScore ?? MIN_QUALITY_SCORE;
    let filtered = sourceEntries.filter(e => e.score >= effectiveMinScore);

    filtered = filtered.filter(e => !seen.has(e.slug));

    if (source.maxSkills && filtered.length > source.maxSkills) {
      filtered.sort((a, b) => b.score - a.score);
      filtered = filtered.slice(0, source.maxSkills);
    }

    for (const entry of filtered) {
      seen.add(entry.slug);
      allEntries.push(entry);
    }

    statsPerSource.set(source.name, filtered.length);
    console.log(`[${source.name}] Added ${filtered.length} skills (${allEntries.length} total)${sourceEntries.length !== filtered.length ? ` [${sourceEntries.length} candidates, ${sourceEntries.length - filtered.length} filtered]` : ''}\n`);
  }

  for (const tmpDir of tmpDirsToClean) {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      console.warn(`Warning: failed to clean up ${tmpDir}`);
    }
  }

  allEntries.sort((a, b) => b.score - a.score);

  if (args.max && allEntries.length > args.max) {
    console.log(`Capping to --max ${args.max} skills (from ${allEntries.length})`);
    allEntries.length = args.max;
  }

  // Print stats
  console.log(`\n=== Summary ===`);
  console.log(`Total skills: ${allEntries.length}`);
  console.log(`\nBy source:`);
  for (const [src, count] of statsPerSource) {
    console.log(`  ${src}: ${count}`);
  }

  const byCat = new Map<string, number>();
  for (const e of allEntries) {
    byCat.set(e.namespace, (byCat.get(e.namespace) || 0) + 1);
  }
  console.log(`\nBy category:`);
  for (const [cat, count] of [...byCat.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat}: ${count}`);
  }

  if (args.dryRun) {
    console.log('\n=== Dry run complete (no skills pushed) ===');
    return;
  }

  // Push to OCI
  console.log(`\n=== Pushing ${allEntries.length} skills to ${args.registry} ===\n`);
  const authHeaders = buildAuthHeaders(args.auth);
  const { pushed, failed, errors } = await pushBatch(
    allEntries,
    args.registry!,
    authHeaders,
    args.parallel,
  );

  console.log(`\n=== Push Complete ===`);
  console.log(`Pushed: ${pushed}`);
  console.log(`Failed: ${failed}`);
  if (errors.length > 0) {
    console.log(`\nErrors:`);
    for (const err of errors.slice(0, 20)) {
      console.log(`  ${err}`);
    }
    if (errors.length > 20) {
      console.log(`  ... and ${errors.length - 20} more`);
    }
  }
}

main().catch(err => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
