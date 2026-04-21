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
import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { skillMarketplaceApiRef } from '../api';
import type {
  SkillData,
  MarketplaceData,
} from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';

interface SkillsState {
  skills: SkillData[];
  marketplace: MarketplaceData | null;
  loading: boolean;
  error: string | null;
}

const SkillsContext = createContext<SkillsState>({
  skills: [],
  marketplace: null,
  loading: true,
  error: null,
});

/**
 * Provider that fetches skills once and shares state with all descendant
 * components via React context. Wrap the plugin's top-level page in this
 * to avoid duplicate GET /skills requests from nested pages.
 *
 * The backend guarantees the catalog is pre-loaded before routes are
 * registered, so `GET /skills` returns data instantly. No slow-load
 * timers or client-side timeouts are needed.
 */
export function SkillsProvider({ children }: { children: React.ReactNode }) {
  const api = useApi(skillMarketplaceApiRef);
  const [skills, setSkills] = useState<SkillData[]>([]);
  const [marketplace, setMarketplace] = useState<MarketplaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    api
      .getSkills()
      .then(data => {
        if (!cancelled) {
          setSkills(data.skills);
          setMarketplace(data.marketplace);
          setLoading(false);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err.message || 'Failed to load skills');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [api]);

  const value = useMemo(
    () => ({ skills, marketplace, loading, error }),
    [skills, marketplace, loading, error],
  );

  return React.createElement(SkillsContext.Provider, { value }, children);
}

/**
 * Returns the shared skills state from `SkillsProvider`.
 * Must be used within a `SkillsProvider`.
 */
export function useSkills(): SkillsState {
  return useContext(SkillsContext);
}
