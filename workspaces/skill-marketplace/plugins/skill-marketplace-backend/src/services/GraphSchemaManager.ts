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

const CONSTRAINT_STATEMENTS = [
  'CREATE CONSTRAINT skill_name IF NOT EXISTS FOR (s:Skill) REQUIRE s.name IS UNIQUE',
  'CREATE CONSTRAINT tool_name IF NOT EXISTS FOR (t:Tool) REQUIRE t.name IS UNIQUE',
  'CREATE CONSTRAINT domain_name IF NOT EXISTS FOR (d:Domain) REQUIRE d.name IS UNIQUE',
];

const INDEX_STATEMENTS = [
  'CREATE INDEX skill_category IF NOT EXISTS FOR (s:Skill) ON (s.category)',
  'CREATE INDEX skill_ociref IF NOT EXISTS FOR (s:Skill) ON (s.ociReference)',
  `CREATE FULLTEXT INDEX skill_search IF NOT EXISTS FOR (s:Skill) ON EACH [s.name, s.description, s.category, s.author]`,
];

export class GraphSchemaManager {
  private readonly logger: LoggerService;
  private readonly neo4j: Neo4jService;
  private initialized = false;
  private initFailed = false;

  constructor(options: { logger: LoggerService; neo4j: Neo4jService }) {
    this.logger = options.logger;
    this.neo4j = options.neo4j;
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
      for (const stmt of CONSTRAINT_STATEMENTS) {
        try {
          await session.run(stmt);
        } catch (err) {
          criticalFailures++;
          this.logger.warn(
            `Schema constraint failed: ${(err as Error).message}`,
          );
        }
      }
      for (const stmt of INDEX_STATEMENTS) {
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
      await session.run(
        `CREATE VECTOR INDEX skill_embedding IF NOT EXISTS
         FOR (s:Skill) ON s.embedding
         OPTIONS {indexConfig: {
           \`vector.dimensions\`: $dimensions,
           \`vector.similarity_function\`: 'cosine'
         }}`,
        { dimensions },
      );
    } catch {
      this.logger.debug('Vector index creation skipped (may already exist or unsupported)');
    } finally {
      await session.close();
    }
  }
}
