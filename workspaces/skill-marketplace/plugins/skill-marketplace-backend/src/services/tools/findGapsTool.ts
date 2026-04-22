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

export const findGapsTool: AgentTool = {
  definition: {
    name: 'find_gaps',
    description:
      'Find catalog gaps -- agent capabilities that have no matching skill in the OCI catalog, and unused skills that no agent capability implements. Use for questions like "what skills are missing", "what capabilities are unmatched", "catalog coverage", or "unused skills".',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: 'Type of gap to find: "unmatched" for capabilities without skills, "unused" for skills without capabilities, "both" for both (default)',
        },
        limit: {
          type: 'number',
          description: 'Maximum results per category (default 20, max 50)',
        },
      },
    },
  },

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<unknown> {
    const gapType = String(args.type || 'both');
    const limit = Math.min(Number(args.limit) || 20, 50);

    const session = await ctx.neo4j.getHealthySession();
    try {
      const result: Record<string, unknown> = {};

      if (gapType === 'unmatched' || gapType === 'both') {
        const cypher = ctx.queryCatalog
          ? ctx.queryCatalog.get('tools.findGaps')
          : `MATCH (a:Agent)-[:EXPOSES]->(c:AgentCapability) WHERE NOT (c)-[:IMPLEMENTED_BY]->(:Skill) WITH a, collect({name: c.name, description: c.description, tags: c.tags}) AS gaps WHERE size(gaps) > 0 RETURN a.name AS agentName, a.namespace AS agentNamespace, gaps ORDER BY a.name LIMIT $limit`;
        const capsResult = await session.run(cypher, { limit: neo4jDriver.int(limit) });
        result.unmatchedCapabilities = capsResult.records.map(r => ({
          agentName: r.get('agentName'),
          agentNamespace: r.get('agentNamespace'),
          gaps: r.get('gaps'),
        }));
      }

      if (gapType === 'unused' || gapType === 'both') {
        const cypher = ctx.queryCatalog
          ? ctx.queryCatalog.get('read.findUnusedSkills')
          : `MATCH (s:Skill) WHERE NOT (:AgentCapability)-[:IMPLEMENTED_BY]->(s) RETURN s.name AS name, s.description AS description, s.category AS category, s.version AS version ORDER BY s.name LIMIT $limit`;
        const skillsResult = await session.run(cypher, { limit: neo4jDriver.int(limit) });
        result.unusedSkills = skillsResult.records.map(r => ({
          name: r.get('name'),
          description: r.get('description'),
          category: r.get('category'),
          version: r.get('version'),
        }));
        result.unusedSkillCount = skillsResult.records.length;
      }

      return result;
    } finally {
      await session.close();
    }
  },
};
