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
import { readNeo4jConfig } from './readNeo4jConfig';
import type { Neo4jConfig } from './readNeo4jConfig';
import { readOciConfig } from './readOciConfig';
import type { OciConfigResult } from './readOciConfig';
import { readKagentiConfig } from './readKagentiConfig';
import type { KagentiConfigResult } from './readKagentiConfig';
import { readSmpAgentsConfig } from './readSmpAgentsConfig';
import { readCatalogConfig } from './readCatalogConfig';
import { readGraphConfig } from './readGraphConfig';
import type {
  GraphConfigResult,
  EmbeddingConfig,
  RagConfig,
} from './readGraphConfig';
import type { SmpAgentsConfig, SkillCatalogConfig } from '../services';

export interface PluginConfig {
  securityMode: string;
  neo4j?: Neo4jConfig;
  oci: OciConfigResult;
  kagenti: KagentiConfigResult;
  smpAgents?: SmpAgentsConfig;
  catalog?: SkillCatalogConfig;
  graph: GraphConfigResult;
  skillSearchDirs?: string[];
}

export function readAllConfig(
  config: Config,
  logger: LoggerService,
): PluginConfig {
  return {
    securityMode:
      config.getOptionalString('skillMarketplace.security.mode') ||
      'plugin-only',
    neo4j: readNeo4jConfig(config, logger),
    oci: readOciConfig(config, logger),
    kagenti: readKagentiConfig(config, logger),
    smpAgents: readSmpAgentsConfig(config, logger),
    catalog: readCatalogConfig(config, logger),
    graph: readGraphConfig(config),
    skillSearchDirs: config.getOptionalStringArray(
      'skillMarketplace.skillSearchDirs',
    ),
  };
}

export {
  readNeo4jConfig,
  readOciConfig,
  readKagentiConfig,
  readSmpAgentsConfig,
  readCatalogConfig,
  readGraphConfig,
};
export type {
  Neo4jConfig,
  OciConfigResult,
  KagentiConfigResult,
  GraphConfigResult,
  EmbeddingConfig,
  RagConfig,
};
