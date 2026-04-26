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
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi, useRouteRef } from '@backstage/core-plugin-api';
import { MarkdownContent } from '@backstage/core-components';
import Drawer from '@material-ui/core/Drawer';
import IconButton from '@material-ui/core/IconButton';
import Tab from '@material-ui/core/Tab';
import Tabs from '@material-ui/core/Tabs';
import Button from '@material-ui/core/Button';
import CircularProgress from '@material-ui/core/CircularProgress';
import CloseIcon from '@material-ui/icons/Close';
import { skillMarketplaceApiRef } from '../../api';
import { rootRouteRef } from '../../routes';
import { useBundle } from '../../hooks';
import type { SkillData } from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import {
  LIFECYCLE_TRANSITIONS,
  type CatalogSkill,
  type LifecycleState,
} from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import { humanize } from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import styles from './SkillDetailDrawer.module.css';

const LIFECYCLE_BADGE: Record<
  string,
  { bg: string; fg: string; label: string }
> = {
  draft: { bg: 'rgba(245,158,11,0.12)', fg: '#d97706', label: 'Draft' },
  testing: { bg: 'rgba(59,130,246,0.12)', fg: '#2563eb', label: 'Testing' },
  published: { bg: 'rgba(16,185,129,0.12)', fg: '#059669', label: 'Published' },
  deprecated: {
    bg: 'rgba(249,115,22,0.12)',
    fg: '#ea580c',
    label: 'Deprecated',
  },
  archived: { bg: 'rgba(107,114,128,0.12)', fg: '#4b5563', label: 'Archived' },
};

export interface SkillDetailDrawerProps {
  open: boolean;
  onClose: () => void;
  skill: SkillData | null;
}

