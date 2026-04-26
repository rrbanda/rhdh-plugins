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

import type { Config } from '@backstage/config';
import type { LoggerService } from '@backstage/backend-plugin-api';
import type { OciRegistryServiceConfig } from '../services';
import type { OciRegistryConfig } from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';

export interface OciConfigResult {
  serviceConfig?: OciRegistryServiceConfig;
  publishRegistry?: OciRegistryConfig;
  catalogCachePath?: string;
  catalogTtlSeconds?: number;
}

export function readOciConfig(
  config: Config,
  logger: LoggerService,
): OciConfigResult {
  const result: OciConfigResult = {};

  const ociRegistries = config.getOptionalConfigArray(
    'skillMarketplace.oci.registries',
  );
  if (ociRegistries && ociRegistries.length > 0) {
    result.serviceConfig = {
      registries: ociRegistries.map(r => {
        const token = r.getOptionalString('token');
        const username = r.getOptionalString('username');
        const password = r.getOptionalString('password');
        let auth:
          | { token: string }
          | { username?: string; password?: string }
          | undefined;
        if (token) {
          auth = { token };
        } else if (username || password) {
          auth = {
            username: username ?? undefined,
            password: password ?? undefined,
          };
        } else {
          auth = undefined;
        }
        return {
          url: r.getString('url'),
          name: r.getOptionalString('name') || r.getString('url'),
          auth,
        };
      }),
      cacheTimeout:
        config.getOptionalNumber('skillMarketplace.oci.cacheTimeout') || 300,
      requestTimeoutMs: config.getOptionalNumber(
        'skillMarketplace.oci.requestTimeoutMs',
      ),
      maxCacheEntries: config.getOptionalNumber(
        'skillMarketplace.oci.maxCacheEntries',
      ),
    };
    logger.info(
      `OCI registry configured: ${result.serviceConfig.registries.map(r => r.name).join(', ')}`,
    );
  } else {
    logger.info('OCI registry not configured -- OCI features disabled');
  }

  const publishUrl = config.getOptionalString(
    'skillMarketplace.oci.publishRegistry.url',
  );
  if (publishUrl) {
    const pubToken = config.getOptionalString(
      'skillMarketplace.oci.publishRegistry.token',
    );
    const pubUser = config.getOptionalString(
      'skillMarketplace.oci.publishRegistry.username',
    );
    const pubPass = config.getOptionalString(
      'skillMarketplace.oci.publishRegistry.password',
    );
    let pubAuth:
      | { token: string }
      | { username?: string; password?: string }
      | undefined;
    if (pubToken) {
      pubAuth = { token: pubToken };
    } else if (pubUser || pubPass) {
      pubAuth = {
        username: pubUser ?? undefined,
        password: pubPass ?? undefined,
      };
    } else {
      pubAuth = undefined;
    }
    result.publishRegistry = {
      url: publishUrl,
      name: 'publish',
      auth: pubAuth,
    };
    logger.info(`OCI publish registry configured: ${publishUrl}`);
  }

  result.catalogCachePath =
    config.getOptionalString('skillMarketplace.oci.catalogCachePath') ||
    undefined;
  result.catalogTtlSeconds = config.getOptionalNumber(
    'skillMarketplace.oci.catalogTtlSeconds',
  );

  return result;
}
