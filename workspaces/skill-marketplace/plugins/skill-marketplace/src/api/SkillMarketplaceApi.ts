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
  MarketplaceData,
  NvlGraphData,
  GraphSchema,
  GraphRAGQuery,
  GraphRAGResult,
  GraphSyncResult,
  AgenticQuery,
  AgenticResult,
  LifecycleState,
} from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';

/** @public */
export interface SkillMarketplaceApi {
  getSkills(): Promise<{ skills: SkillData[]; marketplace: MarketplaceData }>;
  getSkillBySlug(slug: string): Promise<SkillData>;

  getGraphData(limit?: number): Promise<NvlGraphData>;
  getGraphSchema(): Promise<GraphSchema>;
  searchGraph(query: string): Promise<NvlGraphData>;
  getNeighborhood(nodeId: string, depth?: number, limit?: number): Promise<NvlGraphData>;
  triggerSync(): Promise<GraphSyncResult>;
  getSyncStatus(): Promise<{ available: boolean }>;
  queryRAG(query: GraphRAGQuery): Promise<GraphRAGResult>;
  agenticQuery(query: AgenticQuery): Promise<AgenticResult>;
  agenticQueryStreamUrl(query: AgenticQuery): Promise<{ url: string; body: string; headers: Record<string, string> }>;

  getLifecycleState(ref: string): Promise<{ ref: string; lifecycleState: LifecycleState; version: string; name: string }>;
  promoteSkill(ociRef: string, targetState: LifecycleState): Promise<{ success: boolean; previousState: LifecycleState; newState: LifecycleState; newOciRef: string }>;

  generateSkill(body: Record<string, unknown>): Promise<Response>;
  refineSkill(body: Record<string, unknown>): Promise<Response>;
  publishSkill(body: { skillName: string; version: string; description: string; author: string; content: string; registry?: string }): Promise<unknown>;

  getAgentDetail(namespace: string, name: string): Promise<unknown>;
  getAgentLogs(namespace: string, name: string, tail?: number): Promise<unknown>;
  getAgentCard(namespace?: string, agentName?: string): Promise<unknown>;
  chatWithAgent(message: string, sessionId?: string, namespace?: string, agentName?: string, activeSkill?: string): Promise<unknown>;
  streamWithAgent(message: string, sessionId?: string, namespace?: string, agentName?: string, activeSkill?: string): Promise<Response>;
  listAgentNamespaces(): Promise<{ namespaces: string[] }>;
  getHealth(): Promise<Record<string, unknown>>;

  getAgentsFromGraph(): Promise<{ agents: Array<Record<string, unknown>> }>;
  getAgentCount(): Promise<{ count: number }>;
  getAgentSkillsFromGraph(namespace: string, name: string): Promise<{ skills: Array<Record<string, unknown>> }>;
  getSkillAgents(skillName: string): Promise<{ agents: Array<Record<string, unknown>> }>;

  getAgentCapabilities(namespace: string, name: string): Promise<{ capabilities: Array<Record<string, unknown>> }>;
  getCatalogGaps(): Promise<{ gaps: Array<Record<string, unknown>> }>;
  getCatalogGapsCount(): Promise<{ count: number }>;
  getUnusedSkills(limit?: number): Promise<{ skills: Array<Record<string, unknown>> }>;
  getTags(limit?: number): Promise<{ tags: Array<Record<string, unknown>> }>;

  getSyncHistory(limit?: number): Promise<{ events: Array<Record<string, unknown>> }>;
  getQualityAggregate(): Promise<Record<string, unknown>>;
  verifyMatch(skillId: string, body: { agentName: string; agentNamespace: string; verified: boolean }): Promise<Record<string, unknown>>;
  overrideMatch(skillId: string, body: { agentName: string; agentNamespace: string; skillName: string }): Promise<Record<string, unknown>>;

  createBundle(body: { name: string; description: string; skillSlugs: string[] }): Promise<Record<string, unknown>>;
  listBundles(): Promise<{ bundles: Array<Record<string, unknown>> }>;
  getBundle(id: string): Promise<Record<string, unknown>>;
  updateBundle(id: string, body: { name?: string; description?: string; skillSlugs?: string[] }): Promise<Record<string, unknown>>;
  deleteBundle(id: string): Promise<{ ok: boolean }>;
  exportBundle(id: string): Promise<Record<string, unknown>>;
  forkBundle(id: string): Promise<Record<string, unknown>>;
  resolveDependencies(skillNames: string[]): Promise<{ dependencies: Array<Record<string, unknown>>; tools: Array<Record<string, unknown>>; similar: Array<Record<string, unknown>> }>;
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

