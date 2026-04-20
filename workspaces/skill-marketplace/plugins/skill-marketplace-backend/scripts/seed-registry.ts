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
 * Standalone pipeline script: pushes skills from agent-skills-hub into an OCI
 * registry using the standard OCI distribution spec (no plugin runtime needed).
 *
 * This replaces the in-plugin DefaultSkillSeeder. Run it once to populate a
 * registry, then point the plugin at that registry as a read-only consumer.
 *
 * Usage:
 *   npx tsx scripts/seed-registry.ts \
 *     --registry https://quay.io/v2/rbrhssa/skills-mp \
 *     --token <bearer-token> \
 *     [--source /path/to/agent-skills-hub]  \
 *     [--concurrency 10] \
 *     [--dry-run]
 *
 * Environment variables (alternative to flags):
 *   OCI_REGISTRY_URL   - registry base URL
 *   OCI_REGISTRY_TOKEN - bearer token for auth
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as zlib from 'zlib';
import { execSync } from 'child_process';

const SKILLS_HUB_REPO = 'https://github.com/agent-skills-hub/agent-skills-hub.git';
const IMAGE_LAYER_MEDIA_TYPE = 'application/vnd.oci.image.layer.v1.tar+gzip';
const MIN_CONTENT_WORDS = 80;
const MAX_CONTENT_CHARS = 12_000;
const MAX_SKILLS = 100;
const MIN_DESCRIPTION_LEN = 30;

// ---- CLI argument parsing ----

interface CliArgs {
  registry: string;
  token: string;
  source?: string;
  concurrency: number;
  dryRun: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let registry = process.env.OCI_REGISTRY_URL || '';
  let token = process.env.OCI_REGISTRY_TOKEN || '';
  let source: string | undefined;
  let concurrency = 10;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--registry': registry = args[++i]; break;
      case '--token': token = args[++i]; break;
      case '--source': source = args[++i]; break;
      case '--concurrency': concurrency = parseInt(args[++i], 10); break;
      case '--dry-run': dryRun = true; break;
      default:
        if (!args[i].startsWith('-')) {
          source = source || args[i];
        }
    }
  }

  if (!registry) {
    console.error('ERROR: --registry or OCI_REGISTRY_URL is required');
    process.exit(1);
  }
  if (!token && !dryRun) {
    console.error('ERROR: --token or OCI_REGISTRY_TOKEN is required (or use --dry-run)');
    process.exit(1);
  }

  return { registry: registry.replace(/\/$/, ''), token, source, concurrency, dryRun };
}

// ---- OCI helpers ----

function sha256Digest(buf: Buffer): string {
  return `sha256:${crypto.createHash('sha256').update(buf).digest('hex')}`;
}

function buildTarGzipLayer(cardYaml: string, content: string): { compressed: Buffer; uncompressedDigest: string } {
  const files: Array<{ name: string; data: Buffer }> = [
    { name: 'skill.yaml', data: Buffer.from(cardYaml, 'utf-8') },
    { name: 'SKILL.md', data: Buffer.from(content, 'utf-8') },
  ];

  const blocks: Buffer[] = [];
  for (const file of files) {
    const header = Buffer.alloc(512, 0);
    const nameBytes = Buffer.from(file.name, 'utf-8');
    nameBytes.copy(header, 0, 0, Math.min(nameBytes.length, 100));

    const sizeStr = file.data.length.toString(8).padStart(11, '0');
    Buffer.from(sizeStr).copy(header, 124);
    Buffer.from('0100644\0').copy(header, 100);
    Buffer.from('0000000\0').copy(header, 108);
    Buffer.from('0000000\0').copy(header, 116);

    const now = Math.floor(Date.now() / 1000).toString(8).padStart(11, '0');
    Buffer.from(now).copy(header, 136);

    header[156] = 0x30; // '0' = regular file

    Buffer.from('        ').copy(header, 148);
    let checksum = 0;
    for (let j = 0; j < 512; j++) checksum += header[j];
    Buffer.from(checksum.toString(8).padStart(6, '0') + '\0 ').copy(header, 148);

    blocks.push(header);
    blocks.push(file.data);

    const padding = 512 - (file.data.length % 512);
    if (padding < 512) blocks.push(Buffer.alloc(padding, 0));
  }

  blocks.push(Buffer.alloc(1024, 0));
  const tar = Buffer.concat(blocks);
  const uncompressedDigest = sha256Digest(tar);
  const compressed = zlib.gzipSync(tar);
  return { compressed, uncompressedDigest };
}

