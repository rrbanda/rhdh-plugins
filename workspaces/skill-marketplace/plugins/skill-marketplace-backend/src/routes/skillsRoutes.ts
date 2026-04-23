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
import fs from 'fs';
import { Router } from 'express';
import type { LoggerService } from '@backstage/backend-plugin-api';
import type { OciRegistryService } from '../services';
import type {
  SkillData,
  Skill,
  MarketplaceData,
  PluginEntry,
} from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import { getPluginColor, parseSkillContent } from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';

const CATEGORY_KEYWORDS: [string, string[]][] = [
  ['human-resources', ['resume', 'hr', 'candidate', 'hiring', 'recruit']],
  ['operations', ['checklist', 'audit', 'compliance', 'ops', 'process', 'policy']],
  ['engineering', ['code', 'review', 'pull-request', 'pr-', 'lint', 'build', 'ci']],
  ['research', ['summary', 'pdf', 'url', 'research', 'fetch', 'web', 'document']],
];

function categoryOf(skill: Skill): string {
  const tags = skill.card.metadata.tags;
  if (tags && tags.length > 0) {
    const tagStr = tags.join(' ').toLowerCase();
    for (const [cat, keywords] of CATEGORY_KEYWORDS) {
      if (keywords.some(kw => tagStr.includes(kw))) return cat;
    }
  }
  const haystack = `${skill.card.metadata.name} ${skill.card.metadata.description ?? ''}`.toLowerCase();
  for (const [cat, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some(kw => haystack.includes(kw))) return cat;
  }
  return 'general';
}

function ociToSkillData(skill: Skill): SkillData {
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
  ].filter(Boolean).join('\n');

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
  // Only use the OCI annotation word count. When skill.content is not loaded
  // (catalog listing), the body is a synthetic stub and computing from it
  // would produce a misleadingly low number. For skills that lack the
  // annotation, wordCount stays undefined and the UI hides the badge.
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
      name: 'Skill Marketplace',
      email: 'skill-marketplace@redhat.com',
    },
    metadata: {
      description: 'Enterprise Agent Skills Marketplace — OCI Registry',
      version: '1.0.0',
    },
    plugins: [...pluginMap.values()],
  };
}

interface CachedCatalog {
  skills: SkillData[];
  marketplace: MarketplaceData;
  slugIndex: Map<string, number>;
  expiresAt: number;
}

const DEFAULT_CATALOG_TTL_MS = 300_000;
const DEFAULT_DISK_CACHE_PATH = '/tmp/skill-marketplace-catalog.json';

let catalogTtlMs = DEFAULT_CATALOG_TTL_MS;
let diskCachePath = DEFAULT_DISK_CACHE_PATH;
let catalogCache: CachedCatalog | null = null;
let catalogBuildPromise: Promise<CachedCatalog> | null = null;

function buildSlugIndex(skills: SkillData[]): Map<string, number> {
  const idx = new Map<string, number>();
  for (let i = 0; i < skills.length; i++) {
    idx.set(skills[i].slug, i);
  }
  return idx;
}

function persistToDisk(catalog: CachedCatalog, logger: LoggerService): void {
  try {
    const payload = JSON.stringify({
      skills: catalog.skills,
      marketplace: catalog.marketplace,
      savedAt: Date.now(),
    });
    const tmpPath = `${diskCachePath}.tmp`;
    fs.writeFileSync(tmpPath, payload, 'utf8');
    fs.renameSync(tmpPath, diskCachePath);
    logger.debug(
      `Catalog persisted to ${diskCachePath} (${catalog.skills.length} skills, ${(Buffer.byteLength(payload) / 1024).toFixed(0)} KB)`,
    );
  } catch (err) {
    logger.warn(`Failed to persist catalog to disk: ${(err as Error).message}`);
  }
}

export function loadCatalogFromDisk(
  logger: LoggerService,
  path?: string,
): CachedCatalog | null {
  const filePath = path ?? diskCachePath;
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw) as {
      skills: SkillData[];
      marketplace: MarketplaceData;
      savedAt?: number;
    };
    if (!Array.isArray(data.skills) || data.skills.length === 0) return null;
    if (!data.marketplace || !Array.isArray(data.marketplace.plugins)) return null;

    const catalog: CachedCatalog = {
      skills: data.skills,
      marketplace: data.marketplace,
      slugIndex: buildSlugIndex(data.skills),
      expiresAt: 0,
    };
    logger.info(
      `Loaded ${catalog.skills.length} skills from disk cache (${filePath})`,
    );
    return catalog;
  } catch (err) {
    logger.warn(`Failed to load disk cache: ${(err as Error).message}`);
    return null;
  }
}

export function setCatalogCache(catalog: CachedCatalog): void {
  catalogCache = catalog;
}

export function configureCatalog(opts: {
  ttlMs?: number;
  cachePath?: string;
}): void {
  if (opts.ttlMs !== undefined && opts.ttlMs > 0) catalogTtlMs = opts.ttlMs;
  if (opts.cachePath) diskCachePath = opts.cachePath;
}

