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
import type { LlmToolFunction } from '../LlmClient';
import type { Neo4jService } from '../Neo4jService';
import type { OciRegistryService } from '../OciRegistryService';
import type { EmbeddingService } from '../EmbeddingService';
import type { CypherQueryCatalog } from '../CypherQueryCatalog';
import type { LoggerService } from '@backstage/backend-plugin-api';

export interface ToolContext {
  neo4j: Neo4jService;
  ociRegistry?: OciRegistryService;
  embedding?: EmbeddingService;
  logger: LoggerService;
  queryCatalog?: CypherQueryCatalog;
}

export interface AgentTool {
  definition: LlmToolFunction;
  execute: (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
}
