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
import type { LoggerService } from '@backstage/backend-plugin-api';
import type {
  CatalogSkill,
  CatalogSearchParams,
  CatalogSearchResult,
} from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';

export interface SkillCatalogConfig {
  baseUrl: string;
  requestTimeoutMs?: number;
}

export class SkillCatalogService {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly logger: LoggerService;

  constructor(config: SkillCatalogConfig, logger: LoggerService) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.timeoutMs = config.requestTimeoutMs ?? 10_000;
    this.logger = logger;
  }

  private async fetch(path: string, init?: RequestInit): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: { Accept: 'application/json', ...init?.headers },
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async searchSkills(
    params: CatalogSearchParams = {},
  ): Promise<CatalogSearchResult> {
    const qs = new URLSearchParams();
    if (params.q) qs.set('q', params.q);
    if (params.status) qs.set('status', params.status);
    if (params.namespace) qs.set('namespace', params.namespace);
    if (params.tags) qs.set('tags', params.tags);
    if (params.compatibility) qs.set('compatibility', params.compatibility);
    if (params.page) qs.set('page', String(params.page));
    if (params.per_page) qs.set('per_page', String(params.per_page));

    const query = qs.toString();
    const path = `/api/v1/skills${query ? `?${query}` : ''}`;
    const res = await this.fetch(path);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Catalog API ${path} returned ${res.status}: ${body}`);
    }
    return (await res.json()) as CatalogSearchResult;
  }

  async getSkill(namespace: string, name: string): Promise<CatalogSkill> {
    const path = `/api/v1/skills/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`;
    const res = await this.fetch(path);
    if (!res.ok) {
      throw new Error(`Catalog API ${path} returned ${res.status}`);
    }
    const json = (await res.json()) as { data: CatalogSkill };
    return json.data;
  }

  async getSkillVersions(
    namespace: string,
    name: string,
  ): Promise<CatalogSkill[]> {
    const path = `/api/v1/skills/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/versions`;
    const res = await this.fetch(path);
    if (!res.ok) {
      throw new Error(`Catalog API ${path} returned ${res.status}`);
    }
    const json = (await res.json()) as { data: CatalogSkill[] };
    return json.data;
  }

  async getSkillContent(
    namespace: string,
    name: string,
    version: string,
  ): Promise<string> {
    const path = `/api/v1/skills/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/versions/${encodeURIComponent(version)}/content`;
    const res = await this.fetch(path, {
      headers: { Accept: 'text/markdown' },
    });
    if (!res.ok) {
      throw new Error(`Catalog API ${path} returned ${res.status}`);
    }
    return res.text();
  }

  async triggerSync(): Promise<{ message: string }> {
    const res = await this.fetch('/api/v1/sync', { method: 'POST' });
    if (!res.ok) {
      throw new Error(`Catalog API sync returned ${res.status}`);
    }
    const json = (await res.json()) as { data: { message: string } };
    return json.data;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const res = await this.fetch('/api/v1/skills?per_page=1');
      return res.ok;
    } catch (err) {
      this.logger.debug(
        `Catalog API availability check failed: ${(err as Error).message}`,
      );
      return false;
    }
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }
}
