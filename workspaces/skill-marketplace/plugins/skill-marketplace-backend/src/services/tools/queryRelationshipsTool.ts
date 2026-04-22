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

const ALLOWED_REL_TYPES = new Set([
  'USES_TOOL', 'DEPENDS_ON', 'RELATED_TO', 'SIMILAR_TO', 'BELONGS_TO',
  'EXPOSES', 'IMPLEMENTED_BY', 'TAGGED_WITH', 'PARENT_OF',
]);

const ALLOWED_LABELS = new Set([
  'Skill', 'Tool', 'Domain', 'Agent', 'AgentCapability', 'Tag', 'SyncEvent',
]);

export const queryRelationshipsTool: AgentTool = {
  definition: {
    name: 'query_relationships',
    description:
      'Query specific relationship patterns in the graph. Use for questions like "which skills use tool X", "what depends on Y", "skills in domain Z". Uses parameterized Cypher templates for safety.',
    parameters: {
      type: 'object',
      properties: {
        fromLabel: {
          type: 'string',
          description: 'Label of the source node. Available: Skill, Tool, Domain, Agent, AgentCapability, Tag',
        },
        relationType: {
          type: 'string',
          description: 'Relationship type. Available: USES_TOOL, DEPENDS_ON, RELATED_TO, SIMILAR_TO, BELONGS_TO, EXPOSES, IMPLEMENTED_BY, TAGGED_WITH',
        },
        toLabel: {
          type: 'string',
          description: 'Label of the target node. Available: Skill, Tool, Domain, Agent, AgentCapability, Tag',
        },
        nodeName: {
          type: 'string',
          description: 'Name of a specific node to filter on (matches either source or target)',
        },
        limit: {
          type: 'number',
          description: 'Maximum results (default 20, max 50)',
        },
      },
      required: ['relationType'],
    },
  },

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<unknown> {
    const relationType = String(args.relationType || '');
    const fromLabel = String(args.fromLabel || '');
    const toLabel = String(args.toLabel || '');
    const nodeName = String(args.nodeName || '');
    const limit = Math.min(Number(args.limit) || 20, 50);

    if (relationType && !ALLOWED_REL_TYPES.has(relationType)) {
      return {
        error: `Unknown relationship type "${relationType}". Available: ${Array.from(ALLOWED_REL_TYPES).join(', ')}`,
      };
    }

    if (fromLabel && !ALLOWED_LABELS.has(fromLabel)) {
      return { error: `Unknown label "${fromLabel}". Available: ${Array.from(ALLOWED_LABELS).join(', ')}` };
    }
    if (toLabel && !ALLOWED_LABELS.has(toLabel)) {
      return { error: `Unknown label "${toLabel}". Available: ${Array.from(ALLOWED_LABELS).join(', ')}` };
    }

    const fromClause = fromLabel ? `(a:${fromLabel})` : '(a)';
    const toClause = toLabel ? `(b:${toLabel})` : '(b)';
    const relClause = relationType ? `[r:${relationType}]` : '[r]';

    let whereClause = '';
    const params: Record<string, unknown> = { limit: neo4jDriver.int(limit) };
    if (nodeName) {
      whereClause = 'WHERE a.name = $nodeName OR b.name = $nodeName';
      params.nodeName = nodeName;
    }

    const cypher = ctx.queryCatalog
      ? ctx.queryCatalog.get('tools.queryRelationships', { fromClause, relClause, toClause, whereClause })
      : `MATCH ${fromClause}-${relClause}->${toClause} ${whereClause} RETURN a.name AS from, type(r) AS relType, b.name AS to, labels(a) AS fromLabels, labels(b) AS toLabels LIMIT $limit`;

    const session = await ctx.neo4j.getHealthySession();
    try {
      const result = await session.run(cypher, params);
      return {
        results: result.records.map(r => ({
          from: r.get('from'),
          fromLabels: r.get('fromLabels'),
          relType: r.get('relType'),
          to: r.get('to'),
          toLabels: r.get('toLabels'),
        })),
      };
    } finally {
      await session.close();
    }
  },
};
