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
  SkillGraphSyncStatus,
  AgenticQuery,
  LifecycleState,
  BundleSummary,
  BundleDetail,
  CreateBundleRequest,
  CreateBundleResponse,
  UpdateBundleRequest,
  BundleExport,
  ResolvedDependencyTree,
  CatalogSearchParams,
  CatalogSearchResult,
  CatalogSkill,
} from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import * as agentsApi from './modules/agentsApi';
import type { SmpAgentHealthEntry } from './modules/agentsApi';
import * as builderApi from './modules/builderApi';
import * as bundlesApi from './modules/bundlesApi';
import * as catalogApi from './modules/catalogApi';
import * as graphApi from './modules/graphApi';
import * as skillsApi from './modules/skillsApi';
import type { RequestFn } from './modules/types';

/** @public */
export interface SkillMarketplaceApi {
  getSkills(): Promise<{ skills: SkillData[]; marketplace: MarketplaceData }>;
  getSkillBySlug(slug: string): Promise<SkillData>;

  getGraphData(limit?: number): Promise<NvlGraphData>;
  getGraphSchema(): Promise<GraphSchema>;
  searchGraph(query: string): Promise<NvlGraphData>;
  getNeighborhood(
    nodeId: string,
    depth?: number,
    limit?: number,
  ): Promise<NvlGraphData>;
  triggerSync(): Promise<GraphSyncResult>;
  getSyncStatus(): Promise<SkillGraphSyncStatus & { available: boolean }>;
  queryRAG(query: GraphRAGQuery): Promise<GraphRAGResult>;
  agenticQuery(query: AgenticQuery): Promise<{ answer: string; query: string }>;
  askSmpAgent(
    agent: string,
    message: string,
    contextId?: string,
    signal?: AbortSignal,
  ): Promise<{ answer: string; contextId?: string; agent?: string }>;

  getLifecycleState(
    ref: string,
  ): Promise<{
    ref: string;
    lifecycleState: LifecycleState;
    version: string;
    name: string;
  }>;
  promoteSkill(
    ociRef: string,
    targetState: LifecycleState,
  ): Promise<{
    success: boolean;
    previousState: LifecycleState;
    newState: LifecycleState;
    newOciRef: string;
  }>;

