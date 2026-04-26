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
import { skillMarketplaceAccessPermission } from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import type { SkillCatalogService } from '../services/SkillCatalogService';
import { requirePermission } from './authUtils';

export function registerCatalogRoutes(
  router: Router,
  catalogService: SkillCatalogService | undefined,
  logger: LoggerService,
  httpAuth?: HttpAuthService,
  permissions?: PermissionsService,
  securityMode?: string,
) {
  router.get('/catalog/skills', async (req, res) => {
    if (!catalogService) {
      res
        .status(503)
        .json({
          error:
            'Skill Catalog API not configured. Set skillMarketplace.catalog.baseUrl.',
        });
      return;
    }
    try {
      const result = await catalogService.searchSkills({
        q: (req.query.q as string) || undefined,
        status: (req.query.status as string) || undefined,
        namespace: (req.query.namespace as string) || undefined,
        tags: (req.query.tags as string) || undefined,
        compatibility: (req.query.compatibility as string) || undefined,
        page: req.query.page
          ? parseInt(req.query.page as string, 10)
          : undefined,
        per_page: req.query.per_page
          ? parseInt(req.query.per_page as string, 10)
          : undefined,
      });
      res.json(result);
    } catch (err) {
      logger.error(`GET /catalog/skills failed: ${(err as Error).message}`);
      res.status(502).json({ error: 'Failed to fetch from Skill Catalog API' });
    }
  });

  router.get('/catalog/skills/:namespace/:name', async (req, res) => {
    if (!catalogService) {
      res.status(503).json({ error: 'Skill Catalog API not configured' });
      return;
    }
    try {
      const skill = await catalogService.getSkill(
        req.params.namespace,
        req.params.name,
      );
      res.json({ data: skill });
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes('404')) {
        res
          .status(404)
          .json({
            error: `Skill ${req.params.namespace}/${req.params.name} not found`,
          });
        return;
      }
      logger.error(`GET /catalog/skills/:ns/:name failed: ${msg}`);
      res.status(502).json({ error: 'Failed to fetch skill from Catalog API' });
    }
  });

  router.get('/catalog/skills/:namespace/:name/versions', async (req, res) => {
    if (!catalogService) {
      res.status(503).json({ error: 'Skill Catalog API not configured' });
      return;
    }
    try {
      const versions = await catalogService.getSkillVersions(
        req.params.namespace,
        req.params.name,
      );
      res.json({ data: versions });
    } catch (err) {
      logger.error(
        `GET /catalog/skills/:ns/:name/versions failed: ${(err as Error).message}`,
      );
      res.status(502).json({ error: 'Failed to fetch skill versions' });
    }
  });

  router.get(
    '/catalog/skills/:namespace/:name/versions/:version/content',
    async (req, res) => {
      if (!catalogService) {
        res.status(503).json({ error: 'Skill Catalog API not configured' });
        return;
      }
      try {
        const content = await catalogService.getSkillContent(
          req.params.namespace,
          req.params.name,
          req.params.version,
        );
        res.type('text/markdown').send(content);
      } catch (err) {
        logger.error(
          `GET /catalog/skills content failed: ${(err as Error).message}`,
        );
        res.status(502).json({ error: 'Failed to fetch skill content' });
      }
    },
  );

  router.post('/catalog/sync', async (req, res) => {
    if (!catalogService) {
      res.status(503).json({ error: 'Skill Catalog API not configured' });
      return;
    }
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
    try {
      const result = await catalogService.triggerSync();
      res.json({ data: result });
    } catch (err) {
      logger.error(`POST /catalog/sync failed: ${(err as Error).message}`);
      res.status(502).json({ error: 'Failed to trigger catalog sync' });
    }
  });

  router.get('/catalog/available', async (_req, res) => {
    try {
      if (!catalogService) {
        res.json({ available: false, reason: 'not configured' });
        return;
      }
      const available = await catalogService.isAvailable();
      res.json({ available });
    } catch (err) {
      logger.error(`GET /catalog/available failed: ${(err as Error).message}`);
      res.status(500).json({ error: 'Failed to check catalog availability' });
    }
  });
}
