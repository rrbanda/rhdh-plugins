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
import { gzipSync, gunzipSync } from 'zlib';
import fetch from 'node-fetch';
import { LoggerService } from '@backstage/backend-plugin-api';
import yaml from 'js-yaml';
import type {
  Skill,
  SkillCard,
  OciAnnotations,
  OciRegistryConfig,
  LifecycleState,
  Author,
} from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import { validateSkillCard, validateTypedSkillCard } from './SkillCardValidator';

const ANNOTATION_TITLE = 'org.opencontainers.image.title';
const ANNOTATION_VERSION = 'org.opencontainers.image.version';
const ANNOTATION_DESCRIPTION = 'org.opencontainers.image.description';
const ANNOTATION_LICENSES = 'org.opencontainers.image.licenses';
const ANNOTATION_CREATED = 'org.opencontainers.image.created';
const ANNOTATION_AUTHORS = 'org.opencontainers.image.authors';
const ANNOTATION_VENDOR = 'org.opencontainers.image.vendor';
const ANNOTATION_SOURCE = 'org.opencontainers.image.source';
const ANNOTATION_REVISION = 'org.opencontainers.image.revision';
const ANNOTATION_LIFECYCLE_STATUS = 'io.skillimage.status';

const IMAGE_LAYER_MEDIA_TYPE = 'application/vnd.oci.image.layer.v1.tar+gzip';

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
  requestTimeoutMs?: number;
  maxCacheEntries?: number;
}

const OCI_DEFAULT_TIMEOUT_MS = 30_000;
const OCI_DEFAULT_MAX_CACHE = 1000;

export class OciRegistryService {
  private readonly config: OciRegistryServiceConfig;
  private readonly logger: LoggerService;
  private readonly cache = new Map<string, CacheEntry<unknown>>();
  private readonly maxCacheEntries: number;
  private readonly requestTimeoutMs: number;

  constructor(config: OciRegistryServiceConfig, logger: LoggerService) {
    this.config = config;
    this.logger = logger;
    this.maxCacheEntries = config.maxCacheEntries ?? OCI_DEFAULT_MAX_CACHE;
    this.requestTimeoutMs = config.requestTimeoutMs ?? OCI_DEFAULT_TIMEOUT_MS;
  }

