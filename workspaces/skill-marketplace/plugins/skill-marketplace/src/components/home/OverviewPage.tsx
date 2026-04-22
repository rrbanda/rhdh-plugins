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
import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '@backstage/core-plugin-api';
import { skillMarketplaceApiRef } from '../../api';
import { useSkills, useBundle } from '../../hooks';
import {
  humanize,
} from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import type { SkillData, ComplexityLevel } from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
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
  score += Math.min((s.tags?.length ?? 0), 5);
  score += s.sections.workflow.length * 2;
  if (s.lifecycleState === 'published') score += 3;
  else if (s.lifecycleState === 'testing') score += 1;
  if (s.model) score += 1;
  if (s.version) score += 1;
  return score;
}

function selectFeatured(skills: SkillData[], max: number): SkillData[] {
  const ranked = [...skills].sort((a, b) => skillQualityScore(b) - skillQualityScore(a));

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

export default function OverviewPage() {
  const { skills, marketplace, loading, error } = useSkills();
  const navigate = useNavigate();
  const api = useApi(skillMarketplaceApiRef);
  const [gapCount, setGapCount] = useState(0);

  useEffect(() => {
    api.getCatalogGapsCount()
      .then(r => setGapCount(r.count))
      .catch(err => console.warn('OverviewPage: failed to fetch catalog gap count', err));
  }, [api]);

  const featured = useMemo(() => selectFeatured(skills, 3), [skills]);

  if (loading) return <LoadingSpinner message="Loading marketplace..." />;
  if (error) return <ErrorMessage message={error} />;

  const plugins = marketplace?.plugins ?? [];

  return (
    <div className="ov">
      <style>{styles}</style>

      {/* Hero */}
      <div className="ov-hero">
        <div className="ov-hero-left">
          <h1 className="ov-h1">AI Agent Skills</h1>
          <p className="ov-tagline">
            {marketplace?.metadata.description ||
              'Open-source, portable, validated skills for developers \u2014 ready to use across any AI-powered IDE'}
          </p>
          <div className="ov-hero-actions">
            <button className="ov-cta ov-cta-primary" onClick={() => navigate('skills')}>
              Browse Skills
            </button>
            <button className="ov-cta ov-cta-outline" onClick={() => navigate('graph')}>
              Skill Graph
            </button>
            <button className="ov-cta ov-cta-outline" onClick={() => navigate('builder')}>
              Build a Skill
            </button>
          </div>
        </div>
        <div className="ov-hero-stats">
          <div className="ov-stat" title="Total skill definitions synced from OCI registries">
            <span className="ov-stat-v">{skills.length}</span>
            <span className="ov-stat-l">Skills</span>
          </div>
          <div className="ov-stat" title="Skill categories auto-detected from tags and keywords">
            <span className="ov-stat-v">{plugins.length}</span>
            <span className="ov-stat-l">Categories</span>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {gapCount > 0 && (
        <div className="ov-alerts">
          <button className="ov-alert ov-alert-warn" onClick={() => navigate('gaps')}>
            <span className="ov-alert-icon">!</span>
            <span className="ov-alert-text">
              <strong>{gapCount} agent {gapCount === 1 ? 'capability has' : 'capabilities have'} no matching skill.</strong>
              {' '}Author new skills to close the gap.
            </span>
            <span className="ov-alert-action">View gaps &rarr;</span>
          </button>
        </div>
      )}

      {/* Featured Skills */}
      <div className="ov-section">
        <div className="ov-sec-hdr">
          <h2 className="ov-h2">Featured Skills</h2>
          {featured.length > 0 && (
            <button className="ov-link" onClick={() => navigate('skills')}>View all &rarr;</button>
          )}
        </div>
        {featured.length > 0 ? (
          <div className="ov-feat-grid">
            {featured.map(skill => (
              <FeaturedCard
                key={skill.slug}
                skill={skill}
                onClick={() => navigate(`skills/${skill.slug}`)}
              />
            ))}
          </div>
        ) : (
          <div className="ov-empty">
            <p className="ov-empty-text">No skills published yet.</p>
            <button className="ov-cta ov-cta-primary" onClick={() => navigate('builder')}>
              Publish your first skill
            </button>
          </div>
        )}
      </div>

      {/* How It Works */}
      <div className="ov-section">
        <h2 className="ov-h2">How It Works</h2>
        <div className="ov-how-grid">
          {[
            { n: '1', t: 'Author', d: 'Create a skill.yaml following the skillimage.io/v1alpha1 spec.', c: '#0066cc' },
            { n: '2', t: 'Publish', d: 'Push to an OCI registry as a portable, versioned image.', c: '#8b5cf6' },
            { n: '3', t: 'Deploy', d: 'Assign skills to agents via Kagenti and run in production.', c: '#10b981' },
          ].map((s, i) => (
            <React.Fragment key={s.n}>
              {i > 0 && <span className="ov-how-arrow">&rarr;</span>}
              <div className="ov-how-card">
                <span className="ov-how-n" style={{ backgroundColor: `${s.c}14`, color: s.c }}>{s.n}</span>
                <span className="ov-how-t">{s.t}</span>
                <span className="ov-how-d">{s.d}</span>
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

function FeaturedCard({ skill, onClick }: { skill: SkillData; onClick: () => void }) {
  const complexity = estimateComplexity(skill);
  const { addSkill, hasSkill } = useBundle();
  const pluginColor = skill.plugin.color ?? '#6b7280';
  const cxColor: Record<string, string> = { Simple: '#10b981', Medium: '#3b82f6', Complex: '#f59e0b', Advanced: '#ef4444' };
  const stepCount = skill.sections.workflow.length;
  const inBundle = hasSkill(skill.skillName);
  const title = humanize(skill.name);

  return (
    <div
      role="link"
      tabIndex={0}
      className="ov-fc"
      style={{ '--fc-bar-color': pluginColor } as React.CSSProperties}
      onClick={onClick}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
    >
      <span className="ov-fc-bar" />
      <div className="ov-fc-body">
        <div className="ov-fc-top">
          <span className="ov-fc-plugin" style={{ backgroundColor: pluginColor }}>{skill.pluginName}</span>
          <span className="ov-fc-cx" style={{ backgroundColor: `${cxColor[complexity] ?? '#3b82f6'}15`, color: cxColor[complexity] ?? '#3b82f6' }}>{complexity}</span>
        </div>
        <h3 className="ov-fc-title">{title}</h3>
        <p className="ov-fc-desc">{skill.description}</p>
        <div className="ov-fc-bottom">
          {(stepCount > 0 || skill.version || skill.model) && (
            <div className="ov-fc-meta">
              {stepCount > 0 && <span className="ov-fc-meta-item">{stepCount} {stepCount === 1 ? 'step' : 'steps'}</span>}
              {skill.version && <span className="ov-fc-meta-item">v{skill.version}</span>}
              {skill.model && <span className="ov-fc-model">{skill.model}</span>}
            </div>
          )}
          <button
            type="button"
            className={`ov-fc-bundle ${inBundle ? 'ov-fc-bundle-in' : ''}`}
            aria-label={inBundle ? `${title} already in bundle` : `Add ${title} to bundle`}
            disabled={inBundle}
            onClick={e => {
              e.stopPropagation();
              if (!inBundle) {
                addSkill({
                  name: skill.skillName,
                  slug: skill.slug,
                  category: skill.pluginName,
                  description: skill.description,
                });
              }
            }}
          >
            {inBundle ? '✓' : '+'}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = `
  .ov { padding: 0 0 48px; }

  /* Hero */
  .ov-hero {
    display: flex;
    align-items: center;
    gap: 36px;
    background: linear-gradient(135deg, #f0f7ff 0%, #fafbff 50%, #fff 100%);
    border: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
    border-radius: 16px;
    padding: 32px 36px;
    margin: 6px 32px 28px;
  }
  .ov-hero-left { flex: 1; min-width: 0; }
  .ov-hero-stats {
    display: flex;
    gap: 12px;
    flex-shrink: 0;
  }
  .ov-stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 16px 28px;
    background: #fff;
    border: 1px solid var(--pf-t--global--border--color--default, #e0e0e0);
    border-radius: 12px;
    text-align: center;
    min-width: 100px;
  }
  .ov-stat-v {
    font-size: 28px;
    font-weight: 800;
    letter-spacing: -0.02em;
    line-height: 1;
    color: var(--pf-t--global--color--brand--default, #0066cc);
  }
  .ov-stat-l {
    font-size: 12px;
    font-weight: 600;
    color: var(--pf-t--global--text--color--subtle, #6a6e73);
    margin-top: 4px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .ov-h1 {
    font-size: 26px;
    font-weight: 800;
    letter-spacing: -0.03em;
    margin: 0 0 6px;
    color: var(--pf-t--global--text--color--regular, #151515);
    line-height: 1.2;
  }
  .ov-tagline {
    font-size: 14.5px;
    line-height: 1.6;
    color: var(--pf-t--global--text--color--subtle, #6a6e73);
    margin: 0 0 18px;
    max-width: 520px;
  }
  .ov-hero-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .ov-cta {
    display: inline-flex;
    align-items: center;
    padding: 9px 22px;
    border-radius: 9px;
    font-size: 13.5px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
    font-family: inherit;
    border: 1px solid transparent;
  }
  .ov-cta-primary {
    background: var(--pf-t--global--color--brand--default, #0066cc);
    color: #fff;
    box-shadow: 0 2px 8px rgba(0,102,204,0.2);
  }
  .ov-cta-primary:hover { filter: brightness(1.08); box-shadow: 0 4px 14px rgba(0,102,204,0.28); }
  .ov-cta-outline {
    background: #fff;
    border-color: var(--pf-t--global--border--color--default, #d2d2d2);
    color: var(--pf-t--global--text--color--regular, #151515);
  }
  .ov-cta-outline:hover {
    border-color: var(--pf-t--global--color--brand--default, #0066cc);
    color: var(--pf-t--global--color--brand--default, #0066cc);
    background: rgba(0,102,204,0.03);
  }

  /* Sections */
  .ov-section { margin: 0 32px 28px; }
  .ov-sec-hdr { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
  .ov-h2 { font-size: 18px; font-weight: 700; margin: 0; letter-spacing: -0.01em; }
  .ov-link { border: none; background: none; color: var(--pf-t--global--color--brand--default, #0066cc); font-size: 13px; font-weight: 600; cursor: pointer; padding: 0; font-family: inherit; }
  .ov-link:hover { text-decoration: underline; }

  /* Featured cards */
  .ov-feat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
  .ov-fc {
    position: relative;
    display: flex;
    width: 100%;
    text-align: left;
    overflow: hidden;
    border-radius: 12px;
    border: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
    background: var(--pf-t--global--background--color--primary--default, #fff);
    cursor: pointer;
    transition: all 0.2s;
    padding: 0;
    font-family: inherit;
    color: inherit;
  }
  .ov-fc:hover {
    transform: translateY(-2px);
    border-color: var(--pf-t--global--color--brand--default, #0066cc);
    box-shadow: 0 6px 20px rgba(0,0,0,0.07);
  }
  .ov-fc:hover .ov-fc-bar { width: 5px; }
  .ov-fc:hover .ov-fc-title { color: var(--pf-t--global--color--brand--default, #0066cc); }
  .ov-fc-bar { width: 4px; flex-shrink: 0; transition: width 0.15s; background-color: var(--fc-bar-color, #6b7280); }
  .ov-fc-body { flex: 1; padding: 18px 20px; display: flex; flex-direction: column; }
  .ov-fc-top { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
  .ov-fc-plugin { padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; color: #fff; }
  .ov-fc-cx { padding: 3px 9px; border-radius: 999px; font-size: 12px; font-weight: 600; }
  .ov-fc-title { font-size: 16px; font-weight: 700; margin: 0 0 6px; line-height: 1.35; transition: color 0.15s; }
  .ov-fc-desc {
    font-size: 13px;
    line-height: 1.5;
    color: var(--pf-t--global--text--color--subtle, #6a6e73);
    margin: 0 0 auto;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .ov-fc-meta {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .ov-fc-meta-item {
    font-size: 13px;
    font-weight: 500;
    color: var(--pf-t--global--text--color--subtle, #6a6e73);
  }
  .ov-fc-model {
    font-size: 12px;
    font-weight: 600;
    color: #8b5cf6;
    background: rgba(139,92,246,0.08);
    padding: 2px 8px;
    border-radius: 999px;
    margin-left: auto;
  }

  /* Featured card bottom row */
  .ov-fc-bottom {
    display: flex;
    align-items: center;
    margin-top: auto;
    padding-top: 10px;
  }
  .ov-fc-bottom .ov-fc-meta {
    flex: 1;
    margin-top: 0;
    padding-top: 0;
    border-top: 1px solid var(--pf-t--global--border--color--default, #eee);
    padding-top: 10px;
  }
  .ov-fc-bundle {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    border: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
    background: #fff;
    color: var(--pf-t--global--color--brand--default, #0066cc);
    font-size: 16px;
    font-weight: 700;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    margin-left: auto;
    transition: all 0.15s;
    font-family: inherit;
    padding: 0;
  }
  .ov-fc-bundle:hover:not(:disabled) {
    background: var(--pf-t--global--color--brand--default, #0066cc);
    color: #fff;
    border-color: var(--pf-t--global--color--brand--default, #0066cc);
  }
  .ov-fc-bundle-in {
    background: #f0fdf4;
    border-color: #10b981;
    color: #10b981;
    cursor: default;
  }

  /* Empty state */
  .ov-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 48px 24px;
    border: 2px dashed var(--pf-t--global--border--color--default, #d2d2d2);
    border-radius: 12px;
    background: var(--pf-t--global--background--color--primary--default, #fafafa);
    gap: 16px;
  }
  .ov-empty-text {
    font-size: 14px;
    color: var(--pf-t--global--text--color--subtle, #6a6e73);
    margin: 0;
  }

  /* How It Works -- horizontal */
  .ov-how-grid {
    display: grid;
    grid-template-columns: 1fr auto 1fr auto 1fr;
    gap: 0;
    align-items: center;
    margin-top: 14px;
  }
  .ov-how-arrow {
    font-size: 20px;
    color: var(--pf-t--global--text--color--subtle, #6a6e73);
    opacity: 0.4;
    padding: 0 12px;
    user-select: none;
  }
  .ov-how-card {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    padding: 20px;
    border-radius: 12px;
    border: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
    background: var(--pf-t--global--background--color--primary--default, #fff);
  }
  .ov-how-n {
    width: 32px;
    height: 32px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: 800;
    flex-shrink: 0;
  }
  .ov-how-t { font-size: 15px; font-weight: 700; line-height: 1.3; }
  .ov-how-d { font-size: 13px; color: var(--pf-t--global--text--color--subtle, #6a6e73); line-height: 1.5; }

  /* Alerts */
  .ov-alerts {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 0 32px 20px;
  }
  .ov-alert {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 18px;
    border-radius: 10px;
    border: 1px solid;
    cursor: pointer;
    font-family: inherit;
    text-align: left;
    transition: all 0.15s;
    width: 100%;
  }
  .ov-alert:hover { filter: brightness(0.97); }
  .ov-alert-warn {
    background: rgba(245,158,11,0.05);
    border-color: rgba(245,158,11,0.3);
    color: #92400e;
  }
  .ov-alert-icon {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 800;
    flex-shrink: 0;
    background: rgba(245,158,11,0.15);
    color: #d97706;
  }
  .ov-alert-text {
    flex: 1;
    font-size: 13px;
    line-height: 1.5;
  }
  .ov-alert-text strong { font-weight: 700; }
  .ov-alert-action {
    flex-shrink: 0;
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
    color: #d97706;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .ov-hero { margin: 6px 16px 20px; padding: 24px 20px 20px; flex-direction: column; }
    .ov-hero-stats { width: 100%; justify-content: center; }
    .ov-section { margin: 0 16px 24px; }
    .ov-feat-grid { grid-template-columns: 1fr; }
    .ov-how-grid { grid-template-columns: 1fr; }
    .ov-how-arrow { display: none; }
  }
`;