function rebuildCatalog(
  ociRegistry: OciRegistryService,
  logger: LoggerService,
  lightweight?: boolean,
): Promise<CachedCatalog> {
  if (catalogBuildPromise) return catalogBuildPromise;

  catalogBuildPromise = (async () => {
    try {
      const ociSkills = lightweight
        ? await ociRegistry.listSkillsLightweight()
        : await ociRegistry.listSkills();
      const skills = ociSkills.map(ociToSkillData);
      const marketplace = buildMarketplace(skills);

      const cached: CachedCatalog = {
        skills,
        marketplace,
        slugIndex: buildSlugIndex(skills),
        expiresAt: Date.now() + catalogTtlMs,
      };

      catalogCache = cached;
      persistToDisk(cached, logger);
      logger.info(`Catalog rebuilt: ${skills.length} skills (lightweight=${!!lightweight})`);
      return cached;
    } finally {
      catalogBuildPromise = null;
    }
  })();

  return catalogBuildPromise;
}

async function getCatalog(
  ociRegistry: OciRegistryService,
  logger: LoggerService,
): Promise<CachedCatalog> {
  if (catalogCache && Date.now() < catalogCache.expiresAt) {
    return catalogCache;
  }

  if (catalogCache) {
    rebuildCatalog(ociRegistry, logger).catch(err =>
      logger.warn(`Background catalog rebuild failed: ${(err as Error).message}`),
    );
    return catalogCache;
  }

  return rebuildCatalog(ociRegistry, logger);
}

export function invalidateCatalogCache(): void {
  catalogCache = null;
}

export function warmCatalogCache(
  ociRegistry: OciRegistryService,
  logger: LoggerService,
  lightweight?: boolean,
): Promise<void> {
  return rebuildCatalog(ociRegistry, logger, lightweight).then(
    () => logger.info('Catalog cache warmed successfully'),
    err => logger.warn(`Catalog cache warm-up failed: ${(err as Error).message}`),
  );
}

export function registerSkillsRoutes(
  router: Router,
  ociRegistry: OciRegistryService | undefined,
  logger: LoggerService,
  _skillSearchDirs?: string[],
) {
  router.get('/skills/ready', async (_req, res) => {
    if (!ociRegistry) {
      res.json({ ready: false, reason: 'OCI registry not configured' });
      return;
    }
    const hasData = catalogCache !== null && catalogCache.skills.length > 0;
    const isStale = hasData && Date.now() >= catalogCache!.expiresAt;
    res.json({
      ready: hasData,
      stale: isStale,
      skillCount: catalogCache?.skills.length ?? 0,
    });
  });

  router.get('/skills', async (_req, res) => {
    if (!ociRegistry) {
      res.status(503).json({ error: 'OCI registry not configured' });
      return;
    }
    try {
      const catalog = await getCatalog(ociRegistry, logger);
      res.json({ skills: catalog.skills, marketplace: catalog.marketplace });
    } catch (err) {
      logger.error(`GET /skills failed: ${err instanceof Error ? err.message : err}`);
      res.status(502).json({ error: 'Failed to fetch skills from OCI registry' });
    }
  });

  router.get('/skills/:slug', async (req, res) => {
    if (!ociRegistry) {
      res.status(503).json({ error: 'OCI registry not configured' });
      return;
    }
    try {
      const catalog = await getCatalog(ociRegistry, logger);
      const idx = catalog.slugIndex.get(req.params.slug);
      if (idx === undefined) {
        res.status(404).json({ error: 'Skill not found' });
        return;
      }

      const match = { ...catalog.skills[idx] };
      const content = await ociRegistry.getSkillContent(match.gitPath);
      if (content) {
        match.rawContent = content;
        match.body = content;
        const reparsed = parseSkillContent(content);
        if (!reparsed.title) reparsed.title = match.sections.title;
        match.sections = reparsed;
        if (match.wordCount == null) {
          const wc = content.split(/\s+/).filter(Boolean).length;
          if (wc > 0) match.wordCount = wc;
        }
      }
      res.json(match);
    } catch (err) {
      logger.error(`GET /skills/:slug failed: ${err instanceof Error ? err.message : err}`);
      res.status(502).json({ error: 'Failed to fetch skill from OCI registry' });
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
      const registries = ociRegistry.getRegistries().map(({ auth: _auth, ...r }) => r);
      res.json({ skills, registries });
    } catch (err) {
      logger.error(`GET /oci/skills failed: ${err instanceof Error ? err.message : err}`);
      res.status(502).json({ error: 'Failed to fetch skills from OCI registry' });
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
      logger.error(`GET /oci/skill-content failed: ${err instanceof Error ? err.message : err}`);
      res.status(502).json({ error: 'Failed to fetch skill content from OCI registry' });
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
      logger.error(`GET /oci/skill failed: ${err instanceof Error ? err.message : err}`);
      res.status(502).json({ error: 'Failed to fetch skill from OCI registry' });
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
      logger.error(`GET /oci/search failed: ${err instanceof Error ? err.message : err}`);
      res.status(502).json({ error: 'Failed to search OCI registry' });
    }
  });

  router.get('/oci/registries', async (_req, res) => {
    if (!ociRegistry) {
      res.status(503).json({ error: 'OCI registry not configured' });
      return;
    }
    const registries = ociRegistry.getRegistries().map(({ auth: _auth, ...r }) => r);
    res.json({ registries });
  });
}