  private createSignal(): AbortSignal {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), this.requestTimeoutMs);
    return controller.signal;
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
    if (this.cache.size >= this.maxCacheEntries) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + this.config.cacheTimeout * 1000,
    });
  }

  /**
   * Extract the next page URL from the OCI Distribution Spec `Link` header.
   * Format: `</v2/_catalog?last=xyz&n=100>; rel="next"`
   */
  private parseNextLink(linkHeader: string | null, origin: string): string | null {
    if (!linkHeader) return null;
    const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    if (!match) return null;
    const href = match[1];
    if (href.startsWith('http')) {
      if (new URL(href).origin !== origin) {
        this.logger.warn(`Rejecting cross-origin Link header: ${href}`);
        return null;
      }
      return href;
    }
    return `${origin}${href}`;
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
    const firstUrl = this.buildRegistryUrl(
      registry.url,
      `${repoPath}/tags/list`,
    );
    const origin = new URL(firstUrl).origin;

    try {
      const headers: Record<string, string> = {
        Accept: 'application/json',
        ...this.authHeader(registry),
      };

      const allTags: string[] = [];
      let nextUrl: string | null = firstUrl;

      while (nextUrl) {
        const res = await fetch(nextUrl, { headers, signal: this.createSignal() });
        if (!res.ok) {
          if (allTags.length === 0) {
            this.logger.warn(
              `Failed to list tags from ${nextUrl}: ${res.status}`,
            );
            return [];
          }
          break;
        }
        const data = (await res.json()) as OciTagList;
        allTags.push(...(data.tags || []));
        nextUrl = this.parseNextLink(res.headers.get('link'), origin);
      }

      this.setCache(cacheKey, allTags);
      return allTags;
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
      const res = await fetch(url, { headers, signal: this.createSignal() });
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

  private static readonly MAX_BLOB_SIZE = 10 * 1024 * 1024; // 10 MB

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
      const res = await fetch(url, { headers, signal: this.createSignal() });
      if (!res.ok) return null;

      const contentLength = parseInt(res.headers.get('content-length') || '0', 10);
      if (contentLength > OciRegistryService.MAX_BLOB_SIZE) {
        this.logger.warn(`Blob ${digest} too large (${contentLength} bytes), skipping`);
        return null;
      }

      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > OciRegistryService.MAX_BLOB_SIZE) {
        this.logger.warn(`Blob ${digest} exceeds size limit (${buf.length} bytes)`);
        return null;
      }
      return buf;
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
      title: ann[ANNOTATION_TITLE],
      description: ann[ANNOTATION_DESCRIPTION],
      licenses: ann[ANNOTATION_LICENSES],
      authors: ann[ANNOTATION_AUTHORS],
      vendor: ann[ANNOTATION_VENDOR],
      source: ann[ANNOTATION_SOURCE],
      revision: ann[ANNOTATION_REVISION],
      lifecycleStatus: ann[ANNOTATION_LIFECYCLE_STATUS],
    };
  }

  async extractSkillCard(
    registry: OciRegistryConfig,
    manifest: OciManifest,
  ): Promise<SkillCard | null> {
    const tarLayer = manifest.layers.find(
      l => l.mediaType === IMAGE_LAYER_MEDIA_TYPE,
    );
    if (!tarLayer) return null;

    const blob = await this.getBlob(registry, tarLayer.digest);
    if (!blob) return null;

    try {
      const cardContent = this.extractFileFromTarGzip(blob, 'skill.yaml');
      if (!cardContent) return null;
      const raw = yaml.load(cardContent) as Record<string, unknown>;

      const result = validateSkillCard(raw);
      if (!result.valid) {
        this.logger.warn(
          `skill.yaml failed schema validation: ${result.errors?.join('; ')}`,
        );
        return null;
      }

      return this.parseSkillCard(raw);
    } catch (err) {
      this.logger.warn(
        `Failed to extract skill.yaml from tar+gzip layer: ${(err as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Parse a raw YAML object into a typed SkillCard (skillimage.io/v1alpha1).
   */
  private parseSkillCard(raw: Record<string, unknown>): SkillCard {
    const meta = (raw.metadata || {}) as Record<string, unknown>;
    const spec = (raw.spec || {}) as Record<string, unknown>;

    const card: SkillCard = {
      apiVersion: (raw.apiVersion as string) || 'skillimage.io/v1alpha1',
      kind: (raw.kind as string) || 'SkillCard',
      metadata: {
        name: (meta.name as string) || '',
        namespace: (meta.namespace as string) || 'default',
        version: (meta.version as string) || '0.0.0',
        description: (meta.description as string) || '',
        'display-name': (meta['display-name'] as string) || undefined,
        license: (meta.license as string) || undefined,
        compatibility: (meta.compatibility as string) || undefined,
        tags: Array.isArray(meta.tags) ? (meta.tags as string[]) : undefined,
        authors: Array.isArray(meta.authors)
          ? (meta.authors as Author[])
          : undefined,
        'allowed-tools': typeof meta['allowed-tools'] === 'string'
          ? (meta['allowed-tools'] as string)
          : undefined,
      },
    };

    if (raw.provenance && typeof raw.provenance === 'object') {
      const prov = raw.provenance as Record<string, unknown>;
      card.provenance = {
        source: prov.source as string | undefined,
        commit: prov.commit as string | undefined,
        path: prov.path as string | undefined,
      };
    }

    const dependencies = Array.isArray(spec.dependencies)
      ? (spec.dependencies as Array<{ name: string; version: string }>)
      : undefined;

    if (spec.prompt || spec.examples || dependencies) {
      card.spec = {
        prompt: spec.prompt as string | undefined,
        examples: Array.isArray(spec.examples)
          ? (spec.examples as Array<{ input?: string; output?: string }>)
          : undefined,
        dependencies,
      };
    }

    return card;
  }

  skillFromManifest(
    registry: OciRegistryConfig,
    tag: string,
    manifest: OciManifest,
    card: SkillCard | null,
  ): Skill {
    const annotations = this.extractAnnotations(manifest);
    const ociReference = `${registry.url}:${tag}`;
    const lifecycleState = annotations.lifecycleStatus as LifecycleState | undefined;

    if (card) {
      return {
        card,
        ociReference,
        ociAnnotations: annotations,
        registryName: registry.name,
        tags: [tag],
        lifecycleState,
      };
    }

    return {
      card: {
        apiVersion: 'skillimage.io/v1alpha1',
        kind: 'SkillCard',
        metadata: {
          name: annotations.title || tag,
          namespace: annotations.vendor || 'default',
          version: annotations.version || tag,
          description: annotations.description || '',
          authors: annotations.authors
            ? annotations.authors.split(',').map(a => ({ name: a.trim() }))
            : undefined,
        },
      },
      ociReference,
      ociAnnotations: annotations,
      registryName: registry.name,
      tags: [tag],
      lifecycleState,
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

    try {
      const headers: Record<string, string> = {
        Accept: 'application/json',
        ...this.authHeader(registry),
      };

      const allRepositories: string[] = [];
      let nextUrl: string | null = `${parsed.origin}/v2/_catalog`;

      while (nextUrl) {
        const res = await fetch(nextUrl, { headers, signal: this.createSignal() });
        if (!res.ok) {
          if (allRepositories.length === 0) {
            this.logger.warn(`Catalog listing failed (${res.status}), falling back to direct tag listing`);
            break;
          }
          break;
        }
        const data = (await res.json()) as { repositories: string[] };
        allRepositories.push(...(data.repositories || []));
        nextUrl = this.parseNextLink(res.headers.get('link'), parsed.origin);
      }

      const ns = this.registryNamespace(registry.url);
      const stripped = ns
        ? allRepositories
            .filter(r => r.startsWith(`${ns}/`))
            .map(r => r.slice(ns.length + 1))
        : allRepositories;

      let repos = stripped.filter(r => r.startsWith('skill-'));

      if (repos.length === 0 && ns) {
        repos = await this.probeSkillRepos(registry, ns, headers);
      }

      if (repos.length > 0) {
        this.setCache(cacheKey, repos);
      }
      return repos;
    } catch (err) {
      this.logger.warn(`Error listing catalog: ${(err as Error).message}`);
      return [];
    }
  }

  /**
   * When _catalog returns empty (e.g. OpenShift internal registry with
   * restricted permissions), try discovering skill repos via the Kubernetes
   * ImageStream API. Falls back to returning empty if not running in-cluster.
   */
  private async probeSkillRepos(
    _registry: OciRegistryConfig,
    namespace: string,
    _ociHeaders: Record<string, string>,
  ): Promise<string[]> {
    try {
      const k8sHost = process.env.KUBERNETES_SERVICE_HOST;
      const k8sPort = process.env.KUBERNETES_SERVICE_PORT || '443';
      if (!k8sHost) {
        this.logger.info('Not running in-cluster, skipping ImageStream probe');
        return [];
      }

      let token: string | undefined;
      try {
        const fs = await import('fs');
        token = fs.readFileSync('/var/run/secrets/kubernetes.io/serviceaccount/token', 'utf-8').trim();
      } catch {
        this.logger.warn('Cannot read in-cluster SA token for ImageStream probe');
        return [];
      }

      const apiUrl = `https://${k8sHost}:${k8sPort}/apis/image.openshift.io/v1/namespaces/${namespace}/imagestreams`;
      this.logger.info(`Probing OpenShift ImageStreams in namespace ${namespace}`);

      const res = await fetch(apiUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
        signal: this.createSignal(),
        // @ts-ignore - Node fetch TLS option
        ...(process.env.NODE_EXTRA_CA_CERTS ? {} : { }),
      });

      if (!res.ok) {
        this.logger.warn(`ImageStream probe failed (${res.status}), will use direct tag listing`);
        return [];
      }

      const data = (await res.json()) as {
        items?: Array<{ metadata: { name: string } }>;
      };

      const repos = (data.items || [])
        .map(item => item.metadata.name)
        .filter(name => name.startsWith('skill-'));

      this.logger.info(`ImageStream probe found ${repos.length} skill repos in ${namespace}`);
      return repos;
    } catch (err) {
      this.logger.warn(`ImageStream probe error: ${(err as Error).message}`);
      return [];
    }
  }

  private async runParallel<T, R>(
    items: T[],
    fn: (item: T) => Promise<R | null>,
    concurrency = 25,
  ): Promise<R[]> {
    const results: R[] = [];
    let idx = 0;

    async function worker() {
      while (idx < items.length) {
        const i = idx++;
        const result = await fn(items[i]);
        if (result !== null) results.push(result);
      }
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
    return results;
  }

  private async fetchSkillFromRepo(
    registry: OciRegistryConfig,
    repo: string,
  ): Promise<Skill[]> {
    const skills: Skill[] = [];
    try {
      const repoRegistry = { ...registry, url: `${registry.url}/${repo}` };
      const tags = await this.listTags(registry, repo);
      for (const tag of tags) {
        const manifest = await this.getManifest(repoRegistry, tag);
        if (!manifest) continue;
        const card = await this.extractSkillCard(repoRegistry, manifest);
        const skill = this.skillFromManifest(repoRegistry, tag, manifest, card);
        skill.ociReference = `${registry.url}/${repo}:${tag}`;
        skills.push(skill);
      }
    } catch (err) {
      this.logger.warn(`Error fetching repo ${repo}: ${(err as Error).message}`);
    }
    return skills;
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
          this.logger.info(`Scanning ${repos.length} repos in ${registry.name} (parallel, concurrency=25)`);
          const batchResults = await this.runParallel(
            repos,
            repo => this.fetchSkillFromRepo(registry, repo).then(s => s.length > 0 ? s : null),
            25,
          );
          for (const batch of batchResults) allSkills.push(...batch);
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

    this.logger.info(`Listed ${allSkills.length} skills from ${registries.length} registries`);
    this.setCache(cacheKey, allSkills);
    return allSkills;
  }

  /**
   * Resolve a registry config for a given URL. Tries exact match first,
   * then falls back to prefix match for namespace-based discovery where the
   * ociRef URL extends beyond the configured base URL.
   */
  private resolveRegistry(url: string): OciRegistryConfig | undefined {
    return (
      this.config.registries.find(r => r.url === url) ||
      this.config.registries.find(r => url.startsWith(`${r.url}/`))
    );
  }

  async getSkill(ociRef: string): Promise<Skill | null> {
    const [registryUrl, tag] = this.parseOciRef(ociRef);
    const registry = this.resolveRegistry(registryUrl);
    if (!registry) return null;

    const refRegistry = registry.url === registryUrl
      ? registry
      : { ...registry, url: registryUrl };

    const manifest = await this.getManifest(refRegistry, tag);
    if (!manifest) return null;

    const card = await this.extractSkillCard(refRegistry, manifest);
    return this.skillFromManifest(refRegistry, tag, manifest, card);
  }

  async getSkillContent(ociRef: string): Promise<string | null> {
    const [registryUrl, tag] = this.parseOciRef(ociRef);
    const registry = this.resolveRegistry(registryUrl);
    if (!registry) return null;

    const refRegistry = registry.url === registryUrl
      ? registry
      : { ...registry, url: registryUrl };

    const manifest = await this.getManifest(refRegistry, tag);
    if (!manifest) return null;

    const tarLayer = manifest.layers.find(
      l => l.mediaType === IMAGE_LAYER_MEDIA_TYPE,
    );
    if (!tarLayer) return null;

    const blob = await this.getBlob(refRegistry, tarLayer.digest);
    if (!blob) return null;

    try {
      return this.extractFileFromTarGzip(blob, 'SKILL.md');
    } catch {
      return null;
    }
  }

  async searchSkills(query: string): Promise<Skill[]> {
    const all = await this.listSkills();
    const q = query.toLowerCase();
    return all.filter(s => {
      const m = s.card.metadata;
      if (m.name.toLowerCase().includes(q)) return true;
      if (m.description.toLowerCase().includes(q)) return true;
      if (m.authors?.some(a => a.name.toLowerCase().includes(q))) return true;
      const tools = m['allowed-tools'] || '';
      if (tools.toLowerCase().includes(q)) return true;
      if (m.tags?.some(t => t.toLowerCase().includes(q))) return true;
      return false;
    });
  }

  getRegistries(): OciRegistryConfig[] {
    return this.config.registries;
  }

  clearCache(registryUrl?: string): void {
    if (!registryUrl) {
      this.cache.clear();
      return;
    }
    for (const key of this.cache.keys()) {
      if (key.includes(registryUrl) || key.startsWith('skills:')) {
        this.cache.delete(key);
      }
    }
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
   * Produces an upstream-compatible OCI image with a single tar+gzip layer
   * containing skill.yaml + SKILL.md, standard OCI annotations, and
   * io.skillimage.status lifecycle annotation.
   */
  async pushSkill(
    baseRegistry: OciRegistryConfig,
    skillCard: SkillCard,
    skillContent: string,
    tag?: string,
    lifecycleState?: LifecycleState,
  ): Promise<string> {
    const validation = validateTypedSkillCard(skillCard);
    if (!validation.valid) {
      throw new Error(
        `SkillCard failed schema validation: ${validation.errors?.join('; ')}`,
      );
    }

    const skillName = skillCard.metadata.name;
    const state = lifecycleState || 'draft';
    const resolvedTag = tag || `${skillCard.metadata.version || '0.1.0'}-${state}`;

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

    const { compressed: tarLayer, uncompressedDigest } =
      this.buildTarGzipLayer(cardBuf, contentBuf);
    const layerDigest = this.sha256Digest(tarLayer);

    await this.uploadBlob(repoRegistry, tarLayer, layerDigest);

    const imageConfig = JSON.stringify({
      architecture: 'amd64',
      os: 'linux',
      rootfs: {
        type: 'layers',
        diff_ids: [uncompressedDigest],
      },
    });
    const configBuf = Buffer.from(imageConfig, 'utf-8');
    const configDigest = this.sha256Digest(configBuf);
    await this.uploadBlob(repoRegistry, configBuf, configDigest);

    const m = skillCard.metadata;
    const authorsStr = m.authors
      ?.map(a => (a.email ? `${a.name} <${a.email}>` : a.name))
      .join(', ');

    const annotations: Record<string, string> = {
      [ANNOTATION_TITLE]: m['display-name'] || m.name,
      [ANNOTATION_VERSION]: m.version || resolvedTag,
      [ANNOTATION_DESCRIPTION]: (m.description || '').slice(0, 256),
      [ANNOTATION_CREATED]: new Date().toISOString(),
      [ANNOTATION_LIFECYCLE_STATUS]: state,
    };
    if (m.license) annotations[ANNOTATION_LICENSES] = m.license;
    if (authorsStr) annotations[ANNOTATION_AUTHORS] = authorsStr;
    if (m.namespace) annotations[ANNOTATION_VENDOR] = m.namespace;
    if (skillCard.provenance?.source) {
      annotations[ANNOTATION_SOURCE] = skillCard.provenance.source;
    }
    if (skillCard.provenance?.commit) {
      annotations[ANNOTATION_REVISION] = skillCard.provenance.commit;
    }

    const manifest: OciManifest = {
      schemaVersion: 2,
      mediaType: 'application/vnd.oci.image.manifest.v1+json',
      config: {
        mediaType: 'application/vnd.oci.image.config.v1+json',
        digest: configDigest,
        size: configBuf.length,
      },
      layers: [
        {
          mediaType: IMAGE_LAYER_MEDIA_TYPE,
          digest: layerDigest,
          size: tarLayer.length,
        },
      ],
      annotations,
    };

    await this.putManifest(repoRegistry, resolvedTag, manifest);

    const ociReference = `${repoRegistry.url}:${resolvedTag}`;
    this.logger.info(`Successfully pushed skill to ${ociReference}`);

    this.addRegistry({
      url: repoRegistry.url,
      name: repoName,
      auth: baseRegistry.auth,
    });
    this.clearCache(baseRegistry.url);

    return ociReference;
  }

  /**
   * Extract a named file from a gzipped tar archive.
   * Returns the file content as a string, or null if not found.
   */
  private extractFileFromTarGzip(
    gzippedTar: Buffer,
    filename: string,
  ): string | null {
    const tar = gunzipSync(gzippedTar);
    let offset = 0;
    while (offset + 512 <= tar.length) {
      const header = tar.subarray(offset, offset + 512);
      if (header.every(b => b === 0)) break;

      const nameEnd = header.indexOf(0, 0);
      const name = header.subarray(0, Math.min(nameEnd, 100)).toString('utf-8');
      const sizeStr = header.subarray(124, 135).toString('utf-8').trim();
      const size = parseInt(sizeStr, 8) || 0;

      offset += 512;
      if (name === filename || name === `./${filename}`) {
        return tar.subarray(offset, offset + size).toString('utf-8');
      }
      offset += Math.ceil(size / 512) * 512;
    }
    return null;
  }

  /**
   * Build a minimal tar archive containing skill.yaml + SKILL.md,
   * then gzip it. Returns { compressed, uncompressedDigest } so the
   * caller can set rootfs.diff_ids correctly per the OCI image spec.
   */
  private buildTarGzipLayer(
    cardBuf: Buffer,
    contentBuf: Buffer,
  ): { compressed: Buffer; uncompressedDigest: string } {
    const entries: Array<{ name: string; data: Buffer }> = [
      { name: 'skill.yaml', data: cardBuf },
      { name: 'SKILL.md', data: contentBuf },
    ];

    const blocks: Buffer[] = [];
    for (const entry of entries) {
      const header = Buffer.alloc(512);
      const nameBytes = Buffer.from(entry.name, 'utf-8');
      nameBytes.copy(header, 0, 0, Math.min(nameBytes.length, 100));
      Buffer.from('0000644\0', 'utf-8').copy(header, 100); // mode
      Buffer.from('0000000\0', 'utf-8').copy(header, 108); // uid
      Buffer.from('0000000\0', 'utf-8').copy(header, 116); // gid
      const sizeOctal = entry.data.length.toString(8).padStart(11, '0');
      Buffer.from(`${sizeOctal}\0`, 'utf-8').copy(header, 124); // size
      const mtime = Math.floor(Date.now() / 1000).toString(8).padStart(11, '0');
      Buffer.from(`${mtime}\0`, 'utf-8').copy(header, 136); // mtime
      Buffer.from('        ', 'utf-8').copy(header, 148); // checksum placeholder
      header[156] = 48; // '0' = regular file

      let checksum = 0;
      for (let i = 0; i < 512; i++) checksum += header[i];
      const checksumStr = checksum.toString(8).padStart(6, '0');
      Buffer.from(`${checksumStr}\0 `, 'utf-8').copy(header, 148);

      blocks.push(header);
      blocks.push(entry.data);
      const padding = 512 - (entry.data.length % 512);
      if (padding < 512) blocks.push(Buffer.alloc(padding));
    }
    blocks.push(Buffer.alloc(1024)); // end-of-archive

    const uncompressed = Buffer.concat(blocks);
    const uncompressedDigest = this.sha256Digest(uncompressed);
    return { compressed: gzipSync(uncompressed), uncompressedDigest };
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
      signal: this.createSignal(),
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
      signal: this.createSignal(),
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

    const registryOrigin = new URL(this.buildRegistryUrl(registry.url, '')).origin;
    if (putUrl.startsWith('/')) {
      putUrl = `${registryOrigin}${putUrl}`;
    } else if (putUrl.startsWith('http') && new URL(putUrl).origin !== registryOrigin) {
      throw new Error(
        `Rejecting cross-origin Location redirect from registry: ${new URL(putUrl).origin}`,
      );
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
      signal: this.createSignal(),
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
      signal: this.createSignal(),
    });

    if (!res.ok && res.status !== 201) {
      const text = await res.text();
      throw new Error(
        `Failed to push manifest (${res.status}): ${text}`,
      );
    }
  }

  private parseOciRef(ref: string): [string, string] {
    const lastSlash = ref.lastIndexOf('/');
    const afterLastSlash = lastSlash === -1 ? ref : ref.substring(lastSlash);
    const colonInSegment = afterLastSlash.lastIndexOf(':');
    if (colonInSegment === -1) return [ref, 'latest'];
    const splitAt = lastSlash === -1 ? colonInSegment : lastSlash + colonInSegment;
    return [ref.substring(0, splitAt), ref.substring(splitAt + 1)];
  }
}
