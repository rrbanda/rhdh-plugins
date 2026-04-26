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
import CheckCircle from '@material-ui/icons/CheckCircle';
import MuiErrorIcon from '@material-ui/icons/Error';
import Warning from '@material-ui/icons/Warning';
import { useApi } from '@backstage/core-plugin-api';
import { skillMarketplaceApiRef } from '../../api';
import { MetricErrorBoundary } from './MetricErrorBoundary';
import styles from './GraphInsightsBar.module.css';

function useAnimatedCounter(target: number, durationMs = 800) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (target <= 0) {
      setValue(0);
      return;
    }
    const start = window.performance.now();
    const step = (now: number) => {
      const progress = Math.min((now - start) / durationMs, 1);
      setValue(Math.round(target * progress));
      if (progress < 1) {
        requestAnimationFrame(step);
      }
    };
    requestAnimationFrame(step);
  }, [target, durationMs]);
  return value;
}

function MiniDonut({
  value,
  max,
  color,
}: {
  value: number;
  max: number;
  color: string;
}) {
  const pct = max > 0 ? value / max : 0;
  const r = 16;
  const c = 2 * Math.PI * r;
  return (
    <svg width={40} height={40} viewBox="0 0 40 40" className={styles.giDonut}>
      <circle
        cx={20}
        cy={20}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={4}
        opacity={0.1}
      />
      <circle
        cx={20}
        cy={20}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={4}
        strokeDasharray={`${c * pct} ${c * (1 - pct)}`}
        strokeLinecap="round"
        transform="rotate(-90 20 20)"
        style={{ transition: 'stroke-dasharray 0.8s ease' }}
      />
      <text x={20} y={22} textAnchor="middle" fontSize={10} fill="currentColor">
        {Math.round(pct * 100)}%
      </text>
    </svg>
  );
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) {
    return null;
  }
  const max = Math.max(...values);
  const w = 60;
  const h = 20;
  const points = values
    .map(
      (v, i) => `${(i / (values.length - 1)) * w},${h - (v / (max || 1)) * h}`,
    )
    .join(' ');
  return (
    <svg width={w} height={h} className={styles.giSparkline}>
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  );
}

function GapSeverityIcon({ gapCount }: { gapCount: number }) {
  if (gapCount > 10) {
    return (
      <MuiErrorIcon
        className={styles.giSevIcon}
        style={{ color: 'var(--sm-danger)' }}
        fontSize="small"
        titleAccess="Many unmatched capabilities (over threshold)"
        aria-label="Many unmatched capabilities (over threshold)"
      />
    );
  }
  if (gapCount > 0) {
    return (
      <Warning
        className={styles.giSevIcon}
        style={{ color: 'var(--sm-warning)' }}
        fontSize="small"
        titleAccess="Unmatched capabilities"
        aria-label="Unmatched capabilities"
      />
    );
  }
  return (
    <CheckCircle
      className={styles.giSevIcon}
      style={{ color: 'var(--sm-success)' }}
      fontSize="small"
      titleAccess="No catalog gaps"
      aria-label="No catalog gaps"
    />
  );
}

