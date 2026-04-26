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
import { useEffect, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { skillMarketplaceApiRef } from '../api';
import type {
  SkillGraphSyncStatus,
  CatalogSkill,
  BundleSummary,
} from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';

export interface OverviewStats {
  syncStatus: (SkillGraphSyncStatus & { available: boolean }) | null;
  qualityAggregate: Record<string, unknown> | null;
  agentCount: number | null;
  tags: Array<Record<string, unknown>>;
  gapsCount: number | null;
  bundles: (BundleSummary | CatalogSkill)[];
  syncHistory: Array<Record<string, unknown>>;
}

const EMPTY: OverviewStats = {
  syncStatus: null,
  qualityAggregate: null,
  agentCount: null,
  tags: [],
  gapsCount: null,
  bundles: [],
  syncHistory: [],
};

export function useOverviewStats(): {
  stats: OverviewStats;
  loading: boolean;
} {
  const api = useApi(skillMarketplaceApiRef);
  const [stats, setStats] = useState<OverviewStats>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    Promise.allSettled([
      api.getSyncStatus(),
      api.getQualityAggregate(),
      api.getAgentCount(),
      api.getTags(20),
      api.getCatalogGapsCount(),
      api
        .listCatalogBundles()
        .catch(() => api.listBundles().then(r => r?.bundles ?? [])),
      api.getSyncHistory(5),
    ]).then(results => {
      if (cancelled) return;

      const [syncR, qualR, agentR, tagsR, gapsR, bundlesR, histR] = results;

      setStats({
        syncStatus: syncR.status === 'fulfilled' ? syncR.value : null,
        qualityAggregate: qualR.status === 'fulfilled' ? qualR.value : null,
        agentCount: agentR.status === 'fulfilled' ? agentR.value.count : null,
        tags: tagsR.status === 'fulfilled' ? tagsR.value.tags : [],
        gapsCount: gapsR.status === 'fulfilled' ? gapsR.value.count : null,
        bundles: bundlesR.status === 'fulfilled' ? (bundlesR.value as any) : [],
        syncHistory: histR.status === 'fulfilled' ? histR.value.events : [],
      });
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [api]);

  return { stats, loading };
}