async function uploadBlob(registryUrl: string, token: string, data: Buffer, digest: string): Promise<void> {
  const headRes = await fetch(`${registryUrl}/blobs/${digest}`, {
    method: 'HEAD',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (headRes.ok) return;

  const uploadRes = await fetch(`${registryUrl}/blobs/uploads/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!uploadRes.ok) {
    throw new Error(`Blob upload initiation failed: ${uploadRes.status} ${await uploadRes.text()}`);
  }

  let location = uploadRes.headers.get('location') || '';
  if (location.startsWith('/')) {
    const u = new URL(registryUrl);
    location = `${u.protocol}//${u.host}${location}`;
  }

  const sep = location.includes('?') ? '&' : '?';
  const putUrl = `${location}${sep}digest=${encodeURIComponent(digest)}`;

  const putRes = await fetch(putUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(data.length),
    },
    body: data,
  });

  if (!putRes.ok) {
    throw new Error(`Blob PUT failed: ${putRes.status} ${await putRes.text()}`);
  }
}

async function putManifest(registryUrl: string, token: string, tag: string, manifest: object): Promise<void> {
  const body = JSON.stringify(manifest);
  const res = await fetch(`${registryUrl}/manifests/${tag}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/vnd.oci.image.manifest.v1+json',
    },
    body,
  });

  if (!res.ok) {
    throw new Error(`Manifest PUT failed: ${res.status} ${await res.text()}`);
  }
}

// ---- Skill processing (from generate-default-skills.ts) ----

interface SkillEntry {
  slug: string;
  namespace: string;
  tags: string[];
  card: Record<string, unknown>;
  content: string;
}

const CATEGORY_RULES: Array<{ namespace: string; keywords: string[] }> = [
  { namespace: 'security', keywords: ['security', 'vulnerability', 'owasp', 'pentest', 'exploit', 'cve', 'xss', 'threat', 'attack'] },
  { namespace: 'testing', keywords: ['test', 'playwright', 'cypress', 'jest', 'coverage', 'mock', 'e2e', 'selenium'] },
  { namespace: 'devops', keywords: ['ci-cd', 'docker', 'kubernetes', 'k8s', 'helm', 'terraform', 'deploy', 'pipeline', 'github-actions', 'container'] },
  { namespace: 'api', keywords: ['api-design', 'openapi', 'swagger', 'rest-api', 'graphql', 'grpc'] },
  { namespace: 'frontend', keywords: ['react', 'vue', 'angular', 'frontend', 'css', 'tailwind', 'nextjs', 'svelte'] },
  { namespace: 'backend', keywords: ['backend', 'database', 'sql', 'nosql', 'redis', 'postgres', 'microservice', 'express', 'fastapi'] },
  { namespace: 'docs', keywords: ['documentation', 'markdown', 'readme', 'changelog', 'adr', 'technical-writing'] },
  { namespace: 'observability', keywords: ['monitoring', 'observability', 'logging', 'metrics', 'tracing', 'alerting'] },
  { namespace: 'ai-agents', keywords: ['agent', 'llm', 'prompt', 'rag', 'embedding', 'langchain', 'mcp', 'tool-calling'] },
  { namespace: 'engineering', keywords: ['code-review', 'architect', 'refactor', 'clean-code', 'design-pattern', 'git', 'performance', 'debug'] },
];

const EXCLUDE_PATTERNS = [
  /^(2d|3d)-game/, /game-development/, /latex/, /biopy/, /bioserv/, /biorxiv/,
  /^alphafold/, /^chembl/, /^brenda/, /metabolom/, /^anndata/, /^gget/,
  /^astropy/, /clinical/, /treatment-plan/, /scientific/, /research-grant/,
  /^imaging-data/, /^venue-template/, /^literature-review/, /^peer-review/,
  /protein/, /genomic/, /churn-prevention/, /market-research/, /^ad-creative/,
  /^seo-/, /^ai-seo/, /^marketing-psychology/, /^startup-business/,
  /^backtesting/, /^alpha-vantage/, /^binance/, /cryptocurrency/,
  /whisper/, /speech/, /^tts-/, /^voice/, /^customer-support$/,
  /^fp-ts/, /^pptx-official/, /^docx-official/, /^pdf-official/, /^xlsx-official/,
];

function categorize(slug: string, description: string, content: string): { namespace: string; tags: string[] } {
  const haystack = `${slug} ${description} ${content.slice(0, 2000)}`.toLowerCase();
  const tags: string[] = [];
  let bestNs = 'general';
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
    if (score > bestScore) { bestScore = score; bestNs = rule.namespace; }
  }
  if (tags.length === 0) tags.push(bestNs);
  return { namespace: bestNs, tags: tags.slice(0, 8) };
}

function parseFrontmatter(raw: string): { frontmatter: Record<string, string>; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: raw };
  const fm: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^(\w[\w-]*):\s*(.*)/);
    if (kv) {
      let val = kv[2].trim();
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      fm[kv[1]] = val;
    }
  }
  return { frontmatter: fm, body: match[2].trim() };
}

function sanitizeSlug(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 64);
}

function toDisplayName(slug: string): string {
  return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function inferTools(content: string): string | undefined {
  const tools: string[] = [];
  const l = content.toLowerCase();
  if (l.includes('read_file') || l.includes('analyze') || l.includes('review')) tools.push('read_file');
  if (l.includes('write_file') || l.includes('create') || l.includes('generate')) tools.push('write_file');
  if (l.includes('exec') || l.includes('bash') || l.includes('shell')) tools.push('exec');
  if (l.includes('web_fetch') || l.includes('fetch') || l.includes('http')) tools.push('web_fetch');
  return tools.length > 0 ? tools.join(' ') : undefined;
}

function collectSkills(hubPath: string): SkillEntry[] {
  const skillsDir = path.join(hubPath, 'skills');
  if (!fs.existsSync(skillsDir)) {
    console.error(`Skills directory not found: ${skillsDir}`);
    process.exit(1);
  }

  const entries: SkillEntry[] = [];
  const seen = new Set<string>();

  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const sub = path.join(dir, entry.name);
      const skillFile = path.join(sub, 'SKILL.md');
      if (fs.existsSync(skillFile)) {
        processSkill(sub, entry.name);
      } else {
        walk(sub);
      }
    }
  }

  function processSkill(dir: string, dirName: string) {
    const raw = fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf-8');
    const { frontmatter, body } = parseFrontmatter(raw);
    const slug = sanitizeSlug(frontmatter.name || dirName);
    if (seen.has(slug)) return;
    if (EXCLUDE_PATTERNS.some(p => p.test(slug))) return;
    if (body.split(/\s+/).filter(Boolean).length < MIN_CONTENT_WORDS) return;
    const description = (frontmatter.description || '').trim();
    if (!description || description.length < MIN_DESCRIPTION_LEN) return;

    const content = body.slice(0, MAX_CONTENT_CHARS);
    const { namespace, tags } = categorize(slug, description, content);
    const tools = inferTools(content);

    seen.add(slug);
    entries.push({
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
          source: `https://github.com/agent-skills-hub/agent-skills-hub/tree/main/skills/${dirName}`,
        },
      },
      content,
    });
  }

  walk(skillsDir);

  entries.sort((a, b) => b.content.length - a.content.length);
  return entries.slice(0, MAX_SKILLS);
}

