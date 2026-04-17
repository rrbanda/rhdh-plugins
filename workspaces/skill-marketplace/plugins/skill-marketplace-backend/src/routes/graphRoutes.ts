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

  router.post('/graph/build', async (req, res) => {
    if (!builderProxy) {
      res.status(503).json({ error: 'Builder agent not configured' });
      return;
    }
    try {
      const upstream = await builderProxy.graphBuild();
      if (!upstream.ok) {
        const text = await upstream.text();
        logger.error(`Graph build upstream error (${upstream.status}): ${text}`);
        res.status(upstream.status).json({ error: 'Graph build request failed' });
        return;
      }
      if (!upstream.body) {
        res.status(502).send('No stream body');
        return;
      }
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();
      upstream.body.pipe(res);
      upstream.body.on('error', err => {
        logger.error(`Graph build SSE error: ${err.message}`);
        res.end();
      });
      req.on('close', () => { (upstream.body as unknown as { destroy?: () => void })?.destroy?.(); });
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
