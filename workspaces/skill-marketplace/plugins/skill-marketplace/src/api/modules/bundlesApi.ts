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
  BundleSummary,
  BundleDetail,
  CreateBundleRequest,
  CreateBundleResponse,
  UpdateBundleRequest,
  BundleExport,
  ResolvedDependencyTree,
} from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import type { RequestFn } from './types';

export async function createBundle(
  request: RequestFn,
  body: CreateBundleRequest,
): Promise<CreateBundleResponse> {
  return request('/graph/bundles', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function importBundle(
  request: RequestFn,
  body: {
    name: string;
    description?: string;
    skills: Array<{ name: string; slug?: string }>;
  },
): Promise<CreateBundleResponse> {
  return request('/graph/bundles/import', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function listBundles(
  request: RequestFn,
): Promise<{ bundles: BundleSummary[] }> {
  return request('/graph/bundles');
}

export async function getBundle(
  request: RequestFn,
  id: string,
): Promise<BundleDetail> {
  return request(`/graph/bundles/${encodeURIComponent(id)}`);
}

export async function updateBundle(
  request: RequestFn,
  id: string,
  body: UpdateBundleRequest,
): Promise<BundleDetail> {
  return request(`/graph/bundles/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function updateBundleStatus(
  request: RequestFn,
  id: string,
  status: string,
): Promise<{ id: string; status: string }> {
  return request(`/graph/bundles/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function deleteBundle(
  request: RequestFn,
  id: string,
): Promise<{ ok: boolean }> {
  return request(`/graph/bundles/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function exportBundle(
  request: RequestFn,
  id: string,
): Promise<BundleExport> {
  return request(`/graph/bundles/${encodeURIComponent(id)}/export`);
}

export async function forkBundle(
  request: RequestFn,
  id: string,
): Promise<BundleDetail> {
  return request(`/graph/bundles/${encodeURIComponent(id)}/fork`, {
    method: 'POST',
  });
}

export async function resolveDependencies(
  request: RequestFn,
  skillNames: string[],
): Promise<ResolvedDependencyTree> {
  return request('/graph/bundles/resolve', {
    method: 'POST',
    body: JSON.stringify({ skillNames }),
  });
}
