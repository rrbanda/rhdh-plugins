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
import { useEffect, useState, useCallback } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { skillMarketplaceApiRef } from '../api';
import type { NvlGraphData } from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';

export function useGraphData(limit?: number) {
  const api = useApi(skillMarketplaceApiRef);
  const [data, setData] = useState<NvlGraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => {
    setLoading(true);
    setError(null);
    setData(null);
    setTick(t => t + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .getGraphData(limit)
      .then(graphData => {
        if (!cancelled) {
          setData(graphData);
          setLoading(false);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err.message || 'Failed to load graph data');
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [api, limit, tick]);

  return { data, loading, error, refetch };
}
