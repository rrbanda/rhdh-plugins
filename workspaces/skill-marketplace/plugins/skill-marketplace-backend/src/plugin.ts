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
  BuilderProxyService,
  KagentiService,
  OciRegistryService,
  SkillGraphSyncService,
  LlmClient,
  AgenticRagService,
  EmbeddingService,
} from './services';
import { CypherQueryCatalog } from './services/CypherQueryCatalog';
import type { KagentiConfig, OciRegistryServiceConfig, GraphSyncConfig } from './services';

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

        const securityMode =
          config.getOptionalString('skillMarketplace.security.mode') || 'plugin-only';

        let queryOverrides: Record<string, unknown> | undefined;
        const queriesConfig = config.getOptionalConfig('skillMarketplace.graph.queries');
        if (queriesConfig) {
          queryOverrides = {};
          for (const section of queriesConfig.keys()) {
            const sectionConfig = queriesConfig.getOptionalConfig(section);
            if (!sectionConfig) continue;
            const sectionObj: Record<string, unknown> = {};
            for (const key of sectionConfig.keys()) {
              const nested = sectionConfig.getOptionalConfig(key);
              if (nested) {
                const nestedObj: Record<string, string> = {};
                for (const nk of nested.keys()) {
                  nestedObj[nk] = nested.getString(nk);
                }
                sectionObj[key] = nestedObj;
              } else {
                sectionObj[key] = sectionConfig.getString(key);
              }
            }
            queryOverrides[section] = sectionObj;
          }
        }
        const queryCatalog = new CypherQueryCatalog(queryOverrides, logger);
        const validationErrors = queryCatalog.validate();
        if (validationErrors.length > 0) {
          for (const err of validationErrors) {
            logger.warn(`Cypher query validation: ${err}`);
          }
        }

        let neo4j: Neo4jService | undefined;
        const neo4jUri = config.getOptionalString('skillMarketplace.neo4j.uri');
        const neo4jPassword = config.getOptionalString('skillMarketplace.neo4j.password');
        if (neo4jUri && neo4jPassword) {
          neo4j = new Neo4jService({
            uri: neo4jUri,
            user:
              config.getOptionalString('skillMarketplace.neo4j.user') || 'neo4j',
            password: neo4jPassword,
            database:
              config.getOptionalString('skillMarketplace.neo4j.database') ||
              'neo4j',
            logger,
            queryCatalog,
          });
          logger.info(`Neo4j configured: ${neo4jUri}`);
          lifecycle.addShutdownHook(() => neo4j!.close());
        } else if (neo4jUri && !neo4jPassword) {
          logger.warn('Neo4j URI set but password missing -- skipping Neo4j initialization');
        } else {
          logger.info('Neo4j not configured -- graph features will return 503');
        }

        let builderProxy: BuilderProxyService | undefined;

        let ociRegistry: OciRegistryService | undefined;
        const ociRegistries = config.getOptionalConfigArray(
          'skillMarketplace.oci.registries',
        );
        if (ociRegistries && ociRegistries.length > 0) {
          const ociConfig: OciRegistryServiceConfig = {
            registries: ociRegistries.map(r => {
              const token = r.getOptionalString('token');
              const username = r.getOptionalString('username');
              const password = r.getOptionalString('password');
              return {
                url: r.getString('url'),
                name: r.getOptionalString('name') || r.getString('url'),
                auth: token
                  ? { token }
                  : username || password
                    ? { username: username ?? undefined, password: password ?? undefined }
                    : undefined,
              };
            }),
            cacheTimeout:
              config.getOptionalNumber('skillMarketplace.oci.cacheTimeout') || 300,
            requestTimeoutMs:
              config.getOptionalNumber('skillMarketplace.oci.requestTimeoutMs'),
            maxCacheEntries:
              config.getOptionalNumber('skillMarketplace.oci.maxCacheEntries'),
          };
          ociRegistry = new OciRegistryService(ociConfig, logger);
          logger.info(
            `OCI registry configured: ${ociConfig.registries.map(r => r.name).join(', ')}`,
          );
        } else {
          logger.info('OCI registry not configured -- OCI features disabled');
        }

        let publishRegistry: { url: string; name: string; auth?: { token?: string; username?: string; password?: string } } | undefined;
        const publishUrl = config.getOptionalString('skillMarketplace.oci.publishRegistry.url');
        if (publishUrl) {
          const pubToken = config.getOptionalString('skillMarketplace.oci.publishRegistry.token');
          const pubUser = config.getOptionalString('skillMarketplace.oci.publishRegistry.username');
          const pubPass = config.getOptionalString('skillMarketplace.oci.publishRegistry.password');
          publishRegistry = {
            url: publishUrl,
            name: 'publish',
            auth: pubToken
              ? { token: pubToken }
              : pubUser || pubPass
                ? { username: pubUser ?? undefined, password: pubPass ?? undefined }
                : undefined,
          };
          logger.info(`OCI publish registry configured: ${publishUrl}`);
        }

        let kagenti: KagentiService | undefined;
        const kagentiApiUrl = config.getOptionalString(
          'skillMarketplace.kagenti.apiUrl',
        );
        const kagentiNs = config.getOptionalString('skillMarketplace.kagenti.namespace') || 'team1';
        const kagentiAgent = config.getOptionalString('skillMarketplace.kagenti.agentName') || 'skill-builder';
        if (kagentiApiUrl) {
          const kagentiConfig: KagentiConfig = {
            apiUrl: kagentiApiUrl,
            agentName: kagentiAgent,
            namespace: kagentiNs,
            requestTimeoutMs:
              config.getOptionalNumber('skillMarketplace.kagenti.requestTimeoutMs'),
            tokenTimeoutMs:
              config.getOptionalNumber('skillMarketplace.kagenti.tokenTimeoutMs'),
            directA2AUrl:
              config.getOptionalString('skillMarketplace.kagenti.directA2AUrl'),
            keycloak: {
              tokenUrl:
                config.getOptionalString(
                  'skillMarketplace.kagenti.keycloak.tokenUrl',
                ) || '',
              clientId:
                config.getOptionalString(
                  'skillMarketplace.kagenti.keycloak.clientId',
                ) || 'kagenti',
              username:
                config.getOptionalString(
                  'skillMarketplace.kagenti.keycloak.username',
                ) || '',
              password:
                config.getOptionalString(
                  'skillMarketplace.kagenti.keycloak.password',
                ) || '',
            },
          };
          kagenti = new KagentiService(kagentiConfig, logger);
          logger.info(`Kagenti configured: ${kagentiApiUrl}`);
        } else {
          logger.info(
            'Kagenti not configured -- Kagenti features disabled',
          );
        }

        if (kagenti) {
          builderProxy = new BuilderProxyService({
            kagenti,
            logger,
            namespace: kagentiNs,
            agentName: kagentiAgent,
          });
          logger.info(`Builder proxy configured via Kagenti: ${kagentiNs}/${kagentiAgent}`);
        } else {
          logger.info('Builder proxy not available -- Kagenti not configured');
        }

        const skillSearchDirs = config.getOptionalStringArray(
          'skillMarketplace.skillSearchDirs',
        );

        const kagentiDefaults = kagenti
          ? { namespace: kagentiNs, agentName: kagentiAgent }
          : undefined;

        const embeddingApiUrl = config.getOptionalString('skillMarketplace.graph.embeddingApiUrl');
        const embeddingApiKey = config.getOptionalString('skillMarketplace.graph.embeddingApiKey');

        let sharedEmbeddingService: EmbeddingService | undefined;
        if (embeddingApiUrl && embeddingApiKey) {
          sharedEmbeddingService = new EmbeddingService({
            logger,
            apiUrl: embeddingApiUrl,
            apiKey: embeddingApiKey,
            model: config.getOptionalString('skillMarketplace.graph.embeddingModel'),
            dimensions: config.getOptionalNumber('skillMarketplace.graph.embeddingDimensions'),
            timeoutMs: config.getOptionalNumber('skillMarketplace.graph.embeddingTimeoutMs'),
          });
        }

        let syncService: SkillGraphSyncService | undefined;
        if (neo4j && ociRegistry) {
          const graphSyncConfig: GraphSyncConfig = {
            embeddingApiUrl,
            embeddingModel: config.getOptionalString('skillMarketplace.graph.embeddingModel'),
            embeddingApiKey,
            embeddingDimensions: config.getOptionalNumber('skillMarketplace.graph.embeddingDimensions'),
            embeddingTimeoutMs: config.getOptionalNumber('skillMarketplace.graph.embeddingTimeoutMs'),
            similarityThreshold: config.getOptionalNumber('skillMarketplace.graph.similarityThreshold'),
            similarityTopK: config.getOptionalNumber('skillMarketplace.graph.similarityTopK'),
          };

          const rawCategoryMap = config.getOptionalConfig('skillMarketplace.graph.categoryKeywords');
          if (rawCategoryMap) {
            const categoryKeywords: Record<string, string[]> = {};
            for (const key of rawCategoryMap.keys()) {
              categoryKeywords[key] = rawCategoryMap.getStringArray(key);
            }
            graphSyncConfig.categoryKeywords = categoryKeywords;
          }

          const rawToolMeta = config.getOptionalConfig('skillMarketplace.graph.toolMetadata');
          if (rawToolMeta) {
            const toolMetadata: Record<string, { description?: string; docsUrl?: string; version?: string; deprecated?: boolean }> = {};
            for (const key of rawToolMeta.keys()) {
              const entry = rawToolMeta.getConfig(key);
              toolMetadata[key] = {
                description: entry.getOptionalString('description'),
                docsUrl: entry.getOptionalString('docsUrl'),
                version: entry.getOptionalString('version'),
                deprecated: entry.getOptionalBoolean('deprecated') ?? undefined,
              };
            }
            graphSyncConfig.toolMetadata = toolMetadata;
          }

          const rawDomainTax = config.getOptionalConfig('skillMarketplace.graph.domainTaxonomy');
          if (rawDomainTax) {
            const domainTaxonomy: Record<string, { description?: string; owner?: string; parent?: string }> = {};
            for (const key of rawDomainTax.keys()) {
              const entry = rawDomainTax.getConfig(key);
              domainTaxonomy[key] = {
                description: entry.getOptionalString('description'),
                owner: entry.getOptionalString('owner'),
                parent: entry.getOptionalString('parent') ?? undefined,
              };
            }
            graphSyncConfig.domainTaxonomy = domainTaxonomy;
          }

          graphSyncConfig.matchThreshold = config.getOptionalNumber('skillMarketplace.graph.matchThreshold');
          graphSyncConfig.semanticThreshold = config.getOptionalNumber('skillMarketplace.graph.semanticThreshold');
          graphSyncConfig.syncEventRetention = config.getOptionalNumber('skillMarketplace.graph.syncEventRetention');

          syncService = new SkillGraphSyncService({
            logger,
            neo4j,
            ociRegistry,
            kagenti,
            config: graphSyncConfig,
            embeddingService: sharedEmbeddingService,
            queryCatalog,
          });
          logger.info('Skill Knowledge Graph sync service initialized');

          const syncOnStartup = config.getOptionalBoolean('skillMarketplace.graph.syncOnStartup') ?? true;
          if (syncOnStartup) {
            syncService.sync().then(result => {
              logger.info(`Startup graph sync completed: ${result.nodesUpserted} nodes, ${result.relationshipsCreated} rels`);
            }).catch(err => {
              logger.warn(`Startup graph sync failed: ${(err as Error).message}`);
            });
          }

          const syncIntervalSeconds = config.getOptionalNumber('skillMarketplace.graph.syncIntervalSeconds') ?? 300;
          if (syncIntervalSeconds > 0) {
            const intervalMs = syncIntervalSeconds * 1000;
            const intervalHandle = setInterval(() => {
              syncService!.sync().catch(err => {
                logger.warn(`Periodic graph sync failed: ${(err as Error).message}`);
              });
            }, intervalMs);

            lifecycle.addShutdownHook(async () => {
              clearInterval(intervalHandle);
              logger.info('Waiting for in-flight graph sync to complete before shutdown...');
              await syncService!.waitForCompletion();
              logger.info('Graph sync drained, proceeding with shutdown');
            });
            logger.info(`Periodic graph sync enabled: every ${syncIntervalSeconds}s`);
          }
        }

        const ragConfig = {
          fulltextScoreFloor: config.getOptionalNumber('skillMarketplace.graph.rag.fulltextScoreFloor'),
          fulltextLimit: config.getOptionalNumber('skillMarketplace.graph.rag.fulltextLimit'),
          scoreNormalizationDivisor: config.getOptionalNumber('skillMarketplace.graph.rag.scoreNormalizationDivisor'),
          graphPropagationFactor: config.getOptionalNumber('skillMarketplace.graph.rag.graphPropagationFactor'),
          fallbackScore: config.getOptionalNumber('skillMarketplace.graph.rag.fallbackScore'),
          vectorTopKMultiplier: config.getOptionalNumber('skillMarketplace.graph.rag.vectorTopKMultiplier'),
          expansionLimit: config.getOptionalNumber('skillMarketplace.graph.rag.expansionLimit'),
        };

        const cleanRagConfig: Record<string, number> = {};
        for (const [k, v] of Object.entries(ragConfig)) {
          if (v !== undefined) cleanRagConfig[k] = v;
        }

        let agenticService: AgenticRagService | undefined;
        if (neo4j && sharedEmbeddingService && embeddingApiUrl && embeddingApiKey) {
          const configuredLlmUrl = config.getOptionalString('skillMarketplace.graph.agent.llmApiUrl');
          const llmApiUrl = configuredLlmUrl || embeddingApiUrl.replace(/\/embeddings\/?$/, '/chat/completions');
          const llmApiKey = config.getOptionalString('skillMarketplace.graph.agent.llmApiKey') || embeddingApiKey;

          const llm = new LlmClient({
            logger,
            apiUrl: llmApiUrl,
            apiKey: llmApiKey,
            model: config.getOptionalString('skillMarketplace.graph.agent.model'),
            timeoutMs: config.getOptionalNumber('skillMarketplace.graph.agent.timeoutMs'),
          });

          agenticService = new AgenticRagService({
            llm,
            neo4j,
            ociRegistry,
            embedding: sharedEmbeddingService,
            logger,
            config: {
              maxIterations: config.getOptionalNumber('skillMarketplace.graph.agent.maxIterations') ?? undefined,
              schemaCacheTtlSeconds: config.getOptionalNumber('skillMarketplace.graph.agent.schemaCacheTtlSeconds') ?? undefined,
            },
            queryCatalog,
          });
          logger.info('Agentic GraphRAG service initialized');
        } else {
          logger.info('Agentic GraphRAG not configured (requires graph.embeddingApiUrl and graph.embeddingApiKey)');
        }

        httpRouter.use(
          await createRouter({
            logger,
            httpAuth,
            permissions,
            neo4j,
            builderProxy,
            kagenti,
            ociRegistry,
            publishRegistry,
            skillSearchDirs,
            kagentiDefaults,
            syncService,
            ragConfig: Object.keys(cleanRagConfig).length > 0 ? cleanRagConfig : undefined,
            agenticService,
            securityMode,
            builderStreamTimeoutMs: config.getOptionalNumber('skillMarketplace.builderAgent.streamTimeoutMs'),
            queryCatalog,
          }),
        );

        httpRouter.addAuthPolicy({
          path: '/health',
          allow: 'unauthenticated',
        });

        const authPolicy: 'unauthenticated' | 'user-cookie' =
          securityMode === 'none' ? 'unauthenticated' : 'user-cookie';

        const protectedPaths = [
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
          '/graph/agentic-rag/stream',
          '/graph/bundles',
          '/graph/bundles/:id',
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
          '/kagenti/chat',
          '/kagenti/stream',
        ];

        for (const p of protectedPaths) {
          httpRouter.addAuthPolicy({ path: p, allow: authPolicy });
        }

        if (ociRegistry) {
          const catalogCachePath =
            config.getOptionalString('skillMarketplace.oci.catalogCachePath') ||
            undefined;
          const catalogTtlSeconds =
            config.getOptionalNumber('skillMarketplace.oci.catalogTtlSeconds');

          configureCatalog({
            ttlMs: catalogTtlSeconds ? catalogTtlSeconds * 1000 : undefined,
            cachePath: catalogCachePath,
          });

          const diskCache = loadCatalogFromDisk(logger, catalogCachePath);
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
          `Skills Marketplace backend initialized (security: ${securityMode})`,
        );
      },
    });
  },
});
