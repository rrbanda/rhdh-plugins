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
import { randomUUID } from 'crypto';
import neo4j, { type Driver, type Session } from 'neo4j-driver';
import type {
  GraphSchema,
  GraphLabel,
  GraphRelType,
  PluginGroup,
  NvlNode,
  NvlRelationship,
  NvlGraphData,
} from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import { LoggerService } from '@backstage/backend-plugin-api';
import type { CypherQueryCatalog } from './CypherQueryCatalog';

const REL_COLORS: Record<string, string> = {
  USES_TOOL: '#3b82f6',
  BELONGS_TO: '#10b981',
  DEPENDS_ON: '#ef4444',
  RELATED_TO: '#8b5cf6',
  SIMILAR_TO: '#06b6d4',
  EXPOSES: '#f59e0b',
  IMPLEMENTED_BY: '#22c55e',
  TAGGED_WITH: '#a855f7',
  PARENT_OF: '#64748b',
};

const LABEL_PALETTE = [
  '#3b82f6',
  '#10b981',
  '#8b5cf6',
  '#f59e0b',
  '#ef4444',
  '#06b6d4',
  '#ec4899',
  '#84cc16',
  '#f97316',
  '#6366f1',
  '#14b8a6',
  '#e11d48',
  '#a855f7',
  '#22c55e',
  '#eab308',
];

import {
  toNumber,
  serializeProps as sharedSerializeProps,
  resolveId,
  resolveCaption,
} from './neo4jUtils';

function relColor(type: string): string {
  return REL_COLORS[type] ?? '#475569';
}

const COMPLEXITY_SIZE: Record<string, number> = {
  Simple: 25,
  Medium: 35,
  Complex: 50,
  Advanced: 60,
};

function computeNodeSize(
  props: Record<string, unknown>,
  labels?: string[],
): number {
  const complexity = (props.complexity as string) ?? '';
  if (COMPLEXITY_SIZE[complexity]) return COMPLEXITY_SIZE[complexity];
  if (labels?.includes('Agent')) {
    const sc = Number(props.skillCount) || 0;
    return Math.min(30 + sc * 5, 70);
  }
  if (labels?.includes('AgentCapability')) return 20;
  if (labels?.includes('Tag')) return 15;
  return 30;
}

function resolveNodeColor(
  props: Record<string, unknown>,
  labelColor: string,
): string {
  const pc = props.pluginColor as string;
  if (pc && typeof pc === 'string' && pc.startsWith('#')) return pc;
  return labelColor;
}

function serializeProps(
  props: Record<string, unknown>,
): Record<string, unknown> {
  return sharedSerializeProps(props, { stripKeys: new Set() });
}

interface CachedResult<T> {
  data: T;
  expiresAt: number;
}

const CACHE_TTL_MS = 30_000;

export class Neo4jService {
  private driver: Driver | null = null;
  private readonly uri: string;
  private readonly user: string;
  private readonly password: string;
  private readonly database: string;
  private readonly logger: LoggerService;
  private readonly qc?: CypherQueryCatalog;
  private schemaCache: CachedResult<GraphSchema> | null = null;
  private graphCache = new Map<number, CachedResult<NvlGraphData>>();

  constructor(options: {
    uri: string;
    user: string;
    password: string;
    database: string;
    logger: LoggerService;
    queryCatalog?: CypherQueryCatalog;
  }) {
    this.uri = options.uri;
    this.user = options.user;
    this.password = options.password;
    this.database = options.database;
    this.logger = options.logger;
    this.qc = options.queryCatalog;
  }

  private q(
    key: string,
    templateVars?: Record<string, string | number>,
  ): string {
    if (!this.qc)
      throw new Error(
        `Neo4jService: queryCatalog not available for key "${key}"`,
      );
    return this.qc.get(key, templateVars);
  }

  invalidateCache(): void {
    this.schemaCache = null;
    this.graphCache.clear();
  }

  private getDriver(): Driver {
    if (this.driver) return this.driver;
    this.driver = neo4j.driver(
      this.uri,
      neo4j.auth.basic(this.user, this.password),
    );
    return this.driver;
  }

  private async resetDriver(): Promise<void> {
    if (this.driver) {
      try {
        await this.driver.close();
      } catch {
        /* ignore close errors */
      }
      this.driver = null;
    }
  }

