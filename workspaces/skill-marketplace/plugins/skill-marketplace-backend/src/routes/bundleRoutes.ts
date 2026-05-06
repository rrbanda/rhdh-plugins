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
import type {
  HttpAuthService,
  LoggerService,
  PermissionsService,
} from '@backstage/backend-plugin-api';
import {
  skillMarketplaceAccessPermission,
  skillMarketplaceAdminPermission,
} from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import type { Neo4jService, OciRegistryService } from '../services';
import { requirePermission } from './authUtils';

export function registerBundleRoutes(
  router: Router,
  neo4j: Neo4jService | undefined,
  logger: LoggerService,
  httpAuth?: HttpAuthService,
  permissions?: PermissionsService,
  securityMode?: string,
  ociRegistry?: OciRegistryService,
) {
  router.post('/graph/bundles/resolve', async (req, res) => {
    const allowed = await requirePermission(
      req,
      res,
      skillMarketplaceAccessPermission,
      {
        httpAuth,
        permissions,
        securityMode,
      },
    );
    if (!allowed) return;
    if (!neo4j) {
      res.status(503).json({ error: 'Neo4j not configured' });
      return;
    }
    const { skillNames } = req.body ?? {};
    if (
      !Array.isArray(skillNames) ||
      skillNames.length === 0 ||
      !skillNames.every((s: unknown) => typeof s === 'string')
    ) {
      res
        .status(400)
        .json({ error: 'skillNames must be a non-empty array of strings' });
      return;
    }
    try {
      const resolved = await neo4j.resolveDependencyTree(skillNames);
      res.json(resolved);
    } catch (err) {
      logger.error(
        `POST /graph/bundles/resolve failed: ${err instanceof Error ? err.message : err}`,
      );
      res.status(500).json({ error: 'Failed to resolve dependencies' });
    }
  });

  router.post('/graph/bundles', async (req, res) => {
    const allowed = await requirePermission(
      req,
      res,
      skillMarketplaceAdminPermission,
      {
        httpAuth,
        permissions,
        securityMode,
      },
    );
    if (!allowed) return;
    if (!neo4j) {
      res.status(503).json({ error: 'Neo4j not configured' });
      return;
    }
    const { name, description, skillSlugs } = req.body ?? {};
    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    if (
      !Array.isArray(skillSlugs) ||
      skillSlugs.length === 0 ||
      !skillSlugs.every((s: unknown) => typeof s === 'string')
    ) {
      res
        .status(400)
        .json({ error: 'skillSlugs must be a non-empty array of strings' });
      return;
    }
    try {
      const author = (req as any).user?.identity?.userEntityRef ?? 'anonymous';

      // OCI-first: push bundle artifact as draft immediately
      let ociReference: string | undefined;
      if (ociRegistry) {
        try {
          ociReference = await ociRegistry.pushBundle(
            {
              name,
              description: description || '',
              author,
              skills: skillSlugs.map((slug: string) => ({ slug, name: slug })),
            },
            'draft',
          );
          logger.info(
            `Bundle '${name}' pushed to OCI as draft: ${ociReference}`,
          );
        } catch (ociErr) {
          logger.warn(
            `OCI push for new bundle failed (saving to graph only): ${(ociErr as Error).message}`,
          );
        }
      }

      // Also persist in Neo4j for immediate availability
      const bundle = await neo4j.createBundle({
        name,
        description: description || '',
        skillSlugs,
        author,
      });
      res.status(201).json({ ...bundle, ociReference });
    } catch (err) {
      logger.error(
        `POST /graph/bundles failed: ${err instanceof Error ? err.message : err}`,
      );
      res.status(500).json({ error: 'Failed to create bundle' });
    }
  });

  router.post('/graph/bundles/import', async (req, res) => {
    const allowed = await requirePermission(
      req,
      res,
      skillMarketplaceAdminPermission,
      {
        httpAuth,
        permissions,
        securityMode,
      },
    );
    if (!allowed) return;
    if (!neo4j) {
      res.status(503).json({ error: 'Neo4j not configured' });
      return;
    }

    const { name, description, skills } = req.body ?? {};
    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    if (!Array.isArray(skills) || skills.length === 0) {
      res
        .status(400)
        .json({ error: 'skills array is required and must not be empty' });
      return;
    }

    try {
      const skillSlugs = skills
        .map((s: { slug?: string; name?: string }) => s.slug || s.name)
        .filter(Boolean) as string[];
      const result = await neo4j.createBundle({
        name,
        description: description || '',
        skillSlugs,
        author: (req as any).user?.identity?.userEntityRef ?? 'anonymous',
      });
      res.status(201).json(result);
    } catch (err) {
      logger.error(
        `POST /graph/bundles/import failed: ${err instanceof Error ? err.message : err}`,
      );
      res.status(500).json({ error: 'Failed to import bundle' });
    }
  });

  router.get('/graph/bundles', async (req, res) => {
    const allowed = await requirePermission(
      req,
      res,
      skillMarketplaceAccessPermission,
      {
        httpAuth,
        permissions,
        securityMode,
      },
    );
    if (!allowed) return;
    if (!neo4j) {
      res.status(503).json({ error: 'Neo4j not configured' });
      return;
    }
    try {
      const bundles = await neo4j.listBundles();
      res.json({ bundles });
    } catch (err) {
      logger.error(
        `GET /graph/bundles failed: ${err instanceof Error ? err.message : err}`,
      );
      res.status(500).json({ error: 'Failed to list bundles' });
    }
  });

  router.patch('/graph/bundles/:id/status', async (req, res) => {
    const allowed = await requirePermission(
      req,
      res,
      skillMarketplaceAdminPermission,
      {
        httpAuth,
        permissions,
        securityMode,
      },
    );
    if (!allowed) return;

    if (!neo4j) {
      res.status(503).json({ error: 'Neo4j not configured' });
      return;
    }

    const { status } = req.body ?? {};
    const validStatuses = [
      'draft',
      'testing',
      'published',
      'deprecated',
      'archived',
    ];
    if (!status || !validStatuses.includes(status)) {
      res
        .status(400)
        .json({ error: `status must be one of: ${validStatuses.join(', ')}` });
      return;
    }

    // Aligned with skill LIFECYCLE_TRANSITIONS from the SDLC spec
    const BUNDLE_LIFECYCLE_TRANSITIONS: Record<string, string[]> = {
      draft: ['testing', 'archived'],
      testing: ['draft', 'published', 'archived'],
      published: ['deprecated'],
      deprecated: ['archived', 'published'],
      archived: [],
    };

    try {
      const bundle = await neo4j.getBundle(req.params.id);
      if (!bundle) {
        res.status(404).json({ error: 'Bundle not found' });
        return;
      }

      const currentStatus = (bundle as { status?: string }).status || 'draft';
      const allowedTransitions =
        BUNDLE_LIFECYCLE_TRANSITIONS[currentStatus] || [];
      if (!allowedTransitions.includes(status)) {
        res.status(409).json({
          error: `Cannot transition from '${currentStatus}' to '${status}'. Valid transitions: ${allowedTransitions.join(', ') || 'none'}`,
        });
        return;
      }

      // Pre-publish validation: bundle must have skills
      if (status === 'published' || status === 'testing') {
        const fullBundle = await neo4j.getBundle(req.params.id);
        const skills = (fullBundle as any)?.skills;
        if (!skills || !Array.isArray(skills) || skills.length === 0) {
          res.status(422).json({
            error: `Cannot transition to '${status}' — bundle has no skills.`,
          });
          return;
        }
      }

      // OCI-first: push/retag the bundle in OCI on every state transition
      if (ociRegistry) {
        const fullBundle = await neo4j.getBundle(req.params.id);
        if (fullBundle) {
          try {
            await ociRegistry.pushBundle(
              fullBundle as Record<string, unknown>,
              status,
            );
            logger.info(
              `Bundle '${(fullBundle as { name?: string }).name}' pushed to OCI as ${status}`,
            );
          } catch (ociErr) {
            const ociMsg = (ociErr as Error).message;
            logger.error(
              `OCI push failed during ${status} transition: ${ociMsg}`,
            );
            res.status(500).json({
              error: `OCI registry push failed: ${ociMsg}. Status was not changed.`,
            });
            return;
          }
        }
      }

      const updated = await neo4j.updateBundleStatus(req.params.id, status);
      if (!updated) {
        res.status(404).json({ error: 'Bundle not found' });
        return;
      }

      res.json({ id: req.params.id, status });
    } catch (err) {
      logger.error(
        `PATCH /graph/bundles/:id/status failed: ${(err as Error).message}`,
      );
      res.status(500).json({ error: 'Failed to update bundle status' });
    }
  });

  router.get('/graph/bundles/:id', async (req, res) => {
    const allowed = await requirePermission(
      req,
      res,
      skillMarketplaceAccessPermission,
      {
        httpAuth,
        permissions,
        securityMode,
      },
    );
    if (!allowed) return;
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
      logger.error(
        `GET /graph/bundles/:id failed: ${err instanceof Error ? err.message : err}`,
      );
      res.status(500).json({ error: 'Failed to fetch bundle' });
    }
  });

  router.put('/graph/bundles/:id', async (req, res) => {
    const allowed = await requirePermission(
      req,
      res,
      skillMarketplaceAdminPermission,
      {
        httpAuth,
        permissions,
        securityMode,
      },
    );
    if (!allowed) return;
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
    if (
      skillSlugs !== undefined &&
      (!Array.isArray(skillSlugs) ||
        !skillSlugs.every((s: unknown) => typeof s === 'string'))
    ) {
      res.status(400).json({ error: 'skillSlugs must be an array of strings' });
      return;
    }
    try {
      // Only allow editing bundles in draft or testing state
      const existing = await neo4j.getBundle(req.params.id);
      if (!existing) {
        res.status(404).json({ error: 'Bundle not found' });
        return;
      }
      const currentStatus = (existing as any).status || 'draft';
      if (currentStatus !== 'draft' && currentStatus !== 'testing') {
        res.status(409).json({
          error: `Cannot edit a bundle in '${currentStatus}' state. Only draft and testing bundles can be modified.`,
        });
        return;
      }

      const bundle = await neo4j.updateBundle(req.params.id, {
        name,
        description,
        skillSlugs,
      });
      if (!bundle) {
        res.status(404).json({ error: 'Bundle not found' });
        return;
      }

      // OCI-first: re-push updated bundle to OCI with current lifecycle state
      if (ociRegistry) {
        try {
          const fullBundle = await neo4j.getBundle(req.params.id);
          if (fullBundle) {
            await ociRegistry.pushBundle(
              fullBundle as Record<string, unknown>,
              currentStatus,
            );
          }
        } catch (ociErr) {
          logger.warn(
            `OCI re-push after edit failed: ${(ociErr as Error).message}`,
          );
        }
      }

      res.json(bundle);
    } catch (err) {
      logger.error(
        `PUT /graph/bundles/:id failed: ${err instanceof Error ? err.message : err}`,
      );
      res.status(500).json({ error: 'Failed to update bundle' });
    }
  });

  router.delete('/graph/bundles/:id', async (req, res) => {
    const allowed = await requirePermission(
      req,
      res,
      skillMarketplaceAdminPermission,
      {
        httpAuth,
        permissions,
        securityMode,
      },
    );
    if (!allowed) return;
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
      logger.error(
        `DELETE /graph/bundles/:id failed: ${err instanceof Error ? err.message : err}`,
      );
      res.status(500).json({ error: 'Failed to delete bundle' });
    }
  });

  router.get('/graph/bundles/:id/export', async (req, res) => {
    const allowed = await requirePermission(
      req,
      res,
      skillMarketplaceAccessPermission,
      {
        httpAuth,
        permissions,
        securityMode,
      },
    );
    if (!allowed) return;
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
      const skills = (bundle.skills ?? []) as Array<{
        name: string;
        slug: string;
        category: string;
        description: string;
        addedBy: string;
      }>;
      const resolved = await neo4j.resolveDependencyTree(
        skills.map(s => s.name),
      );
      res.json({
        name: bundle.name,
        description: bundle.description,
        author: bundle.author,
        status: (bundle as { status?: string }).status || 'draft',
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
      logger.error(
        `GET /graph/bundles/:id/export failed: ${err instanceof Error ? err.message : err}`,
      );
      res.status(500).json({ error: 'Failed to export bundle' });
    }
  });

  router.post('/graph/bundles/:id/fork', async (req, res) => {
    const allowed = await requirePermission(
      req,
      res,
      skillMarketplaceAdminPermission,
      {
        httpAuth,
        permissions,
        securityMode,
      },
    );
    if (!allowed) return;
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
      logger.error(
        `POST /graph/bundles/:id/fork failed: ${err instanceof Error ? err.message : err}`,
      );
      res.status(500).json({ error: 'Failed to fork bundle' });
    }
  });
}
