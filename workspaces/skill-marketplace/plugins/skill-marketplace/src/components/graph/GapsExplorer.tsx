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
import { useNavigate } from 'react-router-dom';
import { useApi } from '@backstage/core-plugin-api';
import { skillMarketplaceApiRef } from '../../api';
import { useSkills, useBundle } from '../../hooks';
import LoadingSpinner from '../shared/LoadingSpinner';
import ErrorMessage from '../shared/ErrorMessage';

interface Gap {
  skillId: string;
  name: string;
  description: string;
  tags: string[];
  agentName: string;
  agentNamespace: string;
}

export default function GapsExplorer() {
  const api = useApi(skillMarketplaceApiRef);
  const navigate = useNavigate();
  const { skills: catalogSkills } = useSkills();
  const { addSkill } = useBundle();
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'agent'>('name');

  useEffect(() => {
    api.getCatalogGaps()
      .then(r => { setGaps((r.gaps ?? []) as unknown as Gap[]); setLoading(false); })
      .catch(err => { setError(err.message || 'Failed to load gaps'); setLoading(false); });
  }, [api]);

  const agentFrequency = useMemo(() => {
    const freq = new Map<string, number>();
    for (const g of gaps) {
      freq.set(g.name, (freq.get(g.name) ?? 0) + 1);
    }
    return freq;
  }, [gaps]);

  const findSimilarSkills = (gap: Gap): Array<{ name: string; slug: string }> => {
    if (!gap.tags?.length) return [];
    const gapTagSet = new Set(gap.tags.map(t => t.toLowerCase()));
    return catalogSkills
      .filter(s => {
        const sTags = s.tags ?? [];
        return sTags.some(t => gapTagSet.has(t.toLowerCase()));
      })
      .map(s => ({ name: s.name, slug: s.slug }))
      .slice(0, 3);
  };

  const filtered = useMemo(() => {
    let list = gaps;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(g =>
        g.name.toLowerCase().includes(q) ||
        g.description?.toLowerCase().includes(q) ||
        g.agentName.toLowerCase().includes(q) ||
        g.tags?.some(t => t.toLowerCase().includes(q)),
      );
    }
    if (sortBy === 'agent') {
      list = [...list].sort((a, b) => a.agentName.localeCompare(b.agentName));
    } else {
      list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    }
    return list;
  }, [gaps, search, sortBy]);

  if (loading) return <LoadingSpinner message="Loading capability gaps..." />;
  if (error) return <ErrorMessage message={error} />;

  return (
    <div className="gaps-explorer">
      <style>{styles}</style>

      <div className="ge-header">
        <div>
          <h1 className="ge-title">Capability Gaps</h1>
          <p className="ge-subtitle">
            {gaps.length === 0
              ? 'All agent capabilities have matching skills — your catalog is complete!'
              : `${gaps.length} agent ${gaps.length === 1 ? 'capability needs' : 'capabilities need'} a matching skill. Author or link a skill to close each gap.`}
          </p>
        </div>
        <div className="ge-controls">
          <input
            type="text"
            placeholder="Search gaps..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="ge-search"
          />
          <select value={sortBy} onChange={e => setSortBy(e.target.value as 'name' | 'agent')} className="ge-sort">
            <option value="name">Sort by name</option>
            <option value="agent">Sort by agent</option>
          </select>
        </div>
      </div>

      {gaps.length === 0 ? (
        <div className="ge-empty-state">
          <div className="ge-empty-icon">✓</div>
          <h3>No Gaps Found</h3>
          <p>Every agent capability has been matched to a catalog skill. Great coverage!</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="ge-empty-state">
          <p>No gaps match your search.</p>
        </div>
      ) : (
        <div className="ge-list">
          {filtered.map((gap, i) => {
            const similar = findSimilarSkills(gap);
            const freq = agentFrequency.get(gap.name) ?? 1;
            return (
              <div key={`${gap.agentNamespace}/${gap.agentName}/${gap.skillId}-${i}`} className="ge-card">
                <div className="ge-card-top">
                  <span className="ge-gap-indicator" title="Unmatched capability">!</span>
                  <div className="ge-card-info">
                    <span className="ge-cap-name">{gap.name}</span>
                    <span className="ge-agent-ref">
                      from <strong>{gap.agentName}</strong>
                      <span className="ge-agent-ns">({gap.agentNamespace})</span>
                    </span>
                  </div>
                  {freq > 1 && (
                    <span className="ge-freq-badge" title={`${freq} agents declare a similar capability`}>
                      {freq}× requested
                    </span>
                  )}
                </div>
                {gap.description && (
                  <p className="ge-cap-desc">{gap.description}</p>
                )}
                <div className="ge-card-bottom">
                  {gap.tags?.length > 0 && (
                    <div className="ge-tags">
                      {gap.tags.slice(0, 6).map(t => (
                        <span key={t} className="ge-tag">{t}</span>
                      ))}
                    </div>
                  )}
                  {similar.length > 0 && (
                    <div className="ge-similar">
                      <span className="ge-similar-label">Similar skills:</span>
                      {similar.map(s => (
                        <button
                          key={s.slug}
                          className="ge-similar-link"
                          onClick={() => navigate(`../skills/${s.slug}`)}
                        >
                          {s.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="ge-card-actions">
                  {similar.length > 0 && (
                    <button
                      className="ge-create-btn"
                      style={{ background: '#0066cc20', color: '#0066cc' }}
                      onClick={() => {
                        for (const s of similar) {
                          const cat = catalogSkills.find(cs => cs.slug === s.slug);
                          addSkill({
                            name: cat?.skillName || s.name,
                            slug: s.slug,
                            category: cat?.pluginName || '',
                            description: cat?.description || '',
                          });
                        }
                      }}
                      title="Add all similar skills to bundle cart"
                    >
                      + Add to Bundle
                    </button>
                  )}
                  <button
                    className="ge-create-btn"
                    onClick={() => {
                      const prompt = `Create a skill called "${gap.name}"${gap.description ? `: ${gap.description}` : ''}${gap.tags?.length ? `. Tags: ${gap.tags.join(', ')}` : ''}`;
                      navigator.clipboard.writeText(prompt).catch(() => {});
                      navigate('../builder');
                    }}
                    title="Opens the Skill Builder and copies a starter prompt to your clipboard"
                  >
                    Create Skill
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const styles = `
  .gaps-explorer {
    padding: 24px;
    max-width: 1100px;
    margin: 0 auto;
  }
  .ge-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 24px;
    gap: 16px;
    flex-wrap: wrap;
  }
  .ge-title {
    font-size: 20px;
    font-weight: 700;
    margin: 0;
  }
  .ge-subtitle {
    font-size: 13px;
    color: var(--pf-t--global--text--color--subtle, #6a6e73);
    margin: 4px 0 0;
    line-height: 1.5;
  }
  .ge-controls {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .ge-search {
    padding: 8px 14px;
    border-radius: 8px;
    border: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
    font-size: 13px;
    width: 220px;
    font-family: inherit;
    background: var(--pf-t--global--background--color--primary--default, #fff);
  }
  .ge-sort {
    padding: 8px 12px;
    border-radius: 8px;
    border: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
    font-size: 13px;
    font-family: inherit;
    background: var(--pf-t--global--background--color--primary--default, #fff);
    cursor: pointer;
  }
  .ge-empty-state {
    text-align: center;
    padding: 48px 24px;
    color: var(--pf-t--global--text--color--subtle, #6a6e73);
  }
  .ge-empty-icon {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: #dcfce7;
    color: #16a34a;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    font-weight: 700;
    margin: 0 auto 16px;
  }
  .ge-empty-state h3 {
    margin: 0 0 8px;
    font-size: 16px;
    font-weight: 700;
    color: var(--pf-t--global--text--color--regular, #151515);
  }
  .ge-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .ge-card {
    border: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
    border-radius: 10px;
    padding: 16px 20px;
    background: var(--pf-t--global--background--color--primary--default, #fff);
    transition: box-shadow 0.15s;
  }
  .ge-card:hover {
    box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  }
  .ge-card-top {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .ge-gap-indicator {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: rgba(239,68,68,0.1);
    color: #dc2626;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
    font-size: 13px;
    flex-shrink: 0;
  }
  .ge-card-info {
    flex: 1;
    display: flex;
    flex-direction: column;
  }
  .ge-cap-name {
    font-weight: 600;
    font-size: 14px;
  }
  .ge-agent-ref {
    font-size: 12px;
    color: var(--pf-t--global--text--color--subtle, #6a6e73);
  }
  .ge-agent-ns {
    margin-left: 4px;
    opacity: 0.7;
  }
  .ge-freq-badge {
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 10px;
    background: rgba(245,158,11,0.1);
    color: #d97706;
    white-space: nowrap;
  }
  .ge-cap-desc {
    font-size: 13px;
    color: var(--pf-t--global--text--color--subtle, #6a6e73);
    margin: 6px 0 0 34px;
    line-height: 1.5;
  }
  .ge-card-bottom {
    margin: 8px 0 0 34px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .ge-tags {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }
  .ge-tag {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 4px;
    background: rgba(0,102,204,0.06);
    color: #0066cc;
    white-space: nowrap;
  }
  .ge-similar {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    font-size: 12px;
  }
  .ge-similar-label {
    color: var(--pf-t--global--text--color--subtle, #6a6e73);
    font-weight: 600;
  }
  .ge-similar-link {
    background: none;
    border: none;
    padding: 0;
    color: #0066cc;
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    text-decoration: underline;
  }
  .ge-similar-link:hover {
    color: #004999;
  }
  .ge-card-actions {
    display: flex;
    gap: 8px;
    margin: 12px 0 0 34px;
  }
  .ge-create-btn {
    padding: 6px 16px;
    border-radius: 6px;
    border: none;
    background: #0066cc;
    color: #fff;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    transition: background 0.15s;
  }
  .ge-create-btn:hover {
    background: #004999;
  }
  .ge-view-agent-btn {
    padding: 6px 16px;
    border-radius: 6px;
    border: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
    background: transparent;
    color: var(--pf-t--global--text--color--regular, #151515);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    transition: background 0.15s;
  }
  .ge-view-agent-btn:hover {
    background: rgba(0,0,0,0.03);
  }
`;