// ---- Push a single skill ----

async function pushSkill(
  registryUrl: string,
  token: string,
  entry: SkillEntry,
): Promise<string> {
  const meta = (entry.card as any).metadata;
  const repoName = meta.name.startsWith('skill-') ? meta.name : `skill-${meta.name}`;
  const repoUrl = `${registryUrl}/${repoName}`;
  const tag = meta.version || '1.0.0';

  const yaml = Object.entries(entry.card)
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join('\n');

  const { compressed, uncompressedDigest } = buildTarGzipLayer(yaml, entry.content);
  const layerDigest = sha256Digest(compressed);

  await uploadBlob(repoUrl, token, compressed, layerDigest);

  const imageConfig = JSON.stringify({
    architecture: 'amd64',
    os: 'linux',
    rootfs: { type: 'layers', diff_ids: [uncompressedDigest] },
  });
  const configBuf = Buffer.from(imageConfig, 'utf-8');
  const configDigest = sha256Digest(configBuf);
  await uploadBlob(repoUrl, token, configBuf, configDigest);

  const annotations: Record<string, string> = {
    'org.opencontainers.image.title': meta['display-name'] || meta.name,
    'org.opencontainers.image.version': meta.version || tag,
    'org.opencontainers.image.description': (meta.description || '').slice(0, 256),
    'org.opencontainers.image.created': new Date().toISOString(),
    'io.skillimage.status': 'published',
  };
  if (meta.license) annotations['org.opencontainers.image.licenses'] = meta.license;
  if (meta.namespace) annotations['org.opencontainers.image.vendor'] = meta.namespace;

  const manifest = {
    schemaVersion: 2,
    mediaType: 'application/vnd.oci.image.manifest.v1+json',
    config: {
      mediaType: 'application/vnd.oci.image.config.v1+json',
      digest: configDigest,
      size: configBuf.length,
    },
    layers: [{
      mediaType: IMAGE_LAYER_MEDIA_TYPE,
      digest: layerDigest,
      size: compressed.length,
    }],
    annotations,
  };

  await putManifest(repoUrl, token, tag, manifest);
  return `${repoUrl}:${tag}`;
}

