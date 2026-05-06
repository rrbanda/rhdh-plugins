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
import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  type ChangeEvent,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi, useRouteRef } from '@backstage/core-plugin-api';
import { skillMarketplaceApiRef } from '../../api';
import { rootRouteRef } from '../../routes';
import { useBundle } from '../../hooks';
import LoadingSpinner from '../shared/LoadingSpinner';
import ErrorMessage from '../shared/ErrorMessage';
import AddToBundleButton from '../shared/AddToBundleButton';
import BundleLifecycleStepper from './BundleLifecycleStepper';
import type {
  BundleSummary,
  BundleDetail,
  BundleStatus,
  CatalogSkill,
} from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import styles from './BundleBrowser.module.css';

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

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    draft: { bg: '#e0e0e0', text: '#616161' },
    testing: { bg: '#fff3e0', text: '#e65100' },
    published: { bg: '#e8f5e9', text: '#2e7d32' },
    deprecated: { bg: '#fce4ec', text: '#c62828' },
    archived: { bg: '#f5f5f5', text: '#9e9e9e' },
  };
  const c = colors[status] || colors.draft;
  return (
    <span
      className={styles.statusBadge}
      style={{ backgroundColor: c.bg, color: c.text }}
      aria-label={`Status: ${status}`}
    >
      {status}
    </span>
  );
}

