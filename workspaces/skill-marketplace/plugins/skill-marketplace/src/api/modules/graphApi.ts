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
import type {
  NvlGraphData,
  GraphSchema,
  GraphRAGQuery,
  GraphRAGResult,
  GraphSyncResult,
  SkillGraphSyncStatus,
} from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import type { RequestFn } from './types';

export async function getGraphData(
  request: RequestFn,
  limit?: number,
): Promise<NvlGraphData> {
  const query = limit ? `?limit=${limit}` : '';
  return request(`/graph${query}`);
}

export async function getGraphSchema(request: RequestFn): Promise<GraphSchema> {
  return request('/graph/schema');
}

export async function searchGraph(
  request: RequestFn,
  query: string,
): Promise<NvlGraphData> {
  return request('/graph/search', {
    method: 'POST',
    body: JSON.stringify({ query }),
  });
}

export async function getNeighborhood(
  request: RequestFn,
  nodeId: string,
  depth?: number,
  limit?: number,
): Promise<NvlGraphData> {
  return request('/graph/neighborhood', {
    method: 'POST',
    body: JSON.stringify({ nodeId, depth, limit }),
  });
}

export async function triggerSync(
  request: RequestFn,
): Promise<GraphSyncResult> {
  return request('/sync', { method: 'POST' });
}

export async function getSyncStatus(
  request: RequestFn,
): Promise<SkillGraphSyncStatus & { available: boolean }> {
  return request('/sync/status');
}

export async function queryRAG(
  request: RequestFn,
  query: GraphRAGQuery,
): Promise<GraphRAGResult> {
  return request('/graph/rag', {
    method: 'POST',
    body: JSON.stringify(query),
  });
}

export async function getAgentsFromGraph(
  request: RequestFn,
): Promise<{ agents: Array<Record<string, unknown>> }> {
  return request('/graph/agents');
}

export async function getAgentCount(
  request: RequestFn,
): Promise<{ count: number }> {
  return request('/graph/agents/count');
}

export async function getAgentSkillsFromGraph(
  request: RequestFn,
  namespace: string,
  name: string,
): Promise<{ skills: Array<Record<string, unknown>> }> {
  return request(`/graph/agents/${namespace}/${name}/skills`);
}

export async function getSkillAgents(
  request: RequestFn,
  skillName: string,
): Promise<{ agents: Array<Record<string, unknown>> }> {
  return request(`/graph/skills/${encodeURIComponent(skillName)}/agents`);
}

export async function getAgentCapabilities(
  request: RequestFn,
  namespace: string,
  name: string,
): Promise<{ capabilities: Array<Record<string, unknown>> }> {
  return request(`/graph/agents/${namespace}/${name}/capabilities`);
}

export async function getCatalogGaps(
  request: RequestFn,
): Promise<{ gaps: Array<Record<string, unknown>> }> {
  return request('/graph/capabilities/gaps');
}

export async function getCatalogGapsCount(
  request: RequestFn,
): Promise<{ count: number }> {
  return request('/graph/capabilities/gaps/count');
}

export async function getUnusedSkills(
  request: RequestFn,
  limit?: number,
): Promise<{ skills: Array<Record<string, unknown>> }> {
  const qs = limit ? `?limit=${limit}` : '';
  return request(`/graph/skills/unused${qs}`);
}

export async function getTags(
  request: RequestFn,
  limit?: number,
): Promise<{ tags: Array<Record<string, unknown>> }> {
  const qs = limit ? `?limit=${limit}` : '';
  return request(`/graph/tags${qs}`);
}

export async function getSyncHistory(
  request: RequestFn,
  limit?: number,
): Promise<{ events: Array<Record<string, unknown>> }> {
  const qs = limit ? `?limit=${limit}` : '';
  return request(`/graph/sync/history${qs}`);
}

export async function getQualityAggregate(
  request: RequestFn,
): Promise<Record<string, unknown>> {
  return request('/graph/quality');
}

export async function verifyMatch(
  request: RequestFn,
  skillId: string,
  body: { agentName: string; agentNamespace: string; verified: boolean },
): Promise<Record<string, unknown>> {
  return request(`/graph/capabilities/${encodeURIComponent(skillId)}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function overrideMatch(
  request: RequestFn,
  skillId: string,
  body: { agentName: string; agentNamespace: string; skillName: string },
): Promise<Record<string, unknown>> {
  return request(
    `/graph/capabilities/${encodeURIComponent(skillId)}/override`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
}
