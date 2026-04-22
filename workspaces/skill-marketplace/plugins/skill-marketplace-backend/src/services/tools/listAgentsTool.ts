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

export const listAgentsTool: AgentTool = {
  definition: {
    name: 'list_agents',
    description:
      'List all A2A agents registered in the knowledge graph, including their skills. Use for questions like "what agents exist", "which agents are available", or "show agents using skill X".',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum results (default 20, max 50)',
        },
      },
    },
  },

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<unknown> {
    const limit = Math.min(Number(args.limit) || 20, 50);

    const session = await ctx.neo4j.getHealthySession();
    try {
      const cypher = ctx.queryCatalog
        ? ctx.queryCatalog.get('tools.listAgents')
        : `MATCH (a:Agent) OPTIONAL MATCH (a)-[:EXPOSES]->(c:AgentCapability) OPTIONAL MATCH (c)-[:IMPLEMENTED_BY]->(s:Skill) RETURN a.name AS name, a.namespace AS namespace, a.status AS status, a.description AS description, a.framework AS framework, a.version AS version, a.streaming AS streaming, collect(DISTINCT c.name) AS capabilities, collect(DISTINCT s.name) AS skills ORDER BY a.name LIMIT $limit`;
      const result = await session.run(
        cypher,
        { limit: neo4jDriver.int(limit) },
      );

      return {
        agents: result.records.map(r => ({
          name: r.get('name'),
          namespace: r.get('namespace'),
          status: r.get('status'),
          description: r.get('description'),
          framework: r.get('framework'),
          version: r.get('version'),
          streaming: r.get('streaming'),
          capabilities: r.get('capabilities'),
          skills: r.get('skills'),
        })),
        count: result.records.length,
      };
    } finally {
      await session.close();
    }
  },
};