export default function BundleBrowser() {
  const api = useApi(skillMarketplaceApiRef);
  const {
    toggleDrawer,
    setDrawerOpen,
    addSkill,
    hasSkill,
    skills: cartSkills,
    updateBundleStatus,
  } = useBundle();
  const navigate = useNavigate();
  const basePath = useRouteRef(rootRouteRef)();
  const [bundles, setBundles] = useState<BundleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedBundle, setSelectedBundle] = useState<BundleDetail | null>(
    null,
  );
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [catalogAvailable, setCatalogAvailable] = useState(false);
  const [activeTab, setActiveTab] = useState<'my' | 'marketplace'>('my');
  const [catalogBundles, setCatalogBundles] = useState<CatalogSkill[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const feedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const importFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
    };
  }, []);

  const showFeedback = useCallback(
    (type: 'success' | 'error', message: string) => {
      if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
      setActionFeedback({ type, message });
      feedbackTimeoutRef.current = setTimeout(
        () => setActionFeedback(null),
        3000,
      );
    },
    [],
  );

  const loadBundles = useCallback(() => {
    setLoading(true);
    api
      .listBundles()
      .then(r => {
        setBundles(r.bundles ?? []);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message || 'Failed to load skill bundles');
        setLoading(false);
      });
  }, [api]);

  useEffect(() => {
    loadBundles();
  }, [loadBundles]);

  useEffect(() => {
    api
      .isCatalogAvailable()
      .then(setCatalogAvailable)
      .catch(() => {
        setCatalogAvailable(false);
      });
  }, [api]);

  useEffect(() => {
    if (!catalogAvailable || activeTab !== 'marketplace') {
      return;
    }
    setCatalogLoading(true);
    api
      .listCatalogBundles()
      .then(setCatalogBundles)
      .catch(err => {
        console.error('Failed to load marketplace bundles:', err);
      })
      .finally(() => {
        setCatalogLoading(false);
      });
  }, [activeTab, api, catalogAvailable]);

  const handleForkCatalogBundle = useCallback(
    async (cb: CatalogSkill) => {
      const skillSlugs = parseCatalogBundleSkillSlugs(cb.bundle_skills);
      if (skillSlugs.length === 0) {
        showFeedback(
          'error',
          'This skill bundle has no skills listed; cannot fork an empty skill bundle.',
        );
        return;
      }
      setActionLoading('catalog-fork');
      try {
        await api.createBundle({
          name: `${cb.display_name || cb.name} (fork)`,
          description: cb.description || '',
          skillSlugs,
        });
        showFeedback('success', 'Skill bundle forked to My Skill Bundles');
        setActiveTab('my');
        loadBundles();
      } catch (err) {
        showFeedback(
          'error',
          err instanceof Error ? err.message : 'Fork failed',
        );
        console.error('Fork failed:', err);
      } finally {
        setActionLoading(null);
      }
    },
    [api, loadBundles, showFeedback],
  );

  const handleTestCatalogBundle = useCallback(
    (cb: CatalogSkill) => {
      const skillNames = parseCatalogBundleSkillSlugs(cb.bundle_skills);
      const name = cb.display_name || cb.name;
      const params = new URLSearchParams();
      params.set('skills', skillNames.join(','));
      params.set('bundleName', name);
      params.set('bundleId', `${cb.namespace}/${cb.name}`);
      navigate(`${basePath}/playground?${params.toString()}`);
    },
    [basePath, navigate],
  );

  const openDetail = useCallback(
    async (id: string) => {
      setSelectedBundle(null);
      setDetailLoading(true);
      setDetailError(null);
      try {
        const bundle = await api.getBundle(id);
        setSelectedBundle(bundle);
      } catch (err) {
        setDetailError(
          err instanceof Error
            ? err.message
            : 'Failed to load skill bundle details',
        );
      }
      setDetailLoading(false);
    },
    [api],
  );

  const handleFork = useCallback(
    async (id: string) => {
      setActionLoading('fork');
      try {
        await api.forkBundle(id);
        showFeedback('success', 'Skill bundle forked successfully');
        loadBundles();
      } catch (err) {
        showFeedback(
          'error',
          err instanceof Error ? err.message : 'Failed to fork skill bundle',
        );
      } finally {
        setActionLoading(null);
      }
    },
    [api, loadBundles, showFeedback],
  );

  const handleDelete = useCallback(
    async (id: string, name: string) => {
      if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
      setActionLoading('delete');
      try {
        await api.deleteBundle(id);
        if (selectedBundle?.id === id) setSelectedBundle(null);
        showFeedback('success', 'Skill bundle deleted');
        loadBundles();
      } catch (err) {
        showFeedback(
          'error',
          err instanceof Error ? err.message : 'Failed to delete skill bundle',
        );
      } finally {
        setActionLoading(null);
      }
    },
    [api, loadBundles, selectedBundle, showFeedback],
  );

  const handleImportBundleFile = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      setActionLoading('import');
      try {
        const text = await file.text();
        const parsed = JSON.parse(text) as {
          name?: string;
          description?: string;
          skills?: Array<{ name?: string; slug?: string }>;
        };
        if (!parsed.name || typeof parsed.name !== 'string') {
          showFeedback('error', 'Import file must include a "name" string');
          return;
        }
        if (!Array.isArray(parsed.skills) || parsed.skills.length === 0) {
          showFeedback(
            'error',
            'Import file must include a non-empty "skills" array',
          );
          return;
        }
        const skills = parsed.skills
          .filter(s => s && (s.name || s.slug))
          .map(s => ({
            name: String(s.name || s.slug),
            slug: s.slug ? String(s.slug) : undefined,
          }));
        if (skills.length === 0) {
          showFeedback('error', 'No valid skills found in file');
          return;
        }
        await api.importBundle({
          name: parsed.name,
          description:
            typeof parsed.description === 'string'
              ? parsed.description
              : undefined,
          skills,
        });
        showFeedback('success', 'Skill bundle imported');
        loadBundles();
      } catch (err) {
        if (err instanceof SyntaxError) {
          showFeedback('error', 'Invalid JSON file');
        } else {
          showFeedback(
            'error',
            err instanceof Error
              ? err.message
              : 'Failed to import skill bundle',
          );
        }
      } finally {
        setActionLoading(null);
      }
    },
    [api, loadBundles, showFeedback],
  );

  const handleExport = useCallback(
    async (id: string) => {
      setActionLoading('export');
      try {
        const data = await api.exportBundle(id);
        const blob = new Blob([JSON.stringify(data, null, 2)], {
          type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bundle-${id}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showFeedback('success', 'Skill bundle exported');
      } catch (err) {
        showFeedback(
          'error',
          err instanceof Error ? err.message : 'Failed to export skill bundle',
        );
      } finally {
        setActionLoading(null);
      }
    },
    [api, showFeedback],
  );

  const handleLoadIntoCart = useCallback(
    (bundle: BundleDetail) => {
      let added = 0;
      for (const skill of bundle.skills) {
        if (!hasSkill(skill.name)) {
          addSkill({
            name: skill.name,
            slug: skill.slug,
            category: skill.category,
            description: skill.description || '',
          });
          added++;
        }
      }
      const msg =
        added === 0
          ? 'All skills already in cart'
          : `Added ${added} skill(s) to cart (${bundle.skills.length - added} already present)`;
      showFeedback(added === 0 ? 'error' : 'success', msg);
      setDrawerOpen(true);
    },
    [addSkill, hasSkill, setDrawerOpen, showFeedback],
  );

  const handleStartEdit = useCallback(() => {
    if (!selectedBundle) return;
    setEditName(selectedBundle.name);
    setEditDesc(selectedBundle.description);
    setEditMode(true);
  }, [selectedBundle]);

  const handleSaveEdit = useCallback(async () => {
    if (!selectedBundle) return;
    setActionLoading('edit');
    try {
      await api.updateBundle(selectedBundle.id, {
        name: editName,
        description: editDesc,
      });
      showFeedback('success', 'Skill bundle updated');
      setEditMode(false);
      openDetail(selectedBundle.id);
      loadBundles();
    } catch (err) {
      showFeedback(
        'error',
        err instanceof Error ? err.message : 'Failed to update skill bundle',
      );
    } finally {
      setActionLoading(null);
    }
  }, [
    api,
    selectedBundle,
    editName,
    editDesc,
    showFeedback,
    openDetail,
    loadBundles,
  ]);

  const handleSetBundleStatus = useCallback(
    async (newStatus: BundleStatus) => {
      if (!selectedBundle) return;
      setActionLoading('bundle-status');
      try {
        await updateBundleStatus(selectedBundle.id, newStatus);
        showFeedback('success', 'Status updated');
        loadBundles();
        openDetail(selectedBundle.id);
      } catch (err) {
        showFeedback(
          'error',
          err instanceof Error
            ? err.message
            : 'Failed to update skill bundle status',
        );
      } finally {
        setActionLoading(null);
      }
    },
    [selectedBundle, updateBundleStatus, showFeedback, loadBundles, openDetail],
  );

  const handlePublishToMarketplace = useCallback(async () => {
    if (!selectedBundle) return;
    if (
      !window.confirm(
        'Publishing will push this skill bundle to the OCI registry and make it discoverable in the marketplace. Continue?',
      )
    ) {
      return;
    }
    setActionLoading('bundle-status');
    try {
      await updateBundleStatus(selectedBundle.id, 'published');
      showFeedback('success', 'Skill bundle published');
      loadBundles();
      openDetail(selectedBundle.id);
    } catch (err) {
      showFeedback(
        'error',
        err instanceof Error ? err.message : 'Failed to publish skill bundle',
      );
    } finally {
      setActionLoading(null);
    }
  }, [
    selectedBundle,
    updateBundleStatus,
    showFeedback,
    loadBundles,
    openDetail,
  ]);

  const handleRemoveSkillFromBundle = useCallback(
    async (skillSlug: string) => {
      if (!selectedBundle) return;
      setActionLoading('remove-skill');
      try {
        const remaining = selectedBundle.skills
          .filter(s => s.slug !== skillSlug)
          .map(s => s.slug);
        await api.updateBundle(selectedBundle.id, { skillSlugs: remaining });
        showFeedback('success', 'Skill removed from skill bundle');
        openDetail(selectedBundle.id);
        loadBundles();
      } catch (err) {
        showFeedback(
          'error',
          err instanceof Error ? err.message : 'Failed to remove skill',
        );
      } finally {
        setActionLoading(null);
      }
    },
    [api, selectedBundle, showFeedback, openDetail, loadBundles],
  );

  const filteredBundles = useMemo(
    () =>
      statusFilter === 'all'
        ? bundles
        : bundles.filter(b => b.status === statusFilter),
    [bundles, statusFilter],
  );

  if (loading) return <LoadingSpinner message="Loading skill bundles..." />;
  if (error) return <ErrorMessage message={error} />;

  return (
    <div className={styles.bbPage}>
      {actionFeedback && (
        <div
          className={`${styles.bbFeedback} ${
            actionFeedback.type === 'success'
              ? styles.bbFeedbackSuccess
              : styles.bbFeedbackError
          }`}
        >
          {actionFeedback.message}
        </div>
      )}

      <div className={styles.bbHeader}>
        <div>
          <h1 className={styles.bbTitle}>Skill Bundles</h1>
          <p className={styles.bbSubtitle}>
            Curated collections of skills for specific use cases. Browse, fork,
            or create your own.
          </p>
        </div>
        <div className={styles.bbHeaderActions}>
          <input
            ref={importFileInputRef}
            className={styles.bbHiddenFileInput}
            type="file"
            accept=".json,application/json"
            onChange={handleImportBundleFile}
            aria-label="Choose skill bundle JSON file to import"
            tabIndex={-1}
          />
          <button
            className={`${styles.bbBtn} ${styles.bbBtnSecondary}`}
            onClick={() => importFileInputRef.current?.click()}
            disabled={actionLoading === 'import'}
            type="button"
            aria-label="Import skill bundle from JSON file"
          >
            {actionLoading === 'import'
              ? 'Importing...'
              : 'Import Skill Bundle'}
          </button>
          <button
            className={`${styles.bbBtn} ${styles.bbBtnPrimary}`}
            onClick={() => navigate(`${basePath}/skills?mode=select`)}
            type="button"
          >
            + Build New Skill Bundle
          </button>
          <button
            className={styles.bbCartBtn}
            onClick={toggleDrawer}
            type="button"
            aria-label="Open my skill bundle cart"
          >
            <svg
              viewBox="0 0 24 24"
              width={16}
              height={16}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <circle cx="9" cy="21" r="1" />
              <circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6" />
            </svg>
            My Cart
            {cartSkills.length > 0 && (
              <span className={styles.bbCartBadge}>{cartSkills.length}</span>
            )}
          </button>
        </div>
      </div>

      {detailLoading || detailError || selectedBundle ? (
        <div className={styles.bbDetail}>
          <button
            className={styles.bbBack}
            onClick={() => {
              setSelectedBundle(null);
              setDetailError(null);
              setEditMode(false);
            }}
            type="button"
            aria-label="Back to skill bundle list"
          >
            &larr; Back to skill bundles
          </button>
          {detailLoading ? (
            <LoadingSpinner message="Loading skill bundle..." />
          ) : detailError ? (
            <ErrorMessage message={detailError} />
          ) : selectedBundle ? (
            <>
              <div className={styles.bbDetailHeader}>
                {editMode ? (
                  <div className={styles.bbEditForm}>
                    <input
                      className={`${styles.bbEditInput} ${styles.bbEditTitleInput}`}
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      placeholder="Skill bundle name"
                      aria-label="Skill bundle name"
                    />
                    <input
                      className={styles.bbEditInput}
                      value={editDesc}
                      onChange={e => setEditDesc(e.target.value)}
                      placeholder="Description"
                      aria-label="Skill bundle description"
                    />
                    <div className={styles.bbEditActions}>
                      <button
                        className={`${styles.bbBtn} ${styles.bbBtnPrimary}`}
                        onClick={handleSaveEdit}
                        disabled={!editName.trim() || actionLoading === 'edit'}
                        type="button"
                      >
                        {actionLoading === 'edit'
                          ? 'Saving...'
                          : 'Save Changes'}
                      </button>
                      <button
                        className={`${styles.bbBtn} ${styles.bbBtnSecondary}`}
                        onClick={() => setEditMode(false)}
                        type="button"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className={styles.bbDetailTitleRow}>
                      <h2 className={styles.bbDetailTitle}>
                        {selectedBundle.name}
                      </h2>
                      <StatusBadge status={selectedBundle.status} />
                    </div>
                    <p className={styles.bbDetailDesc}>
                      {selectedBundle.description}
                    </p>
                  </>
                )}
                <div className={styles.bbDetailMeta}>
                  <span>By {selectedBundle.author}</span>
                  <span>&middot;</span>
                  <span>{selectedBundle.skills.length} skills</span>
                </div>
                {!editMode && (
                  <>
                    <BundleLifecycleStepper
                      currentStatus={selectedBundle.status as any}
                    />
                    <div
                      className={styles.bbDetailLifecycle}
                      role="group"
                      aria-label="Skill bundle lifecycle actions"
                    >
                      {selectedBundle.status === 'draft' && (
                        <button
                          className={`${styles.bbBtn} ${styles.bbBtnPrimary}`}
                          onClick={() => {
                            void handleSetBundleStatus('testing');
                          }}
                          disabled={actionLoading === 'bundle-status'}
                          type="button"
                          aria-label="Start testing this skill bundle"
                        >
                          Start Testing
                        </button>
                      )}
                      {selectedBundle.status === 'testing' && (
                        <>
                          <button
                            className={`${styles.bbBtn} ${styles.bbBtnPrimary}`}
                            onClick={() => {
                              void handlePublishToMarketplace();
                            }}
                            disabled={actionLoading === 'bundle-status'}
                            type="button"
                            aria-label="Publish skill bundle to the marketplace"
                          >
                            Publish to Marketplace
                          </button>
                          <button
                            className={`${styles.bbBtn} ${styles.bbBtnSecondary}`}
                            onClick={() => {
                              void handleSetBundleStatus('draft');
                            }}
                            disabled={actionLoading === 'bundle-status'}
                            type="button"
                            aria-label="Move skill bundle back to draft"
                          >
                            Back to Draft
                          </button>
                        </>
                      )}
                      {selectedBundle.status === 'published' && (
                        <>
                          <button
                            className={`${styles.bbBtn} ${styles.bbBtnSecondary}`}
                            onClick={() => {
                              void handleSetBundleStatus('deprecated');
                            }}
                            disabled={actionLoading === 'bundle-status'}
                            type="button"
                            aria-label="Deprecate this skill bundle"
                          >
                            Deprecate
                          </button>
                          <button
                            className={`${styles.bbBtn} ${styles.bbBtnSecondary}`}
                            onClick={() => {
                              void handleSetBundleStatus('testing');
                            }}
                            disabled={actionLoading === 'bundle-status'}
                            type="button"
                            aria-label="Move skill bundle back to testing"
                          >
                            Back to Testing
                          </button>
                        </>
                      )}
                      {selectedBundle.status === 'deprecated' && (
                        <>
                          <button
                            className={`${styles.bbBtn} ${styles.bbBtnSecondary}`}
                            onClick={() => {
                              void handleSetBundleStatus('published');
                            }}
                            disabled={actionLoading === 'bundle-status'}
                            type="button"
                            aria-label="Restore skill bundle to published"
                          >
                            Restore to Published
                          </button>
                          <button
                            className={`${styles.bbBtn} ${styles.bbBtnSecondary}`}
                            onClick={() => {
                              void handleSetBundleStatus('archived');
                            }}
                            disabled={actionLoading === 'bundle-status'}
                            type="button"
                            aria-label="Archive this skill bundle"
                          >
                            Archive
                          </button>
                        </>
                      )}
                      {selectedBundle.status === 'archived' && (
                        <p
                          className={styles.bbDetailLifecycleInfo}
                          role="status"
                        >
                          This skill bundle is archived. No further status
                          changes are available.
                        </p>
                      )}
                    </div>
                  </>
                )}
                <div className={styles.bbDetailActions}>
                  <button
                    className={`${styles.bbBtn} ${styles.bbBtnPrimary}`}
                    onClick={() => handleLoadIntoCart(selectedBundle)}
                    type="button"
                  >
                    Load into Cart
                  </button>
                  <button
                    className={`${styles.bbBtn} ${styles.bbBtnSecondary}`}
                    onClick={() => {
                      const params = new URLSearchParams();
                      params.set(
                        'skills',
                        selectedBundle.skills.map(s => s.name).join(','),
                      );
                      params.set('bundleName', selectedBundle.name);
                      params.set('bundleId', selectedBundle.id);
                      navigate(`${basePath}/playground?${params.toString()}`);
                    }}
                    type="button"
                    aria-label={`Test skill bundle ${selectedBundle.name} in Playground`}
                  >
                    Test in Playground
                  </button>
                  {!editMode && (
                    <button
                      className={`${styles.bbBtn} ${styles.bbBtnSecondary}`}
                      onClick={handleStartEdit}
                      type="button"
                    >
                      Edit
                    </button>
                  )}
                  <button
                    className={`${styles.bbBtn} ${styles.bbBtnSecondary}`}
                    onClick={() => handleFork(selectedBundle.id)}
                    disabled={actionLoading === 'fork'}
                    type="button"
                  >
                    {actionLoading === 'fork' ? 'Forking...' : 'Fork'}
                  </button>
                  <button
                    className={`${styles.bbBtn} ${styles.bbBtnSecondary}`}
                    onClick={() => handleExport(selectedBundle.id)}
                    disabled={actionLoading === 'export'}
                    type="button"
                  >
                    {actionLoading === 'export'
                      ? 'Exporting...'
                      : 'Export JSON'}
                  </button>
                  <button
                    className={`${styles.bbBtn} ${styles.bbBtnGhost}`}
                    onClick={() =>
                      handleDelete(selectedBundle.id, selectedBundle.name)
                    }
                    disabled={actionLoading === 'delete'}
                    type="button"
                  >
                    {actionLoading === 'delete' ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>
              <div className={styles.bbSkillList}>
                {selectedBundle.skills.map(skill => (
                  <div key={skill.name} className={styles.bbSkillItem}>
                    <span
                      className={styles.bbSkillCat}
                      style={{
                        background: 'var(--sm-brand-tint)',
                        color: 'var(--sm-brand)',
                      }}
                    >
                      {skill.category}
                    </span>
                    <span className={styles.bbSkillName}>
                      {skill.name.split(':').pop() || skill.name}
                    </span>
                    {skill.description && (
                      <span className={styles.bbSkillDesc}>
                        {skill.description.slice(0, 120)}
                      </span>
                    )}
                    <div className={styles.bbSkillActions}>
                      <AddToBundleButton
                        skill={{
                          name: skill.name,
                          slug: skill.slug,
                          category: skill.category,
                          description: skill.description || '',
                        }}
                        variant="icon"
                      />
                      {editMode && (
                        <button
                          className={styles.bbSkillRemoveBtn}
                          onClick={() =>
                            handleRemoveSkillFromBundle(skill.slug)
                          }
                          disabled={actionLoading === 'remove-skill'}
                          title="Remove from skill bundle"
                          type="button"
                          aria-label={`Remove ${skill.name.split(':').pop() || skill.name} from skill bundle`}
                        >
                          &times;
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>
      ) : (
        <>
          {catalogAvailable && (
            <div
              className={styles.bbTabs}
              role="tablist"
              aria-label="Skill bundle views"
            >
              <button
                id="bundle-tab-my"
                type="button"
                role="tab"
                aria-selected={activeTab === 'my'}
                aria-controls="bundle-panel-my"
                className={`${styles.bbTab} ${activeTab === 'my' ? styles.bbTabActive : ''}`}
                onClick={() => setActiveTab('my')}
                aria-label="My Skill Bundles: local and draft skill bundles"
              >
                My Skill Bundles
              </button>
              <button
                id="bundle-tab-marketplace"
                type="button"
                role="tab"
                aria-selected={activeTab === 'marketplace'}
                aria-controls="bundle-panel-marketplace"
                className={`${styles.bbTab} ${activeTab === 'marketplace' ? styles.bbTabActive : ''}`}
                onClick={() => setActiveTab('marketplace')}
                aria-label="Marketplace: published skill bundles from the catalog"
              >
                Marketplace
              </button>
            </div>
          )}

          <div
            id="bundle-panel-my"
            role={catalogAvailable ? 'tabpanel' : undefined}
            aria-labelledby={catalogAvailable ? 'bundle-tab-my' : undefined}
            hidden={!!catalogAvailable && activeTab !== 'my'}
          >
            {bundles.length === 0 ? (
              <div className={styles.bbEmpty}>
                <h3>No skill bundles yet</h3>
                <p>
                  Start by selecting skills from the catalog using &ldquo;Select
                  for Skill Bundle&rdquo; mode, or add them individually. Then
                  save your curated collection from the cart.
                </p>
                <div className={styles.bbEmptyActions}>
                  <button
                    className={`${styles.bbBtn} ${styles.bbBtnPrimary}`}
                    onClick={() => navigate(`${basePath}/skills?mode=select`)}
                    type="button"
                  >
                    + Build New Skill Bundle
                  </button>
                  <button
                    className={`${styles.bbBtn} ${styles.bbBtnSecondary}`}
                    onClick={() => navigate(`${basePath}/skills`)}
                    type="button"
                  >
                    Browse Skills
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className={styles.bbListToolbar}>
                  <label
                    htmlFor="bundle-status-filter"
                    className={styles.bbFilterLabel}
                  >
                    Status
                  </label>
                  <select
                    id="bundle-status-filter"
                    className={styles.statusFilter}
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                    aria-label="Filter skill bundles by status"
                  >
                    <option value="all">All Statuses</option>
                    <option value="draft">Draft</option>
                    <option value="testing">Testing</option>
                    <option value="published">Published</option>
                    <option value="deprecated">Deprecated</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
                {filteredBundles.length === 0 ? (
                  <p className={styles.bbFilterEmpty} role="status">
                    No skill bundles match this status. Try a different filter
                    or create a new skill bundle.
                  </p>
                ) : (
                  <div className={styles.bbGrid}>
                    {filteredBundles.map(bundle => (
                      <button
                        key={bundle.id}
                        className={styles.bbCard}
                        onClick={() => openDetail(bundle.id)}
                        type="button"
                        aria-label={`Open skill bundle ${bundle.name}`}
                      >
                        <div className={styles.bbCardTop}>
                          <div className={styles.bbCardNameRow}>
                            <h3 className={styles.bbCardName}>{bundle.name}</h3>
                            <StatusBadge status={bundle.status} />
                          </div>
                          <span className={styles.bbCardCount}>
                            {bundle.skillCount} skills
                          </span>
                        </div>
                        {bundle.description && (
                          <p className={styles.bbCardDesc}>
                            {bundle.description}
                          </p>
                        )}
                        <div className={styles.bbCardMeta}>
                          <span>{bundle.author}</span>
                          {bundle.createdAt && (
                            <span>
                              {new Date(bundle.createdAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {catalogAvailable && (
            <div
              id="bundle-panel-marketplace"
              role="tabpanel"
              aria-labelledby="bundle-tab-marketplace"
              hidden={activeTab !== 'marketplace'}
            >
              {catalogLoading ? (
                <div className={styles.bbLoading}>
                  Loading marketplace skill bundles...
                </div>
              ) : catalogBundles.length === 0 ? (
                <div className={styles.bbEmpty} role="status">
                  No published skill bundles in the marketplace yet.
                </div>
              ) : (
                <div className={styles.bbGrid}>
                  {catalogBundles.map(cb => (
                    <div
                      key={`${cb.namespace}-${cb.name}-${cb.version || ''}`}
                      className={styles.bbMarketplaceCard}
                    >
                      <div className={styles.bbCardNameRow}>
                        <strong className={styles.bbMarketplaceTitle}>
                          {cb.display_name || cb.name}
                        </strong>
                        <StatusBadge status={cb.status || 'published'} />
                      </div>
                      <div className={styles.bbCardMeta}>
                        {cb.namespace ? <span>by {cb.namespace}</span> : null}
                        {cb.version ? <span>v{cb.version}</span> : null}
                      </div>
                      <p className={styles.bbMarketplaceDesc}>
                        {cb.description || 'No description'}
                      </p>
                      <div className={styles.bbCardActions}>
                        <button
                          type="button"
                          className={styles.bbActionBtn}
                          disabled={actionLoading === 'catalog-fork'}
                          onClick={() => {
                            void handleForkCatalogBundle(cb);
                          }}
                          aria-label={`Fork ${cb.display_name || cb.name} to My Skill Bundles`}
                        >
                          {actionLoading === 'catalog-fork'
                            ? 'Forking...'
                            : 'Fork to My Skill Bundles'}
                        </button>
                        <button
                          type="button"
                          className={styles.bbActionBtn}
                          onClick={() => handleTestCatalogBundle(cb)}
                          aria-label={`Test ${cb.display_name || cb.name} in Playground`}
                        >
                          Test in Playground
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
