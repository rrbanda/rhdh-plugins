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
import type {
  NvlNode,
  NvlRelationship,
} from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import React, { useState } from 'react';
import { AddToBundleGraphBtn } from './AddToBundleGraphBtn';
import { HIDDEN_PROPS, REL_COLORS } from './graphConstants';
import styles from './DetailPanel.module.css';

const TRUNCATE_LEN = 100;
const LIFECYCLE_STEPS = [
  'draft',
  'staged',
  'active',
  'deprecated',
  'archived',
] as const;

export interface DetailPanelProps {
  node: NvlNode;
  relationships: NvlRelationship[];
  allNodes: NvlNode[];
  labels: { name: string; color: string; count: number }[];
  onClose: () => void;
  onExplore: (nodeId: string) => void;
  exploringNodeId: string | null;
  exploreFeedback: { type: 'info' | 'error'; message: string } | null;
  /** When the KG Q&A agent is available, show “Ask AI” in the header */
  agenticAvailable?: boolean | null;
  onAskAI?: (nodeName: string) => void;
  /** Select another node in the graph by id (e.g. from relationship links) */
  onNavigateToNode?: (nodeId: string) => void;
}

type TabId = 'properties' | 'relationships' | 'history';

function tryPrettyJsonString(s: string): string | null {
  const t = s.trim();
  if (!t.startsWith('{') && !t.startsWith('[')) return null;
  try {
    return JSON.stringify(JSON.parse(t), null, 2);
  } catch {
    return null;
  }
}

