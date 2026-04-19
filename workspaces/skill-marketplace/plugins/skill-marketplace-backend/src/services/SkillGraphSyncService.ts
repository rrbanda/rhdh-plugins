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
import * as crypto from 'crypto';
import type { LoggerService } from '@backstage/backend-plugin-api';
import type { Skill } from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import { getComplexity, getPluginColor } from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import type { GraphSyncResult } from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import type { Neo4jService } from './Neo4jService';
import type { OciRegistryService } from './OciRegistryService';
import type { KagentiService } from './KagentiService';
import { EmbeddingService } from './EmbeddingService';
import { GraphSchemaManager } from './GraphSchemaManager';
import { parseRelatedSkills } from './RelatedSkillsParser';

export interface GraphSyncConfig {
  embeddingApiUrl?: string;
  embeddingModel?: string;
  embeddingApiKey?: string;
  embeddingDimensions?: number;
  embeddingTimeoutMs?: number;
  similarityThreshold?: number;
  categoryKeywords?: Record<string, string[]>;
  similarityTopK?: number;
}

const DEFAULT_CATEGORY_KEYWORDS: [string, string[]][] = [
  ['human-resources', ['resume', 'hr', 'candidate', 'hiring', 'recruit']],
  ['operations', ['checklist', 'audit', 'compliance', 'ops', 'process', 'policy']],
  ['engineering', ['code', 'review', 'pull-request', 'pr-', 'lint', 'build', 'ci']],
  ['research', ['summary', 'pdf', 'url', 'research', 'fetch', 'web', 'document']],
  ['security', ['security', 'vulnerability', 'cve', 'audit', 'threat']],
  ['testing', ['test', 'coverage', 'assertion', 'mock', 'spec']],
  ['devops', ['docker', 'k8s', 'kubernetes', 'helm', 'terraform', 'deploy']],
  ['docs', ['markdown', 'documentation', 'readme', 'changelog']],
  ['api', ['openapi', 'swagger', 'rest', 'graphql', 'grpc']],
];

function buildCategoryKeywords(custom?: Record<string, string[]>): [string, string[]][] {
  if (!custom) return DEFAULT_CATEGORY_KEYWORDS;
  const merged = new Map(DEFAULT_CATEGORY_KEYWORDS);
  for (const [cat, kws] of Object.entries(custom)) {
    merged.set(cat, kws);
  }
  return Array.from(merged.entries());
}

function categoryOf(skill: Skill, keywords: [string, string[]][]): string {
  const tags = skill.card.metadata.tags;
  if (tags && tags.length > 0) {
    const tagStr = tags.join(' ').toLowerCase();
    for (const [cat, kws] of keywords) {
      if (kws.some(kw => tagStr.includes(kw))) return cat;
    }
  }
  const haystack =
    `${skill.card.metadata.name} ${skill.card.metadata.description ?? ''}`.toLowerCase();
  for (const [cat, kws] of keywords) {
    if (kws.some(kw => haystack.includes(kw))) return cat;
  }
  return 'general';
}

