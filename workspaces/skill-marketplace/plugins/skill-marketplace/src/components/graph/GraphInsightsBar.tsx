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
import { useState, useEffect, useMemo } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { skillMarketplaceApiRef } from '../../api';

interface InsightsData {
  quality: Record<string, unknown> | null;
  gaps: number;
  syncHistory: Array<Record<string, unknown>>;
}

export default function GraphInsightsBar() {
  const api = useApi(skillMarketplaceApiRef);
  const [data, setData] = useState<InsightsData>({ quality: null, gaps: 0, syncHistory: [] });
  const [collapsed, setCollapsed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.getQualityAggregate().catch(() => null),
      api.getCatalogGapsCount().catch(() => ({ count: 0 })),
      api.getSyncHistory(5).catch(() => ({ events: [] })),
    ]).then(([quality, gapsResult, syncResult]) => {
      if (cancelled) return;
      setData({
        quality: quality as Record<string, unknown> | null,
        gaps: (gapsResult as { count: number })?.count ?? 0,
        syncHistory: (syncResult as { events: Array<Record<string, unknown>> })?.events ?? [],
      });
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [api]);

  const lastSync = useMemo(() => {
    if (!data.syncHistory.length) return null;
    const latest = data.syncHistory[0];
    const ts = latest.timestamp as string | undefined;
    if (!ts) return null;
    try {
      const d = new Date(ts);
      const now = Date.now();
      const diffMs = now - d.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      if (diffMin < 1) return 'just now';
      if (diffMin < 60) return `${diffMin}m ago`;
      const diffHr = Math.floor(diffMin / 60);
      if (diffHr < 24) return `${diffHr}h ago`;
      return `${Math.floor(diffHr / 24)}d ago`;
    } catch {
      return ts;
    }
  }, [data.syncHistory]);

  const lastSyncOk = useMemo(() => {
    if (!data.syncHistory.length) return true;
    const latest = data.syncHistory[0];
    return (latest.skillsUpserted as number) >= 0 && (latest.durationMs as number) > 0;
  }, [data.syncHistory]);

  const avgQuality = useMemo(() => {
    if (!data.quality) return null;
    const avg = data.quality.avgSkill as number | undefined;
    return avg != null ? Math.round(avg * 100) : null;
  }, [data.quality]);

  const totalCaps = useMemo(() => {
    if (!data.quality) return 0;
    return (data.quality.capabilityCount as number) ?? 0;
  }, [data.quality]);

  const matchedCaps = totalCaps > 0 ? totalCaps - data.gaps : 0;

  const coverage = totalCaps > 0 ? Math.round((matchedCaps / totalCaps) * 100) : 0;

  if (!loaded) return null;

  return (
    <div className="gi-bar">
      <style>{styles}</style>
      <button className="gi-toggle" onClick={() => setCollapsed(c => !c)} title={collapsed ? 'Show insights' : 'Collapse insights'}>
        {collapsed ? '▸ Insights' : '▾ Insights'}
      </button>
      {!collapsed && (
        <div className="gi-content">
          <div className="gi-metric" title={`${matchedCaps} of ${totalCaps} capabilities matched to catalog skills`}>
            <span className="gi-metric-value">{coverage}%</span>
            <span className="gi-metric-label">Match Coverage</span>
            <div className="gi-mini-bar">
              <div className="gi-mini-fill" style={{ width: `${coverage}%`, background: coverage === 100 ? '#10b981' : coverage >= 60 ? '#f59e0b' : '#ef4444' }} />
            </div>
          </div>

          <div className="gi-metric" title={lastSync ? `Last sync: ${lastSync}` : 'No sync events recorded'}>
            <span className={`gi-metric-value ${lastSyncOk ? '' : 'gi-warn'}`}>
              {lastSyncOk ? '●' : '▲'}
            </span>
            <span className="gi-metric-label">
              Sync {lastSync ?? 'N/A'}
            </span>
          </div>

          {avgQuality != null && (
            <div className="gi-metric" title={`Average skill completeness across all skills`}>
              <span className="gi-metric-value">{avgQuality}%</span>
              <span className="gi-metric-label">Avg Quality</span>
            </div>
          )}

          {data.gaps > 0 && (
            <span className="gi-warning" title={`${data.gaps} agent capabilities have no matching skill`}>
              <span className="gi-warning-icon">!</span>
              {data.gaps} unmatched
            </span>
          )}

          {!lastSyncOk && (
            <span className="gi-warning gi-warning-error" title="Most recent sync encountered an error">
              <span className="gi-warning-icon">▲</span>
              Last sync failed
            </span>
          )}
        </div>
      )}
    </div>
  );
}

const styles = `
  .gi-bar {
    padding: 0 24px 6px;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .gi-toggle {
    font-size: 12px;
    font-weight: 600;
    color: var(--pf-t--global--text--color--subtle, #6a6e73);
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
    font-family: inherit;
  }
  .gi-toggle:hover {
    background: rgba(0,0,0,0.04);
  }
  .gi-content {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
  }
  .gi-metric {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    cursor: default;
  }
  .gi-metric-value {
    font-weight: 700;
    font-size: 13px;
    color: var(--pf-t--global--text--color--regular, #151515);
  }
  .gi-metric-value.gi-warn {
    color: #ef4444;
  }
  .gi-metric-label {
    color: var(--pf-t--global--text--color--subtle, #6a6e73);
    font-size: 12px;
  }
  .gi-mini-bar {
    width: 40px;
    height: 4px;
    border-radius: 2px;
    background: rgba(0,0,0,0.08);
    overflow: hidden;
    flex-shrink: 0;
  }
  .gi-mini-fill {
    height: 100%;
    border-radius: 2px;
    transition: width 0.3s;
  }
  .gi-warning {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    font-weight: 600;
    padding: 3px 10px;
    border-radius: 6px;
    border: none;
    background: rgba(245,158,11,0.08);
    color: #d97706;
    cursor: pointer;
    font-family: inherit;
    transition: background 0.15s;
  }
  .gi-warning:hover {
    background: rgba(245,158,11,0.15);
  }
  .gi-warning-error {
    background: rgba(239,68,68,0.08);
    color: #dc2626;
    cursor: default;
  }
  .gi-warning-icon {
    font-weight: 800;
    font-size: 10px;
  }
`;
