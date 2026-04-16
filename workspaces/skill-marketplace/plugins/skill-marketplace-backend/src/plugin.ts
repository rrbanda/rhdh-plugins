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
  Neo4jService,
  BuilderProxyService,
  KagentiService,
  OciRegistryService,
} from './services';
import type { KagentiConfig, OciRegistryServiceConfig } from './services';

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
      },
      async init({
        logger,
        httpRouter,
        config,
        permissionsRegistry,
      }) {
        logger.info('Initializing Skills Marketplace backend plugin');

        permissionsRegistry.addPermissions(skillMarketplacePermissions);

        const securityMode =
          config.getOptionalString('skillMarketplace.security.mode') || 'plugin-only';

        let neo4j: Neo4jService | undefined;
        const neo4jUri = config.getOptionalString('skillMarketplace.neo4j.uri');
        if (neo4jUri) {
          neo4j = new Neo4jService({
            uri: neo4jUri,
            user:
              config.getOptionalString('skillMarketplace.neo4j.user') || 'neo4j',
            password:
              config.getOptionalString('skillMarketplace.neo4j.password') ||
              'skillsmarketplace',
            database:
              config.getOptionalString('skillMarketplace.neo4j.database') ||
              'neo4j',
            logger,
          });
          logger.info(`Neo4j configured: ${neo4jUri}`);
        } else {
          logger.info('Neo4j not configured -- graph features will return 503');
        }

        let builderProxy: BuilderProxyService | undefined;
        const builderUrl = config.getOptionalString(
          'skillMarketplace.builderAgent.url',
        );
        if (builderUrl) {
          builderProxy = new BuilderProxyService({
            baseUrl: builderUrl,
            apiKey:
              config.getOptionalString('skillMarketplace.builderAgent.apiKey') ||
              '',
            logger,
          });
          logger.info(`Builder agent configured: ${builderUrl}`);
        } else {
          logger.info(
            'Builder agent not configured -- builder features will return 503',
          );
        }

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
        if (kagentiApiUrl) {
          const kagentiConfig: KagentiConfig = {
            apiUrl: kagentiApiUrl,
            agentName:
              config.getOptionalString('skillMarketplace.kagenti.agentName') ||
              'builder-agent',
            namespace:
              config.getOptionalString('skillMarketplace.kagenti.namespace') ||
              'skills-marketplace',
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

        httpRouter.use(
          await createRouter({
            logger,
            neo4j,
            builderProxy,
            kagenti,
            ociRegistry,
            publishRegistry,
          }),
        );

        httpRouter.addAuthPolicy({
          path: '/health',
          allow: 'unauthenticated',
        });

        const authPolicy: 'unauthenticated' | 'user-cookie' =
          securityMode === 'none' ? 'unauthenticated' : 'user-cookie';

        const protectedPaths = [
          '/skills',
          '/skills/:slug',
          '/graph',
          '/graph/schema',
          '/graph/search',
          '/graph/neighborhood',
          '/graph/build',
          '/builder',
          '/sync',
          '/builder/publish',
          '/oci/skills',
          '/oci/skill',
          '/oci/skill-content',
          '/oci/search',
          '/oci/registries',
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

        logger.info(
          `Skills Marketplace backend initialized (security: ${securityMode})`,
        );
      },
    });
  },
});