function formatTime(iso: string | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function pickContentVersion(versions: CatalogSkill[], preferred?: string) {
  if (versions.length === 0) return undefined;
  if (preferred) {
    const hit = versions.find(v => v.version === preferred);
    if (hit) return hit.version;
  }
  return versions[0].version;
}

export function SkillDetailDrawer({
  open,
  onClose,
  skill,
}: SkillDetailDrawerProps) {
  const api = useApi(skillMarketplaceApiRef);
  const navigate = useNavigate();
  const basePath = useRouteRef(rootRouteRef)();
  const { addSkill, setDrawerOpen } = useBundle();
  const [tabIndex, setTabIndex] = useState(0);

  const [catalogOk, setCatalogOk] = useState<boolean | null>(null);
  const [versions, setVersions] = useState<CatalogSkill[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionsError, setVersionsError] = useState<string | null>(null);
  const [contentVersion, setContentVersion] = useState<string | undefined>();
  const [mdContent, setMdContent] = useState<string>('');
  const [mdLoading, setMdLoading] = useState(false);
  const [mdError, setMdError] = useState<string | null>(null);
  const [localFallback, setLocalFallback] = useState(false);

  const [promoteTarget, setPromoteTarget] = useState<LifecycleState | ''>('');
  const [promoteBusy, setPromoteBusy] = useState(false);
  const [promoteMsg, setPromoteMsg] = useState<{
    type: 'ok' | 'err';
    text: string;
  } | null>(null);

  const displayTitle = useMemo(
    () => (skill ? skill.sections?.title || humanize(skill.name) : ''),
    [skill],
  );

  const lifecycle = skill?.lifecycleState;
  const badge = useMemo(
    () =>
      lifecycle && LIFECYCLE_BADGE[lifecycle]
        ? LIFECYCLE_BADGE[lifecycle]
        : LIFECYCLE_BADGE.draft,
    [lifecycle],
  );

  const transitionTargets: LifecycleState[] = useMemo(() => {
    if (!skill?.lifecycleState) return LIFECYCLE_TRANSITIONS.draft;
    return LIFECYCLE_TRANSITIONS[skill.lifecycleState] ?? [];
  }, [skill?.lifecycleState]);

  const canPromote = Boolean(skill?.gitPath) && transitionTargets.length > 0;

  const resetState = useCallback(() => {
    setTabIndex(0);
    setCatalogOk(null);
    setVersions([]);
    setVersionsError(null);
    setContentVersion(undefined);
    setMdContent('');
    setMdError(null);
    setLocalFallback(false);
    setPromoteTarget('');
    setPromoteMsg(null);
  }, []);

  useEffect(() => {
    if (!open || !skill) {
      if (!open) resetState();
      return undefined;
    }

    setTabIndex(0);
    setVersionsError(null);
    setMdError(null);
    setPromoteMsg(null);
    setLocalFallback(false);
    setVersions([]);
    setContentVersion(undefined);
    setCatalogOk(null);
    setMdContent('');

    let cancelled = false;
    (async () => {
      setVersionsLoading(true);
      try {
        const available = await api.isCatalogAvailable();
        if (cancelled) return;
        if (!available) {
          setCatalogOk(false);
          setLocalFallback(true);
          setMdContent(skill.rawContent || skill.body || '');
          return;
        }
        const list = await api.getCatalogVersions(
          skill.pluginName,
          skill.skillName,
        );
        if (cancelled) return;
        setCatalogOk(true);
        setVersions(list);
        if (list.length === 0) {
          setLocalFallback(true);
          setMdContent(skill.rawContent || skill.body || '');
          return;
        }
        const v = pickContentVersion(list, skill.version);
        setContentVersion(v);
      } catch (e) {
        if (cancelled) return;
        setCatalogOk(false);
        setLocalFallback(true);
        setVersionsError(
          (e as Error).message ||
            'This skill is not available in the catalog in this environment.',
        );
        setMdContent(skill.rawContent || skill.body || '');
      } finally {
        if (!cancelled) setVersionsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    api,
    open,
    resetState,
    skill,
    skill?.pluginName,
    skill?.skillName,
    skill?.slug,
  ]);

  useEffect(() => {
    if (!open || !skill || !contentVersion || !catalogOk || localFallback) {
      if (open && skill && localFallback) {
        setMdContent(skill.rawContent || skill.body || '');
      }
      return undefined;
    }
    let cancelled = false;
    (async () => {
      setMdLoading(true);
      setMdError(null);
      try {
        const text = await api.getCatalogSkillContent(
          skill.pluginName,
          skill.skillName,
          contentVersion,
        );
        if (!cancelled) setMdContent(text);
      } catch (e) {
        if (!cancelled) {
          setMdError((e as Error).message || 'Failed to load SKILL.md');
          setMdContent(skill.rawContent || skill.body || '');
        }
      } finally {
        if (!cancelled) setMdLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, catalogOk, contentVersion, localFallback, open, skill]);

  const handleTabChange = useCallback(
    (_: React.ChangeEvent<Record<string, unknown>>, value: number) => {
      setTabIndex(value);
    },
    [],
  );

  const handleAddToBundle = useCallback(() => {
    if (!skill) return;
    addSkill({
      name: skill.skillName,
      slug: skill.slug,
      category: skill.pluginName,
      description: skill.description,
    });
    setDrawerOpen(true);
  }, [addSkill, setDrawerOpen, skill]);

  const goPlayground = useCallback(() => {
    if (!skill) return;
    onClose();
    const q = new URLSearchParams({ skill: skill.skillName });
    navigate(`${basePath}playground?${q.toString()}`);
  }, [basePath, navigate, onClose, skill]);

  const goGraph = useCallback(() => {
    onClose();
    navigate(`${basePath}graph`);
  }, [basePath, navigate, onClose]);

  const handlePromote = useCallback(async () => {
    if (!skill?.gitPath || !promoteTarget) return;
    setPromoteBusy(true);
    setPromoteMsg(null);
    try {
      const r = await api.promoteSkill(skill.gitPath, promoteTarget);
      setPromoteMsg({ type: 'ok', text: `Promoted to ${r.newState}.` });
    } catch (e) {
      setPromoteMsg({
        type: 'err',
        text: (e as Error).message || 'Promotion failed',
      });
    } finally {
      setPromoteBusy(false);
    }
  }, [api, promoteTarget, skill?.gitPath]);

  if (!open || !skill) {
    return null;
  }

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      classes={{ paper: styles.drawerPaper }}
      ModalProps={{
        'aria-label': 'Skill details',
        keepMounted: false,
      }}
    >
      <div
        className={styles.root}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sm-skill-detail-title"
      >
        <header className={styles.header}>
          <div className={styles.headerMain}>
            <h2 id="sm-skill-detail-title" className={styles.title}>
              {displayTitle}
            </h2>
            {skill.authors && (
              <p className={styles.subtitle} id="sm-skill-detail-author">
                {skill.authors}
              </p>
            )}
            <div className={styles.metaRow} aria-label="Skill metadata">
              {skill.lifecycleState && (
                <span
                  className={styles.lifecycle}
                  style={{ backgroundColor: badge.bg, color: badge.fg }}
                >
                  {badge.label}
                </span>
              )}
              {skill.version && (
                <span
                  className={styles.subtitle}
                  style={{ margin: 0 }}
                  aria-label="Current version"
                >
                  v{skill.version}
                </span>
              )}
            </div>
          </div>
          <IconButton
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close skill details"
            edge="end"
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </header>

        <Tabs
          value={tabIndex}
          onChange={handleTabChange}
          className={styles.tabs}
          indicatorColor="primary"
          textColor="primary"
          aria-label="Skill detail sections"
        >
          <Tab
            className={styles.tab}
            id="sm-skill-tab-skillmd"
            aria-controls="sm-skill-panel-skillmd"
            label="SKILL.md"
          />
          <Tab
            className={styles.tab}
            id="sm-skill-tab-versions"
            aria-controls="sm-skill-panel-versions"
            label="Version history"
          />
        </Tabs>

        {tabIndex === 0 && (
          <div
            id="sm-skill-panel-skillmd"
            role="tabpanel"
            aria-labelledby="sm-skill-tab-skillmd"
            className={styles.tabPanel}
          >
            {catalogOk && versions.length > 1 && contentVersion && (
              <div className={styles.versionSelect}>
                <label htmlFor="sm-skill-md-version">Version</label>
                <select
                  id="sm-skill-md-version"
                  className={styles.selectNative}
                  value={contentVersion}
                  onChange={e => setContentVersion(e.target.value)}
                  aria-label="Select SKILL.md version"
                >
                  {versions.map(v => (
                    <option key={v.version} value={v.version}>
                      {v.version} ({v.status || '—'})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {versionsLoading && (
              <div
                className={styles.centered}
                role="status"
                aria-label="Loading skill data"
              >
                <CircularProgress size={32} />
                <span>Loading from catalog…</span>
              </div>
            )}

            {!versionsLoading && mdLoading && (
              <div
                className={styles.centered}
                role="status"
                aria-label="Loading SKILL.md"
              >
                <CircularProgress size={28} />
                <span>Loading SKILL.md…</span>
              </div>
            )}

            {versionsError && !versionsLoading && (
              <p className={styles.errorText} role="alert">
                {versionsError}
              </p>
            )}

            {mdError && !mdLoading && (
              <p className={styles.errorText} role="alert">
                {mdError} Showing any cached content from the list below, if
                available.
              </p>
            )}

            {!versionsLoading && !mdLoading && !mdContent.trim() && (
              <div className={styles.centered}>
                <p className={styles.emptyHint}>
                  No SKILL.md content is available for this skill in this view.
                </p>
              </div>
            )}

            {!versionsLoading && !mdLoading && mdContent.trim().length > 0 && (
              <div className={`${styles.mdWrap} sm-skill-md`}>
                <MarkdownContent
                  /* catalog returns markdown text */
                  content={mdContent}
                />
              </div>
            )}
          </div>
        )}

        {tabIndex === 1 && (
          <div
            id="sm-skill-panel-versions"
            role="tabpanel"
            aria-labelledby="sm-skill-tab-versions"
            className={styles.tabPanel}
          >
            {versionsLoading && (
              <div
                className={styles.centered}
                role="status"
                aria-label="Loading versions"
              >
                <CircularProgress size={32} />
                <span>Loading version history…</span>
              </div>
            )}

            {!versionsLoading && versionsError && !versions.length && (
              <p className={styles.errorText} role="alert">
                {versionsError}
              </p>
            )}

            {!versionsLoading &&
              !versionsError &&
              versions.length === 0 &&
              !localFallback && (
                <div className={styles.centered}>
                  <p className={styles.emptyHint}>
                    No version history returned from the skill catalog. This may
                    be a local or OCI-only skill in this environment.
                  </p>
                </div>
              )}

            {!versionsLoading && versions.length > 0 && (
              <ul
                className={styles.versionList}
                aria-label="Skill versions from catalog"
              >
                {versions.map((v, i) => (
                  <li key={`${v.version}-${i}`} className={styles.versionItem}>
                    <div className={styles.versionRow}>
                      <span className={styles.versionName}>v{v.version}</span>
                      {v.status && (
                        <span className={styles.statusPill}>{v.status}</span>
                      )}
                    </div>
                    {v.tag && (
                      <div className={styles.versionTag}>tag: {v.tag}</div>
                    )}
                    <div
                      className={styles.versionMeta}
                      aria-label="Version timestamps"
                    >
                      {v.digest && (
                        <span>digest: {v.digest.slice(0, 16)}… · </span>
                      )}
                      created: {formatTime(v.created)} · synced:{' '}
                      {formatTime(v.synced_at)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <footer className={styles.actions} aria-label="Skill actions">
          <div className={styles.actionRow}>
            <Button
              variant="contained"
              color="primary"
              className={styles.actionBtn}
              onClick={handleAddToBundle}
              aria-label="Add this skill to skill bundle cart"
            >
              Add to Skill Bundle
            </Button>
            <Button
              variant="outlined"
              color="primary"
              className={styles.actionBtn}
              onClick={goPlayground}
              aria-label="Open skill in Skills Playground"
            >
              Open in Playground
            </Button>
            <Button
              variant="outlined"
              className={styles.actionBtn}
              onClick={goGraph}
              aria-label="Open Skill Graph in a new page context"
            >
              View in Graph
            </Button>
          </div>
          {canPromote && (
            <div>
              <p className={styles.promoteLabel}>Promote (lifecycle)</p>
              <div className={styles.actionRow}>
                <select
                  className={styles.selectNative}
                  value={promoteTarget}
                  onChange={e =>
                    setPromoteTarget(
                      (e.target.value || '') as LifecycleState | '',
                    )
                  }
                  aria-label="Select lifecycle state to promote to"
                >
                  <option value="">Choose target state…</option>
                  {transitionTargets.map(t => (
                    <option key={t} value={t}>
                      {LIFECYCLE_BADGE[t]?.label ?? t}
                    </option>
                  ))}
                </select>
                <Button
                  variant="outlined"
                  className={`${styles.actionBtn} ${styles.actionBtnPromote}`}
                  disabled={!promoteTarget || promoteBusy}
                  onClick={handlePromote}
                  aria-label="Promote skill to selected lifecycle state"
                >
                  {promoteBusy ? 'Promoting…' : 'Promote'}
                </Button>
              </div>
            </div>
          )}
          {promoteMsg && (
            <p
              className={
                promoteMsg.type === 'ok' ? styles.successMsg : styles.errorText
              }
              role="status"
            >
              {promoteMsg.text}
            </p>
          )}
        </footer>
      </div>
    </Drawer>
  );
}
