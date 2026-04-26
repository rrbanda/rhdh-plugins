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
import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { skillMarketplacePermissions } from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import { createRouter } from './router';
import {
  warmCatalogCache,
  loadCatalogFromDisk,
  setCatalogCache,
  configureCatalog,
} from './routes';
import {
  Neo4jService,
  KagentiService,
  OciRegistryService,
  SkillGraphSyncService,
  SmpAgentClient,
  EmbeddingService,
  SkillCatalogService,
} from './services';
import { CypherQueryCatalog } from './services/CypherQueryCatalog';
import { readAllConfig } from './config';

const AUTH_POLICY_PATHS = [
  '/skills/ready',
  '/skills',
  '/skills/:slug',
  '/graph',
  '/graph/schema',
  '/graph/search',
  '/graph/neighborhood',
  '/graph/build',
  '/graph/update',
  '/graph/sync/history',
  '/graph/quality',
  '/graph/capabilities/:skillId/verify',
  '/graph/capabilities/:skillId/override',
  '/graph/capabilities/gaps',
  '/graph/capabilities/gaps/count',
  '/graph/agents',
  '/graph/agents/count',
  '/graph/agents/:namespace/:name/capabilities',
  '/graph/agents/:namespace/:name/skills',
  '/graph/skills/unused',
  '/graph/skills/:skillName/agents',
  '/graph/tags',
  '/graph/rag',
  '/graph/agentic-rag',
  '/graph/bundles',
  '/graph/bundles/:id',
  '/graph/bundles/:id/status',
  '/graph/bundles/:id/export',
  '/graph/bundles/:id/fork',
  '/graph/bundles/resolve',
  '/builder',
  '/sync',
  '/sync/status',
  '/builder/publish',
  '/oci/skills',
  '/oci/skill',
  '/oci/skill-content',
  '/oci/search',
  '/oci/registries',
  '/oci/lifecycle/:ref',
  '/oci/promote',
  '/kagenti/agents',
  '/kagenti/agents/:namespace/:name',
  '/kagenti/agents/:namespace/:name/skills',
  '/kagenti/agents/:namespace/:name/skills/:skillName',
  '/kagenti/agents/:namespace/:name/logs',
  '/kagenti/agent-card',
  '/kagenti/namespaces',
  '/kagenti/chat',
  '/kagenti/stream',
  '/agents/advisor',
  '/agents/validator',
  '/agents/kgqa',
  '/agents/playground',
  '/agents/builder',
  '/agents/health',
  '/agents/:agent/card',
  '/catalog/skills',
  '/catalog/skills/:namespace/:name',
  '/catalog/skills/:namespace/:name/versions',
  '/catalog/skills/:namespace/:name/versions/:version/content',
  '/catalog/sync',
  '/catalog/available',
];

/**
 * Skills Marketplace backend plugin
 * @public
 */
