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
import type { Skill } from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import {
  getComplexity,
  getPluginColor,
} from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import type {
  GraphSyncResult,
  SkillGraphSyncStatus,
} from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import type { Neo4jService } from './Neo4jService';
import type { OciRegistryService } from './OciRegistryService';
import type { KagentiService } from './KagentiService';
import { EmbeddingService } from './EmbeddingService';
import { GraphSchemaManager } from './GraphSchemaManager';
import { parseRelatedSkills } from './RelatedSkillsParser';
import type { CypherQueryCatalog } from './CypherQueryCatalog';
import {
  categoriesOf,
  normalizeName,
  computeSkillCompleteness,
  computeAgentCompleteness,
  computeCapabilityCompleteness,
  contentHash,
} from './graphUtils';
import type { DomainTaxonomyEntry, CategoryAssignment } from './graphUtils';

export class SyncAbortedError extends Error {
  constructor() {
    super('Graph sync aborted');
    this.name = 'SyncAbortedError';
  }
}

export type { DomainTaxonomyEntry, CategoryAssignment };
export {
  categoriesOf,
  normalizeName,
  computeSkillCompleteness,
  computeAgentCompleteness,
  computeCapabilityCompleteness,
  contentHash,
};

export interface ToolMetadataEntry {
  description?: string;
  docsUrl?: string;
  version?: string;
  deprecated?: boolean;
}

export interface GraphSyncConfig {
  embeddingApiUrl?: string;
  embeddingModel?: string;
  embeddingApiKey?: string;
  embeddingDimensions?: number;
  embeddingTimeoutMs?: number;
  similarityThreshold?: number;
  categoryKeywords?: Record<string, string[]>;
  similarityTopK?: number;
  toolMetadata?: Record<string, ToolMetadataEntry>;
  domainTaxonomy?: Record<string, DomainTaxonomyEntry>;
  matchThreshold?: number;
  semanticThreshold?: number;
  syncEventRetention?: number;
}

const DEFAULT_CATEGORY_KEYWORDS: [string, string[]][] = [
  ['human-resources', ['resume', 'hr', 'candidate', 'hiring', 'recruit']],
  [
    'operations',
    ['checklist', 'audit', 'compliance', 'ops', 'process', 'policy'],
  ],
  [
    'engineering',
    ['code', 'review', 'pull-request', 'pr-', 'lint', 'build', 'ci'],
  ],
  [
    'research',
    ['summary', 'pdf', 'url', 'research', 'fetch', 'web', 'document'],
  ],
  ['security', ['security', 'vulnerability', 'cve', 'audit', 'threat']],
  ['testing', ['test', 'coverage', 'assertion', 'mock', 'spec']],
  ['devops', ['docker', 'k8s', 'kubernetes', 'helm', 'terraform', 'deploy']],
  ['docs', ['markdown', 'documentation', 'readme', 'changelog']],
  ['api', ['openapi', 'swagger', 'rest', 'graphql', 'grpc']],
];

function buildCategoryKeywords(
  custom?: Record<string, string[]>,
): [string, string[]][] {
  if (!custom) return DEFAULT_CATEGORY_KEYWORDS;
  const merged = new Map(DEFAULT_CATEGORY_KEYWORDS);
  for (const [cat, kws] of Object.entries(custom)) {
    merged.set(cat, kws);
  }
  return Array.from(merged.entries());
}

const DEADLOCK_MAX_RETRIES = 3;

async function withDeadlockRetry<T>(
  fn: () => Promise<T>,
  maxRetries = DEADLOCK_MAX_RETRIES,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isDeadlock =
        msg.includes('DeadlockDetected') ||
        msg.includes('ForsetiClient') ||
        msg.includes('ExclusiveLock') ||
        msg.includes('TransientError');
      if (!isDeadlock || attempt >= maxRetries) throw err;
      await new Promise(r => setTimeout(r, 200 * 2 ** attempt));
    }
  }
}

const NEO4J_CONNECT_MAX_RETRIES = 3;
const SLOW_SYNC_WARN_MS = 30_000;

function isTransientNeo4jConnectionError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  return (
    lower.includes('serviceunavailable') ||
    lower.includes('service unavailable') ||
    lower.includes('sessionexpired') ||
    lower.includes('transienterror') ||
    lower.includes('econnrefused') ||
    lower.includes('etimedout') ||
    lower.includes('enotfound') ||
    lower.includes('econnreset') ||
    lower.includes('socket') ||
    lower.includes('connection') ||
    lower.includes('could not connect') ||
    lower.includes("can't connect") ||
    lower.includes('unable to connect') ||
    lower.includes('n/a') ||
    (lower.includes('neo4j') &&
      (lower.includes('unavailable') || lower.includes('failed')))
  );
}

