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
import type { AgentTool, ToolContext } from './types';

export const listByDomainTool: AgentTool = {
  definition: {
    name: 'list_skills_by_domain',
    description:
      'List all skills belonging to a specific domain/category. Use for questions like "show all security skills" or "what engineering skills exist".',
    parameters: {
      type: 'object',
      properties: {
        domain: {
          type: 'string',
          description: 'Domain/category name (e.g. "security", "engineering", "devops", "human-resources")',
        },
        limit: {
          type: 'number',
          description: 'Maximum results (default 20, max 50)',
        },
      },
      required: ['domain'],
    },
  },

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<unknown> {
    const domain = String(args.domain || '');
    const limit = Math.min(Number(args.limit) || 20, 50);

    const session = await ctx.neo4j.getHealthySession();
    try {
      const result = await session.run(
        `MATCH (s:Skill)
         WHERE toLower(s.category) = toLower($domain)
            OR toLower(s.plugin) = toLower($domain)
         RETURN s.name AS name, s.description AS description,
                s.category AS category, s.version AS version,
                s.complexity AS complexity, s.author AS author
         ORDER BY s.name
         LIMIT $limit`,
        { domain, limit: neo4jDriver.int(limit) },
      );

      return {
        domain,
        skills: result.records.map(r => ({
          name: r.get('name'),
          description: r.get('description'),
          category: r.get('category'),
          version: r.get('version'),
          complexity: r.get('complexity'),
          author: r.get('author'),
        })),
        count: result.records.length,
      };
    } finally {
      await session.close();
    }
  },
};
