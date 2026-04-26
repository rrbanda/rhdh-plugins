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
import { ResponseError } from '@backstage/errors';
import type { FetchApi } from '@backstage/core-plugin-api';
import type {
  CatalogSearchParams,
  CatalogSearchResult,
  CatalogSkill,
} from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import type { RequestFn } from './types';

export type CatalogApiDeps = {
  request: RequestFn;
  getBaseUrl: () => Promise<string>;
  fetch: FetchApi['fetch'];
};

export async function searchCatalog(
  request: RequestFn,
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
  return request(`/catalog/skills${query ? `?${query}` : ''}`);
}

export async function getCatalogSkill(
  request: RequestFn,
  namespace: string,
  name: string,
): Promise<CatalogSkill> {
  const result = await request<{ data: CatalogSkill }>(
    `/catalog/skills/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`,
  );
  return result.data;
}

export async function getCatalogSkillContent(
  deps: CatalogApiDeps,
  namespace: string,
  name: string,
  version: string,
): Promise<string> {
  const baseUrl = await deps.getBaseUrl();
  const res = await deps.fetch(
    `${baseUrl}/catalog/skills/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/versions/${encodeURIComponent(version)}/content`,
    { headers: { Accept: 'text/markdown' } },
  );
  if (!res.ok) throw await ResponseError.fromResponse(res);
  return res.text();
}

export async function getCatalogVersions(
  request: RequestFn,
  namespace: string,
  name: string,
): Promise<CatalogSkill[]> {
  const result = await request<{ data: CatalogSkill[] }>(
    `/catalog/skills/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/versions`,
  );
  return result.data;
}

export async function isCatalogAvailable(request: RequestFn): Promise<boolean> {
  try {
    const result = await request<{ available: boolean }>('/catalog/available');
    return result.available;
  } catch {
    return false;
  }
}

/**
 * Returns published skills from the catalog that are marked as bundles
 * (metadata io.skillimage.bundle on the OCI image).
 */
export async function listCatalogBundles(
  request: RequestFn,
): Promise<CatalogSkill[]> {
  const result = await request<
    CatalogSearchResult | { data?: CatalogSkill[]; skills?: CatalogSkill[] }
  >('/catalog/skills?status=published&per_page=100');
  const skills =
    ('data' in result && result.data) ||
    ('skills' in result && result.skills) ||
    [];
  return skills.filter(
    s => s.bundle === true || (s as { bundle?: boolean | number }).bundle === 1,
  );
}
