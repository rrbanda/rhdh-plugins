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
        ? parseInt(req.query.limit as string, 10)
        : undefined;
      const data = await neo4j.fetchFullGraph(limit);
      res.json(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      logger.error(`GET /graph failed: ${msg}`);
      res.status(500).json({ error: msg });
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
      const msg = err instanceof Error ? err.message : 'Unknown error';
      logger.error(`GET /graph/schema failed: ${msg}`);
      res.status(500).json({ error: msg });
    }
  });

  router.post('/graph/search', async (req, res) => {
    if (!neo4j) {
      res.status(503).json({ error: 'Neo4j not configured' });
      return;
    }
    const { query } = req.body;
    if (!query) {
      res.status(400).json({ error: 'query is required' });
      return;
    }
    try {
      const data = await neo4j.searchGraph(query);
      res.json(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      logger.error(`POST /graph/search failed: ${msg}`);
      res.status(500).json({ error: msg });
    }
  });

  router.post('/graph/neighborhood', async (req, res) => {
    if (!neo4j) {
      res.status(503).json({ error: 'Neo4j not configured' });
      return;
    }
    const { nodeId, depth, limit } = req.body;
    if (!nodeId) {
      res.status(400).json({ error: 'nodeId is required' });
      return;
    }
    try {
      const data = await neo4j.fetchNeighborhood(nodeId, depth, limit);
      res.json(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      logger.error(`POST /graph/neighborhood failed: ${msg}`);
      res.status(500).json({ error: msg });
    }
  });

  router.post('/graph/build', async (_req, res) => {
    if (!builderProxy) {
      res.status(503).json({ error: 'Builder agent not configured' });
      return;
    }
    try {
      const upstream = await builderProxy.graphBuild();
      if (!upstream.ok) {
        const text = await upstream.text();
        res.status(upstream.status).send(text);
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
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res
        .status(502)
        .json({ error: `Failed to reach builder agent: ${message}` });
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
