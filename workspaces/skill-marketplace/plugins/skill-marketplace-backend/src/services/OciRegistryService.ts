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
import { createHash } from 'crypto';
import fetch from 'node-fetch';
import { LoggerService } from '@backstage/backend-plugin-api';
import yaml from 'js-yaml';
import type {
  Skill,
  SkillCard,
  OciAnnotations,
  OciRegistryConfig,
} from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';

const ANNOTATION_SKILL_NAME = 'io.agentskills.skill.name';
const ANNOTATION_TITLE = 'org.opencontainers.image.title';
const ANNOTATION_VERSION = 'org.opencontainers.image.version';
const ANNOTATION_DESCRIPTION = 'org.opencontainers.image.description';
const ANNOTATION_LICENSES = 'org.opencontainers.image.licenses';
const ANNOTATION_CREATED = 'org.opencontainers.image.created';
const ANNOTATION_RESOURCES_MEMORY = 'io.docsclaw.skill.resources.memory';
const ANNOTATION_RESOURCES_CPU = 'io.docsclaw.skill.resources.cpu';
const ANNOTATION_TOOLS_REQUIRED = 'io.docsclaw.skill.tools.required';

const CARD_MEDIA_TYPE = 'application/vnd.docsclaw.skill.card.v1+yaml';
const CONTENT_MEDIA_TYPE =
  'application/vnd.agentskills.skill.content.v1.tar+gzip';

interface OciManifest {
  schemaVersion: number;
  mediaType?: string;
  artifactType?: string;
  config: { mediaType: string; digest: string; size: number };
  layers: Array<{
    mediaType: string;
    digest: string;
    size: number;
    annotations?: Record<string, string>;
  }>;
  annotations?: Record<string, string>;
}

interface OciTagList {
  name: string;
  tags: string[];
}

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export interface OciRegistryServiceConfig {
  registries: OciRegistryConfig[];
  cacheTimeout: number;
}

export class OciRegistryService {
  private readonly config: OciRegistryServiceConfig;
  private readonly logger: LoggerService;
  private readonly cache = new Map<string, CacheEntry<unknown>>();

  constructor(config: OciRegistryServiceConfig, logger: LoggerService) {
    this.config = config;
    this.logger = logger;
  }

