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
import { toNumber } from '../neo4jUtils';
import type { AgentTool, ToolContext } from './types';

export const searchSemanticTool: AgentTool = {
  definition: {
    name: 'search_skills_semantic',
    description:
      'Search skills by meaning using vector similarity. Best for conceptual queries like "skills similar to document summarization" or "AI skills for customer support".',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language search query describing what kind of skills to find',
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

    if (!ctx.embedding) {
      return { error: 'Embedding service not configured', results: [] };
    }

    const embedding = await ctx.embedding.generate(query);
    if (!embedding) {
      return { error: 'Failed to generate query embedding', results: [] };
    }

    const session = await ctx.neo4j.getHealthySession();
    try {
      const result = await session.run(
        `CALL db.index.vector.queryNodes('skill_embedding', $topK, $embedding)
         YIELD node, score WHERE score >= 0.5
         RETURN node.name AS name, node.description AS description,
                node.category AS category, node.version AS version,
                node.author AS author, node.ociReference AS ociReference,
                score
         ORDER BY score DESC`,
        { topK: neo4jDriver.int(limit), embedding },
      );

      return {
        results: result.records.map(r => ({
          name: r.get('name'),
          description: r.get('description'),
          category: r.get('category'),
          version: r.get('version'),
          author: r.get('author'),
          ociReference: r.get('ociReference'),
          similarityScore: toNumber(r.get('score')),
        })),
      };
    } finally {
      await session.close();
    }
  },
};