function contentHash(skill: Skill, content?: string): string {
  const data = JSON.stringify({
    card: skill.card,
    content: content ?? '',
    ociReference: skill.ociReference,
  });
  return crypto.createHash('sha256').update(data).digest('hex').slice(0, 16);
}

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
  private syncing = false;
  private syncPromise: Promise<GraphSyncResult> | null = null;

  constructor(options: {
    logger: LoggerService;
    neo4j: Neo4jService;
    ociRegistry: OciRegistryService;
    kagenti?: KagentiService;
    config: GraphSyncConfig;
  }) {
    this.logger = options.logger;
    this.neo4j = options.neo4j;
    this.ociRegistry = options.ociRegistry;
    this.kagenti = options.kagenti;
    this.similarityThreshold = options.config.similarityThreshold ?? 0.75;
    this.similarityTopK = options.config.similarityTopK ?? 10;
    this.categoryKeywords = buildCategoryKeywords(options.config.categoryKeywords);

    this.schemaManager = new GraphSchemaManager({
      logger: options.logger,
      neo4j: options.neo4j,
    });

    if (options.config.embeddingApiUrl && options.config.embeddingApiKey) {
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

  async generateEmbedding(text: string): Promise<number[] | null> {
    return this.embeddingService?.generate(text) ?? null;
  }

  async waitForCompletion(): Promise<void> {
    if (this.syncPromise) {
      await this.syncPromise;
    }
  }

  async sync(): Promise<GraphSyncResult> {
    if (this.syncing) {
      this.logger.info('Graph sync skipped: already running');
      return {
        ok: false,
        nodesUpserted: 0,
        relationshipsCreated: 0,
        nodesRemoved: 0,
        durationMs: 0,
        embeddingsGenerated: 0,
      };
    }
    this.syncing = true;
    this.syncPromise = this.doSync();
    try {
      return await this.syncPromise;
    } finally {
      this.syncing = false;
      this.syncPromise = null;
    }
  }

  private async doSync(): Promise<GraphSyncResult> {
    const start = Date.now();
    let nodesUpserted = 0;
    let relationshipsCreated = 0;
    let nodesRemoved = 0;
    let embeddingsGenerated = 0;

    try {
      await this.schemaManager.ensureSchema();

      const skills = await this.ociRegistry.listSkills();
      this.logger.info(`Syncing ${skills.length} skills from OCI to Neo4j`);

      const skillNames = new Set<string>();
      const allDomains = new Map<string, string>();

      const CONTENT_CONCURRENCY = 25;
      const contentMap = new Map<string, string | undefined>();

      this.logger.info(`Fetching skill content (concurrency=${CONTENT_CONCURRENCY})...`);
      let contentIdx = 0;
      const fetchContent = async () => {
        while (contentIdx < skills.length) {
          const i = contentIdx++;
          const skill = skills[i];
          try {
            const c = await this.ociRegistry.getSkillContent(skill.ociReference);
            if (c) contentMap.set(skill.ociReference, c);
          } catch { /* content optional */ }
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(CONTENT_CONCURRENCY, skills.length) }, () => fetchContent()),
      );
      this.logger.info(`Content fetched for ${contentMap.size}/${skills.length} skills`);

      interface SkillBatchItem {
        skill: Skill;
        hash: string;
        category: string;
        complexity: string;
        tools: string[];
        deps: Array<{ name: string; version: string }>;
        relatedSkills: { name: string; description?: string }[];
      }

      const batchItems: SkillBatchItem[] = [];
      for (const skill of skills) {
        const name = skill.card.metadata.name;
        skillNames.add(name);
        const content = contentMap.get(skill.ociReference);
        const hash = contentHash(skill, content);
        const category = categoryOf(skill, this.categoryKeywords);
        const complexity = content
          ? getComplexity(content.split('\n').length)
          : 'Simple';
        const allowedToolsStr = skill.card.metadata['allowed-tools'] || '';
        const tools = allowedToolsStr
          ? allowedToolsStr.split(/\s+/).filter(Boolean)
          : [];
        const deps = skill.card.spec?.dependencies ?? [];
        if (!allDomains.has(category)) {
          allDomains.set(category, getPluginColor(category));
        }
        batchItems.push({
          skill, hash, category, complexity, tools, deps,
          relatedSkills: content ? parseRelatedSkills(content) : [],
        });
      }

      const BATCH_SIZE = 50;
      for (let i = 0; i < batchItems.length; i += BATCH_SIZE) {
        const batch = batchItems.slice(i, i + BATCH_SIZE);
        const upsertResults = await Promise.all(
          batch.map(item => this.upsertSkill(item.skill, item.hash, item.category, item.complexity)),
        );
        nodesUpserted += upsertResults.filter(Boolean).length;

        const relResults = await Promise.all(
          batch.map(item =>
            this.syncRelationshipsBatched(
              item.skill.card.metadata.name,
              item.tools,
              item.category,
              allDomains.get(item.category)!,
              item.deps,
              item.relatedSkills,
            ),
          ),
        );
        relationshipsCreated += relResults.reduce((sum, r) => sum + r, 0);
      }

      nodesRemoved = await this.cleanStaleNodes(skillNames);
      await this.cleanOrphanedNodes();

      if (this.kagenti) {
        try {
          const agents = await this.kagenti.listAgentsParsed();
          for (const agent of agents) {
            await this.upsertAgent(agent);
            nodesUpserted++;
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

      this.neo4j.invalidateCache();

      const durationMs = Date.now() - start;
      this.logger.info(
        `Graph sync complete: ${nodesUpserted} upserted, ${relationshipsCreated} rels, ${nodesRemoved} removed, ${embeddingsGenerated} embeddings in ${durationMs}ms`,
      );
      return {
        ok: true,
        nodesUpserted,
        relationshipsCreated,
        nodesRemoved,
        durationMs,
        embeddingsGenerated,
      };
    } catch (err) {
      this.logger.error(`Graph sync failed: ${(err as Error).message}`);
      return {
        ok: false,
        nodesUpserted,
        relationshipsCreated,
        nodesRemoved,
        durationMs: Date.now() - start,
        embeddingsGenerated,
      };
    }
  }

  private async upsertSkill(
    skill: Skill,
    hash: string,
    category: string,
    complexity: string,
  ): Promise<boolean> {
    const m = skill.card.metadata;
    const authorsStr = m.authors
      ?.map(a => (a.email ? `${a.name} <${a.email}>` : a.name))
      .join(', ') ?? '';
    const tagsArr = m.tags ?? [];

    const session = await this.neo4j.getHealthySession();
    try {
      const result = await session.run(
        `MERGE (s:Skill {name: $name})
         ON CREATE SET
           s.namespace = $namespace, s.version = $version,
           s.description = $description, s.author = $author,
           s.license = $license, s.ociReference = $ociReference,
           s.category = $category, s.complexity = $complexity,
           s.contentHash = $hash,
           s.plugin = $category, s.pluginColor = $pluginColor,
           s.tags = $tags, s.displayName = $displayName,
           s.lifecycleState = $lifecycleState,
           s.provenanceSource = $provenanceSource,
           s.provenanceCommit = $provenanceCommit,
           s.createdAt = datetime()
         ON MATCH SET
           s.namespace = $namespace, s.version = $version,
           s.description = $description, s.author = $author,
           s.license = $license, s.ociReference = $ociReference,
           s.category = $category, s.complexity = $complexity,
           s.contentHash = $hash,
           s.plugin = $category, s.pluginColor = $pluginColor,
           s.tags = $tags, s.displayName = $displayName,
           s.lifecycleState = $lifecycleState,
           s.provenanceSource = $provenanceSource,
           s.provenanceCommit = $provenanceCommit,
           s.updatedAt = datetime()
         RETURN s.contentHash AS oldHash`,
        {
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
        },
      );
      return result.records.length > 0;
    } finally {
      await session.close();
    }
  }

  private async syncRelationshipsBatched(
    skillName: string,
    tools: string[],
    domain: string,
    domainColor: string,
    deps: Array<{ name: string; version: string }>,
    relatedSkills: { name: string; description?: string }[],
  ): Promise<number> {
    const session = await this.neo4j.getHealthySession();
    let count = 0;
    try {
      if (tools.length > 0) {
        await session.run(
          `MATCH (s:Skill {name: $skillName})-[r:USES_TOOL]->() DELETE r`,
          { skillName },
        );
        await session.run(
          `MATCH (s:Skill {name: $skillName})
           UNWIND $tools AS tool
           MERGE (t:Tool {name: tool})
           MERGE (s)-[:USES_TOOL]->(t)`,
          { skillName, tools },
        );
        count += tools.length;
      }

      await session.run(
        `MATCH (s:Skill {name: $skillName})-[r:BELONGS_TO]->() DELETE r`,
        { skillName },
      );
      await session.run(
        `MATCH (s:Skill {name: $skillName})
         MERGE (d:Domain {name: $domain})
         ON CREATE SET d.color = $color, d.description = $domain
         MERGE (s)-[:BELONGS_TO]->(d)`,
        { skillName, domain, color: domainColor },
      );
      count++;

      if (deps.length > 0) {
        await session.run(
          `MATCH (s:Skill {name: $skillName})-[r:DEPENDS_ON]->() DELETE r`,
          { skillName },
        );
        await session.run(
          `MATCH (s:Skill {name: $skillName})
           UNWIND $deps AS dep
           MERGE (d:Skill {name: dep.name})
           MERGE (s)-[r:DEPENDS_ON]->(d)
           SET r.version = dep.version`,
          { skillName, deps: deps.map(d => ({ name: d.name, version: d.version })) },
        );
        count += deps.length;
      }

      if (relatedSkills.length > 0) {
        await session.run(
          `MATCH (s:Skill {name: $skillName})-[r:RELATED_TO]->() DELETE r`,
          { skillName },
        );
        await session.run(
          `MATCH (s:Skill {name: $skillName})
           UNWIND $rels AS rel
           MERGE (t:Skill {name: rel.name})
           MERGE (s)-[r:RELATED_TO]->(t)
           SET r.description = rel.description`,
          {
            skillName,
            rels: relatedSkills.map(r => ({
              name: r.name,
              description: r.description || '',
            })),
          },
        );
        count += relatedSkills.length;
      }

      return count;
    } finally {
      await session.close();
    }
  }

  private async upsertAgent(agent: {
    name: string;
    namespace: string;
    status: string;
    description: string;
    labels: { framework: string; protocol: string[] };
    workloadType: string;
  }): Promise<void> {
    const session = await this.neo4j.getHealthySession();
    try {
      await session.run(
        `MERGE (a:Agent {name: $name, namespace: $namespace})
         SET a.status = $status, a.description = $description,
             a.framework = $framework, a.workloadType = $workloadType`,
        {
          name: agent.name,
          namespace: agent.namespace,
          status: agent.status,
          description: agent.description,
          framework: agent.labels.framework || '',
          workloadType: agent.workloadType,
        },
      );
    } finally {
      await session.close();
    }
  }

  private async cleanStaleNodes(
    currentSkills: Set<string>,
  ): Promise<number> {
    const session = await this.neo4j.getHealthySession();
    try {
      const result = await session.run(
        `MATCH (s:Skill) WHERE NOT s.name IN $names
         DETACH DELETE s RETURN count(s) AS removed`,
        { names: Array.from(currentSkills) },
      );
      const removed =
        result.records[0]?.get('removed')?.toNumber?.() ??
        Number(result.records[0]?.get('removed') ?? 0);

      await session.run(
        `MATCH (t:Tool) WHERE NOT (t)<-[:USES_TOOL]-() DETACH DELETE t`,
      );
      return removed;
    } finally {
      await session.close();
    }
  }

  private async cleanOrphanedNodes(): Promise<void> {
    const session = await this.neo4j.getHealthySession();
    try {
      await session.run(
        `MATCH (t:Tool) WHERE NOT (t)<-[:USES_TOOL]-() DETACH DELETE t`,
      );
      await session.run(
        `MATCH (d:Domain) WHERE NOT (d)<-[:BELONGS_TO]-() DETACH DELETE d`,
      );
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
      const session = await this.neo4j.getHealthySession();
      let batchCount = 0;
      try {
        const result = await session.run(
          `MATCH (s:Skill) WHERE s.embedding IS NULL
           RETURN s.name AS name, s.description AS description LIMIT $limit`,
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
            await session.run(
              `MATCH (s:Skill {name: $name}) SET s.embedding = $embedding`,
              { name, embedding },
            );
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
      await this.schemaManager.ensureVectorIndex(this.embeddingService.dimensions);
    }
    return totalCount;
  }

  private async computeSimilarityRelationships(): Promise<void> {
    if (!this.embeddingService) return;
    const session = await this.neo4j.getHealthySession();
    try {
      await session.run(`MATCH ()-[r:SIMILAR_TO]->() DELETE r`);

      try {
        const result = await session.run(
          `MATCH (s:Skill) WHERE s.embedding IS NOT NULL RETURN s.name AS name`,
        );
        for (const record of result.records) {
          const name = record.get('name') as string;
          try {
            await session.run(
              `MATCH (a:Skill {name: $name}) WHERE a.embedding IS NOT NULL
               CALL db.index.vector.queryNodes('skill_embedding', $topK, a.embedding)
               YIELD node AS b, score
               WHERE b.name <> a.name AND score >= $threshold
               MERGE (a)-[r:SIMILAR_TO]->(b)
               SET r.score = score`,
              {
                name,
                topK: this.similarityTopK,
                threshold: this.similarityThreshold,
              },
            );
          } catch {
            break;
          }
        }
      } catch {
        this.logger.debug(
          'Vector-based similarity computation skipped (index may not be available)',
        );
      }
    } finally {
      await session.close();
    }
  }
}
