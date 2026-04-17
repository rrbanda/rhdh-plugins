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

export const exploreGraphTool: AgentTool = {
  definition: {
    name: 'explore_graph',
    description:
      'Explore the neighborhood of a specific node in the knowledge graph. Returns connected nodes and their relationships. Use to understand what a skill connects to.',
    parameters: {
      type: 'object',
      properties: {
        nodeId: {
          type: 'string',
          description: 'Name or ID of the node to explore (e.g. skill name, tool name, or domain name)',
        },
        depth: {
          type: 'number',
          description: 'How many hops to traverse (default 1, max 3)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of connected nodes to return (default 25, max 50)',
        },
      },
      required: ['nodeId'],
    },
  },

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<unknown> {
    const nodeId = String(args.nodeId || '');
    const depth = Math.min(Number(args.depth) || 1, 3);
    const limit = Math.min(Number(args.limit) || 25, 50);

    const session = await ctx.neo4j.getHealthySession();
    try {
      const result = await session.run(
        `MATCH (center)
         WHERE center.name = $nodeId OR center.id = $nodeId
         MATCH (center)-[r*1..${depth}]-(neighbor)
         WITH center, collect(DISTINCT neighbor)[0..$limit] AS neighbors,
              [rel IN collect(DISTINCT last(r)) | {type: type(rel), from: startNode(rel).name, to: endNode(rel).name}] AS connections
         RETURN center.name AS centerName, labels(center) AS centerLabels,
                [n IN neighbors | {name: n.name, labels: labels(n), description: n.description}] AS neighbors,
                connections[0..$limit] AS connections`,
        { nodeId, limit: neo4jDriver.int(limit) },
      );

      if (result.records.length === 0) {
        return { error: `Node "${nodeId}" not found in graph` };
      }

      const rec = result.records[0];
      return {
        center: {
          name: rec.get('centerName'),
          labels: rec.get('centerLabels'),
        },
        neighbors: rec.get('neighbors'),
        connections: rec.get('connections'),
      };
    } finally {
      await session.close();
    }
  },
};
