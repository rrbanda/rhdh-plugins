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
import {
  createApiRef,
  DiscoveryApi,
  FetchApi,
} from '@backstage/core-plugin-api';
import { ResponseError } from '@backstage/errors';
import type {
  SkillData,
  Skill,
  MarketplaceData,
  NvlGraphData,
  GraphSchema,
  SyncResult,
  KagentiAgent,
  AgentDeployRequest,
  OciRegistryConfig,
} from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';

/** @public */
export interface SkillMarketplaceApi {
  // Skills (OCI-backed)
  getSkills(): Promise<{ skills: SkillData[]; marketplace: MarketplaceData }>;
  getSkillBySlug(slug: string): Promise<SkillData>;

  // OCI skills
  getOciSkills(registry?: string): Promise<{ skills: Skill[]; registries: OciRegistryConfig[] }>;
  getOciSkill(ref: string): Promise<Skill>;
  getOciSkillContent(ref: string): Promise<string>;
  searchOciSkills(query: string): Promise<{ skills: Skill[] }>;
  getOciRegistries(): Promise<{ registries: OciRegistryConfig[] }>;

  // Graph
  getGraphData(limit?: number): Promise<NvlGraphData>;
  getGraphSchema(): Promise<GraphSchema>;
  searchGraph(query: string): Promise<NvlGraphData>;
  getNeighborhood(nodeId: string, depth?: number, limit?: number): Promise<NvlGraphData>;

  // Builder
  generateSkill(body: Record<string, unknown>): Promise<Response>;
  refineSkill(body: Record<string, unknown>): Promise<Response>;
  saveSkill(body: Record<string, unknown>): Promise<unknown>;
  buildGraph(): Promise<Response>;
  syncRegistry(): Promise<SyncResult>;
  publishSkill(body: { skillName: string; version: string; description: string; author: string; content: string; registry?: string }): Promise<unknown>;

  // Kagenti agents
  listAgents(namespace?: string): Promise<KagentiAgent[]>;
  getAgentDetail(namespace: string, name: string): Promise<unknown>;
  deployAgent(request: AgentDeployRequest): Promise<unknown>;
  deleteAgent(namespace: string, name: string): Promise<unknown>;
  getAgentSkills(namespace: string, name: string): Promise<unknown>;
  assignSkill(namespace: string, agentName: string, skillRef: string, skillName: string): Promise<unknown>;
  removeSkill(namespace: string, agentName: string, skillName: string): Promise<unknown>;
  getAgentLogs(namespace: string, name: string, tail?: number): Promise<unknown>;
  getAgentCard(namespace?: string, agentName?: string): Promise<unknown>;
  chatWithAgent(message: string, sessionId?: string, namespace?: string, agentName?: string): Promise<unknown>;
  streamAgent(message: string, sessionId?: string, namespace?: string, agentName?: string): Promise<Response>;
}

/** @public */
export const skillMarketplaceApiRef = createApiRef<SkillMarketplaceApi>({
  id: 'plugin.skill-marketplace',
});

/** @public */
export class SkillMarketplaceApiClient implements SkillMarketplaceApi {
  private readonly discoveryApi: DiscoveryApi;
  private readonly fetchApi: FetchApi;

  constructor(options: { discoveryApi: DiscoveryApi; fetchApi: FetchApi }) {
    this.discoveryApi = options.discoveryApi;
    this.fetchApi = options.fetchApi;
  }

  private async getBaseUrl(): Promise<string> {
    return await this.discoveryApi.getBaseUrl('skill-marketplace');
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const baseUrl = await this.getBaseUrl();
    const res = await this.fetchApi.fetch(`${baseUrl}${path}`, {
      headers: { 'Content-Type': 'application/json', ...init?.headers },
      ...init,
    });
    if (!res.ok) throw await ResponseError.fromResponse(res);
    return res.json();
  }

  // ---------------------------------------------------------------------------
  // Skills (OCI-backed)
  // ---------------------------------------------------------------------------

  async getSkills(): Promise<{
    skills: SkillData[];
    marketplace: MarketplaceData;
  }> {
    return this.request('/skills');
  }

  async getSkillBySlug(slug: string): Promise<SkillData> {
    return this.request(`/skills/${slug}`);
  }

  // ---------------------------------------------------------------------------
  // OCI skills
  // ---------------------------------------------------------------------------

  async getOciSkills(
    registry?: string,
  ): Promise<{ skills: Skill[]; registries: OciRegistryConfig[] }> {
    const query = registry ? `?registry=${encodeURIComponent(registry)}` : '';
    return this.request(`/oci/skills${query}`);
  }

  async getOciSkill(ref: string): Promise<Skill> {
    return this.request(`/oci/skill?ref=${encodeURIComponent(ref)}`);
  }

  async getOciSkillContent(ref: string): Promise<string> {
    const result = await this.request<{ content: string }>(
      `/oci/skill-content?ref=${encodeURIComponent(ref)}`,
    );
    return result.content;
  }

  async searchOciSkills(query: string): Promise<{ skills: Skill[] }> {
    return this.request(`/oci/search?q=${encodeURIComponent(query)}`);
  }

  async getOciRegistries(): Promise<{ registries: OciRegistryConfig[] }> {
    return this.request('/oci/registries');
  }

