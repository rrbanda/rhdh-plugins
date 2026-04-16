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
import { LoggerService } from '@backstage/backend-plugin-api';
import express from 'express';
import Router from 'express-promise-router';
import type { OciRegistryConfig } from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import type {
  Neo4jService,
  BuilderProxyService,
  KagentiService,
  OciRegistryService,
} from './services';
import {
  registerSkillsRoutes,
  registerGraphRoutes,
  registerBuilderRoutes,
  registerKagentiRoutes,
  registerSyncRoutes,
} from './routes';

/** @public */
export interface RouterOptions {
  logger: LoggerService;
  neo4j?: Neo4jService;
  builderProxy?: BuilderProxyService;
  kagenti?: KagentiService;
  ociRegistry?: OciRegistryService;
  publishRegistry?: OciRegistryConfig;
}

/** @public */
export async function createRouter(
  options: RouterOptions,
): Promise<express.Router> {
  const { logger, neo4j, builderProxy, kagenti, ociRegistry, publishRegistry } = options;

  const router = Router();
  router.use(express.json());

  router.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      neo4jConfigured: !!neo4j,
      builderAgentConfigured: !!builderProxy,
      kagentiConfigured: !!kagenti,
      ociRegistryConfigured: !!ociRegistry,
    });
  });

  registerSkillsRoutes(router, ociRegistry);
  registerGraphRoutes(router, neo4j, builderProxy, logger);
  registerBuilderRoutes(router, builderProxy, logger, ociRegistry, publishRegistry);
  registerKagentiRoutes(router, kagenti, logger);
  registerSyncRoutes(router, logger);

  router.use(
    (
      err: Error & { code?: string },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (err.code === 'ECONNREFUSED') {
        logger.error(`External service unavailable: ${err.message}`);
        res.status(502).json({
          error: 'External service is not reachable',
          details: err.message,
        });
        return;
      }
      logger.error(`Request failed: ${err.message}`);
      res.status(500).json({
        error: 'Internal server error',
        details: err.message,
      });
    },
  );

  logger.info('Skills Marketplace backend router created');
  return router;
}
