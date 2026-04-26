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
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '@material-ui/core/styles';
import { useSkills, useOverviewStats } from '../../hooks';
import AddToBundleButton from '../shared/AddToBundleButton';
import { humanize } from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import styles from './OverviewPage.module.css';
import type {
  CatalogSkill,
  BundleSummary,
  SkillData,
  ComplexityLevel,
} from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import LoadingSpinner from '../shared/LoadingSpinner';
import ErrorMessage from '../shared/ErrorMessage';

/* ------------------------------------------------------------------ */
/*  Utilities                                                          */
/* ------------------------------------------------------------------ */

function estimateComplexity(s: SkillData): ComplexityLevel {
  const tagCount = s.tags?.length ?? 0;
  const descLen = s.description.length;
  if (s.sections.workflow.length > 0 || tagCount > 4 || descLen > 300)
    return 'Advanced';
  if (tagCount > 2 || descLen > 150) return 'Complex';
  if (descLen > 60) return 'Medium';
  return 'Simple';
}

function skillQualityScore(s: SkillData): number {
  let score = 0;
  score += Math.min(s.description.length / 50, 5);
  score += Math.min(s.tags?.length ?? 0, 5);
  score += s.sections.workflow.length * 2;
  if (s.lifecycleState === 'published') score += 3;
  else if (s.lifecycleState === 'testing') score += 1;
  if (s.model) score += 1;
  if (s.version) score += 1;
  return score;
}

function selectFeatured(skills: SkillData[], max: number): SkillData[] {
  const ranked = [...skills].sort(
    (a, b) => skillQualityScore(b) - skillQualityScore(a),
  );
  const seen = new Set<string>();
  const result: SkillData[] = [];
  for (const s of ranked) {
    if (result.length >= max) break;
    if (!seen.has(s.pluginName)) {
      seen.add(s.pluginName);
      result.push(s);
    }
  }
  for (const s of ranked) {
    if (result.length >= max) break;
    if (!result.includes(s)) result.push(s);
  }
  return result.slice(0, max);
}