// ---- Main ----

async function main() {
  const args = parseArgs();

  let hubPath = args.source;
  if (!hubPath) {
    hubPath = path.join('/tmp', `skills-hub-seed-${Date.now()}`);
    console.log(`Cloning agent-skills-hub to ${hubPath}...`);
    execSync(`git clone --depth 1 ${SKILLS_HUB_REPO} ${hubPath}`, { stdio: 'pipe' });
  }

  const skills = collectSkills(hubPath);
  console.log(`Collected ${skills.length} skills for seeding`);

  if (args.dryRun) {
    console.log('\n[DRY RUN] Would push these skills:');
    for (const s of skills) {
      console.log(`  - ${s.slug} (${s.namespace})`);
    }
    console.log(`\nTotal: ${skills.length} skills to ${args.registry}`);
    return;
  }

  let pushed = 0;
  let skipped = 0;
  let errors = 0;

  let idx = 0;
  const worker = async () => {
    while (idx < skills.length) {
      const i = idx++;
      const skill = skills[i];
      try {
        const ref = await pushSkill(args.registry, args.token, skill);
        pushed++;
        console.log(`[${pushed + skipped + errors}/${skills.length}] Pushed: ${skill.slug} -> ${ref}`);
      } catch (err: any) {
        if (err.message?.includes('409') || err.message?.includes('MANIFEST_INVALID')) {
          skipped++;
          console.log(`[${pushed + skipped + errors}/${skills.length}] Exists: ${skill.slug}`);
        } else {
          errors++;
          console.error(`[${pushed + skipped + errors}/${skills.length}] FAILED: ${skill.slug}: ${err.message}`);
        }
      }
    }
  };

  const concurrency = Math.min(args.concurrency, skills.length);
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  console.log(`\nDone: ${pushed} pushed, ${skipped} skipped, ${errors} errors`);
  if (errors > 0) process.exit(1);
}

main().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
