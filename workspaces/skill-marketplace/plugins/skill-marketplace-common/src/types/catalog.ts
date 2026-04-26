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

/** Raw skill object returned by the Skill Catalog API. @public */
export interface CatalogSkill {
  repository: string;
  tag: string;
  digest: string;
  name: string;
  namespace: string;
  version: string;
  status: string;
  display_name: string;
  description: string;
  authors: string;
  license: string;
  tags_json: string;
  compatibility: string;
  word_count: number;
  created: string;
  bundle: boolean;
  bundle_skills: string;
  synced_at: string;
}

/** Query parameters for the Skill Catalog search endpoint. @public */
export interface CatalogSearchParams {
  q?: string;
  status?: string;
  namespace?: string;
  tags?: string;
  compatibility?: string;
  page?: number;
  per_page?: number;
}

/** Pagination metadata from the Skill Catalog API. @public */
export interface CatalogPagination {
  total: number;
  page: number;
  per_page: number;
}

/** Paginated result from the Skill Catalog search endpoint. @public */
export interface CatalogSearchResult {
  data: CatalogSkill[];
  pagination: CatalogPagination;
}
