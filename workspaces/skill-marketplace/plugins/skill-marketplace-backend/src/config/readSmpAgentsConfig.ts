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
import type { SmpAgentsConfig } from '../services';

export function readSmpAgentsConfig(
  config: Config,
  logger: LoggerService,
): SmpAgentsConfig | undefined {
  const smpConfig: SmpAgentsConfig = {
    skillAdvisorUrl:
      config.getOptionalString('skillMarketplace.smpAgents.skillAdvisorUrl') ||
      undefined,
    bundleValidatorUrl:
      config.getOptionalString(
        'skillMarketplace.smpAgents.bundleValidatorUrl',
      ) || undefined,
    kgQaUrl:
      config.getOptionalString('skillMarketplace.smpAgents.kgQaUrl') ||
      undefined,
    playgroundUrl:
      config.getOptionalString('skillMarketplace.smpAgents.playgroundUrl') ||
      undefined,
    skillBuilderUrl:
      config.getOptionalString('skillMarketplace.smpAgents.skillBuilderUrl') ||
      undefined,
    requestTimeoutMs:
      config.getOptionalNumber('skillMarketplace.smpAgents.requestTimeoutMs') ||
      undefined,
  };

  const hasAnyUrl = !!(
    smpConfig.skillAdvisorUrl ||
    smpConfig.bundleValidatorUrl ||
    smpConfig.kgQaUrl ||
    smpConfig.playgroundUrl ||
    smpConfig.skillBuilderUrl
  );

  if (hasAnyUrl) {
    logger.info(
      `SMP agents configured: ${Object.entries(smpConfig)
        .filter(([k, v]) => v && k.endsWith('Url'))
        .map(([k]) => k.replace('Url', ''))
        .join(', ')}`,
    );
    return smpConfig;
  }

  logger.info('SMP agents not configured — embedded agentic features disabled');
  return undefined;
}
