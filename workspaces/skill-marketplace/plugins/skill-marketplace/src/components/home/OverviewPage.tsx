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
import { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '@backstage/core-plugin-api';
import { skillMarketplaceApiRef } from '../../api';
import { useSkills } from '../../hooks';
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

export default function OverviewPage() {
  const { skills, marketplace, loading, error } = useSkills();
  const navigate = useNavigate();
  const api = useApi(skillMarketplaceApiRef);
  const [agentCount, setAgentCount] = useState(0);
  const [gapCount, setGapCount] = useState(0);
  const [tags, setTags] = useState<Array<{ name: string; skillCount: number; capabilityCount: number }>>([]);
  const [avgQuality, setAvgQuality] = useState<number | null>(null);

  useEffect(() => {
    api.getAgentCount()
      .then(r => setAgentCount(r.count))
      .catch(() => { /* graph may not be configured */ });
    api.getCatalogGapsCount()
      .then(r => setGapCount(r.count))
      .catch(() => { /* graph may not be configured */ });
    api.getTags(20)
      .then(r => setTags((r.tags ?? []) as Array<{ name: string; skillCount: number; capabilityCount: number }>))
      .catch(() => { /* graph may not be configured */ });
    api.getQualityAggregate()
      .then(r => {
        const avg = Number(r.avgSkill ?? 0);
        if (avg > 0) setAvgQuality(Math.round(avg * 100));
      })
      .catch(() => { /* graph may not be configured */ });
  }, [api]);

  const pluginCounts = useMemo(
    () =>
      skills.reduce(
        (acc, s) => {
          acc[s.pluginName] = (acc[s.pluginName] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      ),
    [skills],
  );

  const complexityCounts = useMemo(
    () =>
      skills.reduce(
        (acc, s) => {
          const c = estimateComplexity(s);
          acc[c] = (acc[c] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      ),
    [skills],
  );

  const featured = useMemo(() => selectFeatured(skills, 3), [skills]);

  if (loading) return <LoadingSpinner message="Loading marketplace..." />;
  if (error) return <ErrorMessage message={error} />;

  const plugins = marketplace?.plugins ?? [];

  const replayIntro = () => {
    window.dispatchEvent(new CustomEvent('sm-replay-intro'));
  };

  return (
    <div className="ov">
      <style>{styles}</style>

      {/* Hero banner */}
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
            <button className="ov-replay-link" onClick={replayIntro}>Replay Intro</button>
          </div>
        </div>
        <div className="ov-hero-right">
          {[
            { value: skills.length, label: 'Skills', color: '#0066cc', tip: 'Total skill definitions synced from OCI registries' },
            { value: plugins.length, label: 'Categories', color: '#3e8635', tip: 'Skill domains auto-detected from tags and keywords' },
            { value: agentCount, label: 'Active Agents', color: '#f59e0b', tip: 'AI agents registered via Kagenti with declared capabilities' },
            { value: gapCount, label: 'Catalog Gaps', color: '#ef4444', tip: 'Agent capabilities with no matching skill \u2014 these need new skills authored', action: gapCount > 0 ? () => navigate('gaps') : undefined },
            ...(avgQuality !== null ? [{ value: `${avgQuality}%`, label: 'Skill Quality', color: avgQuality >= 70 ? '#22c55e' : avgQuality >= 40 ? '#f59e0b' : '#ef4444', tip: 'Average completeness score across all skills (description, tags, prompt, examples, etc.)' }] : []),
          ].map(s => (
            <div key={s.label} className={`ov-stat-card ${(s as any).action ? 'ov-stat-clickable' : ''}`} title={(s as any).tip} onClick={(s as any).action}>
              <span className="ov-stat-v" style={{ color: s.color }}>{s.value}</span>
              <span className="ov-stat-l">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Actionable Warnings */}
      {(gapCount > 0 || (avgQuality !== null && avgQuality < 50)) && (
        <div className="ov-alerts">
          {gapCount > 0 && (
            <button className="ov-alert ov-alert-warn" onClick={() => navigate('gaps')}>
              <span className="ov-alert-icon">!</span>
              <span className="ov-alert-text">
                <strong>{gapCount} agent {gapCount === 1 ? 'capability has' : 'capabilities have'} no matching skill.</strong>
                {' '}Author new skills to close the gap.
              </span>
              <span className="ov-alert-action">View gaps &rarr;</span>
            </button>
          )}
          {avgQuality !== null && avgQuality < 50 && (
            <button className="ov-alert ov-alert-info" onClick={() => navigate('graph')}>
              <span className="ov-alert-icon">i</span>
              <span className="ov-alert-text">
                <strong>Average skill quality is {avgQuality}%.</strong>
                {' '}Add descriptions, tags, and examples to improve completeness scores.
              </span>
              <span className="ov-alert-action">View graph &rarr;</span>
            </button>
          )}
        </div>
      )}

      {/* Categories */}
      <div className="ov-section">
        <div className="ov-sec-hdr">
          <h2 className="ov-h2">Categories</h2>
          <button className="ov-link" onClick={() => navigate('skills')}>View all &rarr;</button>
        </div>
        <div className="ov-cat-grid">
          {plugins.map(p => (
            <button
              key={p.name}
              className="ov-cat-card"
              onClick={() => navigate(`skills?category=${encodeURIComponent(p.name)}`)}
            >
              <span className="ov-cat-bar" style={{ backgroundColor: p.color ?? '#6b7280' }} />
              <div className="ov-cat-body">
                <span className="ov-cat-name">{p.name}</span>
                <span className="ov-cat-count">{pluginCounts[p.name] || 0} {(pluginCounts[p.name] || 0) === 1 ? 'skill' : 'skills'}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Featured Skills */}
      <div className="ov-section">
        <div className="ov-sec-hdr">
          <h2 className="ov-h2">Featured Skills</h2>
          <button className="ov-link" onClick={() => navigate('skills')}>View all &rarr;</button>
        </div>
        <div className="ov-feat-grid">
          {featured.map(skill => (
            <FeaturedCard
              key={skill.slug}
              skill={skill}
              onClick={() => navigate(`skills/${skill.slug}`)}
            />
          ))}
        </div>
      </div>

      {/* Tag Cloud */}
      {tags.length > 0 && (
        <div className="ov-section">
          <div className="ov-sec-hdr">
            <h2 className="ov-h2">Tag Cloud</h2>
            <span className="ov-tag-subtitle">Skills &amp; capabilities across the graph</span>
          </div>
          <div className="ov-tag-cloud">
            {tags.map(t => {
              const total = t.skillCount + t.capabilityCount;
              const fontSize = Math.min(11 + total * 0.5, 22);
              return (
                <span
                  key={t.name}
                  className="ov-tag"
                  style={{ fontSize }}
                  title={`${t.skillCount} skills, ${t.capabilityCount} capabilities`}
                >
                  {t.name}
                  <span className="ov-tag-count">{total}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* How it works + Complexity */}
      <div className="ov-bottom">
        <div className="ov-panel">
          <h2 className="ov-h2">How It Works</h2>
          <div className="ov-how-steps">
            {[
              { n: '1', t: 'Author', d: 'Create a skill.yaml SkillCard following the skillimage.io/v1alpha1 spec.', c: '#0066cc' },
              { n: '2', t: 'Publish', d: 'Push to an OCI registry as a portable, versioned OCI image.', c: '#8b5cf6' },
              { n: '3', t: 'Deploy', d: 'Assign skills to agents via Kagenti and run them in production.', c: '#10b981' },
            ].map((s, i) => (
              <div key={s.n} className="ov-how-row">
                <span className="ov-how-n" style={{ backgroundColor: `${s.c}14`, color: s.c }}>{s.n}</span>
                <div className="ov-how-text">
                  <span className="ov-how-t">{s.t}</span>
                  <span className="ov-how-d">{s.d}</span>
                </div>
                {i < 2 && <span className="ov-how-line" />}
              </div>
            ))}
          </div>
        </div>

        <div className="ov-panel">
          <h2 className="ov-h2">Skill Complexity</h2>
          <div className="ov-cx-list">
            {[
              { lv: 'Simple', c: '#10b981', d: 'Under 100 lines' },
              { lv: 'Medium', c: '#3b82f6', d: '100\u2013250 lines' },
              { lv: 'Complex', c: '#f59e0b', d: '250\u2013500 lines' },
              { lv: 'Advanced', c: '#ef4444', d: 'Over 500 lines' },
            ].map(item => {
              const cnt = complexityCounts[item.lv] || 0;
              const pct = skills.length ? Math.round((cnt / skills.length) * 100) : 0;
              return (
                <div key={item.lv} className="ov-cx-row">
                  <div className="ov-cx-label">
                    <span className="ov-cx-lv">{item.lv}</span>
                    <span className="ov-cx-d">{item.d}</span>
                  </div>
                  <div className="ov-cx-track">
                    <div
                      className="ov-cx-fill"
                      style={{ width: `${Math.max(pct, 3)}%`, backgroundColor: item.c }}
                    />
                  </div>
                  <span className="ov-cx-ct" style={{ color: item.c }}>{cnt}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function FeaturedCard({ skill, onClick }: { skill: SkillData; onClick: () => void }) {
  const complexity = estimateComplexity(skill);
  const pluginColor = skill.plugin.color ?? '#6b7280';
  const cxColor: Record<string, string> = { Simple: '#10b981', Medium: '#3b82f6', Complex: '#f59e0b', Advanced: '#ef4444' };
  const stepCount = skill.sections.workflow.length;

  return (
    <button type="button" className="ov-fc" onClick={onClick}>
      <span className="ov-fc-bar" style={{ backgroundColor: pluginColor }} />
      <div className="ov-fc-body">
        <div className="ov-fc-top">
          <span className="ov-fc-plugin" style={{ backgroundColor: pluginColor }}>{skill.pluginName}</span>
          <span className="ov-fc-cx" style={{ backgroundColor: `${cxColor[complexity] ?? '#3b82f6'}15`, color: cxColor[complexity] ?? '#3b82f6' }}>{complexity}</span>
        </div>
        <h3 className="ov-fc-title">{humanize(skill.name)}</h3>
        <p className="ov-fc-desc">{skill.description}</p>
        <div className="ov-fc-meta">
          <span className="ov-fc-meta-item">{stepCount} {stepCount === 1 ? 'step' : 'steps'}</span>
          {skill.version && <span className="ov-fc-meta-item">v{skill.version}</span>}
          {skill.model && <span className="ov-fc-model">{skill.model}</span>}
        </div>
      </div>
    </button>
  );
}

function selectFeatured(skills: SkillData[], max: number): SkillData[] {
  const seen = new Set<string>();
  const result: SkillData[] = [];
  for (const s of skills) {
    if (!seen.has(s.pluginName) && result.length < max) {
      seen.add(s.pluginName);
      result.push(s);
    }
  }
  for (const s of skills) {
    if (result.length >= max) break;
    if (!result.includes(s)) result.push(s);
  }
  return result.slice(0, max);
}

const styles = `
  .ov { padding: 0 0 48px; }

  /* ── Hero banner ──────────────────────────────── */
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
  .ov-hero-right {
    display: flex;
    gap: 14px;
    flex-shrink: 0;
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
  }
  .ov-stat-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 20px 32px;
    background: #fff;
    border: 1px solid var(--pf-t--global--border--color--default, #e0e0e0);
    border-radius: 12px;
    text-align: center;
  }
  .ov-stat-v {
    font-size: 36px;
    font-weight: 800;
    letter-spacing: -0.02em;
    line-height: 1;
  }
  .ov-stat-l {
    font-size: 13px;
    font-weight: 600;
    color: var(--pf-t--global--text--color--subtle, #6a6e73);
    margin-top: 6px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
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
  .ov-replay-link {
    background: none;
    border: none;
    color: var(--pf-t--global--color--brand--default, #0066cc);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    padding: 0;
    font-family: inherit;
    margin-left: auto;
  }
  .ov-replay-link:hover { text-decoration: underline; }

  /* ── Sections ─────────────────────────────────── */
  .ov-section { margin: 0 32px 28px; }
  .ov-sec-hdr { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
  .ov-h2 { font-size: 18px; font-weight: 700; margin: 0; letter-spacing: -0.01em; }
  .ov-link { border: none; background: none; color: var(--pf-t--global--color--brand--default, #0066cc); font-size: 13px; font-weight: 600; cursor: pointer; padding: 0; font-family: inherit; }
  .ov-link:hover { text-decoration: underline; }

  /* ── Category grid ────────────────────────────── */
  .ov-cat-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 10px;
  }
  .ov-cat-card {
    display: flex;
    align-items: stretch;
    border: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
    border-radius: 10px;
    background: var(--pf-t--global--background--color--primary--default, #fff);
    cursor: pointer;
    transition: all 0.15s;
    padding: 0;
    font-family: inherit;
    color: inherit;
    text-align: left;
    overflow: hidden;
  }
  .ov-cat-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 14px rgba(0,0,0,0.07);
    border-color: var(--pf-t--global--border--color--hover, #b8bbbe);
  }
  .ov-cat-bar { width: 4px; flex-shrink: 0; }
  .ov-cat-body { padding: 12px 14px; display: flex; flex-direction: column; gap: 2px; }
  .ov-cat-name { font-size: 13.5px; font-weight: 600; color: var(--pf-t--global--text--color--regular, #151515); }
  .ov-cat-count { font-size: 13px; color: var(--pf-t--global--text--color--subtle, #6a6e73); }

  /* ── Featured cards ───────────────────────────── */
  .ov-feat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
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
  .ov-fc:hover .ov-fc-bar { width: 5px !important; }
  .ov-fc:hover .ov-fc-title { color: var(--pf-t--global--color--brand--default, #0066cc) !important; }
  .ov-fc-bar { width: 4px; flex-shrink: 0; transition: width 0.15s; }
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
    margin-top: 12px;
    padding-top: 10px;
    border-top: 1px solid var(--pf-t--global--border--color--default, #eee);
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

  /* ── Bottom panels ────────────────────────────── */
  .ov-bottom { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 0 32px; }
  .ov-panel {
    padding: 20px 24px;
    border-radius: 14px;
    border: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
    background: var(--pf-t--global--background--color--primary--default, #fff);
  }
  .ov-panel .ov-h2 { margin-bottom: 16px; }
  .ov-how-steps { display: flex; flex-direction: column; }
  .ov-how-row { display: flex; align-items: flex-start; gap: 14px; position: relative; padding-bottom: 18px; }
  .ov-how-row:last-child { padding-bottom: 0; }
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
  .ov-how-text { flex: 1; padding-top: 2px; }
  .ov-how-t { display: block; font-size: 15px; font-weight: 700; line-height: 1.3; margin-bottom: 2px; }
  .ov-how-d { display: block; font-size: 13px; color: var(--pf-t--global--text--color--subtle, #6a6e73); line-height: 1.5; }
  .ov-how-line { position: absolute; left: 15px; top: 36px; bottom: 2px; width: 2px; background: var(--pf-t--global--border--color--default, #e0e0e0); border-radius: 1px; }
  .ov-cx-list { display: flex; flex-direction: column; gap: 14px; }
  .ov-cx-row { display: flex; align-items: center; gap: 12px; }
  .ov-cx-label { width: 80px; flex-shrink: 0; }
  .ov-cx-lv { display: block; font-size: 14px; font-weight: 600; line-height: 1.2; }
  .ov-cx-d { display: block; font-size: 12px; color: var(--pf-t--global--text--color--subtle, #6a6e73); }
  .ov-cx-track { flex: 1; height: 10px; border-radius: 5px; background: var(--pf-t--global--background--color--secondary--default, #f0f0f0); overflow: hidden; }
  .ov-cx-fill { height: 100%; border-radius: 5px; transition: width 0.5s ease; }
  .ov-cx-ct { font-size: 18px; font-weight: 800; width: 36px; text-align: right; flex-shrink: 0; }

  /* ── Tag Cloud ──────────────────────────────── */
  .ov-tag-subtitle {
    font-size: 13px;
    color: var(--pf-t--global--text--color--subtle, #6a6e73);
  }
  .ov-tag-cloud {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 16px;
    border: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
    border-radius: 12px;
    background: var(--pf-t--global--background--color--primary--default, #fff);
    align-items: center;
    justify-content: center;
  }
  .ov-tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 12px;
    border-radius: 999px;
    background: rgba(168,85,247,0.08);
    color: #7c3aed;
    font-weight: 600;
    transition: transform 0.1s;
    cursor: default;
  }
  .ov-tag:hover { transform: scale(1.05); }
  .ov-tag-count {
    font-size: 10px;
    font-weight: 700;
    padding: 1px 5px;
    border-radius: 999px;
    background: rgba(168,85,247,0.15);
    color: #7c3aed;
  }

  /* ── Clickable stat cards ─────────────────────── */
  .ov-stat-clickable {
    cursor: pointer;
    transition: transform 0.15s, box-shadow 0.15s;
  }
  .ov-stat-clickable:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 14px rgba(0,0,0,0.08);
  }

  /* ── Actionable Alerts ─────────────────────────── */
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
  .ov-alert:hover {
    filter: brightness(0.97);
  }
  .ov-alert-warn {
    background: rgba(245,158,11,0.05);
    border-color: rgba(245,158,11,0.3);
    color: #92400e;
  }
  .ov-alert-info {
    background: rgba(59,130,246,0.05);
    border-color: rgba(59,130,246,0.3);
    color: #1e40af;
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
  }
  .ov-alert-warn .ov-alert-icon {
    background: rgba(245,158,11,0.15);
    color: #d97706;
  }
  .ov-alert-info .ov-alert-icon {
    background: rgba(59,130,246,0.15);
    color: #3b82f6;
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
  }
  .ov-alert-warn .ov-alert-action { color: #d97706; }
  .ov-alert-info .ov-alert-action { color: #3b82f6; }

  /* ── Responsive ───────────────────────────────── */
  @media (max-width: 768px) {
    .ov-hero { margin: 6px 16px 20px; padding: 24px 20px 20px; flex-direction: column; }
    .ov-hero-right { width: 100%; }
    .ov-section { margin: 0 16px 24px; }
    .ov-feat-grid { grid-template-columns: 1fr; }
    .ov-bottom { grid-template-columns: 1fr; margin: 0 16px; }
  }
`;