  private getCached<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (entry && Date.now() < entry.expiresAt) {
      return entry.data as T;
    }
    this.cache.delete(key);
    return undefined;
  }

  private setCache<T>(key: string, data: T): void {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + this.config.cacheTimeout * 1000,
    });
  }

  private authHeader(
    registry: OciRegistryConfig,
  ): Record<string, string> | undefined {
    if (registry.auth?.token) {
      return { Authorization: `Bearer ${registry.auth.token}` };
    }
    if (registry.auth?.username && registry.auth?.password) {
      const encoded = Buffer.from(
        `${registry.auth.username}:${registry.auth.password}`,
      ).toString('base64');
      return { Authorization: `Basic ${encoded}` };
    }
    return undefined;
  }

  private buildRegistryUrl(
    registryUrl: string,
    path: string,
  ): string {
    const clean = registryUrl.replace(/\/$/, '');

    if (clean.includes('ghcr.io')) {
      const namespace = clean.replace(/^.*ghcr\.io\/?/, '');
      return `https://ghcr.io/v2/${namespace}${path}`;
    }
    if (clean.includes('quay.io')) {
      const namespace = clean.replace(/^.*quay\.io\/?/, '');
      return `https://quay.io/v2/${namespace}${path}`;
    }
    if (clean.includes('docker.io')) {
      const namespace = clean.replace(/^.*docker\.io\/?/, '');
      return `https://registry-1.docker.io/v2/${namespace}${path}`;
    }

    // Generic registry: extract scheme+host and namespace from URL path.
    // e.g. https://registry.example.com/team1 → https://registry.example.com/v2/team1/...
    const hasScheme = /^https?:\/\//.test(clean);
    const withScheme = hasScheme ? clean : `https://${clean}`;
    const parsed = new URL(withScheme);
    const namespace = parsed.pathname.replace(/^\//, '');
    const nsPrefix = namespace ? `/${namespace}` : '';
    return `${parsed.origin}/v2${nsPrefix}${path}`;
  }

  async listTags(
    registry: OciRegistryConfig,
    repo?: string,
  ): Promise<string[]> {
    const cacheKey = `tags:${registry.url}:${repo || ''}`;
    const cached = this.getCached<string[]>(cacheKey);
    if (cached) return cached;

    const repoPath = repo ? `/${repo}` : '';
    const url = this.buildRegistryUrl(
      registry.url,
      `${repoPath}/tags/list`,
    );

    try {
      const headers: Record<string, string> = {
        Accept: 'application/json',
        ...this.authHeader(registry),
      };
      const res = await fetch(url, { headers });
      if (!res.ok) {
        this.logger.warn(
          `Failed to list tags from ${url}: ${res.status}`,
        );
        return [];
      }
      const data = (await res.json()) as OciTagList;
      this.setCache(cacheKey, data.tags || []);
      return data.tags || [];
    } catch (err) {
      this.logger.warn(
        `Error listing tags from ${registry.url}: ${(err as Error).message}`,
      );
      return [];
    }
  }

  async getManifest(
    registry: OciRegistryConfig,
    ref: string,
  ): Promise<OciManifest | null> {
    const cacheKey = `manifest:${registry.url}:${ref}`;
    const cached = this.getCached<OciManifest>(cacheKey);
    if (cached) return cached;

    const url = this.buildRegistryUrl(
      registry.url,
      `/manifests/${ref}`,
    );

    try {
      const headers: Record<string, string> = {
        Accept: [
          'application/vnd.oci.image.manifest.v1+json',
          'application/vnd.docker.distribution.manifest.v2+json',
        ].join(', '),
        ...this.authHeader(registry),
      };
      const res = await fetch(url, { headers });
      if (!res.ok) return null;

      const manifest = (await res.json()) as OciManifest;
      this.setCache(cacheKey, manifest);
      return manifest;
    } catch (err) {
      this.logger.warn(
        `Error fetching manifest ${ref} from ${registry.url}: ${(err as Error).message}`,
      );
      return null;
    }
  }

  async getBlob(
    registry: OciRegistryConfig,
    digest: string,
  ): Promise<Buffer | null> {
    const url = this.buildRegistryUrl(
      registry.url,
      `/blobs/${digest}`,
    );

    try {
      const headers: Record<string, string> = {
        ...this.authHeader(registry),
      };
      const res = await fetch(url, { headers });
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      this.logger.warn(
        `Error fetching blob ${digest}: ${(err as Error).message}`,
      );
      return null;
    }
  }

  extractAnnotations(
    manifest: OciManifest,
  ): OciAnnotations {
    const ann = manifest.annotations || {};
    return {
      created: ann[ANNOTATION_CREATED],
      version: ann[ANNOTATION_VERSION],
      description: ann[ANNOTATION_DESCRIPTION],
      licenses: ann[ANNOTATION_LICENSES],
      skillName: ann[ANNOTATION_SKILL_NAME],
      resourcesMemory: ann[ANNOTATION_RESOURCES_MEMORY],
      resourcesCPU: ann[ANNOTATION_RESOURCES_CPU],
      toolsRequired: ann[ANNOTATION_TOOLS_REQUIRED],
    };
  }

  async extractSkillCard(
    registry: OciRegistryConfig,
    manifest: OciManifest,
  ): Promise<SkillCard | null> {
    const cardLayer = manifest.layers.find(
      l =>
        l.mediaType === CARD_MEDIA_TYPE ||
        l.annotations?.[ANNOTATION_TITLE] === 'skill.yaml',
    );

    if (!cardLayer) return null;

    const blob = await this.getBlob(registry, cardLayer.digest);
    if (!blob) return null;

    try {
      return yaml.load(blob.toString('utf-8')) as SkillCard;
    } catch (err) {
      this.logger.warn(
        `Failed to parse skill.yaml: ${(err as Error).message}`,
      );
      return null;
    }
  }

  skillFromManifest(
    registry: OciRegistryConfig,
    tag: string,
    manifest: OciManifest,
    card: SkillCard | null,
  ): Skill {
    const annotations = this.extractAnnotations(manifest);
    const ociReference = `${registry.url}:${tag}`;

    if (card) {
      return {
        card,
        ociReference,
        ociAnnotations: annotations,
        registryName: registry.name,
        tags: [tag],
      };
    }

    return {
      card: {
        apiVersion: 'docsclaw.io/v1alpha1',
        kind: 'SkillCard',
        metadata: {
          name: annotations.skillName || tag,
          namespace: '',
          ref: ociReference,
          version: annotations.version || tag,
          description: annotations.description || '',
          author: '',
        },
        spec: {
          tools: {
            required: annotations.toolsRequired
              ? annotations.toolsRequired.split(',').map(s => s.trim())
              : undefined,
          },
          resources: {
            estimatedMemory: annotations.resourcesMemory,
            estimatedCPU: annotations.resourcesCPU,
          },
        },
      },
      ociReference,
      ociAnnotations: annotations,
      registryName: registry.name,
      tags: [tag],
    };
  }

  private registryNamespace(registryUrl: string): string {
    const clean = registryUrl.replace(/\/$/, '');
    const hasScheme = /^https?:\/\//.test(clean);
    const withScheme = hasScheme ? clean : `https://${clean}`;
    return new URL(withScheme).pathname.replace(/^\//, '');
  }

  async listRepos(
    registry: OciRegistryConfig,
  ): Promise<string[]> {
    const cacheKey = `repos:${registry.url}`;
    const cached = this.getCached<string[]>(cacheKey);
    if (cached) return cached;

    const clean = registry.url.replace(/\/$/, '');
    const hasScheme = /^https?:\/\//.test(clean);
    const withScheme = hasScheme ? clean : `https://${clean}`;
    const parsed = new URL(withScheme);
    const catalogUrl = `${parsed.origin}/v2/_catalog`;

    try {
      const headers: Record<string, string> = {
        Accept: 'application/json',
        ...this.authHeader(registry),
      };
      const res = await fetch(catalogUrl, { headers });
      if (!res.ok) {
        this.logger.warn(`Catalog listing failed (${res.status}), falling back to direct tag listing`);
        return [];
      }
      const data = (await res.json()) as { repositories: string[] };
      const ns = this.registryNamespace(registry.url);
      const repos = ns
        ? (data.repositories || [])
            .filter(r => r.startsWith(`${ns}/`))
            .map(r => r.slice(ns.length + 1))
        : data.repositories || [];

      this.setCache(cacheKey, repos);
      return repos;
    } catch (err) {
      this.logger.warn(`Error listing catalog: ${(err as Error).message}`);
      return [];
    }
  }

  async listSkills(registryUrl?: string): Promise<Skill[]> {
    const cacheKey = `skills:${registryUrl || 'all'}`;
    const cached = this.getCached<Skill[]>(cacheKey);
    if (cached) return cached;

    const registries = registryUrl
      ? this.config.registries.filter(r => r.url === registryUrl)
      : this.config.registries;

    const allSkills: Skill[] = [];

    for (const registry of registries) {
      try {
        const repos = await this.listRepos(registry);

        if (repos.length > 0) {
          for (const repo of repos) {
            const tags = await this.listTags(registry, repo);
            for (const tag of tags) {
              const repoRegistry = { ...registry, url: `${registry.url}/${repo}` };
              const manifest = await this.getManifest(repoRegistry, tag);
              if (!manifest) continue;

              const card = await this.extractSkillCard(repoRegistry, manifest);
              const skill = this.skillFromManifest(repoRegistry, tag, manifest, card);
              skill.ociReference = `${registry.url}/${repo}:${tag}`;
              allSkills.push(skill);
            }
          }
        } else {
          const tags = await this.listTags(registry);
          for (const tag of tags) {
            const manifest = await this.getManifest(registry, tag);
            if (!manifest) continue;
            const card = await this.extractSkillCard(registry, manifest);
            allSkills.push(this.skillFromManifest(registry, tag, manifest, card));
          }
        }
      } catch (err) {
        this.logger.warn(
          `Error scanning registry ${registry.url}: ${(err as Error).message}`,
        );
      }
    }

    this.setCache(cacheKey, allSkills);
    return allSkills;
  }

  async getSkill(ociRef: string): Promise<Skill | null> {
    const [registryUrl, tag] = this.parseOciRef(ociRef);
    const registry = this.config.registries.find(
      r => r.url === registryUrl,
    );
    if (!registry) return null;

    const manifest = await this.getManifest(registry, tag);
    if (!manifest) return null;

    const card = await this.extractSkillCard(registry, manifest);
    return this.skillFromManifest(registry, tag, manifest, card);
  }

  async getSkillContent(ociRef: string): Promise<string | null> {
    const [registryUrl, tag] = this.parseOciRef(ociRef);
    const registry = this.config.registries.find(
      r => r.url === registryUrl,
    );
    if (!registry) return null;

    const manifest = await this.getManifest(registry, tag);
    if (!manifest) return null;

    const mdLayer = manifest.layers.find(
      l =>
        l.annotations?.[ANNOTATION_TITLE] === 'SKILL.md' ||
        l.mediaType === CONTENT_MEDIA_TYPE,
    );
    if (!mdLayer) return null;

    const blob = await this.getBlob(registry, mdLayer.digest);
    return blob?.toString('utf-8') || null;
  }

  async searchSkills(query: string): Promise<Skill[]> {
    const all = await this.listSkills();
    const q = query.toLowerCase();
    return all.filter(
      s =>
        s.card.metadata.name.toLowerCase().includes(q) ||
        s.card.metadata.description.toLowerCase().includes(q) ||
        s.card.metadata.author.toLowerCase().includes(q) ||
        (s.card.spec.tools?.required || []).some(t =>
          t.toLowerCase().includes(q),
        ),
    );
  }

  getRegistries(): OciRegistryConfig[] {
    return this.config.registries;
  }

  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Dynamically register a new OCI repo so it's included in future listSkills() calls
   * without requiring a server restart.
   */
  addRegistry(registry: OciRegistryConfig): void {
    if (!this.config.registries.some(r => r.url === registry.url)) {
      this.config.registries.push(registry);
    }
  }

  /**
   * Push a skill to an OCI registry using the OCI Distribution Spec.
   * Uploads skill.yaml (SkillCard) and SKILL.md (content) as separate layers,
   * then pushes a manifest referencing both.
   *
   * @param baseRegistry - The base registry config (e.g. .../team1)
   * @param skillCard - The SkillCard metadata object
   * @param skillContent - The SKILL.md content string
   * @param tag - OCI tag (defaults to the skill version or 'latest')
   * @returns The full OCI reference string (e.g. registry.example.com/team1/skill-foo:0.1.0)
   */
  async pushSkill(
    baseRegistry: OciRegistryConfig,
    skillCard: SkillCard,
    skillContent: string,
    tag?: string,
  ): Promise<string> {
    const skillName = skillCard.metadata.name;
    const resolvedTag = tag || skillCard.metadata.version || 'latest';

    const repoName = skillName.startsWith('skill-') ? skillName : `skill-${skillName}`;
    const repoRegistry: OciRegistryConfig = {
      ...baseRegistry,
      url: `${baseRegistry.url.replace(/\/$/, '')}/${repoName}`,
      name: repoName,
    };

    this.logger.info(
      `Pushing skill ${skillName} to ${repoRegistry.url}:${resolvedTag}`,
    );

    const cardYaml = yaml.dump(skillCard);
    const cardBuf = Buffer.from(cardYaml, 'utf-8');
    const contentBuf = Buffer.from(skillContent, 'utf-8');

    const cardDigest = this.sha256Digest(cardBuf);
    const contentDigest = this.sha256Digest(contentBuf);

    await this.uploadBlob(repoRegistry, cardBuf, cardDigest);
    await this.uploadBlob(repoRegistry, contentBuf, contentDigest);

    const emptyConfig = Buffer.from('{}', 'utf-8');
    const configDigest = this.sha256Digest(emptyConfig);
    await this.uploadBlob(repoRegistry, emptyConfig, configDigest);

    const manifest: OciManifest = {
      schemaVersion: 2,
      mediaType: 'application/vnd.oci.image.manifest.v1+json',
      artifactType: 'application/vnd.agentskills.skill.v1',
      config: {
        mediaType: 'application/vnd.oci.empty.v1+json',
        digest: configDigest,
        size: emptyConfig.length,
      },
      layers: [
        {
          mediaType: CARD_MEDIA_TYPE,
          digest: cardDigest,
          size: cardBuf.length,
          annotations: {
            [ANNOTATION_TITLE]: 'skill.yaml',
          },
        },
        {
          mediaType: CONTENT_MEDIA_TYPE,
          digest: contentDigest,
          size: contentBuf.length,
          annotations: {
            [ANNOTATION_TITLE]: 'SKILL.md',
          },
        },
      ],
      annotations: {
        [ANNOTATION_SKILL_NAME]: skillName,
        [ANNOTATION_VERSION]: skillCard.metadata.version || resolvedTag,
        [ANNOTATION_DESCRIPTION]: skillCard.metadata.description || '',
        [ANNOTATION_CREATED]: new Date().toISOString(),
        ...(skillCard.metadata.license
          ? { [ANNOTATION_LICENSES]: skillCard.metadata.license }
          : {}),
        ...(skillCard.spec.tools?.required
          ? { [ANNOTATION_TOOLS_REQUIRED]: skillCard.spec.tools.required.join(',') }
          : {}),
      },
    };

    await this.putManifest(repoRegistry, resolvedTag, manifest);

    const ociReference = `${repoRegistry.url}:${resolvedTag}`;
    this.logger.info(`Successfully pushed skill to ${ociReference}`);

    this.addRegistry({
      url: repoRegistry.url,
      name: repoName,
      auth: baseRegistry.auth,
    });
    this.clearCache();

    return ociReference;
  }

  private sha256Digest(data: Buffer): string {
    const hash = createHash('sha256').update(data).digest('hex');
    return `sha256:${hash}`;
  }

  private async uploadBlob(
    registry: OciRegistryConfig,
    data: Buffer,
    digest: string,
  ): Promise<void> {
    const existsUrl = this.buildRegistryUrl(
      registry.url,
      `/blobs/${digest}`,
    );
    const headRes = await fetch(existsUrl, {
      method: 'HEAD',
      headers: { ...this.authHeader(registry) },
    });
    if (headRes.ok) {
      this.logger.debug(`Blob ${digest} already exists, skipping upload`);
      return;
    }

    const uploadUrl = this.buildRegistryUrl(
      registry.url,
      '/blobs/uploads/',
    );

    this.logger.debug(`Initiating blob upload to ${uploadUrl}`);
    const initRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Length': '0',
        ...this.authHeader(registry),
      },
    });

    if (!initRes.ok && initRes.status !== 202) {
      const body = await initRes.text();
      throw new Error(
        `Failed to initiate blob upload (${initRes.status}): ${body}`,
      );
    }

    let putUrl = initRes.headers.get('location');
    if (!putUrl) {
      throw new Error('No Location header in blob upload response');
    }

    if (putUrl.startsWith('/')) {
      const parsed = new URL(this.buildRegistryUrl(registry.url, ''));
      putUrl = `${parsed.origin}${putUrl}`;
    }

    const separator = putUrl.includes('?') ? '&' : '?';
    const finalUrl = `${putUrl}${separator}digest=${encodeURIComponent(digest)}`;

    this.logger.debug(`Uploading blob ${digest} (${data.length} bytes)`);
    const putRes = await fetch(finalUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(data.length),
        ...this.authHeader(registry),
      },
      body: data,
    });

    if (!putRes.ok && putRes.status !== 201) {
      const body = await putRes.text();
      throw new Error(
        `Failed to upload blob ${digest} (${putRes.status}): ${body}`,
      );
    }
  }

  private async putManifest(
    registry: OciRegistryConfig,
    tag: string,
    manifest: OciManifest,
  ): Promise<void> {
    const url = this.buildRegistryUrl(
      registry.url,
      `/manifests/${tag}`,
    );

    const body = JSON.stringify(manifest);
    this.logger.debug(`Pushing manifest to ${url}`);

    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/vnd.oci.image.manifest.v1+json',
        'Content-Length': String(Buffer.byteLength(body)),
        ...this.authHeader(registry),
      },
      body,
    });

    if (!res.ok && res.status !== 201) {
      const text = await res.text();
      throw new Error(
        `Failed to push manifest (${res.status}): ${text}`,
      );
    }
  }

  private parseOciRef(ref: string): [string, string] {
    const lastColon = ref.lastIndexOf(':');
    if (lastColon === -1) return [ref, 'latest'];
    return [ref.substring(0, lastColon), ref.substring(lastColon + 1)];
  }
}