function PropertyValue({ name, value }: { name: string; value: unknown }) {
  const [open, setOpen] = useState(false);
  if (value !== null && typeof value === 'object') {
    return (
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- allow keyboard focus for scrollable JSON
      <pre className={styles.jsonPre} tabIndex={0}>
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }
  const s = value === null || value === undefined ? '' : String(value);
  const pretty = tryPrettyJsonString(s);
  if (pretty) {
    return (
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- allow keyboard focus for scrollable JSON
      <pre className={styles.jsonPre} tabIndex={0}>
        {pretty}
      </pre>
    );
  }
  const long = s.length > TRUNCATE_LEN;
  const show =
    !long || open
      ? s
      : `${s.slice(0, TRUNCATE_LEN)}${s.length > TRUNCATE_LEN ? '…' : ''}`;

  if (!long) {
    return <span title={s}>{s}</span>;
  }
  return (
    <span>
      <button
        type="button"
        className={styles.truncateBtn}
        onClick={() => setOpen(v => !v)}
        title={s}
        aria-label={`${open ? 'Collapse' : 'Expand'} value for ${name}`}
        aria-expanded={open}
      >
        {show}
      </button>
    </span>
  );
}

function relPropCount(props: Record<string, unknown>): number {
  return Object.keys(props).filter(k => !k.startsWith('_')).length;
}

function RelRow({
  rel,
  direction,
  otherCaption,
  otherId,
  accent,
  onNavigate,
}: {
  rel: NvlRelationship;
  direction: 'in' | 'out';
  otherCaption: string;
  otherId: string;
  accent: string;
  onNavigate?: (id: string) => void;
}) {
  const [metaOpen, setMetaOpen] = useState(false);
  const n = relPropCount(rel.properties);
  const hasMeta = n > 0;
  const relLabel =
    direction === 'out'
      ? `Open connected node ${otherCaption} via outgoing ${rel.type} relationship`
      : `Open connected node ${otherCaption} via incoming ${rel.type} relationship`;

  const itemInner = (
    <>
      <span className={styles.relArrow} aria-hidden>
        {direction === 'out' ? <ArrowOutIcon /> : <ArrowInIcon />}
      </span>
      <span className={styles.relName}>{otherCaption}</span>
    </>
  );

  return (
    <div>
      {onNavigate ? (
        <button
          type="button"
          className={styles.relItem}
          onClick={() => onNavigate(otherId)}
          style={{ borderLeft: `3px solid ${accent}` }}
          aria-label={relLabel}
        >
          {itemInner}
        </button>
      ) : (
        <div
          className={styles.relItem}
          style={{ borderLeft: `3px solid ${accent}`, cursor: 'default' }}
          role="listitem"
          aria-label={relLabel}
        >
          {itemInner}
        </div>
      )}
      {hasMeta ? (
        <p className={styles.relMeta}>
          <button
            type="button"
            className={styles.relExpander}
            onClick={e => {
              e.stopPropagation();
              setMetaOpen(m => !m);
            }}
            aria-expanded={metaOpen}
            aria-label={
              metaOpen
                ? 'Hide relationship properties'
                : 'Show relationship properties'
            }
          >
            {metaOpen ? 'Hide' : 'Show'} {n} propert{n === 1 ? 'y' : 'ies'}
          </button>
        </p>
      ) : null}
      {hasMeta && metaOpen ? (
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- allow keyboard focus for scrollable JSON
        <pre className={styles.relJson} tabIndex={0}>
          {JSON.stringify(rel.properties, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}

function ArrowOutIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width={14}
      height={14}
      fill="currentColor"
      aria-hidden
    >
      <path d="M1 8a.5.5 0 01.5-.5h8.59L7.3 3.2a.5.5 0 01.7-.7l4.5 4.5a.5.5 0 010 .7l-4.5 4.5a.5.5 0 11-.7-.7l2.8-2.3H1.5A.5.5 0 011 8z" />
    </svg>
  );
}
function ArrowInIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width={14}
      height={14}
      fill="currentColor"
      aria-hidden
    >
      <path d="M6.4 1.1a.5.5 0 01.6.1l4.5 4.5a.5.5 0 010 .7l-4.5 4.5a.5.5 0 11-.7-.7L8.3 6.4H.5A.5.5 0 01.5 5h7.1L5.3 1.8a.5.5 0 01.1-.7z" />
    </svg>
  );
}

function getLifecycle(
  p: Record<string, unknown>,
): { raw: string; norm: string } | null {
  const v = p.lifecycleState ?? p.lifecycle;
  if (v === null || v === undefined || v === '') {
    return null;
  }
  const raw = String(v);
  return { raw, norm: raw.toLowerCase().replace(/\s+/g, '') };
}

function lifecycleBadgeClass(n: string): string {
  if (n === 'active' || n === 'ready') return styles.badgeLive;
  if (n.includes('deprecat') || n === 'archived') return styles.badgeDeprecated;
  if (n === 'draft' || n === 'staged' || n === 'error')
    return styles.badgeDraft;
  return styles.lifecycleBadge;
}

function HistoryView({ node }: { node: NvlNode }) {
  const p = node.properties;
  const lc = getLifecycle(p);
  const raw =
    (p.created as string) ??
    (p.createdAt as string) ??
    (p.created_at as string) ??
    null;
  const sync =
    (p.synced as string) ??
    (p.lastSynced as string) ??
    (p.updatedAt as string) ??
    (p.updated as string) ??
    null;

  return (
    <div>
      {!lc && !raw && !sync ? (
        <p className={styles.muted}>No history metadata on this node.</p>
      ) : null}
      {lc ? (
        <div className={styles.historyRow}>
          <span className={styles.historyLabel}>Lifecycle</span>
          <span
            className={`${styles.lifecycleBadge} ${lifecycleBadgeClass(lc.norm)}`}
          >
            {lc.raw}
          </span>
        </div>
      ) : null}
      {raw ? (
        <div className={styles.historyRow}>
          <span className={styles.historyLabel}>Created / recorded</span>
          <p className={styles.metaDate}>
            <span className={styles.metaDateLabel}>Created</span>
            {String(raw)}
          </p>
        </div>
      ) : null}
      {sync ? (
        <div className={styles.historyRow}>
          <span className={styles.historyLabel}>Sync</span>
          <p className={styles.metaDate}>
            <span className={styles.metaDateLabel}>Synced / updated</span>
            {String(sync)}
          </p>
        </div>
      ) : null}
      {lc ? (
        <div className={styles.lifecycleFlow} aria-label="Lifecycle flow">
          <div className={styles.flowTitle}>State flow</div>
          {LIFECYCLE_STEPS.map((step, i) => (
            <React.Fragment key={step}>
              {i > 0 ? (
                <span className={styles.flowArrow} aria-hidden>
                  →
                </span>
              ) : null}
              <span
                className={`${styles.flowStep} ${
                  lc.norm === step || lc.raw.toLowerCase() === step
                    ? styles.flowStepCurrent
                    : ''
                }`}
              >
                {step}
              </span>
            </React.Fragment>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function DetailPanel({
  node,
  relationships,
  allNodes,
  labels,
  onClose,
  onExplore,
  exploringNodeId,
  exploreFeedback,
  agenticAvailable,
  onAskAI,
  onNavigateToNode,
}: DetailPanelProps) {
  const [tab, setTab] = useState<TabId>('properties');
  const labelColorMap = new Map(labels.map(l => [l.name, l.color]));
  const connections = relationships.filter(
    r => r.from === node.id || r.to === node.id,
  );

  const byType = new Map<
    string,
    { in: NvlRelationship[]; out: NvlRelationship[] }
  >();
  for (const r of connections) {
    if (!byType.has(r.type)) {
      byType.set(r.type, { in: [], out: [] });
    }
    const g = byType.get(r.type)!;
    if (r.from === node.id) g.out.push(r);
    if (r.to === node.id) g.in.push(r);
  }
  const typeKeys = [...byType.keys()].sort((a, b) => a.localeCompare(b));

  const getCaption = (id: string) =>
    allNodes.find(n => n.id === id)?.caption ?? id;

  const displayProps = Object.entries(node.properties).filter(
    ([key]) => !HIDDEN_PROPS.has(key),
  );

  const nodeNameForAi = String(
    (node.properties.name as string | undefined) ?? node.caption,
  );
  const showAskAi = agenticAvailable === true && typeof onAskAI === 'function';
  const primaryLabel = node.labels[0] ?? 'Node';
  const typeColor = labelColorMap.get(primaryLabel) ?? 'var(--sm-brand)';

  const fullDesc = node.properties.description
    ? String(node.properties.description)
    : '';
  const [descOpen, setDescOpen] = useState(false);
  const descLong = fullDesc.length > 280;
  const descShow =
    !descOpen && descLong ? `${fullDesc.slice(0, 280)}…` : fullDesc;

  return (
    <div className={styles.detailPanel}>
      <div className={styles.detailHeader}>
        <div className={styles.typeBadgeRow}>
          <span
            className={styles.typeBadge}
            style={{
              color: typeColor,
              backgroundColor: labelColorMap.get(primaryLabel)
                ? `${labelColorMap.get(primaryLabel)}18`
                : 'var(--sm-surface-hover)',
            }}
          >
            {primaryLabel}
          </span>
        </div>
        <h2 className={styles.detailTitle}>{String(node.caption)}</h2>
        <div className={styles.actionRow}>
          {showAskAi ? (
            <button
              type="button"
              onClick={() => onAskAI?.(nodeNameForAi)}
              className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
              aria-label={`Ask AI about ${nodeNameForAi} in the knowledge graph`}
            >
              <svg
                className={styles.actionIcon}
                viewBox="0 0 24 24"
                width={14}
                height={14}
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden
              >
                <path d="M12 2a4 4 0 014 4c0 1.95-1.4 3.58-3.25 3.93L12 10l-.75-.07A4.001 4.001 0 0112 2z" />
                <path d="M12 10v4M8 18h8M7 22h10" />
                <circle
                  cx="12"
                  cy="6"
                  r="1"
                  fill="currentColor"
                  stroke="none"
                />
              </svg>
              Ask AI
            </button>
          ) : null}
          {node.labels.includes('Skill') ? (
            <AddToBundleGraphBtn node={node} className={styles.headerBundle} />
          ) : null}
          <button
            type="button"
            className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
            onClick={() => onExplore(node.id)}
            disabled={exploringNodeId === node.id}
            aria-label={
              exploringNodeId === node.id
                ? 'Exploring neighborhood'
                : `Explore neighborhood of ${node.caption}`
            }
          >
            <svg
              className={styles.actionIcon}
              viewBox="0 0 16 16"
              width={14}
              height={14}
              fill="currentColor"
              aria-hidden
            >
              <path d="M2 1.5A1.5 1.5 0 013.5 0h1A1.5 1.5 0 016 1.5v1A1.5 1.5 0 014.5 4h-1A1.5 1.5 0 012 2.5v-1zm8 0A1.5 1.5 0 0111.5 0h1A1.5 1.5 0 0114 1.5v1A1.5 1.5 0 0112.5 4h-1A1.5 1.5 0 0110 2.5v-1zM2 12.5A1.5 1.5 0 013.5 11h1A1.5 1.5 0 016 12.5v1A1.5 1.5 0 014.5 16h-1A1.5 1.5 0 012 14.5v-1zm3.5-6A1.5 1.5 0 017 5h2a1.5 1.5 0 011.5 1.5v3A1.5 1.5 0 019 11H7a1.5 1.5 0 01-1.5-1.5v-3z" />
            </svg>
            Explore
          </button>
          <button
            type="button"
            onClick={onClose}
            className={`${styles.actionBtn} ${styles.actionBtnGhost}`}
            aria-label="Close node details"
          >
            <svg
              className={styles.actionIcon}
              viewBox="0 0 16 16"
              width={16}
              height={16}
              fill="currentColor"
              aria-hidden
            >
              <path d="M2.2 2.2a.75.75 0 011.06 0L8 6.94l4.74-4.74a.75.75 0 111.06 1.06L9.06 8l4.74 4.74a.75.75 0 11-1.06 1.06L8 9.06l-4.74 4.74a.75.75 0 01-1.06-1.06L6.94 8 2.2 3.26a.75.75 0 010-1.06z" />
            </svg>
          </button>
        </div>
      </div>

      <div
        className={styles.tabList}
        role="tablist"
        aria-label="Node detail sections"
      >
        {(
          [
            ['properties', 'Properties'],
            ['relationships', 'Relationships'],
            ['history', 'History'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`detail-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`detail-panel-${id}`}
            className={styles.tab}
            onClick={() => setTab(id)}
          >
            {label}
            {id === 'relationships' && connections.length > 0
              ? ` (${connections.length})`
              : ''}
          </button>
        ))}
      </div>

      <div className={styles.detailBody}>
        {tab === 'properties' && (
          <div
            className={styles.tabPanel}
            id="detail-panel-properties"
            role="tabpanel"
            aria-labelledby="detail-tab-properties"
          >
            {fullDesc ? (
              <div
                className={`${styles.subSection} ${styles.descriptionBlock}`}
              >
                <div className={styles.subSectionTitle}>Description</div>
                {descShow}
                {descLong ? (
                  <button
                    type="button"
                    className={styles.descToggle}
                    onClick={() => setDescOpen(o => !o)}
                    aria-expanded={descOpen}
                    aria-label={
                      descOpen
                        ? 'Show less description'
                        : 'Show full description'
                    }
                  >
                    {descOpen ? 'Show less' : 'Read more'}
                  </button>
                ) : null}
              </div>
            ) : null}

            {node.labels.includes('Skill') && (
              <div className={styles.subSection}>
                <div className={styles.subSectionTitle}>Skill</div>
                {node.properties.category ? (
                  <div className={styles.skillMetaRow}>
                    <span className={styles.skillMetaLabel}>Domain</span>
                    <span
                      className={styles.skillMetaValue}
                      style={{
                        color:
                          (node.properties.pluginColor as string) ||
                          'var(--sm-text-secondary)',
                      }}
                    >
                      {String(node.properties.category)}
                    </span>
                  </div>
                ) : null}
                {node.properties.complexity ? (
                  <div className={styles.skillMetaRow}>
                    <span className={styles.skillMetaLabel}>Complexity</span>
                    <span className={styles.skillMetaValue}>
                      {String(node.properties.complexity)}
                    </span>
                  </div>
                ) : null}
                {node.properties.version ? (
                  <div className={styles.skillMetaRow}>
                    <span className={styles.skillMetaLabel}>Version</span>
                    <span className={styles.skillMetaValue}>
                      {String(node.properties.version)}
                    </span>
                  </div>
                ) : null}
                {node.properties.author ? (
                  <div className={styles.skillMetaRow}>
                    <span className={styles.skillMetaLabel}>Author</span>
                    <span className={styles.skillMetaValue}>
                      {String(node.properties.author)}
                    </span>
                  </div>
                ) : null}
              </div>
            )}

            {node.labels.includes('AgentCapability') && (
              <div className={styles.subSection}>
                <div className={styles.subSectionTitle}>Agent capability</div>
                {node.properties.agentName ? (
                  <div className={styles.skillMetaRow}>
                    <span className={styles.skillMetaLabel}>Agent</span>
                    <span className={styles.skillMetaValue}>
                      {String(node.properties.agentName)}/
                      {String(node.properties.agentNamespace)}
                    </span>
                  </div>
                ) : null}
                {node.properties.skillId ? (
                  <div className={styles.skillMetaRow}>
                    <span className={styles.skillMetaLabel}>Skill ID</span>
                    <span
                      className={`${styles.skillMetaValue} ${styles.skillIdValue}`}
                    >
                      {String(node.properties.skillId)}
                    </span>
                  </div>
                ) : null}
                {Array.isArray(node.properties.tags) &&
                  (node.properties.tags as string[]).length > 0 && (
                    <div className={styles.acTagsRow}>
                      {(node.properties.tags as string[]).map(t => (
                        <span
                          key={t}
                          className={`${styles.acCapBadge} ${styles.acTagBadge}`}
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                {Array.isArray(node.properties.examples) &&
                  (node.properties.examples as string[]).length > 0 && (
                    <div className={styles.examplesBlock}>
                      <span
                        className={`${styles.skillMetaLabel} ${styles.examplesLabel}`}
                      >
                        Examples
                      </span>
                      {(node.properties.examples as string[])
                        .slice(0, 3)
                        .map((ex, i) => (
                          <div key={i} className={styles.exampleLine}>
                            &ldquo;{ex}&rdquo;
                          </div>
                        ))}
                    </div>
                  )}
              </div>
            )}

            {node.labels.includes('Agent') && (
              <div className={styles.subSection}>
                <div className={styles.subSectionTitle}>Agent</div>
                {node.properties.namespace ? (
                  <div className={styles.skillMetaRow}>
                    <span className={styles.skillMetaLabel}>Namespace</span>
                    <span className={styles.skillMetaValue}>
                      {String(node.properties.namespace)}
                    </span>
                  </div>
                ) : null}
                {node.properties.status ? (
                  <div className={styles.skillMetaRow}>
                    <span className={styles.skillMetaLabel}>Status</span>
                    <span
                      className={styles.skillMetaValue}
                      style={{
                        color:
                          node.properties.status === 'Ready'
                            ? 'var(--sm-success)'
                            : node.properties.status === 'Error'
                              ? 'var(--sm-danger)'
                              : 'var(--sm-warning)',
                      }}
                    >
                      {String(node.properties.status)}
                    </span>
                  </div>
                ) : null}
                {node.properties.framework ? (
                  <div className={styles.skillMetaRow}>
                    <span className={styles.skillMetaLabel}>Framework</span>
                    <span className={styles.skillMetaValue}>
                      {String(node.properties.framework)}
                    </span>
                  </div>
                ) : null}
                {node.properties.version ? (
                  <div className={styles.skillMetaRow}>
                    <span className={styles.skillMetaLabel}>Version</span>
                    <span className={styles.skillMetaValue}>
                      {String(node.properties.version)}
                    </span>
                  </div>
                ) : null}
                {node.properties.url ? (
                  <div className={styles.skillMetaRow}>
                    <span className={styles.skillMetaLabel}>URL</span>
                    <span
                      className={`${styles.skillMetaValue} ${styles.urlValue}`}
                    >
                      {String(node.properties.url)}
                    </span>
                  </div>
                ) : null}
                <div className={styles.agentCapBadges}>
                  {node.properties.streaming === true && (
                    <span className={styles.acCapBadge}>Streaming</span>
                  )}
                  {node.properties.pushNotifications === true && (
                    <span className={styles.acCapBadge}>Push</span>
                  )}
                </div>
                {typeof node.properties.skillCount === 'number' &&
                  Number(node.properties.skillCount) > 0 && (
                    <div
                      className={`${styles.skillMetaRow} ${styles.skillCountRow}`}
                    >
                      <span className={styles.skillMetaLabel}>Skills</span>
                      <span
                        className={styles.skillMetaValue}
                        style={{ color: 'var(--sm-warning)', fontWeight: 700 }}
                      >
                        {Number(node.properties.skillCount)} linked
                      </span>
                    </div>
                  )}
              </div>
            )}

            {displayProps.length > 0 ? (
              <div className={styles.subSection}>
                <div className={styles.subSectionTitle}>All properties</div>
                <table className={styles.propsTable}>
                  <tbody>
                    {displayProps.map(([key, value]) => (
                      <tr key={key}>
                        <th scope="row">{key}</th>
                        <td>
                          <PropertyValue name={key} value={value} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        )}

        {tab === 'relationships' && (
          <div
            className={styles.tabPanel}
            id="detail-panel-relationships"
            role="tabpanel"
            aria-labelledby="detail-tab-relationships"
          >
            {connections.length === 0 ? (
              <p className={styles.muted}>
                No relationships to or from this node.
              </p>
            ) : (
              typeKeys.map(tkey => {
                const { in: inRels, out: outRels } = byType.get(tkey)!;
                const accent = REL_COLORS[tkey] ?? 'var(--sm-brand)';
                return (
                  <div key={tkey} className={styles.relTypeBlock}>
                    <div className={styles.relTypeHeader}>
                      <span
                        className={styles.relTypeAccent}
                        style={{ background: accent }}
                        aria-hidden
                      />
                      <span
                        className={styles.relTypeName}
                        style={{ color: accent }}
                      >
                        {tkey}
                      </span>
                    </div>
                    {outRels.length > 0 ? (
                      <div>
                        <div className={styles.relSubLabel}>
                          <ArrowOutIcon /> Outgoing
                        </div>
                        {outRels.map(r => (
                          <RelRow
                            key={r.id}
                            rel={r}
                            direction="out"
                            otherCaption={getCaption(r.to)}
                            otherId={r.to}
                            accent={accent}
                            onNavigate={onNavigateToNode}
                          />
                        ))}
                      </div>
                    ) : null}
                    {inRels.length > 0 ? (
                      <div>
                        <div className={styles.relSubLabel}>
                          <ArrowInIcon /> Incoming
                        </div>
                        {inRels.map(r => (
                          <RelRow
                            key={r.id}
                            rel={r}
                            direction="in"
                            otherCaption={getCaption(r.from)}
                            otherId={r.from}
                            accent={accent}
                            onNavigate={onNavigateToNode}
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        )}

        {tab === 'history' && (
          <div
            className={styles.tabPanel}
            id="detail-panel-history"
            role="tabpanel"
            aria-labelledby="detail-tab-history"
          >
            <HistoryView node={node} />
          </div>
        )}
      </div>

      {exploreFeedback ? (
        <div className={styles.exploreSection}>
          <div
            className={`${styles.exploreFeedback} ${
              exploreFeedback.type === 'info'
                ? styles.exploreFeedbackInfo
                : styles.exploreFeedbackError
            }`}
            role="status"
            aria-live="polite"
          >
            {exploreFeedback.message}
          </div>
        </div>
      ) : null}
    </div>
  );
}
