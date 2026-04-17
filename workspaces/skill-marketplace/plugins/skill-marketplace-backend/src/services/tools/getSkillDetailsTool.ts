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
      const nodeResult = await session.run(
        `MATCH (s:Skill)
         WHERE s.name = $name OR s.ociReference = $name
         RETURN s.name AS name, s.description AS description,
                s.category AS category, s.version AS version,
                s.author AS author, s.ociReference AS ociReference,
                s.complexity AS complexity, s.workflowSteps AS workflowSteps
         LIMIT 1`,
        { name: skillName },
      );

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
        workflowSteps: record.get('workflowSteps'),
      };

      let content: string | null = null;
      if (ociRef) {
        try {
          content = await ctx.ociRegistry.getSkillContent(ociRef);
        } catch {
          ctx.logger.debug(`Could not fetch OCI content for ${ociRef}`);
        }
      }

      return {
        metadata,
        content: content ? content.slice(0, 4000) : null,
      };
    } finally {
      await session.close();
    }
  },
};
