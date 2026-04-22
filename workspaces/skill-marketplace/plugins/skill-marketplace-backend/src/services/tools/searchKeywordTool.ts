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
import neo4jDriver from 'neo4j-driver';
import { toNumber, escapeLucene } from '../neo4jUtils';
import type { AgentTool, ToolContext } from './types';

export const searchKeywordTool: AgentTool = {
  definition: {
    name: 'search_skills_keyword',
    description:
      'Search skills by exact keyword or name match using fulltext index. Best for finding specific skills by name like "resume-screener" or matching exact terms.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Keyword or skill name to search for',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results (default 10, max 20)',
        },
      },
      required: ['query'],
    },
  },

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<unknown> {
    const query = String(args.query || '');
    const limit = Math.min(Number(args.limit) || 10, 20);
    const escaped = escapeLucene(query);

    const session = await ctx.neo4j.getHealthySession();
    try {
      const fulltextQuery = ctx.queryCatalog
        ? ctx.queryCatalog.get('tools.searchKeywordFulltext')
        : `CALL db.index.fulltext.queryNodes('skill_search', $query) YIELD node, score WHERE score > 0.3 RETURN node.name AS name, node.description AS description, node.category AS category, node.version AS version, node.author AS author, node.ociReference AS ociReference, score ORDER BY score DESC LIMIT $limit`;
      const fallbackQuery = ctx.queryCatalog
        ? ctx.queryCatalog.get('tools.searchKeywordFallback')
        : `MATCH (s:Skill) WHERE toLower(s.name) CONTAINS toLower($query) OR toLower(s.description) CONTAINS toLower($query) RETURN s.name AS name, s.description AS description, s.category AS category, s.version AS version, s.author AS author, s.ociReference AS ociReference, 1.0 AS score LIMIT $limit`;
      let result;
      try {
        result = await session.run(
          fulltextQuery,
          { query: `${escaped}~`, limit: neo4jDriver.int(limit) },
        );
      } catch {
        result = await session.run(
          fallbackQuery,
          { query, limit: neo4jDriver.int(limit) },
        );
      }

      return {
        results: result.records.map(r => ({
          name: r.get('name'),
          description: r.get('description'),
          category: r.get('category'),
          version: r.get('version'),
          author: r.get('author'),
          ociReference: r.get('ociReference'),
          score: toNumber(r.get('score')),
        })),
      };
    } finally {
      await session.close();
    }
  },
};
