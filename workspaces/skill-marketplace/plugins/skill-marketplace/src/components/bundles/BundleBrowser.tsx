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
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi, useRouteRef } from '@backstage/core-plugin-api';
import { skillMarketplaceApiRef } from '../../api';
import { rootRouteRef } from '../../routes';
import { useBundle } from '../../hooks';
import LoadingSpinner from '../shared/LoadingSpinner';
import ErrorMessage from '../shared/ErrorMessage';

interface BundleSummary {
  id: string;
  name: string;
  description: string;
  author: string;
  createdAt: string;
  skillCount: number;
}

interface BundleDetail {
  id: string;
  name: string;
  description: string;
  author: string;
  createdAt: string;
  skills: Array<{ name: string; slug: string; category: string; description: string; addedBy: string }>;
}

export default function BundleBrowser() {
  const api = useApi(skillMarketplaceApiRef);
  const { toggleDrawer, skills: cartSkills } = useBundle();
  const navigate = useNavigate();
  const basePath = useRouteRef(rootRouteRef)();
  const [bundles, setBundles] = useState<BundleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedBundle, setSelectedBundle] = useState<BundleDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showFeedback = useCallback((type: 'success' | 'error', message: string) => {
    setActionFeedback({ type, message });
    setTimeout(() => setActionFeedback(null), 3000);
  }, []);

  const loadBundles = useCallback(() => {
    setLoading(true);
    api.listBundles()
      .then(r => { setBundles((r.bundles ?? []) as unknown as BundleSummary[]); setLoading(false); })
      .catch(err => { setError(err.message || 'Failed to load bundles'); setLoading(false); });
  }, [api]);

  useEffect(() => { loadBundles(); }, [loadBundles]);

  const openDetail = useCallback(async (id: string) => {
    setSelectedBundle(null);
    setDetailLoading(true);
    setDetailError(null);
    try {
      const bundle = await api.getBundle(id) as unknown as BundleDetail;
      setSelectedBundle(bundle);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : 'Failed to load bundle details');
    }
    setDetailLoading(false);
  }, [api]);

  const handleFork = useCallback(async (id: string) => {
    try {
      await api.forkBundle(id);
      showFeedback('success', 'Bundle forked successfully');
      loadBundles();
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Failed to fork bundle');
    }
  }, [api, loadBundles, showFeedback]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await api.deleteBundle(id);
      if (selectedBundle?.id === id) setSelectedBundle(null);
      showFeedback('success', 'Bundle deleted');
      loadBundles();
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Failed to delete bundle');
    }
  }, [api, loadBundles, selectedBundle, showFeedback]);

  const handleExport = useCallback(async (id: string) => {
    try {
      const data = await api.exportBundle(id);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bundle-${id}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showFeedback('success', 'Bundle exported');
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Failed to export bundle');
    }
  }, [api, showFeedback]);

  if (loading) return <LoadingSpinner message="Loading bundles..." />;
  if (error) return <ErrorMessage message={error} />;

  return (
    <div className="bb-page">
      <style>{browserStyles}</style>

      {actionFeedback && (
        <div className={`bb-feedback bb-feedback-${actionFeedback.type}`}>{actionFeedback.message}</div>
      )}

      <div className="bb-header">
        <div>
          <h1 className="bb-title">Skill Bundles</h1>
          <p className="bb-subtitle">
            Curated collections of skills for specific use cases. Browse, fork, or create your own.
          </p>
        </div>
        <button className="bb-cart-btn" onClick={toggleDrawer}>
          <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
            <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6" />
          </svg>
          My Cart
          {cartSkills.length > 0 && <span className="bb-cart-badge">{cartSkills.length}</span>}
        </button>
      </div>

      {(detailLoading || detailError || selectedBundle) ? (
        <div className="bb-detail">
          <button className="bb-back" onClick={() => { setSelectedBundle(null); setDetailError(null); }}>&larr; Back to bundles</button>
          {detailLoading ? (
            <LoadingSpinner message="Loading bundle..." />
          ) : detailError ? (
            <ErrorMessage message={detailError} />
          ) : selectedBundle ? (
            <>
              <div className="bb-detail-header">
                <h2 className="bb-detail-title">{selectedBundle.name}</h2>
                <p className="bb-detail-desc">{selectedBundle.description}</p>
                <div className="bb-detail-meta">
                  <span>By {selectedBundle.author}</span>
                  <span>&middot;</span>
                  <span>{selectedBundle.skills.length} skills</span>
                </div>
                <div className="bb-detail-actions">
                  <button
                    className="bb-btn bb-btn-primary"
                    onClick={() => {
                      const skillNames = selectedBundle.skills.map(s => s.name).join(',');
                      navigate(`${basePath}/playground?skills=${encodeURIComponent(skillNames)}`);
                    }}
                  >
                    Test Bundle
                  </button>
                  <button className="bb-btn bb-btn-secondary" onClick={() => handleFork(selectedBundle.id)}>Fork</button>
                  <button className="bb-btn bb-btn-secondary" onClick={() => handleExport(selectedBundle.id)}>Export JSON</button>
                  <button className="bb-btn bb-btn-ghost" onClick={() => handleDelete(selectedBundle.id)}>Delete</button>
                </div>
              </div>
              <div className="bb-skill-list">
                {selectedBundle.skills.map(skill => (
                  <div key={skill.name} className="bb-skill-item">
                    <span className="bb-skill-cat" style={{ background: '#0066cc20', color: '#0066cc' }}>{skill.category}</span>
                    <span className="bb-skill-name">{skill.name.split(':').pop() || skill.name}</span>
                    {skill.description && <span className="bb-skill-desc">{skill.description.slice(0, 120)}</span>}
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>
      ) : (
        <>
          {bundles.length === 0 ? (
            <div className="bb-empty">
              <h3>No bundles yet</h3>
              <p>
                Browse skills and click "Add to Bundle" to start curating a collection.
                Then save it from the cart to share with others.
              </p>
              <button className="bb-btn bb-btn-primary" onClick={toggleDrawer}>Open Cart</button>
            </div>
          ) : (
            <div className="bb-grid">
              {bundles.map(bundle => (
                <button key={bundle.id} className="bb-card" onClick={() => openDetail(bundle.id)}>
                  <div className="bb-card-top">
                    <h3 className="bb-card-name">{bundle.name}</h3>
                    <span className="bb-card-count">{bundle.skillCount} skills</span>
                  </div>
                  {bundle.description && <p className="bb-card-desc">{bundle.description}</p>}
                  <div className="bb-card-meta">
                    <span>{bundle.author}</span>
                    {bundle.createdAt && <span>{new Date(bundle.createdAt).toLocaleDateString()}</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const browserStyles = `
.bb-page { padding: 24px 32px 40px; max-width: 1400px; position: relative; }
.bb-feedback {
  padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; margin-bottom: 16px;
  animation: bb-fade-in 0.2s ease-out;
}
@keyframes bb-fade-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
.bb-feedback-success { background: #10b98115; color: #059669; }
.bb-feedback-error { background: #ef444415; color: #dc2626; }
.bb-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 24px; }
.bb-title { font-size: 24px; font-weight: 700; margin: 0; letter-spacing: -0.02em; }
.bb-subtitle { margin: 4px 0 0; font-size: 14px; color: var(--pf-t--global--text--color--subtle, #6a6e73); }
.bb-cart-btn {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 8px 16px; border-radius: 8px;
  border: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
  background: var(--pf-t--global--background--color--primary--default, #fff);
  font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit;
  color: var(--pf-t--global--text--color--regular, #151515);
}
.bb-cart-btn:hover { border-color: var(--pf-t--global--color--brand--default, #0066cc); }
.bb-cart-badge {
  font-size: 11px; padding: 1px 6px; border-radius: 999px;
  background: var(--pf-t--global--color--brand--default, #0066cc); color: #fff; font-weight: 700;
}
.bb-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}
.bb-card {
  display: flex; flex-direction: column; text-align: left;
  padding: 20px; border-radius: 12px;
  border: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
  background: var(--pf-t--global--background--color--primary--default, #fff);
  cursor: pointer; transition: all 0.15s; font-family: inherit; color: inherit;
}
.bb-card:hover {
  border-color: var(--pf-t--global--color--brand--default, #0066cc);
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(0,0,0,0.08);
}
.bb-card-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.bb-card-name { font-size: 16px; font-weight: 600; margin: 0; }
.bb-card-count {
  font-size: 12px; padding: 2px 8px; border-radius: 999px;
  background: var(--pf-t--global--color--brand--default, #0066cc); color: #fff; font-weight: 600;
}
.bb-card-desc {
  font-size: 13px; color: var(--pf-t--global--text--color--subtle, #6a6e73);
  line-height: 1.5; margin: 0 0 12px;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.bb-card-meta {
  display: flex; gap: 12px; font-size: 12px;
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
  margin-top: auto; padding-top: 12px;
  border-top: 1px solid var(--pf-t--global--border--color--default, #f0f0f0);
}
.bb-empty {
  text-align: center; padding: 80px 20px;
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
}
.bb-empty h3 { font-size: 18px; font-weight: 600; margin: 0 0 8px; color: var(--pf-t--global--text--color--regular, #151515); }
.bb-empty p { font-size: 14px; margin: 0 0 20px; max-width: 480px; margin-left: auto; margin-right: auto; }

.bb-detail { }
.bb-back {
  display: inline-flex; align-items: center; gap: 4px;
  background: none; border: none; cursor: pointer; font-size: 13px; font-weight: 600;
  color: var(--pf-t--global--color--brand--default, #0066cc); padding: 0; margin-bottom: 16px; font-family: inherit;
}
.bb-detail-header { margin-bottom: 24px; }
.bb-detail-title { font-size: 22px; font-weight: 700; margin: 0 0 4px; }
.bb-detail-desc { font-size: 14px; color: var(--pf-t--global--text--color--subtle, #6a6e73); margin: 0 0 8px; }
.bb-detail-meta { display: flex; gap: 8px; font-size: 13px; color: var(--pf-t--global--text--color--subtle, #6a6e73); margin-bottom: 16px; }
.bb-detail-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.bb-skill-list { display: flex; flex-direction: column; gap: 8px; }
.bb-skill-item {
  display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-radius: 8px;
  border: 1px solid var(--pf-t--global--border--color--default, #f0f0f0);
}
.bb-skill-cat {
  font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 4px;
  text-transform: uppercase; letter-spacing: 0.02em; white-space: nowrap;
}
.bb-skill-name { font-size: 14px; font-weight: 500; }
.bb-skill-desc { font-size: 12px; color: var(--pf-t--global--text--color--subtle, #6a6e73); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.bb-btn {
  padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600;
  cursor: pointer; border: 1px solid transparent; font-family: inherit; white-space: nowrap;
}
.bb-btn-primary { background: var(--pf-t--global--color--brand--default, #0066cc); color: #fff; }
.bb-btn-primary:hover { opacity: 0.9; }
.bb-btn-secondary {
  background: var(--pf-t--global--background--color--primary--default, #fff);
  border-color: var(--pf-t--global--border--color--default, #d2d2d2);
  color: var(--pf-t--global--text--color--regular, #151515);
}
.bb-btn-secondary:hover { background: var(--pf-t--global--background--color--secondary--default, #f5f5f5); }
.bb-btn-ghost { background: none; color: var(--pf-t--global--text--color--subtle, #6a6e73); }
.bb-btn-ghost:hover { background: rgba(0,0,0,0.04); }
`;
