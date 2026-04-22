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
import { useCallback, useRef, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { skillMarketplaceApiRef } from '../api';
import type {
  GraphRAGSkill,
} from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';

export interface SemanticSearchState {
  results: GraphRAGSkill[];
  loading: boolean;
  error: string | null;
  queryEmbeddingUsed: boolean;
  totalSkills: number;
}

const INITIAL_STATE: SemanticSearchState = {
  results: [],
  loading: false,
  error: null,
  queryEmbeddingUsed: false,
  totalSkills: 0,
};

const DEBOUNCE_MS = 400;
const MIN_QUERY_LENGTH = 3;

export function useSemanticSearch() {
  const api = useApi(skillMarketplaceApiRef);
  const [state, setState] = useState<SemanticSearchState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(
    (query: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (abortRef.current) abortRef.current.abort();

      if (!query || query.trim().length < MIN_QUERY_LENGTH) {
        setState(INITIAL_STATE);
        return;
      }

      timerRef.current = setTimeout(async () => {
        const controller = new AbortController();
        abortRef.current = controller;

        setState(prev => ({ ...prev, loading: true, error: null }));

        try {
          const result = await api.queryRAG({
            query: query.trim(),
            maxResults: 20,
            includeRelated: true,
          });

          if (controller.signal.aborted) return;

          setState({
            results: result.skills,
            loading: false,
            error: null,
            queryEmbeddingUsed: result.graphContext.queryEmbeddingUsed,
            totalSkills: result.graphContext.totalSkills,
          });
        } catch (err) {
          if ((err as Error).name === 'AbortError') return;
          setState(prev => ({
            ...prev,
            loading: false,
            error: (err as Error).message || 'Semantic search failed',
          }));
        } finally {
          if (abortRef.current === controller) {
            abortRef.current = null;
          }
        }
      }, DEBOUNCE_MS);
    },
    [api],
  );

  const clear = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (abortRef.current) abortRef.current.abort();
    setState(INITIAL_STATE);
  }, []);

  return { ...state, search, clear };
}
