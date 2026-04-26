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
import type { KagentiConfig } from '../services';

export interface KagentiConfigResult {
  kagentiConfig?: KagentiConfig;
  namespace: string;
  agentName: string;
}

export function readKagentiConfig(
  config: Config,
  logger: LoggerService,
): KagentiConfigResult {
  const namespace =
    config.getOptionalString('skillMarketplace.kagenti.namespace') || 'team1';
  const agentName =
    config.getOptionalString('skillMarketplace.kagenti.agentName') ||
    'skill-builder';
  const apiUrl = config.getOptionalString('skillMarketplace.kagenti.apiUrl');

  if (!apiUrl) {
    logger.info('Kagenti not configured -- Kagenti features disabled');
    return { namespace, agentName };
  }

  const kagentiConfig: KagentiConfig = {
    apiUrl,
    agentName,
    namespace,
    requestTimeoutMs: config.getOptionalNumber(
      'skillMarketplace.kagenti.requestTimeoutMs',
    ),
    tokenTimeoutMs: config.getOptionalNumber(
      'skillMarketplace.kagenti.tokenTimeoutMs',
    ),
    directA2AUrl: config.getOptionalString(
      'skillMarketplace.kagenti.directA2AUrl',
    ),
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

  logger.info(`Kagenti configured: ${apiUrl}`);
  return { kagentiConfig, namespace, agentName };
}