function parseCatalogBundleSkillSlugs(
  bundleSkills: string | undefined,
): string[] {
  if (!bundleSkills?.trim()) return [];
  const t = bundleSkills.trim();
  if (t.startsWith('[')) {
    try {
      const p = JSON.parse(t) as unknown;
      if (Array.isArray(p)) return p.map(s => String(s).trim()).filter(Boolean);
    } catch {
      /* comma split fallback */
    }
  }
  return t
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

function catalogBundleSkillCount(cs: CatalogSkill): number {
  return parseCatalogBundleSkillSlugs(cs.bundle_skills).length;
}

function isCatalogBundle(b: BundleSummary | CatalogSkill): b is CatalogSkill {
  return 'namespace' in b;
}

function relativeTime(iso: string | null): string {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/* ------------------------------------------------------------------ */
/*  Animated counter hook                                              */
/* ------------------------------------------------------------------ */

function useAnimatedCounter(target: number, duration = 1200): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (target <= 0) {
      setValue(0);
      return undefined;
    }
    let start: number | null = null;
    let raf: number;
    const step = (ts: number) => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

/* ------------------------------------------------------------------ */
/*  AnimatedStat – a single stat pill with animated counter            */
/* ------------------------------------------------------------------ */

function AnimatedStat({
  value,
  label,
  icon,
  delay = 0,
  accent,
  isDark,
}: {
  value: number | null;
  label: string;
  icon: React.ReactNode;
  delay?: number;
  accent: {
    border: string;
    glow: string;
    text: string;
    darkBg: string;
    lightBg: string;
  };
  isDark: boolean;
}) {
  const display = useAnimatedCounter(value ?? 0);
  return (
    <div
      className={styles.heroStat}
      style={{
        animationDelay: `${delay}ms`,
        backgroundColor: isDark ? accent.darkBg : accent.lightBg,
        borderColor: accent.border,
        boxShadow: isDark
          ? `0 4px 20px rgba(0,0,0,0.35), 0 0 16px ${accent.glow}`
          : `0 4px 16px rgba(0,0,0,0.06), 0 0 8px ${accent.glow}`,
      }}
    >
      <span className={styles.heroStatIcon} style={{ color: accent.text }}>
        {icon}
      </span>
      <span className={styles.heroStatValue} style={{ color: accent.text }}>
        {value !== null ? display.toLocaleString() : '—'}
      </span>
      <span className={styles.heroStatLabel}>{label}</span>
    </div>
  );
}

const STAT_ACCENTS = {
  skills: {
    border: 'rgba(59,130,246,0.4)',
    glow: 'rgba(59,130,246,0.10)',
    text: '#60a5fa',
    darkBg: '#172242',
    lightBg: '#eef4ff',
  },
  categories: {
    border: 'rgba(16,185,129,0.4)',
    glow: 'rgba(16,185,129,0.10)',
    text: '#34d399',
    darkBg: '#122e28',
    lightBg: '#ecfdf5',
  },
  bundles: {
    border: 'rgba(168,85,247,0.4)',
    glow: 'rgba(168,85,247,0.10)',
    text: '#c084fc',
    darkBg: '#211838',
    lightBg: '#f5f0ff',
  },
};

/* ------------------------------------------------------------------ */
/*  SVG Progress Ring                                                  */
/* ------------------------------------------------------------------ */

function ProgressRing({
  percent,
  size = 48,
  strokeWidth = 4,
}: {
  percent: number;
  size?: number;
  strokeWidth?: number;
}) {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(percent, 100) / 100);
  return (
    <svg width={size} height={size} className={styles.progressRing}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        className={styles.progressRingBg}
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        className={styles.progressRingFill}
        strokeWidth={strokeWidth}
        strokeDasharray={circ}
        strokeDashoffset={offset}
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        className={styles.progressRingText}
      >
        {Math.round(percent)}%
      </text>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  SVG Icons (inline, no dependencies)                                */
/* ------------------------------------------------------------------ */

const IconCube = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
);

const IconFolder = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
  </svg>
);

const IconBot = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="11" width="18" height="10" rx="2" />
    <circle cx="12" cy="5" r="2" />
    <path d="M12 7v4" />
    <line x1="8" y1="16" x2="8" y2="16" />
    <line x1="16" y1="16" x2="16" y2="16" />
  </svg>
);

const IconPackage = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="16.5" y1="9.4" x2="7.5" y2="4.21" />
    <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
);

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

type InsightTab = 'featured' | 'pulse' | 'how';

