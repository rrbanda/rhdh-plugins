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
  useEffect,
  useState,
  useCallback,
  useRef,
  type MutableRefObject,
} from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { skillMarketplaceApiRef } from '../api';
import { GRAPH_DEFAULTS } from '../components/graph/graphConstants';
import type { NvlGraphData } from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';

function computeFingerprint(d: NvlGraphData): string {
  const schemaPart = `${d.schema.totalNodes}:${d.schema.totalRelationships}:${d.schema.labels.length}`;
  const nodeIds = d.nodes.map(n => n.id).join(',');
  const relIds = d.relationships.map(r => r.id).join(',');
  return `${schemaPart}|${nodeIds}|${relIds}`;
}

export type UseGraphDataOptions = {
  /** When true, scheduled auto-refresh is deferred (e.g. while dragging a node). */
  interactionBlockingRef?: MutableRefObject<boolean>;
};

export function useGraphData(limit?: number, options?: UseGraphDataOptions) {
  const api = useApi(skillMarketplaceApiRef);
  const [data, setData] = useState<NvlGraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const isInitialLoad = useRef(true);
  const prevFingerprintRef = useRef<string>('');
  const lastFetchCompleteAtRef = useRef(Date.now());

  const refetch = useCallback(() => {
    setTick(t => t + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (isInitialLoad.current) {
      setLoading(true);
    }

    api
      .getGraphData(limit)
      .then(graphData => {
        if (!cancelled) {
          const fp = computeFingerprint(graphData);
          if (fp !== prevFingerprintRef.current) {
            prevFingerprintRef.current = fp;
            setData(graphData);
          }
          setError(null);
          setLoading(false);
          isInitialLoad.current = false;
        }
        lastFetchCompleteAtRef.current = Date.now();
      })
      .catch(err => {
        if (!cancelled) {
          setError(err.message || 'Failed to load graph data');
          if (isInitialLoad.current) {
            setLoading(false);
          }
          isInitialLoad.current = false;
        }
        lastFetchCompleteAtRef.current = Date.now();
      });
    return () => {
      cancelled = true;
    };
  }, [api, limit, tick]);

  useEffect(() => {
    const intervalMs = GRAPH_DEFAULTS.AUTO_REFRESH_MS;
    const blockRef = options?.interactionBlockingRef;
    let intervalId: ReturnType<typeof setInterval> | undefined;
    let idleCallbackId = 0;
    let debounceTimeoutId: ReturnType<typeof setTimeout> | undefined;
    let effectCancelled = false;

    const clearDeferred = () => {
      if (idleCallbackId && typeof cancelIdleCallback !== 'undefined') {
        cancelIdleCallback(idleCallbackId);
      }
      if (debounceTimeoutId) {
        clearTimeout(debounceTimeoutId);
      }
      idleCallbackId = 0;
      debounceTimeoutId = undefined;
    };

    const runPoll = () => {
      if (effectCancelled || document.visibilityState !== 'visible') {
        return;
      }
      const tryRefetch = () => {
        if (effectCancelled) {
          clearDeferred();
          return;
        }
        if (document.visibilityState !== 'visible') {
          clearDeferred();
          return;
        }
        if (blockRef?.current) {
          clearDeferred();
          if (typeof requestIdleCallback !== 'undefined') {
            idleCallbackId = requestIdleCallback(tryRefetch, {
              timeout: 2_000,
            });
          } else {
            debounceTimeoutId = setTimeout(tryRefetch, 200);
          }
          return;
        }
        clearDeferred();
        refetch();
      };
      tryRefetch();
    };

    const startInterval = () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
      if (document.visibilityState !== 'visible') {
        return;
      }
      intervalId = setInterval(runPoll, intervalMs);
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = undefined;
        }
        clearDeferred();
        return;
      }
      const elapsed = Date.now() - lastFetchCompleteAtRef.current;
      if (elapsed >= intervalMs) {
        runPoll();
      }
      if (!intervalId) {
        startInterval();
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    if (document.visibilityState === 'visible') {
      startInterval();
    }

    return () => {
      effectCancelled = true;
      clearDeferred();
      document.removeEventListener('visibilitychange', onVisibility);
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [refetch, options?.interactionBlockingRef]);

  return { data, loading, error, refetch };
}
