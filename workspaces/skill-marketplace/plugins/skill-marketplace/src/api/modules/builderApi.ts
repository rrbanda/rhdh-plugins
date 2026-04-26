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
import type { RequestFn } from './types';

export async function generateSkillJson(
  request: RequestFn,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<{ content: string; action: string }> {
  return request('/builder?action=generate', {
    method: 'POST',
    body: JSON.stringify(body),
    signal,
  });
}

export async function refineSkillJson(
  request: RequestFn,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<{ content: string; action: string }> {
  return request('/builder?action=refine', {
    method: 'POST',
    body: JSON.stringify(body),
    signal,
  });
}

export async function publishSkill(
  request: RequestFn,
  body: {
    skillName: string;
    version: string;
    description: string;
    author: string;
    content: string;
    registry?: string;
  },
): Promise<unknown> {
  return request('/builder/publish', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