  async triggerSync(): Promise<GraphSyncResult> {
    return this.request('/sync', { method: 'POST' });
  }

  async getSyncStatus(): Promise<{ available: boolean }> {
    return this.request('/sync/status');
  }

  async queryRAG(query: GraphRAGQuery): Promise<GraphRAGResult> {
    return this.request('/graph/rag', {
      method: 'POST',
      body: JSON.stringify(query),
    });
  }

  async agenticQuery(query: AgenticQuery): Promise<AgenticResult> {
    return this.request('/graph/agentic-rag', {
      method: 'POST',
      body: JSON.stringify(query),
    });
  }

  async agenticQueryStreamUrl(query: AgenticQuery): Promise<{ url: string; body: string; headers: Record<string, string> }> {
    const baseUrl = await this.getBaseUrl();
    return {
      url: `${baseUrl}/graph/agentic-rag/stream`,
      body: JSON.stringify(query),
      headers: { 'Content-Type': 'application/json' },
    };
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async getLifecycleState(
    ref: string,
  ): Promise<{
    ref: string;
    lifecycleState: LifecycleState;
    version: string;
    name: string;
  }> {
    return this.request(`/oci/lifecycle/${encodeURIComponent(ref)}`);
  }

  async promoteSkill(
    ociRef: string,
    targetState: LifecycleState,
  ): Promise<{
    success: boolean;
    previousState: LifecycleState;
    newState: LifecycleState;
    newOciRef: string;
  }> {
    return this.request('/oci/promote', {
      method: 'POST',
      body: JSON.stringify({ ociRef, targetState }),
    });
  }

  // ---------------------------------------------------------------------------
  // Builder
  // ---------------------------------------------------------------------------

  /**
   * SSE streaming request. Uses fetchApi for auth, reads the full body,
   * then wraps it in a fresh Response with a synthetic ReadableStream
   * that delivers SSE events one at a time.
   *
   * We read the full body via res.text() because Backstage's fetchApi
   * middleware and RHDH's proxy layer can interfere with direct
   * ReadableStream consumption. Reading as text guarantees transparent
   * decompression and correct encoding handling.
   *
   * To still give the SSE parser individual events (so the UI shows
   * agent_start → agent_output → complete transitions rather than
   * jumping straight to the end), we split the text into SSE event
   * blocks and enqueue them one per microtask.
   */
  private async streamingFetch(url: string, init: RequestInit): Promise<Response> {
    const res = await this.fetchApi.fetch(url, init);
    if (!res.ok) throw await ResponseError.fromResponse(res);

    const text = await res.text();
    if (!text) {
      throw new Error('Empty response from builder agent');
    }

    const encoder = new TextEncoder();
    const blocks = text.split('\n\n').filter(b => b.trim());
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let i = 0;
        const push = () => {
          if (i < blocks.length) {
            controller.enqueue(encoder.encode(blocks[i] + '\n\n'));
            i++;
            Promise.resolve().then(push);
          } else {
            controller.close();
          }
        };
        push();
      },
    });

    return new Response(stream, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }

  async generateSkill(body: Record<string, unknown>): Promise<Response> {
    const baseUrl = await this.getBaseUrl();
    return this.streamingFetch(`${baseUrl}/builder?action=generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify(body),
    });
  }

  async refineSkill(body: Record<string, unknown>): Promise<Response> {
    const baseUrl = await this.getBaseUrl();
    return this.streamingFetch(`${baseUrl}/builder?action=refine`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify(body),
    });
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

  async getAgentDetail(
    namespace: string,
    name: string,
  ): Promise<unknown> {
    return this.request(`/kagenti/agents/${namespace}/${name}`);
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
    activeSkill?: string,
  ): Promise<unknown> {
    return this.request('/kagenti/chat', {
      method: 'POST',
      body: JSON.stringify({ message, sessionId, namespace, agentName, activeSkill }),
    });
  }

  async streamWithAgent(
    message: string,
    sessionId?: string,
    namespace?: string,
    agentName?: string,
    activeSkill?: string,
  ): Promise<Response> {
    const baseUrl = await this.getBaseUrl();
    return this.streamingFetch(`${baseUrl}/kagenti/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify({ message, sessionId, namespace, agentName, activeSkill }),
    });
  }

  async listAgentNamespaces(): Promise<{ namespaces: string[] }> {
    return this.request('/kagenti/namespaces');
  }

  async getHealth(): Promise<Record<string, unknown>> {
    return this.request('/health');
  }

  // ---------------------------------------------------------------------------
  // Agent graph data (reads from Neo4j)
  // ---------------------------------------------------------------------------

  async getAgentsFromGraph(): Promise<{ agents: Array<Record<string, unknown>> }> {
    return this.request('/graph/agents');
  }

  async getAgentCount(): Promise<{ count: number }> {
    return this.request('/graph/agents/count');
  }

  async getAgentSkillsFromGraph(
    namespace: string,
    name: string,
  ): Promise<{ skills: Array<Record<string, unknown>> }> {
    return this.request(`/graph/agents/${namespace}/${name}/skills`);
  }

  async getSkillAgents(
    skillName: string,
  ): Promise<{ agents: Array<Record<string, unknown>> }> {
    return this.request(`/graph/skills/${encodeURIComponent(skillName)}/agents`);
  }

  // ---------------------------------------------------------------------------
  // Two-Card Ontology: capabilities, gaps, tags
  // ---------------------------------------------------------------------------

  async getAgentCapabilities(
    namespace: string,
    name: string,
  ): Promise<{ capabilities: Array<Record<string, unknown>> }> {
    return this.request(`/graph/agents/${namespace}/${name}/capabilities`);
  }

  async getCatalogGaps(): Promise<{ gaps: Array<Record<string, unknown>> }> {
    return this.request('/graph/capabilities/gaps');
  }

  async getCatalogGapsCount(): Promise<{ count: number }> {
    return this.request('/graph/capabilities/gaps/count');
  }

  async getUnusedSkills(limit?: number): Promise<{ skills: Array<Record<string, unknown>> }> {
    const qs = limit ? `?limit=${limit}` : '';
    return this.request(`/graph/skills/unused${qs}`);
  }

  async getTags(limit?: number): Promise<{ tags: Array<Record<string, unknown>> }> {
    const qs = limit ? `?limit=${limit}` : '';
    return this.request(`/graph/tags${qs}`);
  }

  // ---------------------------------------------------------------------------
  // Enterprise Graph: sync history, quality, governance
  // ---------------------------------------------------------------------------

  async getSyncHistory(limit?: number): Promise<{ events: Array<Record<string, unknown>> }> {
    const qs = limit ? `?limit=${limit}` : '';
    return this.request(`/graph/sync/history${qs}`);
  }

  async getQualityAggregate(): Promise<Record<string, unknown>> {
    return this.request('/graph/quality');
  }

  async verifyMatch(
    skillId: string,
    body: { agentName: string; agentNamespace: string; verified: boolean },
  ): Promise<Record<string, unknown>> {
    return this.request(`/graph/capabilities/${encodeURIComponent(skillId)}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async overrideMatch(
    skillId: string,
    body: { agentName: string; agentNamespace: string; skillName: string },
  ): Promise<Record<string, unknown>> {
    return this.request(`/graph/capabilities/${encodeURIComponent(skillId)}/override`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  // ---------------------------------------------------------------------------
  // Skill Bundles
  // ---------------------------------------------------------------------------

  async createBundle(body: { name: string; description: string; skillSlugs: string[] }): Promise<Record<string, unknown>> {
    return this.request('/graph/bundles', { method: 'POST', body: JSON.stringify(body) });
  }

  async listBundles(): Promise<{ bundles: Array<Record<string, unknown>> }> {
    return this.request('/graph/bundles');
  }

  async getBundle(id: string): Promise<Record<string, unknown>> {
    return this.request(`/graph/bundles/${encodeURIComponent(id)}`);
  }

  async updateBundle(id: string, body: { name?: string; description?: string; skillSlugs?: string[] }): Promise<Record<string, unknown>> {
    return this.request(`/graph/bundles/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(body) });
  }

  async deleteBundle(id: string): Promise<{ ok: boolean }> {
    return this.request(`/graph/bundles/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  async exportBundle(id: string): Promise<Record<string, unknown>> {
    return this.request(`/graph/bundles/${encodeURIComponent(id)}/export`);
  }

  async forkBundle(id: string): Promise<Record<string, unknown>> {
    return this.request(`/graph/bundles/${encodeURIComponent(id)}/fork`, { method: 'POST' });
  }

  async resolveDependencies(skillNames: string[]): Promise<{ dependencies: Array<Record<string, unknown>>; tools: Array<Record<string, unknown>>; similar: Array<Record<string, unknown>> }> {
    return this.request('/graph/bundles/resolve', { method: 'POST', body: JSON.stringify({ skillNames }) });
  }
}
