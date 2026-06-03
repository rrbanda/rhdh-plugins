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
  PROVIDER_REGISTRY,
  getProviderDescriptor,
  getAllProviderDescriptors,
  isValidProviderType,
} from './registry';

describe('provider registry', () => {
  it('PROVIDER_REGISTRY contains llamastack and kagenti entries', () => {
    expect(PROVIDER_REGISTRY.has('llamastack')).toBe(true);
    expect(PROVIDER_REGISTRY.has('kagenti')).toBe(true);
  });

  it('PROVIDER_REGISTRY contains llamastack entry', () => {
    expect(PROVIDER_REGISTRY.has('llamastack')).toBe(true);
  });

  it('getProviderDescriptor("kagenti") returns descriptor with implemented: true', () => {
    const d = getProviderDescriptor('kagenti');
    expect(d).toBeDefined();
    expect(d && d.id).toBe('kagenti');
    expect(d && d.implemented).toBe(true);
  });

  it('getProviderDescriptor("unknown") returns undefined', () => {
    expect(getProviderDescriptor('unknown')).toBeUndefined();
  });

  it('getAllProviderDescriptors returns all providers sorted by displayName', () => {
    const all = getAllProviderDescriptors();
    expect(all).toHaveLength(2);
    expect(all[0].displayName).toBe('Llama Stack');
    expect(all[1].displayName).toBe('Red Hat OpenShift AI');
  });

  it('isValidProviderType("kagenti") returns true', () => {
    expect(isValidProviderType('kagenti')).toBe(true);
  });

  it('isValidProviderType("unknown") returns false', () => {
    expect(isValidProviderType('unknown')).toBe(false);
  });

  it('Kagenti has configFields with baseUrl', () => {
    const d = getProviderDescriptor('kagenti');
    expect(d).toBeDefined();
    const keys = d?.configFields.map(f => f.key);
    expect(keys).toContain('baseUrl');
  });

  it('Kagenti exposes all platform capabilities', () => {
    const d = getProviderDescriptor('kagenti');
    expect(d).toBeDefined();
    expect(d?.capabilities.chat).toBe(true);
    expect(d?.capabilities.rag).toBe(true);
    expect(d?.capabilities.safety).toBe(true);
    expect(d?.capabilities.evaluation).toBe(true);
    expect(d?.capabilities.conversations).toBe(true);
    expect(d?.capabilities.mcpTools).toBe(true);
    expect(d?.capabilities.tools).toBe(true);
  });
});
