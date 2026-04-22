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
import { Router } from 'express';
import type { LoggerService } from '@backstage/backend-plugin-api';
import type { Neo4jService, BuilderProxyService } from '../services';
import { parseIntParam } from './authUtils';

export function registerGraphRoutes(
  router: Router,
  neo4j: Neo4jService | undefined,
  builderProxy: BuilderProxyService | undefined,
  logger: LoggerService,
) {
  router.get('/graph', async (req, res) => {
    if (!neo4j) {
      res.status(503).json({ error: 'Neo4j not configured' });
      return;
    }
    try {
      const limit = req.query.limit
        ? parseIntParam(req.query.limit, 500, 10000)
        : undefined;
      const data = await neo4j.fetchFullGraph(limit);
      res.json(data);
    } catch (err) {
      logger.error(`GET /graph failed: ${err instanceof Error ? err.message : err}`);
      res.status(500).json({ error: 'Failed to fetch graph data' });
    }
  });

  router.get('/graph/schema', async (_req, res) => {
    if (!neo4j) {
      res.status(503).json({ error: 'Neo4j not configured' });
      return;
    }
    try {
      const schema = await neo4j.discoverSchema();
      res.json(schema);
    } catch (err) {
      logger.error(`GET /graph/schema failed: ${err instanceof Error ? err.message : err}`);
      res.status(500).json({ error: 'Failed to fetch graph schema' });
    }
  });

  router.post('/graph/search', async (req, res) => {
    if (!neo4j) {
      res.status(503).json({ error: 'Neo4j not configured' });
      return;
    }
    const { query } = req.body ?? {};
    if (typeof query !== 'string' || !query.trim()) {
      res.status(400).json({ error: 'query is required and must be a string' });
      return;
    }
    try {
      const data = await neo4j.searchGraph(query);
      res.json(data);
    } catch (err) {
      logger.error(`POST /graph/search failed: ${err instanceof Error ? err.message : err}`);
      res.status(500).json({ error: 'Graph search failed' });
    }
  });

  router.post('/graph/neighborhood', async (req, res) => {
    if (!neo4j) {
      res.status(503).json({ error: 'Neo4j not configured' });
      return;
    }
    const { nodeId, depth: rawDepth, limit: rawLimit } = req.body ?? {};
    if (typeof nodeId !== 'string' || !nodeId.trim()) {
      res.status(400).json({ error: 'nodeId is required and must be a string' });
      return;
    }
    const depth = typeof rawDepth === 'number' && Number.isInteger(rawDepth) && rawDepth > 0
      ? rawDepth
      : 2;
    const limit = typeof rawLimit === 'number' && Number.isInteger(rawLimit) && rawLimit > 0
      ? rawLimit
      : undefined;
    try {
      const data = await neo4j.fetchNeighborhood(nodeId, depth, limit);
      res.json(data);
    } catch (err) {
      logger.error(`POST /graph/neighborhood failed: ${err instanceof Error ? err.message : err}`);
      res.status(500).json({ error: 'Failed to fetch neighborhood data' });
    }
  });

  // Agent-graph routes (reads from Neo4j, not Kagenti)
  router.get('/graph/agents', async (_req, res) => {
    if (!neo4j) {
      res.status(503).json({ error: 'Neo4j not configured' });
      return;
    }
    try {
      const agents = await neo4j.listAllAgents();
      res.json({ agents });
    } catch (err) {
      logger.error(`GET /graph/agents failed: ${err instanceof Error ? err.message : err}`);
      res.status(500).json({ error: 'Failed to list agents from graph' });
    }
  });

  router.get('/graph/agents/count', async (_req, res) => {
    if (!neo4j) {
      res.status(503).json({ error: 'Neo4j not configured' });
      return;
    }
    try {
      const count = await neo4j.countAgents();
      res.json({ count });
    } catch (err) {
      logger.error(`GET /graph/agents/count failed: ${err instanceof Error ? err.message : err}`);
      res.status(500).json({ error: 'Failed to count agents' });
    }
  });

  router.get('/graph/agents/:namespace/:name/capabilities', async (req, res) => {
    if (!neo4j) {
      res.status(503).json({ error: 'Neo4j not configured' });
      return;
    }
    try {
      const capabilities = await neo4j.listAgentCapabilities(req.params.name, req.params.namespace);
      res.json({ capabilities });
    } catch (err) {
      logger.error(`GET /graph/agents/:ns/:name/capabilities failed: ${err instanceof Error ? err.message : err}`);
      res.status(500).json({ error: 'Failed to fetch capabilities for agent' });
    }
  });

  router.get('/graph/capabilities/gaps', async (_req, res) => {
    if (!neo4j) {
      res.status(503).json({ error: 'Neo4j not configured' });
      return;
    }
    try {
      const gaps = await neo4j.findCatalogGaps();
      res.json({ gaps });
    } catch (err) {
      logger.error(`GET /graph/capabilities/gaps failed: ${err instanceof Error ? err.message : err}`);
      res.status(500).json({ error: 'Failed to find catalog gaps' });
    }
  });

  router.get('/graph/capabilities/gaps/count', async (_req, res) => {
    if (!neo4j) {
      res.status(503).json({ error: 'Neo4j not configured' });
      return;
    }
    try {
      const count = await neo4j.countCatalogGaps();
      res.json({ count });
    } catch (err) {
      logger.error(`GET /graph/capabilities/gaps/count failed: ${err instanceof Error ? err.message : err}`);
      res.status(500).json({ error: 'Failed to count catalog gaps' });
    }
  });

  router.get('/graph/skills/unused', async (req, res) => {
    if (!neo4j) {
      res.status(503).json({ error: 'Neo4j not configured' });
      return;
    }
    try {
      const limit = req.query.limit ? parseIntParam(req.query.limit, 100, 1000) : 100;
      const skills = await neo4j.findUnusedSkills(limit);
      res.json({ skills });
    } catch (err) {
      logger.error(`GET /graph/skills/unused failed: ${err instanceof Error ? err.message : err}`);
      res.status(500).json({ error: 'Failed to find unused skills' });
    }
  });

  router.get('/graph/tags', async (req, res) => {
    if (!neo4j) {
      res.status(503).json({ error: 'Neo4j not configured' });
      return;
    }
    try {
      const limit = req.query.limit ? parseIntParam(req.query.limit, 50, 200) : 50;
      const tags = await neo4j.listTags(limit);
      res.json({ tags });
    } catch (err) {
      logger.error(`GET /graph/tags failed: ${err instanceof Error ? err.message : err}`);
      res.status(500).json({ error: 'Failed to list tags' });
    }
  });

  router.get('/graph/agents/:namespace/:name/skills', async (req, res) => {
    if (!neo4j) {
      res.status(503).json({ error: 'Neo4j not configured' });
      return;
    }
    try {
      const skills = await neo4j.getSkillsByAgent(req.params.name, req.params.namespace);
      res.json({ skills });
    } catch (err) {
      logger.error(`GET /graph/agents/:ns/:name/skills failed: ${err instanceof Error ? err.message : err}`);
      res.status(500).json({ error: 'Failed to fetch skills for agent' });
    }
  });

  router.get('/graph/skills/:skillName/agents', async (req, res) => {
    if (!neo4j) {
      res.status(503).json({ error: 'Neo4j not configured' });
      return;
    }
    try {
      const agents = await neo4j.getAgentsBySkill(req.params.skillName);
      res.json({ agents });
    } catch (err) {
      logger.error(`GET /graph/skills/:name/agents failed: ${err instanceof Error ? err.message : err}`);
      res.status(500).json({ error: 'Failed to fetch agents for skill' });
    }
  });

  router.get('/graph/sync/history', async (req, res) => {
    if (!neo4j) {
      res.status(503).json({ error: 'Neo4j not configured' });
      return;
    }
    try {
      const limit = req.query.limit ? parseIntParam(req.query.limit, 20, 100) : 20;
      const events = await neo4j.listSyncEvents(limit);
      res.json({ events });
    } catch (err) {
      logger.error(`GET /graph/sync/history failed: ${err instanceof Error ? err.message : err}`);
      res.status(500).json({ error: 'Failed to list sync events' });
    }
  });

  router.get('/graph/quality', async (_req, res) => {
    if (!neo4j) {
      res.status(503).json({ error: 'Neo4j not configured' });
      return;
    }
    try {
      const quality = await neo4j.getQualityAggregate();
      res.json(quality);
    } catch (err) {
      logger.error(`GET /graph/quality failed: ${err instanceof Error ? err.message : err}`);
      res.status(500).json({ error: 'Failed to fetch quality metrics' });
    }
  });

  router.post('/graph/capabilities/:skillId/verify', async (req, res) => {
    if (!neo4j) {
      res.status(503).json({ error: 'Neo4j not configured' });
      return;
    }
    const { agentName, agentNamespace, verified } = req.body ?? {};
    if (!agentName || !agentNamespace || typeof verified !== 'boolean') {
      res.status(400).json({ error: 'agentName, agentNamespace, and verified (boolean) are required' });
      return;
    }
    try {
      const result = await neo4j.verifyImplementedBy({
        skillId: req.params.skillId,
        agentName,
        agentNamespace,
        verified,
        verifiedBy: (req as any).user?.identity?.userEntityRef ?? 'anonymous',
      });
      if (!result) {
        res.status(404).json({ error: 'IMPLEMENTED_BY edge not found' });
        return;
      }
      res.json(result);
    } catch (err) {
      logger.error(`POST /graph/capabilities/:id/verify failed: ${err instanceof Error ? err.message : err}`);
      res.status(500).json({ error: 'Failed to verify match' });
    }
  });

  router.post('/graph/capabilities/:skillId/override', async (req, res) => {
    if (!neo4j) {
      res.status(503).json({ error: 'Neo4j not configured' });
      return;
    }
    const { agentName, agentNamespace, skillName } = req.body ?? {};
    if (!agentName || !agentNamespace || !skillName) {
      res.status(400).json({ error: 'agentName, agentNamespace, and skillName are required' });
      return;
    }
    try {
      const result = await neo4j.overrideImplementedBy({
        skillId: req.params.skillId,
        agentName,
        agentNamespace,
        skillName,
        verifiedBy: (req as any).user?.identity?.userEntityRef ?? 'anonymous',
      });
      if (!result) {
        res.status(404).json({ error: 'Capability or skill not found' });
        return;
      }
      res.json(result);
    } catch (err) {
      logger.error(`POST /graph/capabilities/:id/override failed: ${err instanceof Error ? err.message : err}`);
      res.status(500).json({ error: 'Failed to override match' });
    }
  });

  router.post('/graph/build', async (_req, res) => {
    if (!builderProxy) {
      res.status(503).json({ error: 'Builder agent not configured' });
      return;
    }
    try {
      const events = await builderProxy.graphBuild();
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();
      for (const evt of events) {
        if (!res.writableEnded) {
          res.write(`event: ${evt.event}\ndata: ${JSON.stringify(evt.data)}\n\n`);
        }
      }
      if (!res.writableEnded) {
        res.write('event: stream_end\ndata: {}\n\n');
        res.end();
      }
    } catch (err) {
      logger.error(`POST /graph/build failed: ${err instanceof Error ? err.message : err}`);
      res.status(502).json({ error: 'Failed to reach builder agent' });
    }
  });

  router.post('/graph/update', async (req, res) => {
    if (!builderProxy) {
      res.status(503).json({ error: 'Builder agent not configured' });
      return;
    }
    const result = await builderProxy.graphUpdate(req.body);
    res.status(result.status).json(result.data);
  });
}
