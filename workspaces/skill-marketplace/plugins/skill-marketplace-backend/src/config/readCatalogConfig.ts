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
import type { SkillCatalogConfig } from '../services';

export function readCatalogConfig(
  config: Config,
  logger: LoggerService,
): SkillCatalogConfig | undefined {
  const baseUrl = config.getOptionalString('skillMarketplace.catalog.baseUrl');
  if (!baseUrl) {
    logger.info('Skill Catalog API not configured — catalog features disabled');
    return undefined;
  }

  logger.info(`Skill Catalog API configured: ${baseUrl}`);
  return {
    baseUrl,
    requestTimeoutMs:
      config.getOptionalNumber('skillMarketplace.catalog.requestTimeoutMs') ||
      undefined,
  };
}
