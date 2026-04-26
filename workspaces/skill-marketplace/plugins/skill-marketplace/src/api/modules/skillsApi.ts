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
  SkillData,
  MarketplaceData,
  LifecycleState,
} from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import type { RequestFn } from './types';

export async function getSkills(
  request: RequestFn,
): Promise<{ skills: SkillData[]; marketplace: MarketplaceData }> {
  return request('/skills');
}

export async function getSkillBySlug(
  request: RequestFn,
  slug: string,
): Promise<SkillData> {
  return request(`/skills/${slug}`);
}

export async function getLifecycleState(
  request: RequestFn,
  ref: string,
): Promise<{
  ref: string;
  lifecycleState: LifecycleState;
  version: string;
  name: string;
}> {
  return request(`/oci/lifecycle/${encodeURIComponent(ref)}`);
}

export async function promoteSkill(
  request: RequestFn,
  ociRef: string,
  targetState: LifecycleState,
): Promise<{
  success: boolean;
  previousState: LifecycleState;
  newState: LifecycleState;
  newOciRef: string;
}> {
  return request('/oci/promote', {
    method: 'POST',
    body: JSON.stringify({ ociRef, targetState }),
  });
}
