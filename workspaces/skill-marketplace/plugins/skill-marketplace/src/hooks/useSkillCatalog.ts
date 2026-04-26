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
import { useState, useEffect, useCallback, useRef } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { skillMarketplaceApiRef } from '../api';
import type {
  CatalogSkill,
  CatalogSearchParams,
  CatalogPagination,
} from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';

export interface CatalogFilters {
  namespace?: string;
  status?: string;
  tags?: string;
  compatibility?: string;
}

export interface SkillCatalogState {
  skills: CatalogSkill[];
  pagination: CatalogPagination;
  loading: boolean;
  error: string | null;
  available: boolean;
  search: (query: string) => void;
  setFilters: (filters: CatalogFilters) => void;
  filters: CatalogFilters;
  query: string;
  setPage: (page: number) => void;
  getSkillContent: (
    namespace: string,
    name: string,
    version: string,
  ) => Promise<string>;
  refresh: () => void;
}

const DEBOUNCE_MS = 300;
const DEFAULT_PER_PAGE = 20;

export function useSkillCatalog(perPage = DEFAULT_PER_PAGE): SkillCatalogState {
  const api = useApi(skillMarketplaceApiRef);
  const [available, setAvailable] = useState(false);
  const [skills, setSkills] = useState<CatalogSkill[]>([]);
  const [pagination, setPagination] = useState<CatalogPagination>({
    total: 0,
    page: 1,
    per_page: perPage,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filters, setFiltersState] = useState<CatalogFilters>({});
  const [page, setPageState] = useState(1);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    api.isCatalogAvailable().then(ok => {
      if (mountedRef.current) setAvailable(ok);
    });
  }, [api]);

  const fetchSkills = useCallback(
    async (params: CatalogSearchParams) => {
      if (!mountedRef.current) return;
      setLoading(true);
      setError(null);
      try {
        const result = await api.searchCatalog(params);
        if (mountedRef.current) {
          setSkills(result.data);
          setPagination(result.pagination);
        }
      } catch (err) {
        if (mountedRef.current) {
          setError(
            err instanceof Error ? err.message : 'Failed to fetch catalog',
          );
          setSkills([]);
        }
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    },
    [api],
  );

  useEffect(() => {
    if (!available) {
      setLoading(false);
      return;
    }
    const params: CatalogSearchParams = {
      q: query || undefined,
      ...filters,
      page,
      per_page: perPage,
    };
    fetchSkills(params);
  }, [available, query, filters, page, perPage, fetchSkills]);

  const search = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setQuery(q);
      setPageState(1);
    }, DEBOUNCE_MS);
  }, []);

  const setFilters = useCallback((f: CatalogFilters) => {
    setFiltersState(f);
    setPageState(1);
  }, []);

  const setPage = useCallback((p: number) => {
    setPageState(p);
  }, []);

  const getSkillContent = useCallback(
    (namespace: string, name: string, version: string) =>
      api.getCatalogSkillContent(namespace, name, version),
    [api],
  );

  const refresh = useCallback(() => {
    const params: CatalogSearchParams = {
      q: query || undefined,
      ...filters,
      page,
      per_page: perPage,
    };
    fetchSkills(params);
  }, [query, filters, page, perPage, fetchSkills]);

  return {
    skills,
    pagination,
    loading,
    error,
    available,
    search,
    setFilters,
    filters,
    query,
    setPage,
    getSkillContent,
    refresh,
  };
}
