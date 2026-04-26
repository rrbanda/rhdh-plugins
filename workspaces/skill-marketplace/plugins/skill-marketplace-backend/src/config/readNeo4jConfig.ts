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

export interface Neo4jConfig {
  uri: string;
  user: string;
  password: string;
  database: string;
}

export function readNeo4jConfig(
  config: Config,
  logger: LoggerService,
): Neo4jConfig | undefined {
  const uri = config.getOptionalString('skillMarketplace.neo4j.uri');
  const password = config.getOptionalString('skillMarketplace.neo4j.password');

  if (uri && password) {
    logger.info(`Neo4j configured: ${uri}`);
    return {
      uri,
      user: config.getOptionalString('skillMarketplace.neo4j.user') || 'neo4j',
      password,
      database:
        config.getOptionalString('skillMarketplace.neo4j.database') || 'neo4j',
    };
  }

  if (uri && !password) {
    logger.warn(
      'Neo4j URI set but password missing -- skipping Neo4j initialization',
    );
  } else {
    logger.info('Neo4j not configured -- graph features will return 503');
  }
  return undefined;
}