  private isSessionExpiredError(err: unknown): boolean {
    if (!err || typeof err !== 'object') return false;
    const e = err as { code?: string; message?: string };
    if (e.code === 'Neo.ClientError.Session.Expired') {
      return true;
    }
    const msg = e.message ?? '';
    return (
      msg.includes('SessionExpired') ||
      /\bsession has expired\b/i.test(msg) ||
      /session.*expired/i.test(msg)
    );
  }

  private isConnectionPoolExhaustedError(err: unknown): boolean {
    if (!err || typeof err !== 'object') return false;
    const e = err as { code?: string; message?: string };
    const msg = (e.message ?? '').toLowerCase();
    if (msg.includes('connection acquisition') && msg.includes('timeout')) {
      return true;
    }
    if (
      msg.includes("couldn't acquire") ||
      msg.includes('could not acquire') ||
      msg.includes('no available connections')
    ) {
      return true;
    }
    if (
      e.code === 'ServiceUnavailable' &&
      msg.includes('connection') &&
      (msg.includes('pool') || msg.includes('timeout'))
    ) {
      return true;
    }
    return false;
  }

  async getHealthySession() {
    let d = this.getDriver();
    try {
      await d.verifyConnectivity({ database: this.database });
    } catch (err) {
      if (this.isConnectionPoolExhaustedError(err)) {
        this.logger.warn(
          `Neo4j connection pool may be exhausted: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      this.logger.warn(
        'Neo4j connectivity check failed, resetting driver and retrying',
      );
      await this.resetDriver();
      d = this.getDriver();
      await d.verifyConnectivity({ database: this.database });
    }
    return d.session({ database: this.database });
  }

  async close(): Promise<void> {
    if (this.driver) {
      await this.driver.close();
      this.driver = null;
    }
  }

  /**
   * Graceful driver shutdown; alias for {@link close} for lifecycle hooks.
   */
  async shutdown(): Promise<void> {
    await this.close();
  }

  /**
   * Runs work with a managed session, retrying once on Neo4j session expiry.
   */
  private async withSession<T>(
    fn: (session: Session) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const session = await this.getHealthySession();
      try {
        return await fn(session);
      } catch (err) {
        if (this.isConnectionPoolExhaustedError(err)) {
          this.logger.warn(
            `Neo4j connection pool may be exhausted: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        if (this.isSessionExpiredError(err) && attempt === 0) {
          this.logger.warn(
            'Neo4j session expired, retrying with a new session',
          );
        } else {
          throw err;
        }
      } finally {
        try {
          await session.close();
        } catch {
          // ignore
        }
      }
    }
    throw new Error('Neo4j: session retry exhausted');
  }

  /**
   * Liveness check: runs `RETURN 1` with a 5s cap on query execution time.
   */
  async healthCheck(): Promise<{
    connected: boolean;
    latencyMs: number;
    error?: string;
  }> {
    const start = Date.now();
    const HEALTH_CHECK_TIMEOUT_MS = 5000;
    const session = this.getDriver().session({ database: this.database });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        session.run('RETURN 1 AS one'),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error(
                  `Health check timed out after ${HEALTH_CHECK_TIMEOUT_MS}ms`,
                ),
              ),
            HEALTH_CHECK_TIMEOUT_MS,
          );
        }),
      ]);
      return { connected: true, latencyMs: Date.now() - start };
    } catch (err) {
      return {
        connected: false,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      try {
        await session.close();
      } catch {
        // ignore
      }
    }
  }

  async discoverSchema(): Promise<GraphSchema> {
    if (this.schemaCache && Date.now() < this.schemaCache.expiresAt) {
      return this.schemaCache.data;
    }
    return this.withSession(async session => {
      const labelsResult = await session.run(
        this.q('read.discoverSchemaLabels'),
      );
      const relTypesResult = await session.run(
        this.q('read.discoverSchemaRelTypes'),
      );
      const totalNodesResult = await session.run(this.q('read.countAllNodes'));
      const totalRelsResult = await session.run(this.q('read.countAllRels'));
      const pluginGroupsResult = await session.run(
        this.q('read.discoverPluginGroups'),
      );

      const labels: GraphLabel[] = labelsResult.records.map((rec, i) => ({
        name: rec.get('name') as string,
        color: LABEL_PALETTE[i % LABEL_PALETTE.length],
        count: toNumber(rec.get('count')),
      }));

      const relationshipTypes: GraphRelType[] = relTypesResult.records.map(
        rec => ({
          type: rec.get('type') as string,
          count: toNumber(rec.get('count')),
        }),
      );

      const pluginGroups: PluginGroup[] = pluginGroupsResult.records.map(
        rec => ({
          name: (rec.get('plugin') as string) || 'unknown',
          color: (rec.get('color') as string) || '#6b7280',
          count: toNumber(rec.get('count')),
        }),
      );

      const schema: GraphSchema = {
        labels,
        relationshipTypes,
        pluginGroups,
        totalNodes: toNumber(totalNodesResult.records[0]?.get('c')),
        totalRelationships: toNumber(totalRelsResult.records[0]?.get('c')),
      };
      this.schemaCache = { data: schema, expiresAt: Date.now() + CACHE_TTL_MS };
      return schema;
    });
  }

  async fetchFullGraph(limit?: number): Promise<NvlGraphData> {
    const nodeLimit = limit ?? 500;
    const cached = this.graphCache.get(nodeLimit);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.data;
    }

    const schema = await this.discoverSchema();
    const labelColorMap = new Map(schema.labels.map(l => [l.name, l.color]));

    return this.withSession(async session => {
      const tx = session.beginTransaction();
      try {
        const nodesResult = await tx.run(this.q('read.fetchFullGraphNodes'), {
          limit: neo4j.int(nodeLimit),
        });

        const nodeElementIdMap = new Map<string, string>();
        const nodes: NvlNode[] = nodesResult.records.map(record => {
          const node = record.get('n');
          const lbls = record.get('lbls') as string[];
          const eid = record.get('eid') as string;
          const props = node.properties as Record<string, unknown>;
          const nodeId = resolveId(props, eid);
          nodeElementIdMap.set(eid, nodeId);

          const primaryLabel = lbls[0] ?? 'Unknown';
          const labelColor = labelColorMap.get(primaryLabel) ?? '#6b7280';
          return {
            id: nodeId,
            caption: resolveCaption(props, primaryLabel),
            color: resolveNodeColor(props, labelColor),
            size: computeNodeSize(props, lbls),
            labels: lbls,
            properties: serializeProps(props),
          };
        });

        const nodeIds = new Set(nodes.map(n => n.id));

        const relsResult = await tx.run(this.q('read.fetchRelsByElementIds'), {
          eids: Array.from(nodeElementIdMap.keys()),
        });

        await tx.commit();

        const relationships: NvlRelationship[] = [];
        const seenRelIds = new Set<string>();

        for (const record of relsResult.records) {
          const fromEid = record.get('fromEid') as string;
          const toEid = record.get('toEid') as string;
          const rType = record.get('rType') as string;
          const rProps =
            (record.get('rProps') as Record<string, unknown>) ?? {};
          const rEid = record.get('rEid') as string;

          const fromId = nodeElementIdMap.get(fromEid);
          const toId = nodeElementIdMap.get(toEid);
          if (!fromId || !toId || !nodeIds.has(fromId) || !nodeIds.has(toId))
            continue;

          const relId = `r-${rEid}`;
          if (seenRelIds.has(relId)) continue;
          seenRelIds.add(relId);

          relationships.push({
            id: relId,
            from: fromId,
            to: toId,
            caption: rType,
            color: relColor(rType),
            type: rType,
            properties: serializeProps(rProps),
          });
        }

        const graphData: NvlGraphData = { nodes, relationships, schema };
        this.graphCache.set(nodeLimit, {
          data: graphData,
          expiresAt: Date.now() + CACHE_TTL_MS,
        });
        return graphData;
      } catch (err) {
        try {
          await tx.rollback();
        } catch (rollbackErr) {
          this.logger.warn(`Transaction rollback failed: ${rollbackErr}`);
        }
        throw err;
      }
    });
  }

  async searchGraph(query: string): Promise<NvlGraphData> {
    const schema = await this.discoverSchema();
    const labelColorMap = new Map(schema.labels.map(l => [l.name, l.color]));

    return this.withSession(async session => {
      try {
        let nodesResult;
        try {
          nodesResult = await session.run(this.q('read.searchGraphFulltext'), {
            query: `${query}~`,
          });
        } catch {
          nodesResult = await session.run(this.q('read.searchGraphFallback'), {
            query,
          });
        }

        const nodeElementIdMap = new Map<string, string>();
        const nodes: NvlNode[] = nodesResult.records.map(record => {
          const node = record.get('n');
          const lbls = record.get('lbls') as string[];
          const eid = record.get('eid') as string;
          const props = node.properties as Record<string, unknown>;
          const nodeId = resolveId(props, eid);
          nodeElementIdMap.set(eid, nodeId);
          const primaryLabel = lbls[0] ?? 'Unknown';
          const labelColor = labelColorMap.get(primaryLabel) ?? '#6b7280';

          return {
            id: nodeId,
            caption: resolveCaption(props, primaryLabel),
            color: resolveNodeColor(props, labelColor),
            size: computeNodeSize(props, lbls),
            labels: lbls,
            properties: serializeProps(props),
          };
        });

        const relationships: NvlRelationship[] = [];
        if (nodeElementIdMap.size > 1) {
          const eids = Array.from(nodeElementIdMap.keys());
          const relsResult = await session.run(
            this.q('read.fetchRelsByElementIds'),
            { eids },
          );

          const nodeIds = new Set(nodes.map(n => n.id));
          const seenRelIds = new Set<string>();
          for (const record of relsResult.records) {
            const fromEid = record.get('fromEid') as string;
            const toEid = record.get('toEid') as string;
            const rType = record.get('rType') as string;
            const rProps =
              (record.get('rProps') as Record<string, unknown>) ?? {};
            const rEid = record.get('rEid') as string;

            const fromId = nodeElementIdMap.get(fromEid);
            const toId = nodeElementIdMap.get(toEid);
            if (!fromId || !toId || !nodeIds.has(fromId) || !nodeIds.has(toId))
              continue;

            const relId = `r-${rEid}`;
            if (seenRelIds.has(relId)) continue;
            seenRelIds.add(relId);

            relationships.push({
              id: relId,
              from: fromId,
              to: toId,
              caption: rType,
              color: relColor(rType),
              type: rType,
              properties: serializeProps(rProps),
            });
          }
        }

        return { nodes, relationships, schema };
      } catch (err) {
        this.logger.error(`Graph search failed: ${err}`);
        throw err;
      }
    });
  }

  async fetchNeighborhood(
    nodeId: string,
    depth: number = 2,
    limit: number = 100,
  ): Promise<NvlGraphData> {
    const schema = await this.discoverSchema();
    const labelColorMap = new Map(schema.labels.map(l => [l.name, l.color]));

    return this.withSession(async session => {
      const safeDepth = Math.floor(Math.min(Math.max(depth, 1), 5));

      const result = await session.run(
        this.q('read.fetchNeighborhood', { depth: safeDepth }),
        { nodeId, limit: neo4j.int(limit) },
      );

      if (result.records.length === 0) {
        return { nodes: [], relationships: [], schema };
      }

      const rawNodes = result.records[0].get('nodes') as Array<{
        elementId: string;
        labels: string[];
        properties: Record<string, unknown>;
      }>;

      const nodeElementIdMap = new Map<string, string>();
      const nodes: NvlNode[] = rawNodes.map(n => {
        const props = n.properties;
        const lbls = n.labels;
        const eid = n.elementId;
        const id = resolveId(props, eid);
        nodeElementIdMap.set(eid, id);
        const primaryLabel = lbls[0] ?? 'Unknown';
        const labelColor = labelColorMap.get(primaryLabel) ?? '#6b7280';

        return {
          id,
          caption: resolveCaption(props, primaryLabel),
          color: resolveNodeColor(props, labelColor),
          size: computeNodeSize(props, lbls),
          labels: lbls,
          properties: serializeProps(props),
        };
      });

      const nodeIds = new Set(nodes.map(n => n.id));
      const relationships: NvlRelationship[] = [];
      const seenRelIds = new Set<string>();

      const rawRelPaths = result.records[0].get('allRelPaths') as Array<
        Array<{
          elementId: string;
          startNodeElementId: string;
          endNodeElementId: string;
          type: string;
          properties: Record<string, unknown>;
        }>
      >;

      for (const relPath of rawRelPaths) {
        for (const r of relPath) {
          const fromId = nodeElementIdMap.get(r.startNodeElementId);
          const toId = nodeElementIdMap.get(r.endNodeElementId);
          if (!fromId || !toId || !nodeIds.has(fromId) || !nodeIds.has(toId))
            continue;

          const relId = `r-${r.elementId}`;
          if (seenRelIds.has(relId)) continue;
          seenRelIds.add(relId);

          relationships.push({
            id: relId,
            from: fromId,
            to: toId,
            caption: r.type,
            color: relColor(r.type),
            type: r.type,
            properties: serializeProps(r.properties),
          });
        }
      }

      return { nodes, relationships, schema };
    });
  }

  async listAllAgents(): Promise<Array<Record<string, unknown>>> {
    return this.withSession(async session => {
      const result = await session.run(this.q('read.listAllAgents'));
      return result.records.map(r => ({
        name: r.get('name'),
        namespace: r.get('namespace'),
        status: r.get('status'),
        description: r.get('description'),
        framework: r.get('framework'),
        version: r.get('version'),
        url: r.get('url'),
        streaming: r.get('streaming'),
        pushNotifications: r.get('pushNotifications'),
        provider: r.get('provider'),
        protocol: r.get('protocol'),
        workloadType: r.get('workloadType'),
        skillCount: toNumber(r.get('skillCount')),
      }));
    });
  }

  async getAgentsBySkill(
    skillName: string,
  ): Promise<Array<Record<string, unknown>>> {
    return this.withSession(async session => {
      const result = await session.run(this.q('read.fetchAgentsBySkill'), {
        skillName,
      });
      return result.records.map(r => ({
        name: r.get('name'),
        namespace: r.get('namespace'),
        status: r.get('status'),
        description: r.get('description'),
        framework: r.get('framework'),
        version: r.get('version'),
        url: r.get('url'),
        streaming: r.get('streaming'),
        skillCount: toNumber(r.get('skillCount')),
        skillId: r.get('skillId'),
      }));
    });
  }

  async getSkillsByAgent(
    name: string,
    namespace: string,
  ): Promise<Array<Record<string, unknown>>> {
    return this.withSession(async session => {
      const result = await session.run(this.q('read.fetchSkillsByAgent'), {
        name,
        namespace,
      });
      return result.records.map(r => ({
        name: r.get('name'),
        description: r.get('description'),
        category: r.get('category'),
        version: r.get('version'),
        complexity: r.get('complexity'),
        author: r.get('author'),
        skillId: r.get('skillId'),
      }));
    });
  }

  async countAgents(): Promise<number> {
    return this.withSession(async session => {
      const result = await session.run(this.q('read.countAllAgents'));
      return toNumber(result.records[0]?.get('c'));
    });
  }

  /** Counts nodes with the :Skill label (used for graph sync status). */
  async countSkillNodes(): Promise<number> {
    return this.withSession(async session => {
      const result = await session.run('MATCH (s:Skill) RETURN count(s) AS c');
      return toNumber(result.records[0]?.get('c'));
    });
  }

  /**
   * Post-sync integrity check: in normal Neo4j data, a MATCH (a)-[r]->(b) never yields
   * null endpoints; this query is kept for the audit contract. Prefer monitoring for
   * unexpected positive counts in supported Neo4j versions.
   */
  async countDanglingPatternEdges(): Promise<number> {
    return this.withSession(async session => {
      const result = await session.run(`
        MATCH (a)-[r]->(b)
        WHERE a IS NULL OR b IS NULL
        RETURN count(r) AS danglingEdges
      `);
      return toNumber(result.records[0]?.get('danglingEdges'));
    });
  }

  /** Skill nodes total vs count that have an embedding property set. */
  async getSkillEmbeddingCoverage(): Promise<{
    total: number;
    withEmbeddings: number;
  }> {
    return this.withSession(async session => {
      const result = await session.run(`
        MATCH (s:Skill)
        RETURN count(s) AS total,
               coalesce(sum(CASE WHEN s.embedding IS NOT NULL THEN 1 ELSE 0 END), 0) AS withEmbeddings
      `);
      const r = result.records[0];
      if (!r) {
        return { total: 0, withEmbeddings: 0 };
      }
      return {
        total: toNumber(r.get('total')),
        withEmbeddings: toNumber(r.get('withEmbeddings')),
      };
    });
  }

  async listAgentCapabilities(
    agentName: string,
    agentNamespace: string,
  ): Promise<Array<Record<string, unknown>>> {
    return this.withSession(async session => {
      const result = await session.run(this.q('read.listAgentCapabilities'), {
        agentName,
        agentNamespace,
      });
      return result.records.map(r => ({
        skillId: r.get('skillId'),
        name: r.get('name'),
        description: r.get('description'),
        tags: r.get('tags'),
        examples: r.get('examples'),
        inputModes: r.get('inputModes'),
        outputModes: r.get('outputModes'),
        completeness: Number(r.get('completeness') ?? 0),
        matchedSkillName: r.get('matchedSkillName'),
        matchConfidence:
          r.get('matchConfidence') !== null &&
          r.get('matchConfidence') !== undefined
            ? Number(r.get('matchConfidence'))
            : null,
        matchType: r.get('matchType'),
        verified: r.get('verified') ?? false,
        verifiedBy: r.get('verifiedBy') ?? null,
        matchedAt:
          r.get('matchedAt') !== null && r.get('matchedAt') !== undefined
            ? String(r.get('matchedAt'))
            : null,
        matchCount: toNumber(r.get('matchCount') ?? 0),
      }));
    });
  }

  async findCatalogGaps(): Promise<Array<Record<string, unknown>>> {
    return this.withSession(async session => {
      const result = await session.run(
        this.q('read.findUnmatchedCapabilities'),
      );
      return result.records.map(r => ({
        skillId: r.get('skillId'),
        name: r.get('name'),
        description: r.get('description'),
        tags: r.get('tags'),
        agentName: r.get('agentName'),
        agentNamespace: r.get('agentNamespace'),
      }));
    });
  }

  async findUnusedSkills(
    limit: number = 100,
  ): Promise<Array<Record<string, unknown>>> {
    return this.withSession(async session => {
      const result = await session.run(this.q('read.findUnusedSkills'), {
        limit: neo4j.int(limit),
      });
      return result.records.map(r => ({
        name: r.get('name'),
        description: r.get('description'),
        category: r.get('category'),
        version: r.get('version'),
      }));
    });
  }

  async listTags(limit: number = 50): Promise<Array<Record<string, unknown>>> {
    return this.withSession(async session => {
      const result = await session.run(this.q('read.listTags'), {
        limit: neo4j.int(limit),
      });
      return result.records.map(r => ({
        name: r.get('name'),
        skillCount: toNumber(r.get('skillCount')),
        capabilityCount: toNumber(r.get('capabilityCount')),
      }));
    });
  }

  async countCatalogGaps(): Promise<number> {
    return this.withSession(async session => {
      const result = await session.run(this.q('read.countCatalogGaps'));
      return toNumber(result.records[0]?.get('gaps'));
    });
  }

  async listSyncEvents(
    limit: number = 20,
  ): Promise<Array<Record<string, unknown>>> {
    return this.withSession(async session => {
      const result = await session.run(this.q('read.listSyncEvents'), {
        limit: neo4j.int(limit),
      });
      return result.records.map(r => ({
        timestamp: String(r.get('timestamp') ?? ''),
        skillsUpserted: toNumber(r.get('skillsUpserted')),
        capabilitiesCreated: toNumber(r.get('capabilitiesCreated')),
        matchesCreated: toNumber(r.get('matchesCreated')),
        gapsFound: toNumber(r.get('gapsFound')),
        durationMs: toNumber(r.get('durationMs')),
      }));
    });
  }

  async getQualityAggregate(): Promise<Record<string, unknown>> {
    return this.withSession(async session => {
      const result = await session.run(this.q('read.qualityAggregate'));
      const r = result.records[0];
      if (!r)
        return {
          avgSkill: 0,
          skillCount: 0,
          avgAgent: 0,
          agentCount: 0,
          avgCapability: 0,
          capabilityCount: 0,
        };
      return {
        avgSkill: Number(r.get('avgSkill') ?? 0),
        skillCount: toNumber(r.get('skillCount')),
        avgAgent: Number(r.get('avgAgent') ?? 0),
        agentCount: toNumber(r.get('agentCount')),
        avgCapability: Number(r.get('avgCapability') ?? 0),
        capabilityCount: toNumber(r.get('capabilityCount')),
      };
    });
  }

  async verifyImplementedBy(params: {
    skillId: string;
    agentName: string;
    agentNamespace: string;
    verified: boolean;
    verifiedBy: string;
  }): Promise<Record<string, unknown> | null> {
    return this.withSession(async session => {
      const result = await session.run(
        this.q('sync.verifyImplementedBy'),
        params,
      );
      if (result.records.length === 0) return null;
      const r = result.records[0];
      return {
        skillName: r.get('skillName'),
        confidence: Number(r.get('confidence')),
      };
    });
  }

  async overrideImplementedBy(params: {
    skillId: string;
    agentName: string;
    agentNamespace: string;
    skillName: string;
    verifiedBy: string;
  }): Promise<Record<string, unknown> | null> {
    return this.withSession(async session => {
      await session.run(this.q('sync.deleteCapabilityImplementedByAll'), {
        skillId: params.skillId,
        agentName: params.agentName,
        agentNamespace: params.agentNamespace,
      });
      const result = await session.run(
        this.q('sync.overrideImplementedBy'),
        params,
      );
      if (result.records.length === 0) return null;
      return { skillName: result.records[0].get('skillName') };
    });
  }

  // ---------------------------------------------------------------------------
  // Skill Bundles
  // ---------------------------------------------------------------------------

  private bundleQ(key: string): string {
    return this.q(`bundle.${key}`);
  }

  async createBundle(params: {
    name: string;
    description: string;
    skillSlugs: string[];
    author: string;
  }): Promise<Record<string, unknown>> {
    return this.withSession(async session => {
      const id = randomUUID();
      await session.run(this.bundleQ('createBundle'), {
        id,
        name: params.name,
        description: params.description,
        author: params.author,
        status: 'draft',
      });
      const matchedSlugs: string[] = [];
      const unmatchedSlugs: string[] = [];
      const uniqueSlugs = [...new Set(params.skillSlugs)];
      for (const slug of uniqueSlugs) {
        const r = await session.run(this.bundleQ('linkSkill'), {
          bundleId: id,
          slug,
        });
        if (r.records.length > 0) {
          matchedSlugs.push(slug);
        } else {
          unmatchedSlugs.push(slug);
        }
      }
      await session.run(this.bundleQ('updateSkillCount'), { id });
      const full = await this.getBundle(id);
      if (full) {
        (full as Record<string, unknown>).matchedSlugs = matchedSlugs;
        (full as Record<string, unknown>).unmatchedSlugs = unmatchedSlugs;
      }
      return (
        full ?? {
          id,
          name: params.name,
          description: params.description,
          author: params.author,
          status: 'draft',
          skillCount: matchedSlugs.length,
          matchedSlugs,
          unmatchedSlugs,
        }
      );
    });
  }

  async listBundles(): Promise<Array<Record<string, unknown>>> {
    return this.withSession(async session => {
      const result = await session.run(this.bundleQ('listBundles'));
      return result.records.map(r => ({
        id: r.get('id'),
        name: r.get('name'),
        description: r.get('description'),
        author: r.get('author'),
        status: (r.get('status') as string) || 'draft',
        createdAt: r.get('createdAt')?.toString(),
        skillCount: toNumber(r.get('skillCount')),
      }));
    });
  }

  async getBundle(id: string): Promise<Record<string, unknown> | null> {
    return this.withSession(async session => {
      const bundleResult = await session.run(this.bundleQ('getBundle'), { id });
      if (bundleResult.records.length === 0) return null;
      const b = bundleResult.records[0].get('b').properties;

      const skillsResult = await session.run(this.bundleQ('getBundleSkills'), {
        id,
      });
      const skills = skillsResult.records.map(r => ({
        name: r.get('name'),
        description: r.get('description'),
        category: r.get('category'),
        version: r.get('version'),
        complexity: r.get('complexity'),
        author: r.get('skillAuthor'),
        addedBy: r.get('addedBy') || 'user',
        slug: r.get('slug'),
      }));

      return {
        id: b.id,
        name: b.name,
        description: b.description,
        author: b.author,
        status: (b.status as string) || 'draft',
        createdAt: b.createdAt?.toString(),
        updatedAt: b.updatedAt?.toString(),
        skillCount: skills.length,
        skills,
      };
    });
  }

  async updateBundleStatus(id: string, status: string): Promise<boolean> {
    return this.withSession(async session => {
      const result = await session.run(
        `MATCH (b:SkillBundle {id: $id})
         SET b.status = $status, b.updatedAt = datetime()
         RETURN b.id AS id`,
        { id, status },
      );
      return result.records.length > 0;
    });
  }

  async createOrUpdateBundleFromOCI(opts: {
    name: string;
    description: string;
    author: string;
    skillNames: string[];
    status: string;
  }): Promise<void> {
    return this.withSession(async session => {
      // MERGE on name ensures OCI-synced and API-created bundles with the
      // same name converge to a single node (no duplicates).
      // ON CREATE assigns a UUID id so both access paths work.
      await session.run(
        `MERGE (b:SkillBundle {name: $name})
         ON CREATE SET b.id = randomUUID(), b.description = $description, b.author = $author,
           b.status = $status, b.source = 'oci', b.skillCount = 0,
           b.createdAt = datetime(), b.updatedAt = datetime()
         ON MATCH SET b.description = CASE WHEN b.source = 'oci' OR b.description IS NULL THEN $description ELSE b.description END,
           b.status = CASE WHEN b.source = 'oci' THEN $status ELSE b.status END,
           b.updatedAt = datetime()`,
        {
          name: opts.name,
          description: opts.description,
          author: opts.author,
          status: opts.status,
        },
      );

      for (const skillName of opts.skillNames) {
        await session.run(
          `MATCH (b:SkillBundle {name: $bundleName})
           MATCH (s:Skill) WHERE s.name = $skillName
           MERGE (b)-[r:INCLUDES]->(s)
           ON CREATE SET r.addedBy = 'oci-sync', r.addedAt = datetime()`,
          { bundleName: opts.name, skillName },
        );
      }

      await session.run(
        `MATCH (b:SkillBundle {name: $name})
         OPTIONAL MATCH (b)-[:INCLUDES]->(s:Skill)
         WITH b, count(s) AS cnt
         SET b.skillCount = cnt`,
        { name: opts.name },
      );
    });
  }

  async updateBundle(
    id: string,
    params: { name?: string; description?: string; skillSlugs?: string[] },
  ): Promise<Record<string, unknown> | null> {
    return this.withSession(async session => {
      const check = await session.run(this.bundleQ('getBundle'), { id });
      if (check.records.length === 0) return null;

      if (params.name || params.description !== undefined) {
        await session.run(this.bundleQ('updateBundleMeta'), {
          id,
          name: params.name ?? null,
          description: params.description ?? null,
        });
      }

      const matchedSlugs: string[] = [];
      const unmatchedSlugs: string[] = [];
      if (params.skillSlugs) {
        const uniqueSlugs = [...new Set(params.skillSlugs)];
        await session.run(this.bundleQ('deleteIncludesEdges'), { id });
        for (const slug of uniqueSlugs) {
          const r = await session.run(this.bundleQ('linkSkill'), {
            bundleId: id,
            slug,
          });
          if (r.records.length > 0) {
            matchedSlugs.push(slug);
          } else {
            unmatchedSlugs.push(slug);
          }
        }
        await session.run(this.bundleQ('updateSkillCountWithTimestamp'), {
          id,
        });
      }

      const bundle = await this.getBundle(id);
      if (bundle && params.skillSlugs) {
        (bundle as Record<string, unknown>).matchedSlugs = matchedSlugs;
        (bundle as Record<string, unknown>).unmatchedSlugs = unmatchedSlugs;
      }
      return bundle;
    });
  }

  async deleteBundle(id: string): Promise<boolean> {
    return this.withSession(async session => {
      const result = await session.run(this.bundleQ('deleteBundle'), { id });
      return (result.summary.counters.updates().nodesDeleted ?? 0) > 0;
    });
  }

  /**
   * Sets each SkillBundle.skillCount to the number of :INCLUDES->:Skill links
   * when the stored count is stale (e.g. after skills were removed in sync).
   */
  async reconcileBundleSkillCounts(): Promise<number> {
    return this.withSession(async session => {
      const result = await session.run(`
        MATCH (b:SkillBundle)
        OPTIONAL MATCH (b)-[:INCLUDES]->(s:Skill)
        WITH b, count(s) AS actual
        WHERE b.skillCount <> actual
        SET b.skillCount = actual, b.updatedAt = datetime()
        RETURN count(b) AS updated
      `);
      return toNumber(result.records[0]?.get('updated'));
    });
  }

  async resolveDependencyTree(skillNames: string[]): Promise<{
    dependencies: Array<{
      name: string;
      category: string;
      description: string;
      dependencyOf: string;
    }>;
    tools: Array<{ name: string; description: string }>;
    similar: Array<{
      name: string;
      category: string;
      description: string;
      similarTo: string;
    }>;
  }> {
    if (skillNames.length === 0) {
      return { dependencies: [], tools: [], similar: [] };
    }
    const perRootLimit = Math.max(5, Math.ceil(30 / skillNames.length));
    return this.withSession(async session => {
      const depResult = await session.run(this.bundleQ('resolveDependencies'), {
        roots: skillNames,
      });
      const dependencies = depResult.records.map(r => ({
        name: r.get('name'),
        category: r.get('category') || '',
        description: r.get('description') || '',
        dependencyOf: r.get('dependencyOf'),
      }));

      const toolResult = await session.run(this.bundleQ('resolveTools'), {
        roots: skillNames,
      });
      const tools = toolResult.records.map(r => ({
        name: r.get('name'),
        description: r.get('description') || '',
      }));

      const simResult = await session.run(this.bundleQ('resolveSimilar'), {
        roots: skillNames,
        limit: neo4j.int(perRootLimit * skillNames.length),
      });
      const similar = simResult.records.map(r => ({
        name: r.get('name'),
        category: r.get('category') || '',
        description: r.get('description') || '',
        similarTo: r.get('similarTo'),
      }));

      return { dependencies, tools, similar };
    });
  }
}
