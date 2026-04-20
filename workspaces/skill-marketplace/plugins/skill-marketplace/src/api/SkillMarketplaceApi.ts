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
  searchGraph(query: string): Promise<NvlGraphData>;
  getNeighborhood(nodeId: string, depth?: number, limit?: number): Promise<NvlGraphData>;
  triggerSync(): Promise<GraphSyncResult>;
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
   * SSE streaming request. Uses fetchApi for auth, then reads the full body
   * text and wraps it in a fresh Response with a ReadableStream body.
   *
   * We always read the full body rather than forwarding the original
   * ReadableStream because gzip compression (applied by Express or reverse
   * proxies) buffers the response and prevents incremental streaming.
   * Reading the full text lets the browser transparently decompress before
   * we hand the data to the SSE parser.
   */
  private async streamingFetch(url: string, init: RequestInit): Promise<Response> {
    const res = await this.fetchApi.fetch(url, init);
    if (!res.ok) throw await ResponseError.fromResponse(res);

    const text = await res.text();
    if (!text) {
      throw new Error('Empty response from builder agent');
    }
    return new Response(text, {
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
}
