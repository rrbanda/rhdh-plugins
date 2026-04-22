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
import LoadingSpinner from '../shared/LoadingSpinner';
import ErrorMessage from '../shared/ErrorMessage';

interface SyncEvent {
  timestamp: string;
  skillsUpserted: number;
  capabilitiesCreated: number;
  matchesCreated: number;
  gapsFound: number;
  durationMs: number;
}

function Sparkline({ values, color, label, height = 80, width = 280 }: {
  values: number[];
  color: string;
  label: string;
  height?: number;
  width?: number;
}) {
  if (values.length === 0) return <div className="an-spark-empty">No data</div>;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const padY = 8;
  const padX = 4;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const step = values.length > 1 ? innerW / (values.length - 1) : innerW;

  const points = values.map((v, i) => {
    const x = padX + i * step;
    const y = padY + innerH - ((v - min) / range) * innerH;
    return `${x},${y}`;
  });
  const linePath = points.join(' ');
  const areaPath = `${padX},${padY + innerH} ${linePath} ${padX + (values.length - 1) * step},${padY + innerH}`;

  const latest = values[values.length - 1];

  return (
    <div className="an-spark-card">
      <div className="an-spark-header">
        <span className="an-spark-label">{label}</span>
        <span className="an-spark-latest" style={{ color }}>{latest}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="an-spark-svg">
        <polygon points={areaPath} fill={color} opacity="0.08" />
        <polyline points={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {values.map((v, i) => {
          const x = padX + i * step;
          const y = padY + innerH - ((v - min) / range) * innerH;
          return <circle key={i} cx={x} cy={y} r="3" fill={color} opacity={i === values.length - 1 ? 1 : 0.4} />;
        })}
      </svg>
      <div className="an-spark-footer">
        <span>oldest</span>
        <span>latest</span>
      </div>
    </div>
  );
}

function BarChart({ data, color, label, valueKey, height = 120, barWidth = 24 }: {
  data: SyncEvent[];
  color: string;
  label: string;
  valueKey: keyof SyncEvent;
  height?: number;
  barWidth?: number;
}) {
  const values = data.map(d => Number(d[valueKey]) || 0);
  if (values.length === 0) return <div className="an-spark-empty">No data</div>;
  const max = Math.max(...values, 1);
  const chartW = Math.max(data.length * (barWidth + 6) + 20, 200);
  const padY = 8;
  const innerH = height - padY * 2;

  return (
    <div className="an-spark-card an-spark-wide">
      <div className="an-spark-header">
        <span className="an-spark-label">{label}</span>
      </div>
      <div className="an-bar-scroll">
        <svg viewBox={`0 0 ${chartW} ${height}`} width={chartW} height={height}>
          {values.map((v, i) => {
            const barH = (v / max) * innerH;
            const x = 10 + i * (barWidth + 6);
            const y = padY + innerH - barH;
            return (
              <g key={i}>
                <rect x={x} y={y} width={barWidth} height={barH} rx={3} fill={color} opacity={0.7} />
                <text x={x + barWidth / 2} y={y - 4} textAnchor="middle" fontSize="9" fill={color} fontWeight="600">
                  {v > 0 ? v : ''}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="an-spark-footer">
        <span>oldest</span>
        <span>latest</span>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const api = useApi(skillMarketplaceApiRef);
  const [events, setEvents] = useState<SyncEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getSyncHistory(50)
      .then(r => {
        const evts = ((r.events ?? []) as unknown as SyncEvent[]).slice().reverse();
        setEvents(evts);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message || 'Failed to load sync history');
        setLoading(false);
      });
  }, [api]);

  const matchCoverage = useMemo(() => {
    return events.map(e => {
      const total = e.matchesCreated + e.gapsFound;
      return total > 0 ? Math.round((e.matchesCreated / total) * 100) : 0;
    });
  }, [events]);

  const syncDurations = useMemo(() => events.map(e => Math.round(e.durationMs / 1000)), [events]);

  if (loading) return <LoadingSpinner message="Loading analytics..." />;
  if (error) return <ErrorMessage message={error} />;

  if (events.length === 0) {
    return (
      <div className="analytics-page">
        <style>{styles}</style>
        <div className="an-empty">
          <h2>No Sync History Yet</h2>
          <p>
            Analytics will appear after the first graph sync completes.
            Syncs happen automatically on startup, or you can trigger one manually from the Skill Graph tab.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="analytics-page">
      <style>{styles}</style>

      <div className="an-header">
        <h1 className="an-title">Graph Analytics</h1>
        <p className="an-subtitle">
          Showing trends from the last {events.length} sync events.
          Use these charts to track skill catalog growth and match coverage over time.
        </p>
      </div>

      <div className="an-grid">
        <Sparkline
          values={events.map(e => e.skillsUpserted)}
          color="#0066cc"
          label="Skills Upserted"
        />
        <Sparkline
          values={matchCoverage}
          color="#10b981"
          label="Match Coverage %"
        />
        <Sparkline
          values={events.map(e => e.gapsFound)}
          color="#ef4444"
          label="Gaps Found"
        />
        <Sparkline
          values={syncDurations}
          color="#8b5cf6"
          label="Sync Duration (s)"
        />
      </div>

      <h2 className="an-section-title">Sync History</h2>
      <div className="an-grid">
        <BarChart data={events} color="#0066cc" label="Skills Upserted per Sync" valueKey="skillsUpserted" />
        <BarChart data={events} color="#22c55e" label="Matches Created per Sync" valueKey="matchesCreated" />
      </div>

      <h2 className="an-section-title">Event Log</h2>
      <div className="an-table-wrap">
        <table className="an-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Skills</th>
              <th>Capabilities</th>
              <th>Matches</th>
              <th>Gaps</th>
              <th>Duration</th>
            </tr>
          </thead>
          <tbody>
            {[...events].reverse().map((e, i) => (
              <tr key={i}>
                <td className="an-ts">{formatTimestamp(e.timestamp)}</td>
                <td>{e.skillsUpserted}</td>
                <td>{e.capabilitiesCreated}</td>
                <td>{e.matchesCreated}</td>
                <td className={e.gapsFound > 0 ? 'an-warn' : ''}>{e.gapsFound}</td>
                <td>{(e.durationMs / 1000).toFixed(1)}s</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatTimestamp(ts: string): string {
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return ts;
  }
}

const styles = `
  .analytics-page {
    padding: 24px;
    max-width: 1100px;
    margin: 0 auto;
  }
  .an-header {
    margin-bottom: 24px;
  }
  .an-title {
    font-size: 20px;
    font-weight: 700;
    margin: 0;
  }
  .an-subtitle {
    font-size: 13px;
    color: var(--pf-t--global--text--color--subtle, #6a6e73);
    margin: 4px 0 0;
    line-height: 1.5;
  }
  .an-empty {
    text-align: center;
    padding: 64px 24px;
    color: var(--pf-t--global--text--color--subtle, #6a6e73);
  }
  .an-empty h2 {
    font-size: 18px;
    font-weight: 700;
    margin: 0 0 8px;
    color: var(--pf-t--global--text--color--regular, #151515);
  }
  .an-empty p {
    max-width: 400px;
    margin: 0 auto;
    line-height: 1.6;
  }
  .an-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 16px;
    margin-bottom: 28px;
  }
  .an-section-title {
    font-size: 16px;
    font-weight: 700;
    margin: 0 0 12px;
  }
  .an-spark-card {
    border: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
    border-radius: 10px;
    padding: 14px 16px 10px;
    background: var(--pf-t--global--background--color--primary--default, #fff);
  }
  .an-spark-wide {
    grid-column: span 2;
  }
  .an-spark-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 6px;
  }
  .an-spark-label {
    font-size: 13px;
    font-weight: 600;
    color: var(--pf-t--global--text--color--subtle, #6a6e73);
  }
  .an-spark-latest {
    font-size: 18px;
    font-weight: 700;
  }
  .an-spark-svg {
    display: block;
    width: 100%;
    height: auto;
  }
  .an-spark-footer {
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    color: var(--pf-t--global--text--color--subtle, #6a6e73);
    margin-top: 2px;
    opacity: 0.6;
  }
  .an-spark-empty {
    font-size: 13px;
    color: var(--pf-t--global--text--color--subtle, #6a6e73);
    padding: 24px;
    text-align: center;
  }
  .an-bar-scroll {
    overflow-x: auto;
  }
  .an-table-wrap {
    overflow-x: auto;
    border: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
    border-radius: 10px;
  }
  .an-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  .an-table th {
    text-align: left;
    padding: 10px 14px;
    font-weight: 600;
    background: var(--pf-t--global--background--color--secondary--default, #f5f5f5);
    border-bottom: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
    white-space: nowrap;
  }
  .an-table td {
    padding: 8px 14px;
    border-bottom: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
  }
  .an-table tr:last-child td {
    border-bottom: none;
  }
  .an-ts {
    white-space: nowrap;
    color: var(--pf-t--global--text--color--subtle, #6a6e73);
  }
  .an-warn {
    color: #ef4444;
    font-weight: 600;
  }
`;
