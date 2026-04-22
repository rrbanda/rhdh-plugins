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
import neo4j, { type Driver } from 'neo4j-driver';
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
  '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1',
  '#14b8a6', '#e11d48', '#a855f7', '#22c55e', '#eab308',
];

import { toNumber, serializeProps as sharedSerializeProps, resolveId, resolveCaption } from './neo4jUtils';

function relColor(type: string): string {
  return REL_COLORS[type] ?? '#475569';
}

const COMPLEXITY_SIZE: Record<string, number> = {
  Simple: 25,
  Medium: 35,
  Complex: 50,
  Advanced: 60,
};

function computeNodeSize(props: Record<string, unknown>, labels?: string[]): number {
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

function serializeProps(props: Record<string, unknown>): Record<string, unknown> {
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

  private q(key: string, templateVars?: Record<string, string | number>): string {
    if (!this.qc) throw new Error(`Neo4jService: queryCatalog not available for key "${key}"`);
    return this.qc.get(key, templateVars);
  }

  invalidateCache(): void {
    this.schemaCache = null;
    this.graphCache.clear();
  }

  private getDriver(): Driver {
    if (this.driver) return this.driver;
    this.driver = neo4j.driver(this.uri, neo4j.auth.basic(this.user, this.password));
    return this.driver;
  }

  private async resetDriver(): Promise<void> {
    if (this.driver) {
      try { await this.driver.close(); } catch { /* ignore close errors */ }
      this.driver = null;
    }
  }

  async getHealthySession() {
    let d = this.getDriver();
    try {
      await d.verifyConnectivity({ database: this.database });
    } catch {
      this.logger.warn('Neo4j connectivity check failed, resetting driver and retrying');
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

  async discoverSchema(): Promise<GraphSchema> {
    if (this.schemaCache && Date.now() < this.schemaCache.expiresAt) {
      return this.schemaCache.data;
    }
    const session = await this.getHealthySession();
    try {
      const labelsResult = await session.run(this.q('read.discoverSchemaLabels'));
      const relTypesResult = await session.run(this.q('read.discoverSchemaRelTypes'));
      const totalNodesResult = await session.run(this.q('read.countAllNodes'));
      const totalRelsResult = await session.run(this.q('read.countAllRels'));
      const pluginGroupsResult = await session.run(this.q('read.discoverPluginGroups'));

      const labels: GraphLabel[] = labelsResult.records.map((rec, i) => ({
        name: rec.get('name') as string,
        color: LABEL_PALETTE[i % LABEL_PALETTE.length],
        count: toNumber(rec.get('count')),
      }));

      const relationshipTypes: GraphRelType[] = relTypesResult.records.map(rec => ({
        type: rec.get('type') as string,
        count: toNumber(rec.get('count')),
      }));

      const pluginGroups: PluginGroup[] = pluginGroupsResult.records.map(rec => ({
        name: (rec.get('plugin') as string) || 'unknown',
        color: (rec.get('color') as string) || '#6b7280',
        count: toNumber(rec.get('count')),
      }));

      const schema: GraphSchema = {
        labels,
        relationshipTypes,
        pluginGroups,
        totalNodes: toNumber(totalNodesResult.records[0]?.get('c')),
        totalRelationships: toNumber(totalRelsResult.records[0]?.get('c')),
      };
      this.schemaCache = { data: schema, expiresAt: Date.now() + CACHE_TTL_MS };
      return schema;
    } finally {
      await session.close();
    }
  }

  async fetchFullGraph(limit?: number): Promise<NvlGraphData> {
    const nodeLimit = limit ?? 500;
    const cached = this.graphCache.get(nodeLimit);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.data;
    }

    const schema = await this.discoverSchema();
    const labelColorMap = new Map(schema.labels.map(l => [l.name, l.color]));

    const session = await this.getHealthySession();
    const tx = session.beginTransaction();
    try {
      const nodesResult = await tx.run(
        this.q('read.fetchFullGraphNodes'),
        { limit: neo4j.int(nodeLimit) },
      );

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

      const relsResult = await tx.run(
        this.q('read.fetchRelsByElementIds'),
        { eids: Array.from(nodeElementIdMap.keys()) },
      );

      await tx.commit();

      const relationships: NvlRelationship[] = [];
      const seenRelIds = new Set<string>();

      for (const record of relsResult.records) {
        const fromEid = record.get('fromEid') as string;
        const toEid = record.get('toEid') as string;
        const rType = record.get('rType') as string;
        const rProps = (record.get('rProps') as Record<string, unknown>) ?? {};
        const rEid = record.get('rEid') as string;

        const fromId = nodeElementIdMap.get(fromEid);
        const toId = nodeElementIdMap.get(toEid);
        if (!fromId || !toId || !nodeIds.has(fromId) || !nodeIds.has(toId)) continue;

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
      this.graphCache.set(nodeLimit, { data: graphData, expiresAt: Date.now() + CACHE_TTL_MS });
      return graphData;
    } catch (err) {
      try { await tx.rollback(); } catch (rollbackErr) {
        this.logger.warn(`Transaction rollback failed: ${rollbackErr}`);
      }
      throw err;
    } finally {
      await session.close();
    }
  }

  async searchGraph(query: string): Promise<NvlGraphData> {
    const schema = await this.discoverSchema();
    const labelColorMap = new Map(schema.labels.map(l => [l.name, l.color]));

    const session = await this.getHealthySession();
    try {

      let nodesResult;
      try {
        nodesResult = await session.run(
          this.q('read.searchGraphFulltext'),
          { query: `${query}~` },
        );
      } catch {
        nodesResult = await session.run(
          this.q('read.searchGraphFallback'),
          { query },
        );
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
          const rProps = (record.get('rProps') as Record<string, unknown>) ?? {};
          const rEid = record.get('rEid') as string;

          const fromId = nodeElementIdMap.get(fromEid);
          const toId = nodeElementIdMap.get(toEid);
          if (!fromId || !toId || !nodeIds.has(fromId) || !nodeIds.has(toId)) continue;

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
    } finally {
      await session.close();
    }
  }

  async fetchNeighborhood(
    nodeId: string,
    depth: number = 2,
    limit: number = 100,
  ): Promise<NvlGraphData> {
    const schema = await this.discoverSchema();
    const labelColorMap = new Map(schema.labels.map(l => [l.name, l.color]));

    const session = await this.getHealthySession();
    try {
      const safeDepth = Math.min(depth, 5);

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
          if (!fromId || !toId || !nodeIds.has(fromId) || !nodeIds.has(toId)) continue;

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
    } finally {
      await session.close();
    }
  }

  async listAllAgents(): Promise<Array<Record<string, unknown>>> {
    const session = await this.getHealthySession();
    try {
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
    } finally {
      await session.close();
    }
  }

  async getAgentsBySkill(skillName: string): Promise<Array<Record<string, unknown>>> {
    const session = await this.getHealthySession();
    try {
      const result = await session.run(
        this.q('read.fetchAgentsBySkill'),
        { skillName },
      );
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
    } finally {
      await session.close();
    }
  }

  async getSkillsByAgent(name: string, namespace: string): Promise<Array<Record<string, unknown>>> {
    const session = await this.getHealthySession();
    try {
      const result = await session.run(
        this.q('read.fetchSkillsByAgent'),
        { name, namespace },
      );
      return result.records.map(r => ({
        name: r.get('name'),
        description: r.get('description'),
        category: r.get('category'),
        version: r.get('version'),
        complexity: r.get('complexity'),
        author: r.get('author'),
        skillId: r.get('skillId'),
      }));
    } finally {
      await session.close();
    }
  }

  async countAgents(): Promise<number> {
    const session = await this.getHealthySession();
    try {
      const result = await session.run(this.q('read.countAllAgents'));
      return toNumber(result.records[0]?.get('c'));
    } finally {
      await session.close();
    }
  }

  async listAgentCapabilities(agentName: string, agentNamespace: string): Promise<Array<Record<string, unknown>>> {
    const session = await this.getHealthySession();
    try {
      const result = await session.run(
        this.q('read.listAgentCapabilities'),
        { agentName, agentNamespace },
      );
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
        matchConfidence: r.get('matchConfidence') != null ? Number(r.get('matchConfidence')) : null,
        matchType: r.get('matchType'),
        verified: r.get('verified') ?? false,
        verifiedBy: r.get('verifiedBy') ?? null,
        matchedAt: r.get('matchedAt') != null ? String(r.get('matchedAt')) : null,
        matchCount: toNumber(r.get('matchCount') ?? 0),
      }));
    } finally {
      await session.close();
    }
  }

  async findCatalogGaps(): Promise<Array<Record<string, unknown>>> {
    const session = await this.getHealthySession();
    try {
      const result = await session.run(this.q('read.findUnmatchedCapabilities'));
      return result.records.map(r => ({
        skillId: r.get('skillId'),
        name: r.get('name'),
        description: r.get('description'),
        tags: r.get('tags'),
        agentName: r.get('agentName'),
        agentNamespace: r.get('agentNamespace'),
      }));
    } finally {
      await session.close();
    }
  }

  async findUnusedSkills(limit: number = 100): Promise<Array<Record<string, unknown>>> {
    const session = await this.getHealthySession();
    try {
      const result = await session.run(
        this.q('read.findUnusedSkills'),
        { limit: neo4j.int(limit) },
      );
      return result.records.map(r => ({
        name: r.get('name'),
        description: r.get('description'),
        category: r.get('category'),
        version: r.get('version'),
      }));
    } finally {
      await session.close();
    }
  }

  async listTags(limit: number = 50): Promise<Array<Record<string, unknown>>> {
    const session = await this.getHealthySession();
    try {
      const result = await session.run(
        this.q('read.listTags'),
        { limit: neo4j.int(limit) },
      );
      return result.records.map(r => ({
        name: r.get('name'),
        skillCount: toNumber(r.get('skillCount')),
        capabilityCount: toNumber(r.get('capabilityCount')),
      }));
    } finally {
      await session.close();
    }
  }

  async countCatalogGaps(): Promise<number> {
    const session = await this.getHealthySession();
    try {
      const result = await session.run(this.q('read.countCatalogGaps'));
      return toNumber(result.records[0]?.get('gaps'));
    } finally {
      await session.close();
    }
  }

  async listSyncEvents(limit: number = 20): Promise<Array<Record<string, unknown>>> {
    const session = await this.getHealthySession();
    try {
      const result = await session.run(
        this.q('read.listSyncEvents'),
        { limit: neo4j.int(limit) },
      );
      return result.records.map(r => ({
        timestamp: String(r.get('timestamp') ?? ''),
        skillsUpserted: toNumber(r.get('skillsUpserted')),
        capabilitiesCreated: toNumber(r.get('capabilitiesCreated')),
        matchesCreated: toNumber(r.get('matchesCreated')),
        gapsFound: toNumber(r.get('gapsFound')),
        durationMs: toNumber(r.get('durationMs')),
      }));
    } finally {
      await session.close();
    }
  }

  async getQualityAggregate(): Promise<Record<string, unknown>> {
    const session = await this.getHealthySession();
    try {
      const result = await session.run(this.q('read.qualityAggregate'));
      const r = result.records[0];
      if (!r) return { avgSkill: 0, skillCount: 0, avgAgent: 0, agentCount: 0, avgCapability: 0, capabilityCount: 0 };
      return {
        avgSkill: Number(r.get('avgSkill') ?? 0),
        skillCount: toNumber(r.get('skillCount')),
        avgAgent: Number(r.get('avgAgent') ?? 0),
        agentCount: toNumber(r.get('agentCount')),
        avgCapability: Number(r.get('avgCapability') ?? 0),
        capabilityCount: toNumber(r.get('capabilityCount')),
      };
    } finally {
      await session.close();
    }
  }

  async verifyImplementedBy(params: {
    skillId: string;
    agentName: string;
    agentNamespace: string;
    verified: boolean;
    verifiedBy: string;
  }): Promise<Record<string, unknown> | null> {
    const session = await this.getHealthySession();
    try {
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
    } finally {
      await session.close();
    }
  }

  async overrideImplementedBy(params: {
    skillId: string;
    agentName: string;
    agentNamespace: string;
    skillName: string;
    verifiedBy: string;
  }): Promise<Record<string, unknown> | null> {
    const session = await this.getHealthySession();
    try {
      await session.run(
        this.q('sync.deleteCapabilityImplementedByAll'),
        { skillId: params.skillId, agentName: params.agentName, agentNamespace: params.agentNamespace },
      );
      const result = await session.run(
        this.q('sync.overrideImplementedBy'),
        params,
      );
      if (result.records.length === 0) return null;
      return { skillName: result.records[0].get('skillName') };
    } finally {
      await session.close();
    }
  }

  // ---------------------------------------------------------------------------
  // Skill Bundles
  // ---------------------------------------------------------------------------

  async createBundle(params: {
    name: string;
    description: string;
    skillSlugs: string[];
    author: string;
  }): Promise<Record<string, unknown>> {
    const session = await this.getHealthySession();
    try {
      const id = randomUUID();
      await session.run(
        `CREATE (b:SkillBundle {id: $id, name: $name, description: $description, author: $author, skillCount: $skillCount, createdAt: datetime(), updatedAt: datetime()})`,
        { id, name: params.name, description: params.description, author: params.author, skillCount: neo4j.int(params.skillSlugs.length) },
      );
      for (const slug of params.skillSlugs) {
        await session.run(
          `MATCH (b:SkillBundle {id: $bundleId})
           MATCH (s:Skill) WHERE s.name CONTAINS $slug OR s.category + '-' + s.name = $slug
           WITH b, s LIMIT 1
           MERGE (b)-[r:INCLUDES]->(s)
           SET r.addedBy = 'user', r.addedAt = datetime()`,
          { bundleId: id, slug },
        );
      }
      return { id, name: params.name, description: params.description, author: params.author, skillCount: params.skillSlugs.length };
    } finally {
      await session.close();
    }
  }

  async listBundles(): Promise<Array<Record<string, unknown>>> {
    const session = await this.getHealthySession();
    try {
      const result = await session.run(
        `MATCH (b:SkillBundle)
         OPTIONAL MATCH (b)-[:INCLUDES]->(s:Skill)
         RETURN b.id AS id, b.name AS name, b.description AS description,
                b.author AS author, b.createdAt AS createdAt,
                count(s) AS skillCount
         ORDER BY b.createdAt DESC`,
      );
      return result.records.map(r => ({
        id: r.get('id'),
        name: r.get('name'),
        description: r.get('description'),
        author: r.get('author'),
        createdAt: r.get('createdAt')?.toString(),
        skillCount: toNumber(r.get('skillCount')),
      }));
    } finally {
      await session.close();
    }
  }

  async getBundle(id: string): Promise<Record<string, unknown> | null> {
    const session = await this.getHealthySession();
    try {
      const bundleResult = await session.run(
        `MATCH (b:SkillBundle {id: $id}) RETURN b`,
        { id },
      );
      if (bundleResult.records.length === 0) return null;
      const b = bundleResult.records[0].get('b').properties;

      const skillsResult = await session.run(
        `MATCH (b:SkillBundle {id: $id})-[r:INCLUDES]->(s:Skill)
         RETURN s.name AS name, s.description AS description, s.category AS category,
                s.version AS version, s.complexity AS complexity, s.author AS skillAuthor,
                r.addedBy AS addedBy,
                s.category + '-' + s.name AS slug
         ORDER BY s.name`,
        { id },
      );
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
        createdAt: b.createdAt?.toString(),
        updatedAt: b.updatedAt?.toString(),
        skills,
      };
    } finally {
      await session.close();
    }
  }

  async updateBundle(
    id: string,
    params: { name?: string; description?: string; skillSlugs?: string[] },
  ): Promise<Record<string, unknown> | null> {
    const session = await this.getHealthySession();
    try {
      const check = await session.run(`MATCH (b:SkillBundle {id: $id}) RETURN b`, { id });
      if (check.records.length === 0) return null;

      if (params.name || params.description !== undefined) {
        await session.run(
          `MATCH (b:SkillBundle {id: $id})
           SET b.name = COALESCE($name, b.name),
               b.description = COALESCE($description, b.description),
               b.updatedAt = datetime()`,
          { id, name: params.name ?? null, description: params.description ?? null },
        );
      }

      if (params.skillSlugs) {
        await session.run(`MATCH (b:SkillBundle {id: $id})-[r:INCLUDES]->() DELETE r`, { id });
        for (const slug of params.skillSlugs) {
          await session.run(
            `MATCH (b:SkillBundle {id: $bundleId})
             MATCH (s:Skill) WHERE s.name CONTAINS $slug OR s.category + '-' + s.name = $slug
             WITH b, s LIMIT 1
             MERGE (b)-[r:INCLUDES]->(s)
             SET r.addedBy = 'user', r.addedAt = datetime()`,
            { bundleId: id, slug },
          );
        }
        await session.run(
          `MATCH (b:SkillBundle {id: $id})
           OPTIONAL MATCH (b)-[:INCLUDES]->(s:Skill)
           WITH b, count(s) AS cnt
           SET b.skillCount = cnt, b.updatedAt = datetime()`,
          { id },
        );
      }

      return this.getBundle(id);
    } finally {
      await session.close();
    }
  }

  async deleteBundle(id: string): Promise<void> {
    const session = await this.getHealthySession();
    try {
      await session.run(`MATCH (b:SkillBundle {id: $id}) DETACH DELETE b`, { id });
    } finally {
      await session.close();
    }
  }

  async resolveDependencyTree(skillNames: string[]): Promise<{
    dependencies: Array<{ name: string; category: string; description: string; dependencyOf: string }>;
    tools: Array<{ name: string; description: string }>;
    similar: Array<{ name: string; category: string; description: string; similarTo: string }>;
  }> {
    const session = await this.getHealthySession();
    try {
      const depResult = await session.run(
        `WITH $roots AS rootNames
         UNWIND rootNames AS rootName
         MATCH (root:Skill {name: rootName})-[:DEPENDS_ON*1..3]->(dep:Skill)
         WHERE NOT dep.name IN rootNames
         RETURN DISTINCT dep.name AS name, dep.category AS category,
                dep.description AS description, rootName AS dependencyOf`,
        { roots: skillNames },
      );
      const dependencies = depResult.records.map(r => ({
        name: r.get('name'),
        category: r.get('category') || '',
        description: r.get('description') || '',
        dependencyOf: r.get('dependencyOf'),
      }));

      const toolResult = await session.run(
        `WITH $roots AS rootNames
         UNWIND rootNames AS rootName
         MATCH (s:Skill {name: rootName})-[:USES_TOOL]->(t:Tool)
         RETURN DISTINCT t.name AS name, t.description AS description`,
        { roots: skillNames },
      );
      const tools = toolResult.records.map(r => ({
        name: r.get('name'),
        description: r.get('description') || '',
      }));

      const simResult = await session.run(
        `WITH $roots AS rootNames
         UNWIND rootNames AS rootName
         MATCH (s:Skill {name: rootName})-[:SIMILAR_TO]-(sim:Skill)
         WHERE NOT sim.name IN rootNames
         RETURN DISTINCT sim.name AS name, sim.category AS category,
                sim.description AS description, rootName AS similarTo
         LIMIT 10`,
        { roots: skillNames },
      );
      const similar = simResult.records.map(r => ({
        name: r.get('name'),
        category: r.get('category') || '',
        description: r.get('description') || '',
        similarTo: r.get('similarTo'),
      }));

      return { dependencies, tools, similar };
    } finally {
      await session.close();
    }
  }
}
