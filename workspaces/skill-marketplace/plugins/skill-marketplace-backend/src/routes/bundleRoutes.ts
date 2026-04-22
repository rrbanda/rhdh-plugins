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
import type { Neo4jService } from '../services';

export function registerBundleRoutes(
  router: Router,
  neo4j: Neo4jService | undefined,
  logger: LoggerService,
) {
  router.post('/graph/bundles', async (req, res) => {
    if (!neo4j) {
      res.status(503).json({ error: 'Neo4j not configured' });
      return;
    }
    const { name, description, skillSlugs } = req.body ?? {};
    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    if (!Array.isArray(skillSlugs) || skillSlugs.length === 0) {
      res.status(400).json({ error: 'skillSlugs must be a non-empty array' });
      return;
    }
    try {
      const author = (req as any).user?.identity?.userEntityRef ?? 'anonymous';
      const bundle = await neo4j.createBundle({ name, description: description || '', skillSlugs, author });
      res.status(201).json(bundle);
    } catch (err) {
      logger.error(`POST /graph/bundles failed: ${err instanceof Error ? err.message : err}`);
      res.status(500).json({ error: 'Failed to create bundle' });
    }
  });

  router.get('/graph/bundles', async (_req, res) => {
    if (!neo4j) {
      res.status(503).json({ error: 'Neo4j not configured' });
      return;
    }
    try {
      const bundles = await neo4j.listBundles();
      res.json({ bundles });
    } catch (err) {
      logger.error(`GET /graph/bundles failed: ${err instanceof Error ? err.message : err}`);
      res.status(500).json({ error: 'Failed to list bundles' });
    }
  });

  router.get('/graph/bundles/:id', async (req, res) => {
    if (!neo4j) {
      res.status(503).json({ error: 'Neo4j not configured' });
      return;
    }
    try {
      const bundle = await neo4j.getBundle(req.params.id);
      if (!bundle) {
        res.status(404).json({ error: 'Bundle not found' });
        return;
      }
      res.json(bundle);
    } catch (err) {
      logger.error(`GET /graph/bundles/:id failed: ${err instanceof Error ? err.message : err}`);
      res.status(500).json({ error: 'Failed to fetch bundle' });
    }
  });

  router.put('/graph/bundles/:id', async (req, res) => {
    if (!neo4j) {
      res.status(503).json({ error: 'Neo4j not configured' });
      return;
    }
    const { name, description, skillSlugs } = req.body ?? {};
    if (name !== undefined && typeof name !== 'string') {
      res.status(400).json({ error: 'name must be a string' });
      return;
    }
    if (description !== undefined && typeof description !== 'string') {
      res.status(400).json({ error: 'description must be a string' });
      return;
    }
    if (skillSlugs !== undefined && (!Array.isArray(skillSlugs) || !skillSlugs.every((s: unknown) => typeof s === 'string'))) {
      res.status(400).json({ error: 'skillSlugs must be an array of strings' });
      return;
    }
    try {
      const bundle = await neo4j.updateBundle(req.params.id, { name, description, skillSlugs });
      if (!bundle) {
        res.status(404).json({ error: 'Bundle not found' });
        return;
      }
      res.json(bundle);
    } catch (err) {
      logger.error(`PUT /graph/bundles/:id failed: ${err instanceof Error ? err.message : err}`);
      res.status(500).json({ error: 'Failed to update bundle' });
    }
  });

  router.delete('/graph/bundles/:id', async (req, res) => {
    if (!neo4j) {
      res.status(503).json({ error: 'Neo4j not configured' });
      return;
    }
    try {
      const deleted = await neo4j.deleteBundle(req.params.id);
      if (!deleted) {
        res.status(404).json({ error: 'Bundle not found' });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      logger.error(`DELETE /graph/bundles/:id failed: ${err instanceof Error ? err.message : err}`);
      res.status(500).json({ error: 'Failed to delete bundle' });
    }
  });

  router.get('/graph/bundles/:id/export', async (req, res) => {
    if (!neo4j) {
      res.status(503).json({ error: 'Neo4j not configured' });
      return;
    }
    try {
      const bundle = await neo4j.getBundle(req.params.id);
      if (!bundle) {
        res.status(404).json({ error: 'Bundle not found' });
        return;
      }
      const skills = (bundle.skills ?? []) as Array<{ name: string; slug: string; category: string; description: string; addedBy: string }>;
      const resolved = await neo4j.resolveDependencyTree(skills.map(s => s.name));
      res.json({
        name: bundle.name,
        description: bundle.description,
        author: bundle.author,
        createdAt: bundle.createdAt,
        skills: skills.map(s => ({
          name: s.name,
          slug: s.slug,
          category: s.category,
          addedBy: s.addedBy || 'user',
          description: s.description || '',
        })),
        dependencies: resolved.dependencies,
        toolRequirements: resolved.tools,
        similarSuggestions: resolved.similar,
        totalSkills: skills.length + resolved.dependencies.length,
        manuallyAdded: skills.length,
        autoDependencies: resolved.dependencies.length,
      });
    } catch (err) {
      logger.error(`GET /graph/bundles/:id/export failed: ${err instanceof Error ? err.message : err}`);
      res.status(500).json({ error: 'Failed to export bundle' });
    }
  });

  router.post('/graph/bundles/:id/fork', async (req, res) => {
    if (!neo4j) {
      res.status(503).json({ error: 'Neo4j not configured' });
      return;
    }
    try {
      const original = await neo4j.getBundle(req.params.id);
      if (!original) {
        res.status(404).json({ error: 'Bundle not found' });
        return;
      }
      const author = (req as any).user?.identity?.userEntityRef ?? 'anonymous';
      const origSkills = (original.skills ?? []) as Array<{ slug: string }>;
      const ts = new Date().toISOString().slice(0, 16).replace('T', ' ');
      const forked = await neo4j.createBundle({
        name: `${original.name} (fork ${ts})`,
        description: String(original.description ?? ''),
        skillSlugs: origSkills.map(s => s.slug),
        author,
      });
      res.status(201).json(forked);
    } catch (err) {
      logger.error(`POST /graph/bundles/:id/fork failed: ${err instanceof Error ? err.message : err}`);
      res.status(500).json({ error: 'Failed to fork bundle' });
    }
  });

  router.post('/graph/bundles/resolve', async (req, res) => {
    if (!neo4j) {
      res.status(503).json({ error: 'Neo4j not configured' });
      return;
    }
    const { skillNames } = req.body ?? {};
    if (!Array.isArray(skillNames) || skillNames.length === 0) {
      res.status(400).json({ error: 'skillNames must be a non-empty array' });
      return;
    }
    try {
      const resolved = await neo4j.resolveDependencyTree(skillNames);
      res.json(resolved);
    } catch (err) {
      logger.error(`POST /graph/bundles/resolve failed: ${err instanceof Error ? err.message : err}`);
      res.status(500).json({ error: 'Failed to resolve dependencies' });
    }
  });
}