async function withNeo4jConnectionRetry<T>(
  fn: () => Promise<T>,
  logger: import('@backstage/backend-plugin-api').LoggerService,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= NEO4J_CONNECT_MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (
        attempt < NEO4J_CONNECT_MAX_RETRIES &&
        isTransientNeo4jConnectionError(err)
      ) {
        const delayMs = 200 * 2 ** attempt;
        logger.warn(
          `Neo4j connection attempt ${attempt + 1} failed, retrying in ${delayMs}ms: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        await new Promise(r => setTimeout(r, delayMs));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

export type { SkillGraphSyncStatus } from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';

export class SkillGraphSyncService {
  private readonly logger: LoggerService;
  private readonly neo4j: Neo4jService;
  private readonly ociRegistry: OciRegistryService;
  private readonly kagenti?: KagentiService;
  private readonly embeddingService?: EmbeddingService;
  private readonly schemaManager: GraphSchemaManager;
  private readonly categoryKeywords: [string, string[]][];
  private readonly similarityThreshold: number;
  private readonly similarityTopK: number;
  private readonly qc?: CypherQueryCatalog;
  private readonly toolMetadata: Record<string, ToolMetadataEntry>;
  private readonly domainTaxonomy: Record<string, DomainTaxonomyEntry>;
  private readonly matchThreshold: number;
  private readonly semanticThreshold: number;
  private readonly syncEventRetention: number;
  private readonly syncIntervalMs: number;
  private isRunning = false;
  private syncPromise: Promise<GraphSyncResult> | null = null;
  private lastSyncAt: Date | null = null;
  private lastSyncDurationMs: number | null = null;
  private lastError: string | null = null;

  constructor(options: {
    logger: LoggerService;
    neo4j: Neo4jService;
    ociRegistry: OciRegistryService;
    kagenti?: KagentiService;
    config: GraphSyncConfig;
    embeddingService?: EmbeddingService;
    queryCatalog?: CypherQueryCatalog;
    /** If > 0, used to populate nextSyncAt in getStatus (periodic sync interval). */
    syncIntervalMs?: number;
  }) {
    this.logger = options.logger;
    this.neo4j = options.neo4j;
    this.ociRegistry = options.ociRegistry;
    this.kagenti = options.kagenti;
    this.similarityThreshold = options.config.similarityThreshold ?? 0.75;
    this.similarityTopK = options.config.similarityTopK ?? 10;
    this.categoryKeywords = buildCategoryKeywords(
      options.config.categoryKeywords,
    );
    this.toolMetadata = options.config.toolMetadata ?? {};
    this.domainTaxonomy = options.config.domainTaxonomy ?? {};
    this.matchThreshold = options.config.matchThreshold ?? 0.6;
    this.semanticThreshold = options.config.semanticThreshold ?? 0.6;
    this.syncEventRetention = options.config.syncEventRetention ?? 50;
    this.syncIntervalMs = options.syncIntervalMs ?? 0;
    this.qc = options.queryCatalog;

    this.schemaManager = new GraphSchemaManager({
      logger: options.logger,
      neo4j: options.neo4j,
      queryCatalog: options.queryCatalog,
    });

    if (options.embeddingService) {
      this.embeddingService = options.embeddingService;
    } else if (
      options.config.embeddingApiUrl &&
      options.config.embeddingApiKey
    ) {
      this.embeddingService = new EmbeddingService({
        logger: options.logger,
        apiUrl: options.config.embeddingApiUrl,
        apiKey: options.config.embeddingApiKey,
        model: options.config.embeddingModel,
        dimensions: options.config.embeddingDimensions,
        timeoutMs: options.config.embeddingTimeoutMs,
      });
    }
  }

  private sq(key: string): string {
    if (!this.qc)
      throw new Error(
        `SkillGraphSyncService: queryCatalog not available for key "${key}"`,
      );
    return this.qc.get(key);
  }

  async generateEmbedding(text: string): Promise<number[] | null> {
    return this.embeddingService?.generate(text) ?? null;
  }

  async waitForCompletion(): Promise<void> {
    if (this.syncPromise) {
      await this.syncPromise;
    }
  }

  private getHealthySessionForSync() {
    return withNeo4jConnectionRetry(
      () => this.neo4j.getHealthySession(),
      this.logger,
    );
  }

  /**
   * Live sync state for GET /sync/status. skillCount is best-effort (0 if Neo4j is unreachable).
   */
  async getStatus(): Promise<SkillGraphSyncStatus> {
    let skillCount = 0;
    let embeddingCoverage: { total: number; withEmbeddings: number } = {
      total: 0,
      withEmbeddings: 0,
    };
    try {
      skillCount = await withNeo4jConnectionRetry(
        () => this.neo4j.countSkillNodes(),
        this.logger,
      );
    } catch (err) {
      this.logger.warn(
        `getStatus: could not count Skill nodes: ${(err as Error).message}`,
      );
    }
    try {
      embeddingCoverage = await withNeo4jConnectionRetry(
        () => this.neo4j.getSkillEmbeddingCoverage(),
        this.logger,
      );
    } catch (err) {
      this.logger.warn(
        `getStatus: could not get embedding coverage: ${(err as Error).message}`,
      );
    }

    let status: SkillGraphSyncStatus['status'] = 'idle';
    if (this.isRunning) {
      status = 'running';
    } else if (this.lastError) {
      status = 'error';
    }

    const lastSyncAtIso = this.lastSyncAt?.toISOString() ?? null;
    const staleSinceMs =
      this.lastSyncAt !== null && this.lastSyncAt !== undefined
        ? Date.now() - this.lastSyncAt.getTime()
        : null;

    return {
      status,
      lastSyncAt: lastSyncAtIso,
      staleSinceMs,
      lastSyncDurationMs: this.lastSyncDurationMs,
      lastError: this.lastError,
      skillCount,
      nextSyncAt: this.computeNextSyncAt(),
      embeddingCoverage,
    };
  }

  private computeNextSyncAt(): string | null {
    if (this.syncIntervalMs <= 0) {
      return null;
    }
    const base = this.lastSyncAt?.getTime() ?? Date.now();
    return new Date(base + this.syncIntervalMs).toISOString();
  }

  async sync(options?: { signal?: AbortSignal }): Promise<GraphSyncResult> {
    if (this.isRunning) {
      this.logger.info('Graph sync skipped: already running');
      return {
        ok: false,
        nodesUpserted: 0,
        relationshipsCreated: 0,
        nodesRemoved: 0,
        durationMs: 0,
        embeddingsGenerated: 0,
        agentCapabilitiesCreated: 0,
        tagsCreated: 0,
        implementedByEdges: 0,
      };
    }
    this.isRunning = true;
    this.syncPromise = this.doSync(options);
    try {
      return await this.syncPromise;
    } finally {
      this.isRunning = false;
      this.syncPromise = null;
    }
  }

  private assertSyncNotAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
      throw new SyncAbortedError();
    }
  }

  private async doSync(options?: {
    signal?: AbortSignal;
  }): Promise<GraphSyncResult> {
    const start = globalThis.performance.now();
    let syncOutcome: 'success' | 'aborted' | 'error' = 'success';
    let syncErrorMessage: string | null = null;
    let nodesUpserted = 0;
    let skillsUpsertedCount = 0;
    let relationshipsCreated = 0;
    let nodesRemoved = 0;
    let embeddingsGenerated = 0;
    let agentCapabilitiesCreated = 0;
    let tagsCreated = 0;
    let implementedByEdges = 0;

    const syncSignal = options?.signal;
    try {
      this.assertSyncNotAborted(syncSignal);
      await withNeo4jConnectionRetry(
        () => this.schemaManager.ensureSchema(),
        this.logger,
      );

      await this.migrateRemoveUsesSkill();

      this.assertSyncNotAborted(syncSignal);
      const allOciSkills = await this.ociRegistry.listSkills();
      const skills = allOciSkills.filter(
        s => s.ociAnnotations?.bundleImage !== 'true',
      );
      this.logger.info(
        `Syncing ${skills.length} skills from OCI to Neo4j (${allOciSkills.length - skills.length} OCI bundle image(s) excluded from skill upsert)`,
      );

      const skillNames = new Set<string>();
      const allDomains = new Map<string, string>();

      const CONTENT_CONCURRENCY = 25;
      const contentMap = new Map<string, string | undefined>();

      this.logger.info(
        `Fetching skill content (concurrency=${CONTENT_CONCURRENCY})...`,
      );
      let contentIdx = 0;
      const fetchContent = async () => {
        while (contentIdx < skills.length) {
          this.assertSyncNotAborted(syncSignal);
          const i = contentIdx++;
          const skill = skills[i];
          try {
            const c = await this.ociRegistry.getSkillContent(
              skill.ociReference,
            );
            if (c) contentMap.set(skill.ociReference, c);
          } catch {
            /* content optional */
          }
        }
      };
      await Promise.all(
        Array.from(
          { length: Math.min(CONTENT_CONCURRENCY, skills.length) },
          () => fetchContent(),
        ),
      );
      this.logger.info(
        `Content fetched for ${contentMap.size}/${skills.length} skills`,
      );

      interface SkillBatchItem {
        skill: Skill;
        hash: string;
        categories: CategoryAssignment[];
        complexity: string;
        tools: Array<{
          name: string;
          description: string;
          docsUrl: string;
          version: string;
          deprecated: boolean;
        }>;
        deps: Array<{ name: string; version: string }>;
        relatedSkills: { name: string; description?: string }[];
        completeness: number;
        hasContent: boolean;
      }

      const batchItems: SkillBatchItem[] = [];
      for (const skill of skills) {
        const name = skill.card.metadata.name;
        skillNames.add(name);
        const content = contentMap.get(skill.ociReference);
        const hash = contentHash(skill, content);
        const cats = categoriesOf(
          skill,
          this.categoryKeywords,
          this.domainTaxonomy,
        );
        const complexity = content
          ? getComplexity(content.split('\n').length)
          : 'Simple';
        const allowedToolsStr = skill.card.metadata['allowed-tools'] || '';
        const toolNames = allowedToolsStr
          ? allowedToolsStr.split(/\s+/).filter(Boolean)
          : [];
        const tools = toolNames.map(t => {
          const meta = this.toolMetadata[t];
          return {
            name: t,
            description: meta?.description ?? '',
            docsUrl: meta?.docsUrl ?? '',
            version: meta?.version ?? '',
            deprecated: meta?.deprecated ?? false,
          };
        });
        const deps = skill.card.spec?.dependencies ?? [];
        for (const c of cats) {
          if (!allDomains.has(c.domain)) {
            allDomains.set(c.domain, getPluginColor(c.domain));
          }
        }
        const hasContent = content !== undefined;
        batchItems.push({
          skill,
          hash,
          categories: cats,
          complexity,
          tools,
          deps,
          relatedSkills: content ? parseRelatedSkills(content) : [],
          completeness: computeSkillCompleteness(skill, hasContent),
          hasContent,
        });
      }

      const BATCH_SIZE = 50;
      const REL_CONCURRENCY = 10;
      for (let i = 0; i < batchItems.length; i += BATCH_SIZE) {
        this.assertSyncNotAborted(syncSignal);
        const batch = batchItems.slice(i, i + BATCH_SIZE);
        const primaryCategory = (item: SkillBatchItem) =>
          item.categories.find(c => c.primary)?.domain ?? 'general';

        const upsertResults = await Promise.all(
          batch.map(item =>
            withDeadlockRetry(() =>
              this.upsertSkill(
                item.skill,
                item.hash,
                primaryCategory(item),
                item.complexity,
                item.completeness,
              ),
            ),
          ),
        );
        const batchUpserted = upsertResults.filter(Boolean).length;
        nodesUpserted += batchUpserted;
        skillsUpsertedCount += batchUpserted;

        for (let r = 0; r < batch.length; r += REL_CONCURRENCY) {
          const relBatch = batch.slice(r, r + REL_CONCURRENCY);
          const relCounts = await Promise.all(
            relBatch.map(item =>
              withDeadlockRetry(() =>
                this.syncRelationshipsBatched(
                  item.skill.card.metadata.name,
                  item.tools,
                  item.categories,
                  allDomains,
                  item.deps,
                  item.relatedSkills,
                ),
              ),
            ),
          );
          for (const c of relCounts) relationshipsCreated += c;
        }

        for (const item of batch) {
          const skillTags = item.skill.card.metadata.tags ?? [];
          if (skillTags.length > 0) {
            const tc = await withDeadlockRetry(() =>
              this.syncSkillTags(item.skill.card.metadata.name, skillTags),
            );
            tagsCreated += tc;
          }
        }
      }

      this.assertSyncNotAborted(syncSignal);
      for (const skill of allOciSkills) {
        const ann = skill.ociAnnotations;
        if (!ann || ann.bundleImage !== 'true') {
          continue;
        }
        const bundleSkillsJson = ann.bundleSkillsJson || '[]';
        let bundleSkillNames: string[] = [];
        try {
          bundleSkillNames = JSON.parse(bundleSkillsJson) as string[];
        } catch {
          /* invalid JSON — skip name list */
        }
        const bundleName = ann.title || skill.card.metadata.name;
        const bundleStatus = ann.lifecycleStatus || 'published';
        try {
          await withNeo4jConnectionRetry(
            () =>
              this.neo4j.createOrUpdateBundleFromOCI({
                name: bundleName,
                description: `OCI bundle: ${bundleName}`,
                author: ann.vendor || 'oci-registry',
                skillNames: bundleSkillNames,
                status: bundleStatus,
              }),
            this.logger,
          );
          this.logger.info(
            `Synced OCI bundle: ${bundleName} (${bundleSkillNames.length} skills)`,
          );
        } catch (err) {
          this.logger.warn(
            `Failed to sync OCI bundle ${bundleName}: ${(err as Error).message}`,
          );
        }
      }

      nodesRemoved = await this.cleanStaleNodes(skillNames);
      await this.cleanOrphanedNodes();

      this.assertSyncNotAborted(syncSignal);
      if (this.kagenti) {
        try {
          const agents = await this.kagenti.listAgentsWithCards();
          const agentKeys: string[] = [];
          for (const agent of agents) {
            await withDeadlockRetry(() => this.upsertAgent(agent));
            agentKeys.push(`${agent.name}/${agent.namespace}`);
            nodesUpserted++;

            if (agent.agentCard?.skills && agent.agentCard.skills.length > 0) {
              const capResult = await withDeadlockRetry(() =>
                this.syncAgentCapabilities(agent),
              );
              agentCapabilitiesCreated += capResult.capsCreated;
              relationshipsCreated += capResult.exposesCreated;
              tagsCreated += capResult.tagsCreated;
            }
          }

          if (agentKeys.length > 0) {
            await this.cleanStaleAgents(agentKeys);
            await this.cleanStaleCapabilities(agentKeys);
          }

          for (const agent of agents) {
            if (agent.agentCard?.skills && agent.agentCard.skills.length > 0) {
              const matchCount = await withDeadlockRetry(() =>
                this.matchCapabilitiesToSkills(agent.name, agent.namespace),
              );
              implementedByEdges += matchCount;
            }
          }
        } catch (err) {
          this.logger.warn(`Agent sync failed: ${(err as Error).message}`);
        }
      }

      if (this.embeddingService) {
        embeddingsGenerated = await this.generateMissingEmbeddings();
        if (embeddingsGenerated > 0) {
          await this.computeSimilarityRelationships();
        }
      }

      await this.cleanOrphanTags();
      this.neo4j.invalidateCache();

      const durationMs = Math.round(globalThis.performance.now() - start);

      let gapsFound = 0;
      try {
        gapsFound = await this.neo4j.countCatalogGaps();
      } catch {
        /* best-effort */
      }

      await this.recordSyncEvent({
        skillsUpserted: skillsUpsertedCount,
        capabilitiesCreated: agentCapabilitiesCreated,
        matchesCreated: implementedByEdges,
        gapsFound,
        durationMs,
      });

      await this.runPostSyncDataAccuracyChecks(skillNames);

      try {
        const bundlesUpdated = await this.neo4j.reconcileBundleSkillCounts();
        if (bundlesUpdated > 0) {
          this.logger.warn(
            `Post-sync: reconciled skillCount on ${bundlesUpdated} bundle(s) whose included skills changed`,
          );
        }
      } catch (err) {
        this.logger.warn(
          `Post-sync bundle skillCount reconciliation failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }

      this.logger.info(
        `Graph sync complete: ${nodesUpserted} upserted, ${relationshipsCreated} rels, ${nodesRemoved} removed, ${embeddingsGenerated} embeddings, ${agentCapabilitiesCreated} capabilities, ${tagsCreated} tags, ${implementedByEdges} implemented-by, ${gapsFound} gaps in ${durationMs}ms`,
      );
      return {
        ok: true,
        nodesUpserted,
        relationshipsCreated,
        nodesRemoved,
        durationMs,
        embeddingsGenerated,
        agentCapabilitiesCreated,
        tagsCreated,
        implementedByEdges,
      };
    } catch (err) {
      if (err instanceof SyncAbortedError) {
        this.logger.info(`Graph sync aborted: ${(err as Error).message}`);
        syncOutcome = 'aborted';
        return {
          ok: false,
          nodesUpserted,
          relationshipsCreated,
          nodesRemoved,
          durationMs: Math.round(globalThis.performance.now() - start),
          embeddingsGenerated,
          agentCapabilitiesCreated,
          tagsCreated,
          implementedByEdges,
        };
      }
      syncOutcome = 'error';
      syncErrorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error(`Graph sync failed: ${syncErrorMessage}`);
      return {
        ok: false,
        nodesUpserted,
        relationshipsCreated,
        nodesRemoved,
        durationMs: Math.round(globalThis.performance.now() - start),
        embeddingsGenerated,
        agentCapabilitiesCreated,
        tagsCreated,
        implementedByEdges,
      };
    } finally {
      const durationMs = Math.round(globalThis.performance.now() - start);
      this.lastSyncAt = new Date();
      this.lastSyncDurationMs = durationMs;
      this.lastError = syncOutcome === 'error' ? syncErrorMessage : null;
      if (durationMs > SLOW_SYNC_WARN_MS) {
        this.logger.warn(
          `Graph sync was slow: completed in ${durationMs}ms (warn threshold ${SLOW_SYNC_WARN_MS}ms)`,
        );
      }
    }
  }

  private async upsertSkill(
    skill: Skill,
    hash: string,
    category: string,
    complexity: string,
    completeness: number = 0,
  ): Promise<boolean> {
    const m = skill.card.metadata;
    const authorsStr =
      m.authors
        ?.map(a => (a.email ? `${a.name} <${a.email}>` : a.name))
        .join(', ') ?? '';
    const tagsArr = m.tags ?? [];

    const prompt = (skill.card.spec?.prompt || '').slice(0, 2000);
    const examples = skill.card.spec?.examples
      ? JSON.stringify(skill.card.spec.examples).slice(0, 2000)
      : '';
    const compatibility = m.compatibility || '';

    const session = await this.getHealthySessionForSync();
    try {
      const result = await session.run(this.sq('sync.upsertSkill'), {
        name: m.name,
        namespace: m.namespace || 'default',
        version: m.version || '0.0.0',
        description: (m.description || '').slice(0, 1000),
        author: authorsStr,
        license: m.license || '',
        ociReference: skill.ociReference,
        category,
        complexity,
        hash,
        pluginColor: getPluginColor(category),
        tags: tagsArr,
        displayName: m['display-name'] || '',
        lifecycleState: skill.lifecycleState || 'draft',
        provenanceSource: skill.card.provenance?.source || '',
        provenanceCommit: skill.card.provenance?.commit || '',
        prompt,
        examples,
        compatibility,
        completeness,
      });
      return result.records.length > 0;
    } finally {
      await session.close();
    }
  }

  private async syncRelationshipsBatched(
    skillName: string,
    tools: Array<{
      name: string;
      description: string;
      docsUrl: string;
      version: string;
      deprecated: boolean;
    }>,
    categories: CategoryAssignment[],
    allDomains: Map<string, string>,
    deps: Array<{ name: string; version: string }>,
    relatedSkills: { name: string; description?: string }[],
  ): Promise<number> {
    const session = await this.getHealthySessionForSync();
    let count = 0;
    try {
      await session.executeWrite(async tx => {
        if (tools.length > 0) {
          await tx.run(this.sq('sync.deleteUsesToolEdges'), { skillName });
          await tx.run(this.sq('sync.mergeUsesTool'), { skillName, tools });
          count += tools.length;
        }

        await tx.run(this.sq('sync.deleteBelongsToEdges'), { skillName });
        for (const cat of categories) {
          const taxEntry = this.domainTaxonomy[cat.domain];
          await tx.run(this.sq('sync.mergeBelongsToDomain'), {
            skillName,
            domain: cat.domain,
            color: allDomains.get(cat.domain) ?? getPluginColor(cat.domain),
            description: taxEntry?.description ?? '',
            owner: taxEntry?.owner ?? '',
            primary: cat.primary,
          });
          count++;

          if (taxEntry?.parent) {
            await tx.run(this.sq('sync.mergeDomainParent'), {
              child: cat.domain,
              parent: taxEntry.parent,
            });
            count++;
          }
        }

        if (deps.length > 0) {
          await tx.run(this.sq('sync.deleteDependsOnEdges'), { skillName });
          await tx.run(this.sq('sync.mergeDependsOn'), {
            skillName,
            deps: deps.map(d => ({ name: d.name, version: d.version })),
          });
          count += deps.length;
        }

        if (relatedSkills.length > 0) {
          await tx.run(this.sq('sync.deleteRelatedToEdges'), { skillName });
          await tx.run(this.sq('sync.mergeRelatedTo'), {
            skillName,
            rels: relatedSkills.map(r => ({
              name: r.name,
              description: r.description || '',
            })),
          });
          count += relatedSkills.length;
        }
      });

      return count;
    } finally {
      await session.close();
    }
  }

  private async upsertAgent(
    agent: import('@red-hat-developer-hub/backstage-plugin-skill-marketplace-common').KagentiAgent,
  ): Promise<void> {
    const card = agent.agentCard;
    const session = await this.getHealthySessionForSync();
    try {
      await session.run(this.sq('sync.upsertAgent'), {
        name: agent.name,
        namespace: agent.namespace,
        status: agent.status,
        description: card?.description || agent.description,
        framework: agent.labels.framework || '',
        workloadType: agent.workloadType,
        url: card?.url || '',
        version: card?.version || '',
        documentationUrl: card?.documentationUrl || '',
        provider: card?.provider?.organization || '',
        providerUrl: card?.provider?.url || '',
        streaming: card?.capabilities?.streaming ?? false,
        pushNotifications: card?.capabilities?.pushNotifications ?? false,
        stateTransitionHistory:
          card?.capabilities?.stateTransitionHistory ?? false,
        authSchemes: card?.authentication?.schemes ?? [],
        defaultInputModes: card?.defaultInputModes ?? ['text/plain'],
        defaultOutputModes: card?.defaultOutputModes ?? ['text/plain'],
        protocol: agent.labels.protocol ?? [],
        skillCount: card?.skills?.length ?? 0,
        completeness: computeAgentCompleteness(agent),
      });
    } finally {
      await session.close();
    }
  }

  private async syncSkillTags(
    skillName: string,
    tags: string[],
  ): Promise<number> {
    const session = await this.getHealthySessionForSync();
    let count = 0;
    try {
      await session.run(this.sq('sync.deleteSkillTaggedWith'), { skillName });
      for (const rawTag of tags) {
        const tag = rawTag.toLowerCase().trim();
        if (!tag) continue;
        try {
          await session.run(this.sq('sync.mergeSkillTaggedWith'), {
            skillName,
            tag,
          });
          count++;
        } catch (err) {
          this.logger.debug(
            `Tag sync failed for ${skillName}/${tag}: ${(err as Error).message}`,
          );
        }
      }
    } finally {
      await session.close();
    }
    return count;
  }

  private async syncAgentCapabilities(
    agent: import('@red-hat-developer-hub/backstage-plugin-skill-marketplace-common').KagentiAgent,
  ): Promise<{
    capsCreated: number;
    exposesCreated: number;
    tagsCreated: number;
  }> {
    const card = agent.agentCard;
    if (!card?.skills || card.skills.length === 0) {
      return { capsCreated: 0, exposesCreated: 0, tagsCreated: 0 };
    }

    const session = await this.getHealthySessionForSync();
    let capsCreated = 0;
    let exposesCreated = 0;
    let tagsCreated = 0;
    try {
      await session.run(this.sq('sync.deleteAgentCapabilities'), {
        agentName: agent.name,
        agentNamespace: agent.namespace,
      });

      for (const skill of card.skills) {
        try {
          await session.run(this.sq('sync.upsertAgentCapability'), {
            skillId: skill.id,
            agentName: agent.name,
            agentNamespace: agent.namespace,
            name: skill.name,
            description: skill.description || '',
            tags: skill.tags ?? [],
            examples: skill.examples ?? [],
            inputModes: skill.inputModes ?? card.defaultInputModes ?? [],
            outputModes: skill.outputModes ?? card.defaultOutputModes ?? [],
            completeness: computeCapabilityCompleteness(skill),
          });
          capsCreated++;

          await session.run(this.sq('sync.mergeAgentExposes'), {
            agentName: agent.name,
            agentNamespace: agent.namespace,
            skillId: skill.id,
          });
          exposesCreated++;

          for (const rawTag of skill.tags ?? []) {
            const tag = rawTag.toLowerCase().trim();
            if (!tag) continue;
            try {
              await session.run(this.sq('sync.mergeCapabilityTaggedWith'), {
                skillId: skill.id,
                agentName: agent.name,
                agentNamespace: agent.namespace,
                tag,
              });
              tagsCreated++;
            } catch {
              /* tag sync best-effort */
            }
          }
        } catch (err) {
          this.logger.debug(
            `Capability sync failed for ${agent.name}/${skill.id}: ${(err as Error).message}`,
          );
        }
      }
    } finally {
      await session.close();
    }
    return { capsCreated, exposesCreated, tagsCreated };
  }

  private async matchCapabilitiesToSkills(
    agentName: string,
    agentNamespace: string,
  ): Promise<number> {
    const session = await this.getHealthySessionForSync();
    let matchCount = 0;
    try {
      await session.run(this.sq('sync.deleteCapabilityImplementedBy'), {
        agentName,
        agentNamespace,
      });

      const capsResult = await session.run(
        this.sq('read.listAgentCapabilities'),
        { agentName, agentNamespace },
      );

      const allSkillsResult = await session.run(
        'MATCH (s:Skill) RETURN s.name AS name, s.tags AS tags',
      );
      const skillMap = new Map<string, { name: string; tags: string[] }>();
      const normalizedSkillMap = new Map<
        string,
        { name: string; tags: string[] }
      >();
      const normalizedCollisions = new Set<string>();
      for (const r of allSkillsResult.records) {
        const sn = r.get('name') as string;
        const tags = (r.get('tags') as string[]) ?? [];
        skillMap.set(sn.toLowerCase(), { name: sn, tags });
        const nn = normalizeName(sn);
        if (normalizedSkillMap.has(nn)) {
          normalizedCollisions.add(nn);
        } else {
          normalizedSkillMap.set(nn, { name: sn, tags });
        }
      }
      for (const collision of normalizedCollisions) {
        normalizedSkillMap.delete(collision);
      }

      const tagDocFreq = new Map<string, number>();
      const totalSkills = skillMap.size;
      for (const [, skill] of skillMap) {
        const seen = new Set<string>();
        for (const t of skill.tags) {
          const lt = t.toLowerCase();
          if (!seen.has(lt)) {
            seen.add(lt);
            tagDocFreq.set(lt, (tagDocFreq.get(lt) ?? 0) + 1);
          }
        }
      }

      for (const capRec of capsResult.records) {
        const capName = (capRec.get('name') as string) || '';
        const capTags: string[] = (capRec.get('tags') as string[]) ?? [];
        const capSkillId = capRec.get('skillId') as string;

        let bestMatch: {
          skillName: string;
          confidence: number;
          matchType: string;
        } | null = null;

        const exactMatch = skillMap.get(capName.toLowerCase());
        if (exactMatch) {
          bestMatch = {
            skillName: exactMatch.name,
            confidence: 1.0,
            matchType: 'name',
          };
        }

        if (!bestMatch) {
          const fuzzyMatch = normalizedSkillMap.get(normalizeName(capName));
          if (fuzzyMatch) {
            bestMatch = {
              skillName: fuzzyMatch.name,
              confidence: 0.95,
              matchType: 'name_fuzzy',
            };
          }
        }

        if (!bestMatch && this.embeddingService) {
          const capDescription =
            (capRec.get('description') as string) || capName;
          try {
            const embedding = await this.embeddingService.generate(
              `${capName}: ${capDescription}`,
            );
            if (embedding) {
              const vecResult = await session.run(
                "CALL db.index.vector.queryNodes('skill_embedding', $topK, $embedding) YIELD node, score WHERE score >= $threshold RETURN node.name AS name, score ORDER BY score DESC LIMIT 1",
                { topK: 5, embedding, threshold: 0.85 },
              );
              if (vecResult.records.length > 0) {
                const rec = vecResult.records[0];
                bestMatch = {
                  skillName: rec.get('name') as string,
                  confidence: Number(rec.get('score')),
                  matchType: 'semantic',
                };
              }
            }
          } catch {
            this.logger.debug(
              `High-confidence semantic matching skipped for capability ${capName}`,
            );
          }
        }

        if (!bestMatch && capTags.length > 0 && totalSkills > 0) {
          const normalizedCapTags = capTags.map(t => t.toLowerCase());
          let bestTagScore = 0;
          let bestTagSkill: string | null = null;
          for (const [, skill] of skillMap) {
            const skillTagsLower = skill.tags.map(t => t.toLowerCase());
            let idfScore = 0;
            let maxPossible = 0;
            for (const ct of normalizedCapTags) {
              const idf = Math.log(
                (totalSkills + 1) / ((tagDocFreq.get(ct) ?? 0) + 1),
              );
              maxPossible += idf;
              if (skillTagsLower.includes(ct)) {
                idfScore += idf;
              }
            }
            const score = maxPossible > 0 ? idfScore / maxPossible : 0;
            if (score > bestTagScore) {
              bestTagScore = score;
              bestTagSkill = skill.name;
            }
          }
          if (bestTagSkill && bestTagScore >= this.matchThreshold) {
            bestMatch = {
              skillName: bestTagSkill,
              confidence: bestTagScore,
              matchType: 'tag',
            };
          }
        }

        if (!bestMatch && this.embeddingService) {
          const capDescription =
            (capRec.get('description') as string) || capName;
          try {
            const embedding = await this.embeddingService.generate(
              `${capName}: ${capDescription}`,
            );
            if (embedding) {
              const vecResult = await session.run(
                "CALL db.index.vector.queryNodes('skill_embedding', $topK, $embedding) YIELD node, score WHERE score >= $threshold RETURN node.name AS name, score ORDER BY score DESC LIMIT 1",
                { topK: 5, embedding, threshold: this.semanticThreshold },
              );
              if (vecResult.records.length > 0) {
                const rec = vecResult.records[0];
                bestMatch = {
                  skillName: rec.get('name') as string,
                  confidence: Number(rec.get('score')),
                  matchType: 'semantic_weak',
                };
              }
            }
          } catch {
            this.logger.debug(
              `Weak semantic matching skipped for capability ${capName}`,
            );
          }
        }

        if (bestMatch) {
          try {
            await session.run(this.sq('sync.mergeImplementedBy'), {
              skillId: capSkillId,
              agentName,
              agentNamespace,
              skillName: bestMatch.skillName,
              confidence: bestMatch.confidence,
              matchType: bestMatch.matchType,
            });
            matchCount++;
          } catch (err) {
            this.logger.debug(
              `IMPLEMENTED_BY failed for ${capName}->${bestMatch.skillName}: ${(err as Error).message}`,
            );
          }
        }
      }
    } finally {
      await session.close();
    }
    return matchCount;
  }

  private async cleanStaleCapabilities(
    currentAgentKeys: string[],
  ): Promise<void> {
    const session = await this.getHealthySessionForSync();
    try {
      const result = await session.run(
        this.sq('sync.deleteStaleCapabilities'),
        { keys: currentAgentKeys },
      );
      const removed = result.records[0]?.get('removed');
      if (removed && Number(removed) > 0) {
        this.logger.info(`Removed ${removed} stale agent capability nodes`);
      }
    } finally {
      await session.close();
    }
  }

  private async cleanOrphanTags(): Promise<void> {
    const session = await this.getHealthySessionForSync();
    try {
      await session.run(this.sq('sync.deleteOrphanTags'));
    } finally {
      await session.close();
    }
  }

  private async migrateRemoveUsesSkill(): Promise<void> {
    const session = await this.getHealthySessionForSync();
    try {
      const result = await session.run(this.sq('sync.migrateRemoveUsesSkill'));
      const removed = result.records[0]?.get('removed');
      if (removed && Number(removed) > 0) {
        this.logger.info(
          `Migration: removed ${removed} legacy USES_SKILL relationships`,
        );
      }
    } catch {
      /* migration is best-effort if USES_SKILL relationships don't exist */
    } finally {
      await session.close();
    }
  }

  private async cleanStaleAgents(currentKeys: string[]): Promise<void> {
    const session = await this.getHealthySessionForSync();
    try {
      const result = await session.run(this.sq('sync.deleteStaleAgents'), {
        keys: currentKeys,
      });
      const removed = result.records[0]?.get('removed');
      if (removed && Number(removed) > 0) {
        this.logger.info(`Removed ${removed} stale agent nodes`);
      }
    } finally {
      await session.close();
    }
  }

  /**
   * Removes graph skills not present in the current OCI registry name set
   * (`sync.deleteStaleSkills` in the Cypher catalog — `DETACH DELETE` on stale :Skill).
   */
  private async cleanStaleNodes(currentSkills: Set<string>): Promise<number> {
    const session = await this.getHealthySessionForSync();
    try {
      const result = await session.run(this.sq('sync.deleteStaleSkills'), {
        names: Array.from(currentSkills),
      });
      const removed =
        result.records[0]?.get('removed')?.toNumber?.() ??
        Number(result.records[0]?.get('removed') ?? 0);
      this.logger.debug(
        `Stale skill pruning: removed ${removed} :Skill not in the current OCI name list (sync.deleteStaleSkills).`,
      );

      await session.run(this.sq('sync.deleteOrphanTools'));
      return removed;
    } finally {
      await session.close();
    }
  }

  /** Compares Neo4j :Skill count to the OCI registry set size and runs an edge integrity query. */
  private async runPostSyncDataAccuracyChecks(
    skillNames: Set<string>,
  ): Promise<void> {
    const expected = skillNames.size;
    try {
      const dbCount = await withNeo4jConnectionRetry(
        () => this.neo4j.countSkillNodes(),
        this.logger,
      );
      if (dbCount !== expected) {
        this.logger.warn(
          `Post-sync Skill count mismatch: MATCH (s:Skill) RETURN count(s) => ${dbCount}, but OCI registry had ${expected} unique skill names in this run.`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Post-sync count verification failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    try {
      const dangling = await withNeo4jConnectionRetry(
        () => this.neo4j.countDanglingPatternEdges(),
        this.logger,
      );
      if (dangling > 0) {
        this.logger.warn(
          `Post-sync relationship check: found ${dangling} relationships matching (a)-[r]->(b) WHERE a IS NULL OR b IS NULL`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Post-sync dangling edge check failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async cleanOrphanedNodes(): Promise<void> {
    const session = await this.getHealthySessionForSync();
    try {
      await session.run(this.sq('sync.deleteOrphanTools'));
      await session.run(this.sq('sync.deleteOrphanDomains'));
    } finally {
      await session.close();
    }
  }

  private async generateMissingEmbeddings(): Promise<number> {
    if (!this.embeddingService) return 0;
    const BATCH_SIZE = 50;
    const MAX_TOTAL = 500;
    let totalCount = 0;

    while (totalCount < MAX_TOTAL) {
      const session = await this.getHealthySessionForSync();
      let batchCount = 0;
      try {
        const result = await session.run(
          this.sq('sync.listMissingEmbeddings'),
          { limit: BATCH_SIZE },
        );
        if (result.records.length === 0) break;

        for (const record of result.records) {
          const name = record.get('name') as string;
          const description = (record.get('description') as string) || name;
          const embedding = await this.embeddingService.generate(
            `${name}: ${description}`,
          );
          if (embedding) {
            await session.run(this.sq('sync.setSkillEmbedding'), {
              name,
              embedding,
            });
            batchCount++;
          }
        }
      } finally {
        await session.close();
      }

      totalCount += batchCount;
      if (batchCount < BATCH_SIZE) break;
    }

    if (totalCount > 0 && this.embeddingService) {
      await withNeo4jConnectionRetry(
        () =>
          this.schemaManager.ensureVectorIndex(
            this.embeddingService!.dimensions,
          ),
        this.logger,
      );
    }
    return totalCount;
  }

  private async recordSyncEvent(event: {
    skillsUpserted: number;
    capabilitiesCreated: number;
    matchesCreated: number;
    gapsFound: number;
    durationMs: number;
  }): Promise<void> {
    const session = await this.getHealthySessionForSync();
    try {
      await session.run(this.sq('sync.createSyncEvent'), {
        skillsUpserted: event.skillsUpserted,
        capabilitiesCreated: event.capabilitiesCreated,
        matchesCreated: event.matchesCreated,
        gapsFound: event.gapsFound,
        durationMs: event.durationMs,
      });
      await session.run(this.sq('sync.pruneSyncEvents'), {
        retention: this.syncEventRetention,
      });
    } catch (err) {
      this.logger.debug(
        `SyncEvent recording failed: ${(err as Error).message}`,
      );
    } finally {
      await session.close();
    }
  }

  private async computeSimilarityRelationships(): Promise<void> {
    if (!this.embeddingService) return;
    const session = await this.getHealthySessionForSync();
    try {
      const touchedPairs = new Set<string>();

      try {
        const result = await session.run(
          this.sq('sync.listEmbeddedSkillNames'),
        );
        for (const record of result.records) {
          const name = record.get('name') as string;
          try {
            const simResult = await session.run(
              this.sq('sync.mergeSimilarTo'),
              {
                name,
                topK: this.similarityTopK,
                threshold: this.similarityThreshold,
              },
            );
            for (const rec of simResult.records) {
              touchedPairs.add(`${rec.get('from')}::${rec.get('to')}`);
            }
          } catch {
            break;
          }
        }
      } catch {
        this.logger.debug(
          'Vector-based similarity computation skipped (index may not be available)',
        );
        return;
      }

      await session.run(this.sq('sync.deleteUnsyncedSimilarTo'));
      await session.run(this.sq('sync.removeSimilarToSyncedFlag'));
      this.logger.debug(
        `Similarity: ${touchedPairs.size} relationships maintained`,
      );
    } finally {
      await session.close();
    }
  }
}
