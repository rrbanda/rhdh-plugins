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
import type { HttpAuthService, LoggerService, PermissionsService } from '@backstage/backend-plugin-api';
import express from 'express';
import Router from 'express-promise-router';
import type { OciRegistryConfig } from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import type {
  Neo4jService,
  BuilderProxyService,
  KagentiService,
  OciRegistryService,
  SkillGraphSyncService,
  AgenticRagService,
} from './services';
import { SkillContextBuilder } from './services';
import {
  registerSkillsRoutes,
  registerGraphRoutes,
  registerBuilderRoutes,
  registerKagentiRoutes,
  registerSyncRoutes,
  registerRagRoutes,
  registerAgenticRoutes,
  registerLifecycleRoutes,
} from './routes';

/** @public */
export interface RouterOptions {
  logger: LoggerService;
  httpAuth?: HttpAuthService;
  permissions?: PermissionsService;
  neo4j?: Neo4jService;
  builderProxy?: BuilderProxyService;
  kagenti?: KagentiService;
  ociRegistry?: OciRegistryService;
  publishRegistry?: OciRegistryConfig;
  skillSearchDirs?: string[];
  kagentiDefaults?: { namespace: string; agentName: string };
  syncService?: SkillGraphSyncService;
  ragConfig?: Record<string, number>;
  agenticService?: AgenticRagService;
  securityMode?: string;
  builderStreamTimeoutMs?: number;
}

/** @public */
export async function createRouter(
  options: RouterOptions,
): Promise<express.Router> {
  const { logger, httpAuth, permissions, neo4j, builderProxy, kagenti, ociRegistry, publishRegistry, skillSearchDirs, kagentiDefaults, syncService, ragConfig, agenticService, securityMode, builderStreamTimeoutMs } = options;

  const router = Router();
  router.use(express.json());

  router.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      neo4jConfigured: !!neo4j,
      builderAgentConfigured: !!builderProxy,
      kagentiConfigured: !!kagenti,
      ociRegistryConfigured: !!ociRegistry,
      kagenti: kagentiDefaults
        ? { namespace: kagentiDefaults.namespace, agentName: kagentiDefaults.agentName }
        : undefined,
      builder: {
        streamTimeoutMs: builderStreamTimeoutMs ?? 300_000,
      },
    });
  });

  const skillContextBuilder = ociRegistry
    ? new SkillContextBuilder({ ociRegistry, logger })
    : undefined;

  registerSkillsRoutes(router, ociRegistry, logger, skillSearchDirs);
  registerGraphRoutes(router, neo4j, builderProxy, logger);
  registerBuilderRoutes(router, builderProxy, logger, ociRegistry, publishRegistry, httpAuth, permissions, syncService, securityMode);
  registerKagentiRoutes(router, kagenti, logger, httpAuth, permissions, securityMode, skillContextBuilder);
  registerSyncRoutes(router, logger, syncService, httpAuth, permissions, securityMode);
  registerRagRoutes(router, logger, neo4j, syncService, httpAuth, permissions, ragConfig);
  registerAgenticRoutes(router, logger, agenticService, httpAuth, permissions);
  registerLifecycleRoutes(router, logger, ociRegistry, httpAuth, permissions, securityMode);

  router.use(
    (
      err: Error & { code?: string },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (err.code === 'ECONNREFUSED') {
        logger.error(`External service unavailable: ${err.message}`);
        res.status(502).json({ error: 'External service is not reachable' });
        return;
      }
      logger.error(`Request failed: ${err.message}`);
      res.status(500).json({ error: 'Internal server error' });
    },
  );

  logger.info('Skills Marketplace backend router created');
  return router;
}