  generateSkillJson(
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<{ content: string; action: string }>;
  refineSkillJson(
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<{ content: string; action: string }>;
  publishSkill(body: {
    skillName: string;
    version: string;
    description: string;
    author: string;
    content: string;
    registry?: string;
  }): Promise<unknown>;

  getAgentDetail(namespace: string, name: string): Promise<unknown>;
  getAgentLogs(
    namespace: string,
    name: string,
    tail?: number,
  ): Promise<unknown>;
  getAgentCard(namespace?: string, agentName?: string): Promise<unknown>;
  chatWithAgent(
    message: string,
    sessionId?: string,
    namespace?: string,
    agentName?: string,
    activeSkill?: string,
    signal?: AbortSignal,
  ): Promise<unknown>;
  listAgentNamespaces(): Promise<{ namespaces: string[] }>;
  getHealth(): Promise<Record<string, unknown>>;
  getAgentsHealth(): Promise<Record<string, SmpAgentHealthEntry>>;

  getAgentsFromGraph(): Promise<{ agents: Array<Record<string, unknown>> }>;
  getAgentCount(): Promise<{ count: number }>;
  getAgentSkillsFromGraph(
    namespace: string,
    name: string,
  ): Promise<{ skills: Array<Record<string, unknown>> }>;
  getSkillAgents(
    skillName: string,
  ): Promise<{ agents: Array<Record<string, unknown>> }>;

  getAgentCapabilities(
    namespace: string,
    name: string,
  ): Promise<{ capabilities: Array<Record<string, unknown>> }>;
  getCatalogGaps(): Promise<{ gaps: Array<Record<string, unknown>> }>;
  getCatalogGapsCount(): Promise<{ count: number }>;
  getUnusedSkills(
    limit?: number,
  ): Promise<{ skills: Array<Record<string, unknown>> }>;
  getTags(limit?: number): Promise<{ tags: Array<Record<string, unknown>> }>;

  getSyncHistory(
    limit?: number,
  ): Promise<{ events: Array<Record<string, unknown>> }>;
  getQualityAggregate(): Promise<Record<string, unknown>>;
  verifyMatch(
    skillId: string,
    body: { agentName: string; agentNamespace: string; verified: boolean },
  ): Promise<Record<string, unknown>>;
  overrideMatch(
    skillId: string,
    body: { agentName: string; agentNamespace: string; skillName: string },
  ): Promise<Record<string, unknown>>;

  createBundle(body: CreateBundleRequest): Promise<CreateBundleResponse>;
  importBundle(body: {
    name: string;
    description?: string;
    skills: Array<{ name: string; slug?: string }>;
  }): Promise<CreateBundleResponse>;
  listBundles(): Promise<{ bundles: BundleSummary[] }>;
  getBundle(id: string): Promise<BundleDetail>;
  updateBundle(id: string, body: UpdateBundleRequest): Promise<BundleDetail>;
  updateBundleStatus(
    id: string,
    status: string,
  ): Promise<{ id: string; status: string }>;
  deleteBundle(id: string): Promise<{ ok: boolean }>;
  exportBundle(id: string): Promise<BundleExport>;
  forkBundle(id: string): Promise<BundleDetail>;
  resolveDependencies(skillNames: string[]): Promise<ResolvedDependencyTree>;

  searchCatalog(params?: CatalogSearchParams): Promise<CatalogSearchResult>;
  getCatalogSkill(namespace: string, name: string): Promise<CatalogSkill>;
  getCatalogSkillContent(
    namespace: string,
    name: string,
    version: string,
  ): Promise<string>;
  getCatalogVersions(namespace: string, name: string): Promise<CatalogSkill[]>;
  isCatalogAvailable(): Promise<boolean>;
  listCatalogBundles(): Promise<CatalogSkill[]>;
}

/** @public */
export const skillMarketplaceApiRef = createApiRef<SkillMarketplaceApi>({
  id: 'plugin.skill-marketplace',
});

/** @public */
export class SkillMarketplaceApiClient implements SkillMarketplaceApi {
  private readonly discoveryApi: DiscoveryApi;
  private readonly fetchApi: FetchApi;

  private readonly requestFn: RequestFn = (path, init) =>
    this.request(path, init);

  private getCatalogDeps(): catalogApi.CatalogApiDeps {
    return {
      request: this.requestFn,
      getBaseUrl: () => this.getBaseUrl(),
      fetch: this.fetchApi.fetch,
    };
  }

  constructor(options: { discoveryApi: DiscoveryApi; fetchApi: FetchApi }) {
    this.discoveryApi = options.discoveryApi;
    this.fetchApi = options.fetchApi;
  }

  private async getBaseUrl(): Promise<string> {
    return await this.discoveryApi.getBaseUrl('skill-marketplace');
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const baseUrl = await this.getBaseUrl();
    // RequestInit (e.g. signal for AbortController) is forwarded via ...init
    const res = await this.fetchApi.fetch(`${baseUrl}${path}`, {
      headers: { 'Content-Type': 'application/json', ...init?.headers },
      ...init,
    });
    if (!res.ok) throw await ResponseError.fromResponse(res);
    return res.json();
  }

  async getSkills() {
    return skillsApi.getSkills(this.requestFn);
  }

  async getSkillBySlug(slug: string) {
    return skillsApi.getSkillBySlug(this.requestFn, slug);
  }

  async getGraphData(limit?: number) {
    return graphApi.getGraphData(this.requestFn, limit);
  }

  async getGraphSchema() {
    return graphApi.getGraphSchema(this.requestFn);
  }

  async searchGraph(query: string) {
    return graphApi.searchGraph(this.requestFn, query);
  }

  async getNeighborhood(nodeId: string, depth?: number, limit?: number) {
    return graphApi.getNeighborhood(this.requestFn, nodeId, depth, limit);
  }

  async triggerSync() {
    return graphApi.triggerSync(this.requestFn);
  }

  async getSyncStatus() {
    return graphApi.getSyncStatus(this.requestFn);
  }

  async queryRAG(query: GraphRAGQuery) {
    return graphApi.queryRAG(this.requestFn, query);
  }

  /** @deprecated Use askSmpAgent('kgqa', ...) instead */
  async agenticQuery(query: AgenticQuery) {
    return agentsApi.agenticQuery(this.requestFn, query);
  }

  async askSmpAgent(
    agent: string,
    message: string,
    contextId?: string,
    signal?: AbortSignal,
  ) {
    return agentsApi.askSmpAgent(
      this.requestFn,
      agent,
      message,
      contextId,
      signal,
    );
  }

  async getLifecycleState(ref: string) {
    return skillsApi.getLifecycleState(this.requestFn, ref);
  }

  async promoteSkill(ociRef: string, targetState: LifecycleState) {
    return skillsApi.promoteSkill(this.requestFn, ociRef, targetState);
  }

  async generateSkillJson(body: Record<string, unknown>, signal?: AbortSignal) {
    return builderApi.generateSkillJson(this.requestFn, body, signal);
  }

  async refineSkillJson(body: Record<string, unknown>, signal?: AbortSignal) {
    return builderApi.refineSkillJson(this.requestFn, body, signal);
  }

  async publishSkill(body: {
    skillName: string;
    version: string;
    description: string;
    author: string;
    content: string;
    registry?: string;
  }) {
    return builderApi.publishSkill(this.requestFn, body);
  }

  async getAgentDetail(namespace: string, name: string) {
    return agentsApi.getAgentDetail(this.requestFn, namespace, name);
  }

  async getAgentLogs(namespace: string, name: string, tail?: number) {
    return agentsApi.getAgentLogs(this.requestFn, namespace, name, tail);
  }

  async getAgentCard(namespace?: string, agentName?: string) {
    return agentsApi.getAgentCard(this.requestFn, namespace, agentName);
  }

  async chatWithAgent(
    message: string,
    sessionId?: string,
    namespace?: string,
    agentName?: string,
    activeSkill?: string,
    signal?: AbortSignal,
  ) {
    return agentsApi.chatWithAgent(
      this.requestFn,
      message,
      sessionId,
      namespace,
      agentName,
      activeSkill,
      signal,
    );
  }

  async listAgentNamespaces() {
    return agentsApi.listAgentNamespaces(this.requestFn);
  }

  async getHealth() {
    return agentsApi.getHealth(this.requestFn);
  }

  async getAgentsHealth() {
    return agentsApi.getAgentsHealth(this.requestFn);
  }

  async getAgentsFromGraph() {
    return graphApi.getAgentsFromGraph(this.requestFn);
  }

  async getAgentCount() {
    return graphApi.getAgentCount(this.requestFn);
  }

  async getAgentSkillsFromGraph(namespace: string, name: string) {
    return graphApi.getAgentSkillsFromGraph(this.requestFn, namespace, name);
  }

  async getSkillAgents(skillName: string) {
    return graphApi.getSkillAgents(this.requestFn, skillName);
  }

  async getAgentCapabilities(namespace: string, name: string) {
    return graphApi.getAgentCapabilities(this.requestFn, namespace, name);
  }

  async getCatalogGaps() {
    return graphApi.getCatalogGaps(this.requestFn);
  }

  async getCatalogGapsCount() {
    return graphApi.getCatalogGapsCount(this.requestFn);
  }

  async getUnusedSkills(limit?: number) {
    return graphApi.getUnusedSkills(this.requestFn, limit);
  }

  async getTags(limit?: number) {
    return graphApi.getTags(this.requestFn, limit);
  }

  async getSyncHistory(limit?: number) {
    return graphApi.getSyncHistory(this.requestFn, limit);
  }

  async getQualityAggregate() {
    return graphApi.getQualityAggregate(this.requestFn);
  }

  async verifyMatch(
    skillId: string,
    body: { agentName: string; agentNamespace: string; verified: boolean },
  ) {
    return graphApi.verifyMatch(this.requestFn, skillId, body);
  }

  async overrideMatch(
    skillId: string,
    body: { agentName: string; agentNamespace: string; skillName: string },
  ) {
    return graphApi.overrideMatch(this.requestFn, skillId, body);
  }

  async createBundle(body: CreateBundleRequest) {
    return bundlesApi.createBundle(this.requestFn, body);
  }

  async importBundle(body: {
    name: string;
    description?: string;
    skills: Array<{ name: string; slug?: string }>;
  }) {
    return bundlesApi.importBundle(this.requestFn, body);
  }

  async listBundles() {
    return bundlesApi.listBundles(this.requestFn);
  }

  async getBundle(id: string) {
    return bundlesApi.getBundle(this.requestFn, id);
  }

  async updateBundle(id: string, body: UpdateBundleRequest) {
    return bundlesApi.updateBundle(this.requestFn, id, body);
  }

  async updateBundleStatus(id: string, status: string) {
    return bundlesApi.updateBundleStatus(this.requestFn, id, status);
  }

  async deleteBundle(id: string) {
    return bundlesApi.deleteBundle(this.requestFn, id);
  }

  async exportBundle(id: string) {
    return bundlesApi.exportBundle(this.requestFn, id);
  }

  async forkBundle(id: string) {
    return bundlesApi.forkBundle(this.requestFn, id);
  }

  async resolveDependencies(skillNames: string[]) {
    return bundlesApi.resolveDependencies(this.requestFn, skillNames);
  }

  async searchCatalog(params: CatalogSearchParams = {}) {
    return catalogApi.searchCatalog(this.requestFn, params);
  }

  async getCatalogSkill(namespace: string, name: string) {
    return catalogApi.getCatalogSkill(this.requestFn, namespace, name);
  }

  async getCatalogSkillContent(
    namespace: string,
    name: string,
    version: string,
  ) {
    return catalogApi.getCatalogSkillContent(
      this.getCatalogDeps(),
      namespace,
      name,
      version,
    );
  }

  async getCatalogVersions(namespace: string, name: string) {
    return catalogApi.getCatalogVersions(this.requestFn, namespace, name);
  }

  async isCatalogAvailable() {
    return catalogApi.isCatalogAvailable(this.requestFn);
  }

  async listCatalogBundles() {
    return catalogApi.listCatalogBundles(this.requestFn);
  }
}
