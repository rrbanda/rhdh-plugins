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
import { useState, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSkills } from '../../hooks';
import { SkillCard } from './SkillCard';
import LoadingSpinner from '../shared/LoadingSpinner';
import ErrorMessage from '../shared/ErrorMessage';

export default function SkillsPage() {
  const { skills, marketplace, loading, error } = useSkills();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [activePlugin, setActivePlugin] = useState<string | null>(
    () => searchParams.get('category'),
  );

  const pluginCounts = useMemo(() => {
    return skills.reduce(
      (acc, s) => {
        acc[s.pluginName] = (acc[s.pluginName] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
  }, [skills]);

  const filtered = useMemo(() => {
    let result = skills;
    if (activePlugin) {
      result = result.filter(s => s.pluginName === activePlugin);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        s =>
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.pluginName.toLowerCase().includes(q) ||
          s.sections.title.toLowerCase().includes(q),
      );
    }
    return result;
  }, [skills, searchQuery, activePlugin]);

  const handlePluginClick = useCallback(
    (plugin: string | null) => {
      setActivePlugin(prev => {
        const next = prev === plugin ? null : plugin;
        if (next) {
          setSearchParams({ category: next }, { replace: true });
        } else {
          setSearchParams({}, { replace: true });
        }
        return next;
      });
    },
    [setSearchParams],
  );

  if (loading) return <LoadingSpinner message="Loading skills..." />;
  if (error) return <ErrorMessage message={error} />;

  const plugins = marketplace?.plugins ?? [];

  return (
    <div className="sp-page">
      <style>{skillsPageStyles}</style>

      {/* Header */}
      <div className="sp-header">
        <div className="sp-header-text">
          <h1 className="sp-title">Browse Skills</h1>
          <p className="sp-subtitle">
            Explore {skills.length} AI agent skills across{' '}
            {plugins.length} categories
          </p>
        </div>
        <span className="sp-count">{filtered.length} of {skills.length} skills</span>
      </div>

      {/* Search */}
      <div className="sp-search-wrap">
        <svg
          className="sp-search-icon"
          viewBox="0 0 16 16"
          width={18}
          height={18}
          fill="currentColor"
        >
          <path d="M11.742 10.344a6.5 6.5 0 10-1.397 1.398h-.001l3.85 3.85a1 1 0 001.415-1.414l-3.85-3.85zm-5.442.156a5 5 0 110-10 5 5 0 010 10z" />
        </svg>
        <input
          type="text"
          className="sp-search-input"
          placeholder="Search skills... e.g. 'dockerfile review' or 'API testing'"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button
            className="sp-search-clear"
            onClick={() => setSearchQuery('')}
          >
            <svg viewBox="0 0 16 16" width={14} height={14} fill="currentColor">
              <path d="M4.646 4.646a.5.5 0 01.708 0L8 7.293l2.646-2.647a.5.5 0 01.708.708L8.707 8l2.647 2.646a.5.5 0 01-.708.708L8 8.707l-2.646 2.647a.5.5 0 01-.708-.708L7.293 8 4.646 5.354a.5.5 0 010-.708z" />
            </svg>
          </button>
        )}
      </div>

      {/* Filter pills */}
      <div className="sp-filters">
        <button
          className={`sp-pill ${activePlugin === null ? 'active' : ''}`}
          onClick={() => handlePluginClick(null)}
        >
          All
          <span className="sp-pill-count">{skills.length}</span>
        </button>
        {plugins.map(p => {
          const isActive = activePlugin === p.name;
          return (
            <button
              key={p.name}
              className={`sp-pill ${isActive ? 'active' : ''}`}
              onClick={() => handlePluginClick(p.name)}
              style={
                isActive
                  ? { backgroundColor: p.color ?? '#6b7280', borderColor: p.color ?? '#6b7280' }
                  : undefined
              }
            >
              <span
                className="sp-pill-dot"
                style={{ backgroundColor: p.color ?? '#6b7280' }}
              />
              {p.name}
              <span className="sp-pill-count">{pluginCounts[p.name] || 0}</span>
            </button>
          );
        })}
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="sp-empty">
          <svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <h3>No skills found</h3>
          <p>
            {searchQuery
              ? `No results for "${searchQuery}". Try a different search.`
              : 'No skills available in this category.'}
          </p>
        </div>
      ) : (
        <div className="sp-grid">
          {filtered.map(skill => (
            <SkillCard key={skill.slug} skill={skill} />
          ))}
        </div>
      )}
    </div>
  );
}