export const skillMarketplacePlugin = createBackendPlugin({
  pluginId: 'skill-marketplace',
  register(env) {
    env.registerInit({
      deps: {
        logger: coreServices.logger,
        config: coreServices.rootConfig,
        httpRouter: coreServices.httpRouter,
        httpAuth: coreServices.httpAuth,
        permissions: coreServices.permissions,
        permissionsRegistry: coreServices.permissionsRegistry,
        lifecycle: coreServices.lifecycle,
      },
      async init({
        logger,
        httpRouter,
        httpAuth,
        config,
        permissions,
        permissionsRegistry,
        lifecycle,
      }) {
        logger.info('Initializing Skills Marketplace backend plugin');
        permissionsRegistry.addPermissions(skillMarketplacePermissions);

        const pluginConfig = readAllConfig(config, logger);

        // Cypher query catalog
        const queryCatalog = new CypherQueryCatalog(
          pluginConfig.graph.queryOverrides,
          logger,
        );
        const validationErrors = queryCatalog.validate();
        for (const err of validationErrors) {
          logger.warn(`Cypher query validation: ${err}`);
        }

        // Neo4j
        let neo4j: Neo4jService | undefined;
        if (pluginConfig.neo4j) {
          neo4j = new Neo4jService({
            ...pluginConfig.neo4j,
            logger,
            queryCatalog,
          });
          lifecycle.addShutdownHook(() => neo4j!.shutdown());
        }

        // OCI registry
        let ociRegistry: OciRegistryService | undefined;
        if (pluginConfig.oci.serviceConfig) {
          ociRegistry = new OciRegistryService(
            {
              ...pluginConfig.oci.serviceConfig,
              publishRegistry: pluginConfig.oci.publishRegistry,
            },
            logger,
          );
        }

        // Kagenti
        let kagenti: KagentiService | undefined;
        if (pluginConfig.kagenti.kagentiConfig) {
          kagenti = new KagentiService(
            pluginConfig.kagenti.kagentiConfig,
            logger,
          );
        }

        // SMP agent client
        let smpAgentClient: SmpAgentClient | undefined;
        if (pluginConfig.smpAgents) {
          if (!kagenti) {
            logger.warn(
              'SMP agents configured but Kagenti is not — token provisioning unavailable',
            );
          } else {
            smpAgentClient = new SmpAgentClient(
              pluginConfig.smpAgents,
              kagenti,
              logger,
            );
          }
        }

        // Skill Catalog API
        let skillCatalogService: SkillCatalogService | undefined;
        if (pluginConfig.catalog) {
          skillCatalogService = new SkillCatalogService(
            pluginConfig.catalog,
            logger,
          );
        }

        // Embedding service
        let sharedEmbeddingService: EmbeddingService | undefined;
        if (pluginConfig.graph.embeddingConfig) {
          sharedEmbeddingService = new EmbeddingService({
            logger,
            ...pluginConfig.graph.embeddingConfig,
          });
        }

        // Graph sync service
        let syncService: SkillGraphSyncService | undefined;
        if (neo4j && ociRegistry && pluginConfig.graph.graphSyncConfig) {
          const { syncOnStartup, syncIntervalSeconds } =
            pluginConfig.graph.scheduleConfig;
          syncService = new SkillGraphSyncService({
            logger,
            neo4j,
            ociRegistry,
            kagenti,
            config: pluginConfig.graph.graphSyncConfig,
            embeddingService: sharedEmbeddingService,
            queryCatalog,
            syncIntervalMs:
              syncIntervalSeconds > 0 ? syncIntervalSeconds * 1000 : 0,
          });
          logger.info('Skill Knowledge Graph sync service initialized');
          if (syncOnStartup) {
            syncService
              .sync()
              .then(result => {
                logger.info(
                  `Startup graph sync completed: ${result.nodesUpserted} nodes, ${result.relationshipsCreated} rels`,
                );
              })
              .catch(err => {
                logger.warn(
                  `Startup graph sync failed: ${(err as Error).message}`,
                );
              });
          }

          if (syncIntervalSeconds > 0) {
            const intervalHandle = setInterval(() => {
              syncService!.sync().catch(err => {
                logger.warn(
                  `Periodic graph sync failed: ${(err as Error).message}`,
                );
              });
            }, syncIntervalSeconds * 1000);

            lifecycle.addShutdownHook(async () => {
              clearInterval(intervalHandle);
              logger.info(
                'Waiting for in-flight graph sync to complete before shutdown...',
              );
              await syncService!.waitForCompletion();
              logger.info('Graph sync drained, proceeding with shutdown');
            });
            logger.info(
              `Periodic graph sync enabled: every ${syncIntervalSeconds}s`,
            );
          }
        }

        const kagentiDefaults = kagenti
          ? {
              namespace: pluginConfig.kagenti.namespace,
              agentName: pluginConfig.kagenti.agentName,
            }
          : undefined;

        // Create and mount router
        httpRouter.use(
          await createRouter({
            logger,
            httpAuth,
            permissions,
            neo4j,
            kagenti,
            smpAgentClient,
            ociRegistry,
            publishRegistry: pluginConfig.oci.publishRegistry,
            skillSearchDirs: pluginConfig.skillSearchDirs,
            kagentiDefaults,
            syncService,
            ragConfig: pluginConfig.graph.ragConfig,
            securityMode: pluginConfig.securityMode,
            queryCatalog,
            skillCatalogService,
          }),
        );

        // Auth policies
        httpRouter.addAuthPolicy({ path: '/health', allow: 'unauthenticated' });
        const authPolicy: 'unauthenticated' | 'user-cookie' =
          pluginConfig.securityMode === 'none'
            ? 'unauthenticated'
            : 'user-cookie';
        for (const p of AUTH_POLICY_PATHS) {
          httpRouter.addAuthPolicy({ path: p, allow: authPolicy });
        }

        // Warm OCI catalog cache
        if (ociRegistry) {
          configureCatalog({
            ttlMs: pluginConfig.oci.catalogTtlSeconds
              ? pluginConfig.oci.catalogTtlSeconds * 1000
              : undefined,
            cachePath: pluginConfig.oci.catalogCachePath,
          });

          const diskCache = loadCatalogFromDisk(
            logger,
            pluginConfig.oci.catalogCachePath,
          );
          if (diskCache) {
            setCatalogCache(diskCache);
            logger.info(
              `Pre-loaded ${diskCache.skills.length} skills from disk — starting background refresh`,
            );
            warmCatalogCache(ociRegistry, logger);
          } else {
            logger.info(
              'No disk cache found — awaiting initial catalog build before accepting requests',
            );
            await warmCatalogCache(ociRegistry, logger);
          }
        }

        logger.info(
          `Skills Marketplace backend initialized (security: ${pluginConfig.securityMode})`,
        );
      },
    });
  },
});
