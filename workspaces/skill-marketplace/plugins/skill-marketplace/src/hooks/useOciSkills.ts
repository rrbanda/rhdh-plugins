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
import { useState, useEffect, useCallback } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { skillMarketplaceApiRef } from '../api';
import type {
  Skill,
  OciRegistryConfig,
} from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';

export function useOciSkills(registryUrl?: string) {
  const api = useApi(skillMarketplaceApiRef);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [registries, setRegistries] = useState<OciRegistryConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getOciSkills(registryUrl);
      setSkills(result.skills);
      setRegistries(result.registries);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load OCI skills');
    } finally {
      setLoading(false);
    }
  }, [api, registryUrl]);

  useEffect(() => {
    load();
  }, [load]);

  return { skills, registries, loading, error, refetch: load };
}
