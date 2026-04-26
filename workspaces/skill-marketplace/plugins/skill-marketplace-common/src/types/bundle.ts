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

/** Lifecycle states aligned with skillimage OCI annotations (io.skillimage.status) */
export type BundleStatus =
  | 'draft'
  | 'testing'
  | 'published'
  | 'deprecated'
  | 'archived';

/** A skill as stored within a bundle. @public */
export interface BundleSkillEntry {
  name: string;
  slug: string;
  category: string;
  description: string;
  addedBy: 'user' | 'dependency';
  version?: string;
  complexity?: string;
  author?: string;
}

/** Summary shape returned by listBundles. @public */
export interface BundleSummary {
  id: string;
  name: string;
  description: string;
  author: string;
  status: BundleStatus;
  createdAt: string;
  skillCount: number;
}

/** Full detail shape returned by getBundle. @public */
export interface BundleDetail {
  id: string;
  name: string;
  description: string;
  author: string;
  status: BundleStatus;
  createdAt: string;
  updatedAt?: string;
  skillCount: number;
  skills: BundleSkillEntry[];
  unmatchedSlugs?: string[];
}

/** Request body for POST /graph/bundles. @public */
export interface CreateBundleRequest {
  name: string;
  description: string;
  skillSlugs: string[];
}

/** Request body for PUT /graph/bundles/:id. @public */
export interface UpdateBundleRequest {
  name?: string;
  description?: string;
  skillSlugs?: string[];
}

/** Response shape for createBundle including match feedback. @public */
export interface CreateBundleResponse extends BundleDetail {
  matchedSlugs: string[];
  unmatchedSlugs: string[];
}

/** Resolved dependency tree for a set of skills. @public */
export interface ResolvedDependencyTree {
  dependencies: Array<{
    name: string;
    category: string;
    description: string;
    dependencyOf: string;
  }>;
  tools: Array<{ name: string; description: string }>;
  similar: Array<{
    name: string;
    category: string;
    description: string;
    similarTo: string;
  }>;
}

/** Bundle export payload. @public */
export interface BundleExport {
  name: string;
  description: string;
  author: string;
  status: BundleStatus;
  createdAt: string;
  skills: Array<{
    name: string;
    slug: string;
    category: string;
    addedBy: string;
    description: string;
  }>;
  dependencies: ResolvedDependencyTree['dependencies'];
  toolRequirements: ResolvedDependencyTree['tools'];
  similarSuggestions: ResolvedDependencyTree['similar'];
  totalSkills: number;
  manuallyAdded: number;
  autoDependencies: number;
}
