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

export const getGraphSchemaTool: AgentTool = {
  definition: {
    name: 'get_graph_schema',
    description:
      'Get the current graph schema: node labels, relationship types, and counts. Use to understand what data is available before querying.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },

  async execute(_args: Record<string, unknown>, ctx: ToolContext): Promise<unknown> {
    const schema = await ctx.neo4j.discoverSchema();
    return {
      labels: schema.labels.map(l => ({ name: l.name, count: l.count })),
      relationshipTypes: schema.relationshipTypes.map(r => ({ type: r.type, count: r.count })),
      totalNodes: schema.totalNodes,
      totalRelationships: schema.totalRelationships,
      domains: schema.pluginGroups.map(p => ({ name: p.name, count: p.count })),
    };
  },
};