export default function OverviewPage() {
  const { skills, marketplace, loading, error } = useSkills();
  const { stats, loading: statsLoading } = useOverviewStats();
  const navigate = useNavigate();
  const muiTheme = useTheme();
  const isDark = muiTheme.palette.type === 'dark';
  const [activeTab, setActiveTab] = useState<InsightTab>('featured');

  const featured = useMemo(() => selectFeatured(skills, 6), [skills]);
  const plugins = marketplace?.plugins ?? [];

  // Category distribution
  const categoryDist = useMemo(() => {
    const map = new Map<string, { count: number; color: string }>();
    skills.forEach(s => {
      const e = map.get(s.pluginName) || { count: 0, color: s.plugin.color };
      e.count++;
      map.set(s.pluginName, e);
    });
    return [...map.entries()].sort((a, b) => b[1].count - a[1].count);
  }, [skills]);

  // Hero stats
  const skillCount = stats.syncStatus?.skillCount ?? skills.length;
  const agentCount =
    (stats.qualityAggregate as any)?.agentCount ?? stats.agentCount ?? null;
  const bundleCount = stats.bundles.length || null;

  // Ecosystem pulse
  const embeddingCoverage = stats.syncStatus?.embeddingCoverage;
  const coveragePercent =
    embeddingCoverage && embeddingCoverage.total > 0
      ? (embeddingCoverage.withEmbeddings / embeddingCoverage.total) * 100
      : 0;
  const qualityScore =
    stats.qualityAggregate &&
    typeof (stats.qualityAggregate as any).avgSkill === 'number'
      ? Math.round((stats.qualityAggregate as any).avgSkill * 100)
      : null;
  const capabilityCount =
    stats.qualityAggregate &&
    typeof (stats.qualityAggregate as any).capabilityCount === 'number'
      ? (stats.qualityAggregate as any).capabilityCount
      : null;

  // Tags
  const tags = stats.tags;
  const maxTagCount =
    tags.length > 0 ? Math.max(...tags.map((t: any) => t.count ?? 0)) : 1;

  // Featured bundles (published ones)
  const featuredBundles = useMemo(() => {
    return stats.bundles
      .filter(b => {
        const st = (b.status || '').toLowerCase();
        return st === 'published' || st === '';
      })
      .slice(0, 6);
  }, [stats.bundles]);

  if (loading) return <LoadingSpinner message="Loading marketplace..." />;
  if (error) return <ErrorMessage message={error} />;

  return (
    <div className={styles.ov}>
      {/* ============================================================ */}
      {/* Section 1: Hero Banner                                       */}
      {/* ============================================================ */}
      <div className={styles.hero}>
        <div className={styles.heroGlow} aria-hidden />
        <div className={styles.heroContent}>
          <div className={styles.heroLeft}>
            <h1 className={styles.heroTitle}>AI Agent Skills Marketplace</h1>
            <p className={styles.heroSubtitle}>
              {marketplace?.metadata.description ||
                'Enterprise-grade, portable skills for any AI agent \u2014 discover, compose, and deploy'}
            </p>
            <div className={styles.heroActions}>
              <button
                className={`${styles.cta} ${styles.ctaPrimary}`}
                onClick={() => navigate('skills')}
                type="button"
              >
                Browse Skills
              </button>
              <button
                className={`${styles.cta} ${styles.ctaOutline}`}
                onClick={() => navigate('graph')}
                type="button"
              >
                Explore Graph
              </button>
              <button
                className={`${styles.cta} ${styles.ctaOutline}`}
                onClick={() => navigate('builder')}
                type="button"
              >
                Build a Skill
              </button>
            </div>
          </div>
          <div className={styles.heroStats}>
            <AnimatedStat
              value={skillCount}
              label="Skills"
              icon={<IconCube />}
              delay={0}
              accent={STAT_ACCENTS.skills}
              isDark={isDark}
            />
            <AnimatedStat
              value={plugins.length}
              label="Categories"
              icon={<IconFolder />}
              delay={80}
              accent={STAT_ACCENTS.categories}
              isDark={isDark}
            />
            <AnimatedStat
              value={bundleCount}
              label="Skill Bundles"
              icon={<IconPackage />}
              delay={160}
              accent={STAT_ACCENTS.bundles}
              isDark={isDark}
            />
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* Section 2: Category Distribution                             */}
      {/* ============================================================ */}
      {categoryDist.length > 0 && (
        <section className={styles.section}>
          <div className={styles.secHeader}>
            <h2 className={styles.h2}>Skill Categories</h2>
            <button
              className={styles.linkBtn}
              onClick={() => navigate('skills')}
              type="button"
            >
              View all &rarr;
            </button>
          </div>
          <div className={styles.catStrip}>
            {categoryDist.map(([name, { count, color }], i) => (
              <button
                key={name}
                className={styles.catPill}
                style={
                  {
                    '--cat-color': color,
                    animationDelay: `${i * 40}ms`,
                  } as React.CSSProperties
                }
                onClick={() => navigate('skills')}
                type="button"
              >
                <span
                  className={styles.catDot}
                  style={{ backgroundColor: color }}
                />
                <span className={styles.catName}>{name}</span>
                <span className={styles.catCount}>{count}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ============================================================ */}
      {/* Tabbed Section: Featured Skills | Ecosystem Pulse | How It Works */}
      {/* ============================================================ */}
      <section className={styles.section}>
        <div className={styles.tabBar} role="tablist">
          {[
            {
              id: 'featured' as InsightTab,
              label: 'Featured Skills',
              count: featured.length,
            },
            { id: 'pulse' as InsightTab, label: 'Ecosystem Pulse' },
            { id: 'how' as InsightTab, label: 'How It Works' },
          ].map(tab => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`}
              onClick={() => setActiveTab(tab.id)}
              type="button"
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className={styles.tabBadge}>{tab.count}</span>
              )}
            </button>
          ))}
          {activeTab === 'featured' && featured.length > 0 && (
            <button
              className={`${styles.linkBtn} ${styles.tabLink}`}
              onClick={() => navigate('skills')}
              type="button"
            >
              View all &rarr;
            </button>
          )}
        </div>

        <div className={styles.tabPanel} role="tabpanel">
          {/* Tab: Featured Skills */}
          {activeTab === 'featured' && (
            <>
              {featured.length > 0 ? (
                <div className={styles.featGrid}>
                  {featured.map((skill, i) => (
                    <FeaturedCard
                      key={skill.slug}
                      skill={skill}
                      index={i}
                      onClick={() => navigate(`skills/${skill.slug}`)}
                    />
                  ))}
                </div>
              ) : (
                <div className={styles.empty}>
                  <p className={styles.emptyText}>No skills published yet.</p>
                  <button
                    className={`${styles.cta} ${styles.ctaPrimary}`}
                    onClick={() => navigate('builder')}
                    type="button"
                  >
                    Publish your first skill
                  </button>
                </div>
              )}
            </>
          )}

          {/* Tab: Ecosystem Pulse */}
          {activeTab === 'pulse' && (
            <div className={styles.pulseGrid}>
              <div
                className={styles.pulseCard}
                style={{ animationDelay: '0ms' }}
              >
                <div className={styles.pulseHeader}>
                  <span
                    className={styles.pulseDot}
                    data-status={stats.syncStatus?.status ?? 'idle'}
                  />
                  <span className={styles.pulseLabel}>Graph Sync</span>
                </div>
                <span className={styles.pulseValue}>
                  {stats.syncStatus?.skillCount?.toLocaleString() ?? '—'}
                </span>
                <span className={styles.pulseSub}>
                  nodes &middot;{' '}
                  {relativeTime(stats.syncStatus?.lastSyncAt ?? null)}
                </span>
              </div>

              <div
                className={styles.pulseCard}
                style={{ animationDelay: '60ms' }}
              >
                <div className={styles.pulseHeader}>
                  <span className={styles.pulseLabel}>Embedding Coverage</span>
                </div>
                <ProgressRing percent={coveragePercent} />
                <span className={styles.pulseSub}>
                  {embeddingCoverage
                    ? `${embeddingCoverage.withEmbeddings} / ${embeddingCoverage.total}`
                    : '—'}
                </span>
              </div>

              <div
                className={styles.pulseCard}
                style={{ animationDelay: '120ms' }}
              >
                <div className={styles.pulseHeader}>
                  <span className={styles.pulseLabel}>Agent Readiness</span>
                </div>
                <span className={styles.pulseValue}>{agentCount ?? '—'}</span>
                <span className={styles.pulseSub}>
                  agents
                  {stats.gapsCount !== null && stats.gapsCount > 0 && (
                    <span className={styles.gapsBadge}>
                      {stats.gapsCount} gaps
                    </span>
                  )}
                </span>
              </div>

              <div
                className={styles.pulseCard}
                style={{ animationDelay: '180ms' }}
              >
                <div className={styles.pulseHeader}>
                  <span className={styles.pulseLabel}>Quality Score</span>
                </div>
                <span className={styles.pulseValue}>
                  {qualityScore !== null ? `${qualityScore}%` : '—'}
                </span>
                {qualityScore !== null && (
                  <div className={styles.qualityBar}>
                    <div
                      className={styles.qualityBarFill}
                      style={{ width: `${qualityScore}%` }}
                    />
                  </div>
                )}
                {capabilityCount !== null && (
                  <span className={styles.pulseSub}>
                    {capabilityCount} capabilities mapped
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Tab: How It Works */}
          {activeTab === 'how' && (
            <div className={styles.howGrid}>
              {[
                {
                  n: '1',
                  t: 'Author',
                  d: 'Create a skill.yaml following the skillimage.io/v1alpha1 spec \u2014 define capabilities, prompts, and workflows.',
                },
                {
                  n: '2',
                  t: 'Publish',
                  d: 'Push to an OCI-compliant registry as a portable, versioned skill image \u2014 share across teams and runtimes.',
                },
                {
                  n: '3',
                  t: 'Deploy',
                  d: 'Assign skills to agents via Kagenti and run in production \u2014 monitor, version, and iterate.',
                },
              ].map((step, i) => (
                <React.Fragment key={step.n}>
                  {i > 0 && <span className={styles.howArrow}>&rarr;</span>}
                  <div
                    className={styles.howCard}
                    style={{ animationDelay: `${i * 80}ms` }}
                  >
                    <span className={styles.howNumber}>{step.n}</span>
                    <span className={styles.howTitle}>{step.t}</span>
                    <span className={styles.howDesc}>{step.d}</span>
                  </div>
                </React.Fragment>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ============================================================ */}
      {/* Section 5: Top Tags                                          */}
      {/* ============================================================ */}
      {tags.length > 0 && (
        <section className={`${styles.section} ${styles.tagSection}`}>
          <h2 className={styles.h2}>Popular Tags</h2>
          <div className={styles.tagCloud}>
            {tags.map((tag: any, i: number) => {
              const name = tag.name ?? tag.tag ?? '';
              const count = tag.count ?? 0;
              const scale = 12 + 6 * (count / maxTagCount);
              const opacity = 0.7 + 0.3 * (count / maxTagCount);
              return (
                <button
                  key={name}
                  className={styles.tagChip}
                  style={{
                    fontSize: `${scale}px`,
                    opacity,
                    animationDelay: `${i * 30}ms`,
                  }}
                  onClick={() => navigate('skills')}
                  type="button"
                >
                  {name}
                  <sup className={styles.tagCount}>{count}</sup>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* ============================================================ */}
      {/* Section 6: Featured Skill Bundles                            */}
      {/* ============================================================ */}
      {featuredBundles.length > 0 && (
        <section
          className={styles.section}
          aria-labelledby="ov-bundles-heading"
        >
          <div className={styles.secHeader}>
            <div>
              <h2 className={styles.h2} id="ov-bundles-heading">
                Featured Skill Bundles
              </h2>
              <p className={styles.secSub}>
                Curated collections ready to deploy
              </p>
            </div>
            <button
              className={styles.linkBtn}
              onClick={() => navigate('bundles')}
              type="button"
            >
              View all &rarr;
            </button>
          </div>
          <div className={styles.bunGrid}>
            {featuredBundles.map((bundle, idx) => {
              const fromCatalog = isCatalogBundle(bundle);
              const key = fromCatalog
                ? `${bundle.namespace}/${bundle.name}`
                : bundle.id;
              const title =
                (fromCatalog
                  ? bundle.display_name || bundle.name
                  : bundle.name) || 'Skill Bundle';
              const desc = bundle.description?.trim() || 'No description';
              const count = fromCatalog
                ? catalogBundleSkillCount(bundle)
                : bundle.skillCount;
              const st = (bundle.status || 'published').toLowerCase();
              return (
                <div
                  key={key || `bundle-${idx}`}
                  role="link"
                  tabIndex={0}
                  className={styles.bunCard}
                  style={{ animationDelay: `${idx * 50}ms` }}
                  onClick={() => navigate('bundles')}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      navigate('bundles');
                    }
                  }}
                  aria-label={`Open skill bundle: ${title}`}
                >
                  <div className={styles.bunCardHeader}>
                    <span className={styles.bunIcon} aria-hidden />
                    <h3 className={styles.bunCardName}>{title}</h3>
                  </div>
                  <p className={styles.bunCardDesc}>{desc}</p>
                  <div className={styles.bunCardFooter}>
                    <span className={styles.bunCount}>
                      {count} {count === 1 ? 'skill' : 'skills'}
                    </span>
                    <span className={styles.bunStatus}>{st}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Featured Card (3D tilt)                                            */
/* ------------------------------------------------------------------ */

function FeaturedCard({
  skill,
  index,
  onClick,
}: {
  skill: SkillData;
  index: number;
  onClick: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const complexity = estimateComplexity(skill);
  const pluginColor = skill.plugin.color ?? '#6b7280';

  const cxStyle: Record<string, { fg: string; bg: string }> = {
    Simple: { fg: 'var(--sm-success)', bg: 'var(--sm-success-tint)' },
    Medium: { fg: '#3b82f6', bg: 'rgba(59,130,246,0.08)' },
    Complex: { fg: 'var(--sm-warning)', bg: 'var(--sm-warning-tint)' },
    Advanced: { fg: 'var(--sm-danger)', bg: 'var(--sm-danger-tint)' },
  };
  const stepCount = skill.sections.workflow.length;
  const title = humanize(skill.name);
  const tags = skill.tags?.slice(0, 3) ?? [];

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const tiltX = (y - 0.5) * -8;
    const tiltY = (x - 0.5) * 8;
    el.style.transform = `perspective(800px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) scale(1.02)`;
  }, []);

  const handleMouseLeave = useCallback(() => {
    const el = cardRef.current;
    if (!el) return;
    el.style.transform = 'perspective(800px) rotateX(0) rotateY(0) scale(1)';
  }, []);

  return (
    <div
      ref={cardRef}
      role="link"
      tabIndex={0}
      className={styles.featCard}
      style={
        {
          '--fc-bar-color': pluginColor,
          animationDelay: `${index * 60}ms`,
        } as React.CSSProperties
      }
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      aria-label={`Open skill ${title}`}
    >
      <span className={styles.featBar} />
      <div className={styles.featBody}>
        <div className={styles.featTop}>
          <span
            className={styles.featPlugin}
            style={{ backgroundColor: pluginColor }}
          >
            {skill.pluginName}
          </span>
          <span
            className={styles.featCx}
            style={{
              backgroundColor: (cxStyle[complexity] ?? cxStyle.Medium).bg,
              color: (cxStyle[complexity] ?? cxStyle.Medium).fg,
            }}
          >
            {complexity}
          </span>
        </div>
        <h3 className={styles.featTitle}>{title}</h3>
        <p className={styles.featDesc}>{skill.description}</p>
        {tags.length > 0 && (
          <div className={styles.featTags}>
            {tags.map(tag => (
              <span key={tag} className={styles.featTag}>
                {tag}
              </span>
            ))}
          </div>
        )}
        <div className={styles.featBottom}>
          <div className={styles.featMeta}>
            {stepCount > 0 && (
              <span className={styles.featMetaItem}>
                {stepCount} {stepCount === 1 ? 'step' : 'steps'}
              </span>
            )}
            {skill.version && (
              <span className={styles.featMetaItem}>v{skill.version}</span>
            )}
            {skill.model && (
              <span className={styles.featModel}>{skill.model}</span>
            )}
          </div>
          <AddToBundleButton
            skill={{
              name: skill.skillName,
              slug: skill.slug,
              category: skill.pluginName,
              description: skill.description,
            }}
            variant="icon"
          />
        </div>
      </div>
    </div>
  );
}
