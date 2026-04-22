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
import type { AgentTool, ToolContext } from './types';

export const getSkillDetailsTool: AgentTool = {
  definition: {
    name: 'get_skill_details',
    description:
      'Get the full SKILL.md content and metadata for a specific skill by its OCI reference or name. Use when you need the complete specification of a skill.',
    parameters: {
      type: 'object',
      properties: {
        skillName: {
          type: 'string',
          description: 'The skill name (e.g. "resume-screener") or OCI reference',
        },
      },
      required: ['skillName'],
    },
  },

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<unknown> {
    const skillName = String(args.skillName || '');

    if (!ctx.ociRegistry) {
      return { error: 'OCI registry not configured' };
    }

    const session = await ctx.neo4j.getHealthySession();
    try {
      const cypher = ctx.queryCatalog
        ? ctx.queryCatalog.get('tools.getSkillDetails')
        : `MATCH (s:Skill) WHERE s.name = $name OR s.ociReference = $name RETURN s.name AS name, s.description AS description, s.category AS category, s.version AS version, s.author AS author, s.ociReference AS ociReference, s.complexity AS complexity, s.tags AS tags, s.displayName AS displayName LIMIT 1`;
      const nodeResult = await session.run(cypher, { name: skillName });

      if (nodeResult.records.length === 0) {
        return { error: `Skill "${skillName}" not found in graph` };
      }

      const record = nodeResult.records[0];
      const ociRef = record.get('ociReference') as string;
      const metadata = {
        name: record.get('name'),
        description: record.get('description'),
        category: record.get('category'),
        version: record.get('version'),
        author: record.get('author'),
        complexity: record.get('complexity'),
        tags: record.get('tags'),
        displayName: record.get('displayName'),
      };

      let content: string | null = null;
      if (ociRef) {
        try {
          content = await ctx.ociRegistry.getSkillContent(ociRef);
        } catch {
          ctx.logger.debug(`Could not fetch OCI content for ${ociRef}`);
        }
      }

      let agents: Array<{ name: string; namespace: string; status: string }> = [];
      try {
        const agentsResult = await session.run(
          ctx.queryCatalog
            ? ctx.queryCatalog.get('read.fetchAgentsBySkill')
            : 'MATCH (a:Agent)-[:EXPOSES]->(c:AgentCapability)-[:IMPLEMENTED_BY]->(s:Skill {name: $skillName}) RETURN a.name AS name, a.namespace AS namespace, a.status AS status',
          { skillName: metadata.name as string },
        );
        agents = agentsResult.records.map(r => ({
          name: r.get('name') as string,
          namespace: r.get('namespace') as string,
          status: r.get('status') as string,
        }));
      } catch {
        ctx.logger.debug(`Could not fetch agents for skill ${skillName}`);
      }

      let implementingCapabilities: Array<{ capName: string; agentName: string; confidence: number; matchType: string }> = [];
      try {
        const capsResult = await session.run(
          'MATCH (c:AgentCapability)-[r:IMPLEMENTED_BY]->(s:Skill {name: $skillName}) RETURN c.name AS capName, c.agentName AS agentName, r.confidence AS confidence, r.matchType AS matchType',
          { skillName: metadata.name as string },
        );
        implementingCapabilities = capsResult.records.map(r => ({
          capName: r.get('capName') as string,
          agentName: r.get('agentName') as string,
          confidence: Number(r.get('confidence')),
          matchType: r.get('matchType') as string,
        }));
      } catch {
        ctx.logger.debug(`Could not fetch implementing capabilities for skill ${skillName}`);
      }

      return {
        metadata,
        content: content ? content.slice(0, 4000) : null,
        usedByAgents: agents,
        implementingCapabilities,
      };
    } finally {
      await session.close();
    }
  },
};
