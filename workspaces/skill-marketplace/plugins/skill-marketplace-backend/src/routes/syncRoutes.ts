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
import { skillMarketplaceAdminPermission } from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import type { SkillGraphSyncService } from '../services';
import { requirePermission } from './authUtils';
import { getRequestAbortSignal } from './requestSignal';

export function registerSyncRoutes(
  router: Router,
  logger: LoggerService,
  syncService?: SkillGraphSyncService,
  httpAuth?: HttpAuthService,
  permissions?: PermissionsService,
  securityMode?: string,
) {
  router.post('/sync', async (req, res) => {
    try {
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

      if (!syncService) {
        res.status(503).json({
          error:
            'Graph sync not available — configure Neo4j and OCI registries',
        });
        return;
      }

      logger.info('Graph sync triggered via API');
      const result = await syncService.sync({
        signal: getRequestAbortSignal(req),
      });
      let status = 200;
      if (result.ok === false) {
        status =
          result.durationMs === 0 && result.nodesUpserted === 0 ? 409 : 500;
      }
      res.status(status).json(result);
    } catch (err) {
      logger.error(`POST /sync failed: ${(err as Error).message}`);
      res.status(500).json({ error: 'Graph sync request failed' });
    }
  });

  router.get('/sync/status', async (_req, res) => {
    try {
      if (!syncService) {
        res.json({
          available: false,
          status: 'idle',
          lastSyncAt: null,
          staleSinceMs: null,
          lastSyncDurationMs: null,
          lastError: null,
          skillCount: 0,
          nextSyncAt: null,
          embeddingCoverage: { total: 0, withEmbeddings: 0 },
        });
        return;
      }
      const body = { available: true, ...(await syncService.getStatus()) };
      res.json(body);
    } catch (err) {
      logger.error(`GET /sync/status failed: ${(err as Error).message}`);
      res.status(500).json({ error: 'Failed to get sync status' });
    }
  });
}