function MetricApiFallback({ onRetry }: { onRetry: () => void }) {
  return (
    <div className={styles.giMetric} role="status">
      <span className={styles.giMetricErrorText}>Unavailable</span>
      <button type="button" className={styles.giMetricRetry} onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}

function buildMatchCoverage(
  quality: Record<string, unknown>,
  gapCount: number,
) {
  const totalCaps = (quality.capabilityCount as number) ?? 0;
  const matchedCaps = totalCaps > 0 ? totalCaps - gapCount : 0;
  const coverage =
    totalCaps > 0 ? Math.round((matchedCaps / totalCaps) * 100) : 0;
  return { totalCaps, matchedCaps, coverage };
}

function MatchCoverageContent({
  quality,
  gapCount,
  displayPercent,
  donutColor,
}: {
  quality: Record<string, unknown>;
  gapCount: number;
  /** Animated 0–100 match coverage. */
  displayPercent: number;
  donutColor: string;
}) {
  const { totalCaps, matchedCaps } = buildMatchCoverage(quality, gapCount);
  const animatedMatch = useAnimatedCounter(matchedCaps, 800);
  return (
    <div
      className={styles.giMetric}
      title={`${matchedCaps} of ${totalCaps} capabilities matched to catalog skills`}
    >
      <MiniDonut
        value={totalCaps > 0 ? animatedMatch : 0}
        max={totalCaps > 0 ? totalCaps : 1}
        color={donutColor}
      />
      <span className={styles.giMetricValue}>{displayPercent}%</span>
      <span className={styles.giMetricLabel}>Match coverage</span>
    </div>
  );
}

function AvgQualityBlock({ quality }: { quality: Record<string, unknown> }) {
  const avg = quality.avgSkill as number | undefined;
  const avgQ = avg !== null && avg !== undefined ? Math.round(avg * 100) : null;
  const animated = useAnimatedCounter(avgQ ?? 0, 800);
  if (avgQ === null) {
    return null;
  }
  return (
    <div
      className={styles.giMetric}
      title="Average skill completeness across all skills"
    >
      <span className={styles.giMetricValue}>{animated}%</span>
      <span className={styles.giMetricLabel}>Avg Quality</span>
    </div>
  );
}

function SyncTimeBlock({
  syncHistory,
  sparklineColor,
}: {
  syncHistory: Array<Record<string, unknown>>;
  sparklineColor: string;
}) {
  const lastSync = useMemo(() => {
    if (!syncHistory.length) {
      return null;
    }
    const latest = syncHistory[0];
    const ts = latest.timestamp as string | undefined;
    if (!ts) {
      return null;
    }
    try {
      const d = new Date(ts);
      const now = Date.now();
      const diffMs = now - d.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      if (diffMin < 1) {
        return 'just now';
      }
      if (diffMin < 60) {
        return `${diffMin}m ago`;
      }
      const diffHr = Math.floor(diffMin / 60);
      if (diffHr < 24) {
        return `${diffHr}h ago`;
      }
      return `${Math.floor(diffHr / 24)}d ago`;
    } catch {
      return ts;
    }
  }, [syncHistory]);

  const lastSyncOk = useMemo(() => {
    if (!syncHistory.length) {
      return true;
    }
    const latest = syncHistory[0];
    return (
      (latest.skillsUpserted as number) >= 0 &&
      (latest.durationMs as number) > 0
    );
  }, [syncHistory]);

  const durationSeries = useMemo(() => {
    const rows = syncHistory
      .slice(0, 5)
      .map(e => toNumberish(e.durationMs))
      .filter(n => n > 0);
    return [...rows].reverse();
  }, [syncHistory]);

  return (
    <div
      className={styles.giMetric}
      title={lastSync ? `Last sync: ${lastSync}` : 'No sync events recorded'}
    >
      {durationSeries.length >= 2 && (
        <Sparkline values={durationSeries} color={sparklineColor} />
      )}
      <span
        className={
          lastSyncOk
            ? styles.giMetricValue
            : `${styles.giMetricValue} ${styles.giMetricValueWarn}`
        }
      >
        {lastSyncOk ? '●' : '▲'}
      </span>
      <span className={styles.giMetricLabel}>{lastSync ?? 'N/A'}</span>
    </div>
  );
}

function toNumberish(v: unknown): number {
  if (typeof v === 'number' && !Number.isNaN(v)) {
    return v;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function LastSyncFailedBanner({
  syncHistory,
}: {
  syncHistory: Array<Record<string, unknown>>;
}) {
  const lastSyncOk = useMemo(() => {
    if (!syncHistory.length) {
      return true;
    }
    const latest = syncHistory[0];
    return (
      (latest.skillsUpserted as number) >= 0 &&
      (latest.durationMs as number) > 0
    );
  }, [syncHistory]);

  if (lastSyncOk) {
    return null;
  }
  return (
    <span
      className={`${styles.giWarning} ${styles.giWarningError}`}
      title="Most recent sync encountered an error"
    >
      <span className={styles.giWarningIcon}>▲</span>
      Last sync failed
    </span>
  );
}

function GapsWarningBlock({ gapCount }: { gapCount: number }) {
  if (gapCount <= 0) {
    return null;
  }
  return (
    <span
      className={styles.giWarning}
      title={`${gapCount} agent capabilities have no matching skill`}
    >
      <span className={styles.giWarningIcon}>!</span>
      {gapCount} unmatched
    </span>
  );
}

function CollapsedKeyNumbers({
  quality,
  syncHistory,
  animatedCoverage,
  animatedGaps,
  sparklineColor,
}: {
  quality: Record<string, unknown> | null;
  syncHistory: Array<Record<string, unknown>>;
  animatedCoverage: number;
  animatedGaps: number;
  sparklineColor: string;
}) {
  const durationSeries = useMemo(() => {
    const rows = syncHistory
      .slice(0, 5)
      .map(e => toNumberish(e.durationMs))
      .filter(n => n > 0);
    return [...rows].reverse();
  }, [syncHistory]);

  const lastSync = useMemo(() => {
    if (!quality || !syncHistory.length) {
      return '—';
    }
    const latest = syncHistory[0];
    const ts = latest.timestamp as string | undefined;
    if (!ts) {
      return '—';
    }
    try {
      const d = new Date(ts);
      const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
      if (diffMin < 1) {
        return 'now';
      }
      if (diffMin < 60) {
        return `${diffMin}m`;
      }
      return `${Math.floor(diffMin / 60)}h`;
    } catch {
      return '—';
    }
  }, [quality, syncHistory]);

  if (!quality) {
    return null;
  }
  return (
    <div className={styles.giCollapsedLine}>
      {durationSeries.length >= 2 && (
        <Sparkline values={durationSeries} color={sparklineColor} />
      )}
      <span>
        <strong>{animatedCoverage}%</strong> match
      </span>
      <span className={styles.giDot}>·</span>
      <span>
        <strong>{animatedGaps}</strong> gaps
      </span>
      <span className={styles.giDot}>·</span>
      <span>sync {lastSync}</span>
    </div>
  );
}

export default function GraphInsightsBar() {
  const api = useApi(skillMarketplaceApiRef);
  const [expanded, setExpanded] = useState(false);

  const [quality, setQuality] = useState<Record<string, unknown> | null>(null);
  const [qualityError, setQualityError] = useState(false);
  const [qualityAttempted, setQualityAttempted] = useState(false);
  const [qualityRetry, setQualityRetry] = useState(0);

  const [gaps, setGaps] = useState(0);
  const [gapsError, setGapsError] = useState(false);
  const [gapsAttempted, setGapsAttempted] = useState(false);
  const [gapsRetry, setGapsRetry] = useState(0);

  const [syncHistory, setSyncHistory] = useState<
    Array<Record<string, unknown>>
  >([]);
  const [syncError, setSyncError] = useState(false);
  const [syncAttempted, setSyncAttempted] = useState(false);
  const [syncRetry, setSyncRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await api.getQualityAggregate();
        if (!cancelled) {
          setQuality(d as Record<string, unknown>);
          setQualityError(false);
        }
      } catch {
        if (!cancelled) {
          setQuality(null);
          setQualityError(true);
        }
      } finally {
        if (!cancelled) {
          setQualityAttempted(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, qualityRetry]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await api.getCatalogGapsCount();
        if (!cancelled) {
          setGaps(d.count);
          setGapsError(false);
        }
      } catch {
        if (!cancelled) {
          setGaps(0);
          setGapsError(true);
        }
      } finally {
        if (!cancelled) {
          setGapsAttempted(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, gapsRetry]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await api.getSyncHistory(5);
        if (!cancelled) {
          setSyncHistory(d.events);
          setSyncError(false);
        }
      } catch {
        if (!cancelled) {
          setSyncHistory([]);
          setSyncError(true);
        }
      } finally {
        if (!cancelled) {
          setSyncAttempted(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, syncRetry]);

  const coverageTarget =
    quality && !gapsError && !qualityError
      ? buildMatchCoverage(quality, gaps).coverage
      : 0;
  const animatedCoverage = useAnimatedCounter(coverageTarget, 800);
  const animatedGaps = useAnimatedCounter(gaps, 800);

  if (!qualityAttempted || !gapsAttempted || !syncAttempted) {
    return (
      <div className={styles.giHeader}>
        <span className={styles.giToggle}>▸ Insights</span>
        <div className={styles.giSkeletonRow}>
          <span className={styles.giSkeletonPill} />
          <span className={styles.giSkeletonPill} />
          <span className={styles.giSkeletonPill} />
        </div>
      </div>
    );
  }

  const donutColor =
    coverageTarget === 100
      ? 'var(--sm-success)'
      : coverageTarget >= 60
        ? 'var(--sm-warning)'
        : 'var(--sm-danger)';

  return (
    <div className={styles.giBar}>
      <div className={styles.giHeader}>
        <button
          className={styles.giToggle}
          onClick={() => setExpanded(e => !e)}
          type="button"
          aria-expanded={expanded}
        >
          {expanded ? '▾' : '▸'} Insights
        </button>
        {!expanded && !qualityError && !gapsError && quality && (
          <CollapsedKeyNumbers
            quality={quality}
            syncHistory={syncHistory}
            animatedCoverage={animatedCoverage}
            animatedGaps={animatedGaps}
            sparklineColor="var(--sm-info, #0ea5e9)"
          />
        )}
        {!gapsError && <GapSeverityIcon gapCount={gaps} />}
      </div>

      <div
        className={`${styles.giExpandable} ${expanded ? styles.giExpandableOpen : ''}`}
        aria-hidden={!expanded}
      >
        <div className={styles.giContent}>
          <MetricErrorBoundary
            onRetry={() => {
              setQualityRetry(r => r + 1);
              setGapsRetry(r => r + 1);
            }}
          >
            {qualityError || gapsError || !quality ? (
              <MetricApiFallback
                onRetry={() => {
                  setQualityRetry(r => r + 1);
                  setGapsRetry(r => r + 1);
                }}
              />
            ) : (
              <MatchCoverageContent
                quality={quality}
                gapCount={gaps}
                displayPercent={animatedCoverage}
                donutColor={donutColor}
              />
            )}
          </MetricErrorBoundary>

          <MetricErrorBoundary
            onRetry={() => {
              setSyncRetry(r => r + 1);
            }}
          >
            {syncError ? (
              <MetricApiFallback
                onRetry={() => {
                  setSyncRetry(r => r + 1);
                }}
              />
            ) : (
              <SyncTimeBlock
                syncHistory={syncHistory}
                sparklineColor="var(--sm-info, #0ea5e9)"
              />
            )}
          </MetricErrorBoundary>

          <MetricErrorBoundary
            onRetry={() => {
              setQualityRetry(r => r + 1);
            }}
          >
            {qualityError || !quality ? (
              <MetricApiFallback
                onRetry={() => {
                  setQualityRetry(r => r + 1);
                }}
              />
            ) : (
              <AvgQualityBlock quality={quality} />
            )}
          </MetricErrorBoundary>

          <MetricErrorBoundary
            onRetry={() => {
              setGapsRetry(r => r + 1);
            }}
          >
            {gapsError ? (
              <MetricApiFallback
                onRetry={() => {
                  setGapsRetry(r => r + 1);
                }}
              />
            ) : (
              <GapsWarningBlock gapCount={gaps} />
            )}
          </MetricErrorBoundary>

          {!syncError && <LastSyncFailedBanner syncHistory={syncHistory} />}
        </div>
      </div>
    </div>
  );
}
