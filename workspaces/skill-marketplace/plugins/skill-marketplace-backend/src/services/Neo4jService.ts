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

const REL_COLORS: Record<string, string> = {
  CROSS_LANGUAGE: '#f59e0b',
  USES_AUTH: '#ef4444',
  SAME_DOMAIN: '#8b5cf6',
  SAME_PLUGIN: '#06b6d4',
  COMPLEMENTS: '#10b981',
  DEPENDS_ON: '#ef4444',
  ALTERNATIVE_TO: '#f59e0b',
  EXTENDS: '#8b5cf6',
  PRECEDES: '#06b6d4',
  MEMBER_OF: '#64748b',
  RELATES_TO: '#475569',
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

function computeNodeSize(props: Record<string, unknown>): number {
  const complexity = (props.complexity as string) ?? '';
  if (COMPLEXITY_SIZE[complexity]) return COMPLEXITY_SIZE[complexity];
  const steps = toNumber(props.workflowSteps);
  if (steps > 0) return Math.max(25, Math.min(60, 20 + steps * 5));
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

export class Neo4jService {
  private driver: Driver | null = null;
  private readonly uri: string;
  private readonly user: string;
  private readonly password: string;
  private readonly database: string;
  private readonly logger: LoggerService;

  constructor(options: {
    uri: string;
    user: string;
    password: string;
    database: string;
    logger: LoggerService;
  }) {
    this.uri = options.uri;
    this.user = options.user;
    this.password = options.password;
    this.database = options.database;
    this.logger = options.logger;
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
    const session = await this.getHealthySession();
    try {
      const labelsResult = await session.run(
        'MATCH (n) WITH labels(n) AS lbls UNWIND lbls AS lbl RETURN lbl AS name, count(*) AS count ORDER BY count DESC',
      );
      const relTypesResult = await session.run(
        'MATCH ()-[r]->() RETURN type(r) AS type, count(*) AS count ORDER BY count DESC',
      );
      const totalNodesResult = await session.run('MATCH (n) RETURN count(n) AS c');
      const totalRelsResult = await session.run('MATCH ()-[r]->() RETURN count(r) AS c');
      const pluginGroupsResult = await session.run(
        'MATCH (n) WHERE n.plugin IS NOT NULL RETURN n.plugin AS plugin, n.pluginColor AS color, count(*) AS count ORDER BY count DESC',
      );

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

      return {
        labels,
        relationshipTypes,
        pluginGroups,
        totalNodes: toNumber(totalNodesResult.records[0]?.get('c')),
        totalRelationships: toNumber(totalRelsResult.records[0]?.get('c')),
      };
    } finally {
      await session.close();
    }
  }

  async fetchFullGraph(limit?: number): Promise<NvlGraphData> {
    const schema = await this.discoverSchema();
    const labelColorMap = new Map(schema.labels.map(l => [l.name, l.color]));

    const session = await this.getHealthySession();
    try {
      const nodeLimit = limit ?? 500;

      const nodesResult = await session.run(
        'MATCH (n) RETURN n, labels(n) AS lbls, elementId(n) AS eid LIMIT $limit',
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
          size: computeNodeSize(props),
          labels: lbls,
          properties: serializeProps(props),
        };
      });

      const nodeIds = new Set(nodes.map(n => n.id));

      const relsResult = await session.run(
        `MATCH (a)-[r]->(b)
         WHERE elementId(a) IN $eids AND elementId(b) IN $eids
         RETURN elementId(a) AS fromEid, elementId(b) AS toEid,
                type(r) AS rType, properties(r) AS rProps, elementId(r) AS rEid`,
        { eids: Array.from(nodeElementIdMap.keys()) },
      );

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

      return { nodes, relationships, schema };
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
          `CALL db.index.fulltext.queryNodes("skill_search", $query)
           YIELD node, score WHERE score > 0.3
           RETURN node AS n, labels(node) AS lbls, elementId(node) AS eid
           ORDER BY score DESC LIMIT 50`,
          { query: `${query}~` },
        );
      } catch {
        nodesResult = await session.run(
          `MATCH (n)
           WITH n, labels(n) AS lbls, elementId(n) AS eid,
                [key IN keys(n) WHERE n[key] =~ '(?i).*' + $query + '.*' | key] AS matchedKeys
           WHERE size(matchedKeys) > 0
           RETURN n, lbls, eid LIMIT 50`,
          { query },
        );
      }

      const nodes: NvlNode[] = nodesResult.records.map(record => {
        const node = record.get('n');
        const lbls = record.get('lbls') as string[];
        const eid = record.get('eid') as string;
        const props = node.properties as Record<string, unknown>;
        const primaryLabel = lbls[0] ?? 'Unknown';
        const labelColor = labelColorMap.get(primaryLabel) ?? '#6b7280';

        return {
          id: resolveId(props, eid),
          caption: resolveCaption(props, primaryLabel),
          color: resolveNodeColor(props, labelColor),
          size: computeNodeSize(props),
          labels: lbls,
          properties: serializeProps(props),
        };
      });

      return { nodes, relationships: [], schema };
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
        `MATCH (center)
         WHERE center.id = $nodeId OR elementId(center) = $nodeId
         MATCH path = (center)-[*1..${safeDepth}]-(neighbor)
         WITH collect(DISTINCT center) + collect(DISTINCT neighbor) AS allNodes,
              [p IN collect(DISTINCT path) | relationships(p)] AS allRelPaths
         UNWIND allNodes AS n
         WITH collect(DISTINCT n)[0..$limit] AS nodes, allRelPaths
         RETURN nodes, allRelPaths`,
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
          size: computeNodeSize(props),
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
}