  // ---------------------------------------------------------------------------
  // Graph
  // ---------------------------------------------------------------------------

  async getGraphData(limit?: number): Promise<NvlGraphData> {
    const query = limit ? `?limit=${limit}` : '';
    return this.request(`/graph${query}`);
  }

  async getGraphSchema(): Promise<GraphSchema> {
    return this.request('/graph/schema');
  }

  async searchGraph(query: string): Promise<NvlGraphData> {
    return this.request('/graph/search', {
      method: 'POST',
      body: JSON.stringify({ query }),
    });
  }

  async getNeighborhood(
    nodeId: string,
    depth?: number,
    limit?: number,
  ): Promise<NvlGraphData> {
    return this.request('/graph/neighborhood', {
      method: 'POST',
      body: JSON.stringify({ nodeId, depth, limit }),
    });
  }

  // ---------------------------------------------------------------------------
  // Builder
  // ---------------------------------------------------------------------------

  async generateSkill(body: Record<string, unknown>): Promise<Response> {
    const baseUrl = await this.getBaseUrl();
    const res = await this.fetchApi.fetch(
      `${baseUrl}/builder?action=generate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) throw await ResponseError.fromResponse(res);
    return res;
  }

  async refineSkill(body: Record<string, unknown>): Promise<Response> {
    const baseUrl = await this.getBaseUrl();
    const res = await this.fetchApi.fetch(`${baseUrl}/builder?action=refine`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw await ResponseError.fromResponse(res);
    return res;
  }

  async saveSkill(body: Record<string, unknown>): Promise<unknown> {
    return this.request('/builder?action=save', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async buildGraph(): Promise<Response> {
    const baseUrl = await this.getBaseUrl();
    const res = await this.fetchApi.fetch(`${baseUrl}/graph/build`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) throw await ResponseError.fromResponse(res);
    return res;
  }

  async syncRegistry(): Promise<SyncResult> {
    return this.request('/sync', { method: 'POST' });
  }

  async publishSkill(body: {
    skillName: string;
    version: string;
    description: string;
    author: string;
    content: string;
    registry?: string;
  }): Promise<unknown> {
    return this.request('/builder/publish', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  // ---------------------------------------------------------------------------
  // Kagenti agents
  // ---------------------------------------------------------------------------

  async listAgents(namespace?: string): Promise<KagentiAgent[]> {
    const query = namespace
      ? `?namespace=${encodeURIComponent(namespace)}`
      : '';
    const result = await this.request<{ items?: KagentiAgent[] }>(
      `/kagenti/agents${query}`,
    );
    return result.items || (result as unknown as KagentiAgent[]) || [];
  }

  async getAgentDetail(
    namespace: string,
    name: string,
  ): Promise<unknown> {
    return this.request(`/kagenti/agents/${namespace}/${name}`);
  }

  async deployAgent(request: AgentDeployRequest): Promise<unknown> {
    return this.request('/kagenti/agents', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async deleteAgent(
    namespace: string,
    name: string,
  ): Promise<unknown> {
    return this.request(`/kagenti/agents/${namespace}/${name}`, {
      method: 'DELETE',
    });
  }

  async getAgentSkills(
    namespace: string,
    name: string,
  ): Promise<unknown> {
    return this.request(`/kagenti/agents/${namespace}/${name}/skills`);
  }

  async assignSkill(
    namespace: string,
    agentName: string,
    skillRef: string,
    skillName: string,
  ): Promise<unknown> {
    return this.request(`/kagenti/agents/${namespace}/${agentName}/skills`, {
      method: 'POST',
      body: JSON.stringify({ skillRef, skillName }),
    });
  }

  async removeSkill(
    namespace: string,
    agentName: string,
    skillName: string,
  ): Promise<unknown> {
    return this.request(
      `/kagenti/agents/${namespace}/${agentName}/skills/${skillName}`,
      { method: 'DELETE' },
    );
  }

  async getAgentLogs(
    namespace: string,
    name: string,
    tail?: number,
  ): Promise<unknown> {
    const query = tail ? `?tail=${tail}` : '';
    return this.request(
      `/kagenti/agents/${namespace}/${name}/logs${query}`,
    );
  }

  async getAgentCard(
    namespace?: string,
    agentName?: string,
  ): Promise<unknown> {
    const params = new URLSearchParams();
    if (namespace) params.set('namespace', namespace);
    if (agentName) params.set('agent', agentName);
    const query = params.toString() ? `?${params}` : '';
    return this.request(`/kagenti/agent-card${query}`);
  }

  async chatWithAgent(
    message: string,
    sessionId?: string,
    namespace?: string,
    agentName?: string,
  ): Promise<unknown> {
    return this.request('/kagenti/chat', {
      method: 'POST',
      body: JSON.stringify({ message, sessionId, namespace, agentName }),
    });
  }

  async streamAgent(
    message: string,
    sessionId?: string,
    namespace?: string,
    agentName?: string,
  ): Promise<Response> {
    const baseUrl = await this.getBaseUrl();
    const res = await this.fetchApi.fetch(`${baseUrl}/kagenti/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, sessionId, namespace, agentName }),
    });
    if (!res.ok) throw await ResponseError.fromResponse(res);
    return res;
  }
}