const skillsPageStyles = `
  .sp-page {
    padding: 24px 32px 40px;
    max-width: 1400px;
  }

  .sp-header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    margin-bottom: 20px;
  }
  .sp-title {
    font-size: 24px;
    font-weight: 700;
    margin: 0;
    letter-spacing: -0.02em;
    color: var(--pf-t--global--text--color--regular, #151515);
  }
  .sp-subtitle {
    margin: 2px 0 0;
    font-size: 14px;
    color: var(--pf-t--global--text--color--subtle, #6a6e73);
  }
  .sp-count {
    font-size: 13px;
    color: var(--pf-t--global--text--color--subtle, #6a6e73);
    white-space: nowrap;
  }

  /* Search */
  .sp-search-wrap {
    position: relative;
    margin-bottom: 16px;
  }
  .sp-search-icon {
    position: absolute;
    left: 16px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--pf-t--global--text--color--subtle, #6a6e73);
    opacity: 0.6;
    pointer-events: none;
  }
  .sp-search-input {
    width: 100%;
    height: 48px;
    padding: 0 40px 0 48px;
    border-radius: 12px;
    border: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
    background: var(--pf-t--global--background--color--primary--default, #fff);
    font-size: 15px;
    color: var(--pf-t--global--text--color--regular, #151515);
    outline: none;
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  .sp-search-input::placeholder {
    color: var(--pf-t--global--text--color--subtle, #6a6e73);
    opacity: 0.6;
  }
  .sp-search-input:focus {
    border-color: var(--pf-t--global--color--brand--default, #0066cc);
    box-shadow: 0 0 0 3px rgba(0,102,204,0.12);
  }
  .sp-search-clear {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    width: 28px;
    height: 28px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--pf-t--global--text--color--subtle, #6a6e73);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .sp-search-clear:hover {
    background: var(--pf-t--global--background--color--secondary--default, #f0f0f0);
  }

  /* Filter pills */
  .sp-filters {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 24px;
  }
  .sp-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 16px;
    border-radius: 999px;
    border: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
    background: var(--pf-t--global--background--color--primary--default, #fff);
    color: var(--pf-t--global--text--color--subtle, #6a6e73);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }
  .sp-pill:hover {
    border-color: var(--pf-t--global--border--color--hover, #b8bbbe);
    background: var(--pf-t--global--background--color--secondary--default, #f5f5f5);
  }
  .sp-pill.active {
    background: var(--pf-t--global--color--brand--default, #0066cc);
    border-color: var(--pf-t--global--color--brand--default, #0066cc);
    color: #fff;
  }
  .sp-pill.active .sp-pill-dot {
    background: #fff !important;
    opacity: 0.7;
  }
  .sp-pill.active .sp-pill-count {
    background: rgba(255,255,255,0.2);
    color: #fff;
  }
  .sp-pill-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .sp-pill-count {
    font-size: 12px;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: 999px;
    background: var(--pf-t--global--background--color--secondary--default, #f0f0f0);
    color: var(--pf-t--global--text--color--subtle, #6a6e73);
  }

  /* Grid */
  .sp-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    gap: 16px;
  }

  /* Empty state */
  .sp-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 80px 20px;
    text-align: center;
    color: var(--pf-t--global--text--color--subtle, #6a6e73);
  }
  .sp-empty svg {
    margin-bottom: 16px;
    opacity: 0.4;
  }
  .sp-empty h3 {
    font-size: 18px;
    font-weight: 600;
    margin: 0 0 4px;
    color: var(--pf-t--global--text--color--regular, #151515);
  }
  .sp-empty p {
    font-size: 14px;
    margin: 0;
  }

  /* Card styles */
  .sm-card {
    position: relative;
    display: flex;
    width: 100%;
    text-align: left;
    overflow: hidden;
    border-radius: 12px;
    border: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
    background: var(--pf-t--global--background--color--primary--default, #fff);
    cursor: pointer;
    transition: all 0.2s ease;
    padding: 0;
    font-family: inherit;
    color: inherit;
  }
  .sm-card:hover {
    transform: translateY(-2px);
    border-color: var(--pf-t--global--color--brand--default, #0066cc);
    box-shadow: 0 8px 24px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,102,204,0.1);
  }
  .sm-card:hover .sm-card-bar {
    width: 5px !important;
  }
  .sm-card:hover .sm-card-title {
    color: var(--pf-t--global--color--brand--default, #0066cc) !important;
  }
  .sm-card:hover .sm-card-arrow {
    transform: translateX(3px);
    color: var(--pf-t--global--color--brand--default, #0066cc);
  }

  .sm-card-bar {
    width: 4px;
    flex-shrink: 0;
    transition: width 0.2s;
  }

  .sm-card-inner {
    display: flex;
    flex-direction: column;
    flex: 1;
    padding: 16px 20px;
    min-height: 160px;
  }

  .sm-card-top {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }
  .sm-card-plugin {
    display: inline-flex;
    align-items: center;
    padding: 2px 10px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
    color: #fff;
    letter-spacing: 0.01em;
  }
  .sm-card-version {
    font-size: 12px;
    color: var(--pf-t--global--text--color--subtle, #6a6e73);
    opacity: 0.7;
  }
  .sm-card-lifecycle {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.02em;
  }
  .sm-card-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-bottom: 6px;
  }
  .sm-card-tag {
    display: inline-block;
    padding: 1px 7px;
    border-radius: 4px;
    font-size: 11px;
    background: var(--pf-t--global--background--color--secondary--default, #f0f0f0);
    color: var(--pf-t--global--text--color--subtle, #6a6e73);
  }
  .sm-card-tag-more {
    font-style: italic;
    opacity: 0.7;
  }
  .sm-card-authors {
    display: block;
    font-size: 11px;
    color: var(--pf-t--global--text--color--subtle, #6a6e73);
    margin-bottom: 4px;
    opacity: 0.8;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sm-card-title {
    font-size: 16px;
    font-weight: 600;
    line-height: 1.35;
    margin: 0 0 6px;
    color: var(--pf-t--global--text--color--regular, #151515);
    transition: color 0.15s;
  }

  .sm-card-desc {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    font-size: 13px;
    line-height: 1.6;
    color: var(--pf-t--global--text--color--subtle, #6a6e73);
    margin: 0 0 auto;
    padding-bottom: 12px;
  }

  .sm-card-bottom {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 12px;
    border-top: 1px solid var(--pf-t--global--border--color--default, #f0f0f0);
  }
  .sm-card-badges {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .sm-card-complexity {
    display: inline-flex;
    padding: 2px 10px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
  }
  .sm-card-meta-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: var(--pf-t--global--text--color--subtle, #6a6e73);
  }

  .sm-card-arrow {
    font-size: 16px;
    color: var(--pf-t--global--text--color--subtle, #6a6e73);
    transition: transform 0.2s, color 0.2s;
    flex-shrink: 0;
  }
`;
