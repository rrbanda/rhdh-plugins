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
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '@backstage/core-plugin-api';
import { useSkills } from '../../hooks';
import { skillMarketplaceApiRef } from '../../api';
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

/** Slugs from catalog `bundle_skills` (JSON array or comma-separated, per API). */
function parseCatalogBundleSkillSlugs(
  bundleSkills: string | undefined,
): string[] {
  if (!bundleSkills?.trim()) {
    return [];
  }
  const t = bundleSkills.trim();
  if (t.startsWith('[')) {
    try {
      const p = JSON.parse(t) as unknown;
      if (Array.isArray(p)) {
        return p.map(s => String(s).trim()).filter(Boolean);
      }
    } catch {
      // fall through to comma split
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

function isPublishedCatalogStatus(status: string | undefined): boolean {
  return (status || '').toLowerCase() === 'published';
}

function isCatalogBundle(b: BundleSummary | CatalogSkill): b is CatalogSkill {
  return 'namespace' in b;
}

export default function OverviewPage() {
  const api = useApi(skillMarketplaceApiRef);
  const { skills, marketplace, loading, error } = useSkills();
  const navigate = useNavigate();
  const [featuredBundles, setFeaturedBundles] = useState<
    (BundleSummary | CatalogSkill)[]
  >([]);

  const featured = useMemo(() => selectFeatured(skills, 3), [skills]);

  useEffect(() => {
    let cancelled = false;
    api
      .listCatalogBundles()
      .then(bundles => {
        if (cancelled) return;
        const published = (bundles || []).filter(b =>
          isPublishedCatalogStatus(b.status),
        );
        setFeaturedBundles(published.slice(0, 6));
      })
      .catch(() => {
        api
          .listBundles()
          .then(result => {
            if (cancelled) return;
            const published = (result?.bundles || []).filter(
              (b: BundleSummary) => b.status === 'published',
            );
            setFeaturedBundles(published.slice(0, 6));
          })
          .catch(() => {
            if (!cancelled) {
              setFeaturedBundles([]);
            }
          });
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  if (loading) return <LoadingSpinner message="Loading marketplace..." />;
  if (error) return <ErrorMessage message={error} />;

  const plugins = marketplace?.plugins ?? [];

  return (
    <div className={styles.ov}>
      {/* Hero */}
      <div className={styles.ovHero}>
        <div className={styles.ovHeroLeft}>
          <h1 className={styles.ovH1}>AI Agent Skills</h1>
          <p className={styles.ovTagline}>
            {marketplace?.metadata.description ||
              'Open-source, portable, validated skills for developers \u2014 ready to use across any AI-powered IDE'}
          </p>
          <div className={styles.ovHeroActions}>
            <button
              className={`${styles.ovCta} ${styles.ovCtaPrimary}`}
              onClick={() => navigate('skills')}
              type="button"
            >
              Browse Skills
            </button>
            <button
              className={`${styles.ovCta} ${styles.ovCtaOutline}`}
              onClick={() => navigate('graph')}
              type="button"
            >
              Skill Graph
            </button>
            <button
              className={`${styles.ovCta} ${styles.ovCtaOutline}`}
              onClick={() => navigate('builder')}
              type="button"
            >
              Build a Skill
            </button>
          </div>
        </div>
        <div className={styles.ovHeroStats}>
          <div
            className={styles.ovStat}
            title="Total skill definitions synced from OCI registries"
          >
            <span className={styles.ovStatV}>{skills.length}</span>
            <span className={styles.ovStatL}>Skills</span>
          </div>
          <div
            className={styles.ovStat}
            title="Skill categories auto-detected from tags and keywords"
          >
            <span className={styles.ovStatV}>{plugins.length}</span>
            <span className={styles.ovStatL}>Categories</span>
          </div>
        </div>
      </div>

      {/* Featured Skills */}
      <div className={styles.ovSection}>
        <div className={styles.ovSecHdr}>
          <h2 className={styles.ovH2}>Featured Skills</h2>
          {featured.length > 0 && (
            <button
              className={styles.ovLink}
              onClick={() => navigate('skills')}
            >
              View all &rarr;
            </button>
          )}
        </div>
        {featured.length > 0 ? (
          <div className={styles.ovFeatGrid}>
            {featured.map(skill => (
              <FeaturedCard
                key={skill.slug}
                skill={skill}
                onClick={() => navigate(`skills/${skill.slug}`)}
              />
            ))}
          </div>
        ) : (
          <div className={styles.ovEmpty}>
            <p className={styles.ovEmptyText}>No skills published yet.</p>
            <button
              className={`${styles.ovCta} ${styles.ovCtaPrimary}`}
              onClick={() => navigate('builder')}
              type="button"
            >
              Publish your first skill
            </button>
          </div>
        )}
      </div>

      {/* Featured Bundles */}
      {featuredBundles.length > 0 && (
        <section
          className={styles.ovSection}
          aria-labelledby="featured-bundles-heading"
        >
          <div className={`${styles.ovSecHdr} ${styles.ovSecHdrWithSub}`}>
            <div>
              <h2 className={styles.ovH2} id="featured-bundles-heading">
                Featured Bundles
              </h2>
              <p className={styles.ovSecSub}>
                Curated skill bundles ready to use
              </p>
            </div>
            <button
              className={styles.ovLink}
              onClick={() => navigate('bundles')}
              type="button"
            >
              View all &rarr;
            </button>
          </div>
          <div className={styles.ovBunGrid}>
            {featuredBundles.map((bundle, idx) => {
              const fromCatalog = isCatalogBundle(bundle);
              const key = fromCatalog
                ? `${bundle.namespace}/${bundle.name}`
                : bundle.id;
              const title =
                (fromCatalog
                  ? bundle.display_name || bundle.name
                  : bundle.name) || 'Bundle';
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
                  className={styles.ovBunCard}
                  onClick={() => navigate('bundles')}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      navigate('bundles');
                    }
                  }}
                  aria-label={`Open bundles: ${title}`}
                >
                  <div className={styles.ovBunCardHdr}>
                    <span className={styles.ovBunIcon} aria-hidden />
                    <h3 className={styles.ovBunCardName}>{title}</h3>
                  </div>
                  <p className={styles.ovBunCardDesc}>{desc}</p>
                  <div className={styles.ovBunCardFtr}>
                    <span className={styles.ovBunCount}>
                      {count} {count === 1 ? 'skill' : 'skills'}
                    </span>
                    <span className={styles.ovBunSt}>{st}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* How It Works */}
      <div className={styles.ovSection}>
        <h2 className={styles.ovH2}>How It Works</h2>
        <div className={styles.ovHowGrid}>
          {[
            {
              n: '1',
              t: 'Author',
              d: 'Create a skill.yaml following the skillimage.io/v1alpha1 spec.',
              c: 'var(--sm-brand)',
              bg: 'var(--sm-brand-tint)',
            },
            {
              n: '2',
              t: 'Publish',
              d: 'Push to an OCI registry as a portable, versioned image.',
              c: '#8b5cf6',
              bg: 'rgba(139,92,246,0.08)',
            },
            {
              n: '3',
              t: 'Deploy',
              d: 'Assign skills to agents via Kagenti and run in production.',
              c: 'var(--sm-success)',
              bg: 'var(--sm-success-tint)',
            },
          ].map((s, i) => (
            <React.Fragment key={s.n}>
              {i > 0 && <span className={styles.ovHowArrow}>&rarr;</span>}
              <div className={styles.ovHowCard}>
                <span
                  className={styles.ovHowN}
                  style={{ backgroundColor: s.bg, color: s.c }}
                >
                  {s.n}
                </span>
                <span className={styles.ovHowT}>{s.t}</span>
                <span className={styles.ovHowD}>{s.d}</span>
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

function FeaturedCard({
  skill,
  onClick,
}: {
  skill: SkillData;
  onClick: () => void;
}) {
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

  return (
    <div
      role="link"
      tabIndex={0}
      className={styles.ovFc}
      style={{ '--fc-bar-color': pluginColor } as React.CSSProperties}
      onClick={onClick}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      aria-label={`Open skill ${title}`}
    >
      <span className={styles.ovFcBar} />
      <div className={styles.ovFcBody}>
        <div className={styles.ovFcTop}>
          <span
            className={styles.ovFcPlugin}
            style={{ backgroundColor: pluginColor }}
          >
            {skill.pluginName}
          </span>
          <span
            className={styles.ovFcCx}
            style={{
              backgroundColor: (cxStyle[complexity] ?? cxStyle.Medium).bg,
              color: (cxStyle[complexity] ?? cxStyle.Medium).fg,
            }}
          >
            {complexity}
          </span>
        </div>
        <h3 className={styles.ovFcTitle}>{title}</h3>
        <p className={styles.ovFcDesc}>{skill.description}</p>
        <div className={styles.ovFcBottom}>
          {(stepCount > 0 || skill.version || skill.model) && (
            <div className={styles.ovFcMeta}>
              {stepCount > 0 && (
                <span className={styles.ovFcMetaItem}>
                  {stepCount} {stepCount === 1 ? 'step' : 'steps'}
                </span>
              )}
              {skill.version && (
                <span className={styles.ovFcMetaItem}>v{skill.version}</span>
              )}
              {skill.model && (
                <span className={styles.ovFcModel}>{skill.model}</span>
              )}
            </div>
          )}
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
