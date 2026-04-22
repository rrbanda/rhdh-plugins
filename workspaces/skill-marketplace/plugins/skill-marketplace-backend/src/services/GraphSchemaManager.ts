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
import type { LoggerService } from '@backstage/backend-plugin-api';
import type { Neo4jService } from './Neo4jService';
import type { CypherQueryCatalog } from './CypherQueryCatalog';

export class GraphSchemaManager {
  private readonly logger: LoggerService;
  private readonly neo4j: Neo4jService;
  private readonly queryCatalog?: CypherQueryCatalog;
  private initialized = false;
  private initFailed = false;

  constructor(options: { logger: LoggerService; neo4j: Neo4jService; queryCatalog?: CypherQueryCatalog }) {
    this.logger = options.logger;
    this.neo4j = options.neo4j;
    this.queryCatalog = options.queryCatalog;
  }

  get isInitialized(): boolean {
    return this.initialized;
  }

  get hasInitFailed(): boolean {
    return this.initFailed;
  }

  async ensureSchema(): Promise<void> {
    if (this.initialized) return;
    const session = await this.neo4j.getHealthySession();
    let criticalFailures = 0;
    try {
      const constraints = this.queryCatalog
        ? Object.values(this.queryCatalog.getSection('schema.constraints'))
        : [
            'CREATE CONSTRAINT skill_name IF NOT EXISTS FOR (s:Skill) REQUIRE s.name IS UNIQUE',
            'CREATE CONSTRAINT tool_name IF NOT EXISTS FOR (t:Tool) REQUIRE t.name IS UNIQUE',
            'CREATE CONSTRAINT domain_name IF NOT EXISTS FOR (d:Domain) REQUIRE d.name IS UNIQUE',
            'CREATE CONSTRAINT agent_name_ns IF NOT EXISTS FOR (a:Agent) REQUIRE (a.name, a.namespace) IS NODE KEY',
          ];
      for (const stmt of constraints) {
        try {
          await session.run(stmt);
        } catch (err) {
          criticalFailures++;
          this.logger.warn(
            `Schema constraint failed: ${(err as Error).message}`,
          );
        }
      }

      const indexes = this.queryCatalog
        ? Object.values(this.queryCatalog.getSection('schema.indexes'))
        : [
            'CREATE INDEX skill_category IF NOT EXISTS FOR (s:Skill) ON (s.category)',
            'CREATE INDEX skill_ociref IF NOT EXISTS FOR (s:Skill) ON (s.ociReference)',
            'CREATE FULLTEXT INDEX skill_search IF NOT EXISTS FOR (s:Skill) ON EACH [s.name, s.description, s.category, s.author]',
          ];
      for (const stmt of indexes) {
        try {
          await session.run(stmt);
        } catch (err) {
          this.logger.warn(
            `Schema index statement skipped: ${(err as Error).message}`,
          );
        }
      }

      if (criticalFailures > 0) {
        this.initFailed = true;
        this.logger.warn(
          `Neo4j graph schema partially initialized: ${criticalFailures} constraint(s) failed`,
        );
      } else {
        this.logger.info('Neo4j graph schema initialized');
      }
      this.initialized = true;
    } finally {
      await session.close();
    }
  }

  async ensureVectorIndex(dimensions: number): Promise<void> {
    const session = await this.neo4j.getHealthySession();
    try {
      const query = this.queryCatalog
        ? this.queryCatalog.get('schema.vectorIndex')
        : `CREATE VECTOR INDEX skill_embedding IF NOT EXISTS
           FOR (s:Skill) ON s.embedding
           OPTIONS {indexConfig: {
             \`vector.dimensions\`: $dimensions,
             \`vector.similarity_function\`: 'cosine'
           }}`;
      await session.run(query, { dimensions });
    } catch {
      this.logger.debug('Vector index creation skipped (may already exist or unsupported)');
    } finally {
      await session.close();
    }
  }
}
