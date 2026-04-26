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
import { useId, useState, useMemo } from 'react';
import { humanize } from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import type { CatalogSkill } from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import { useSkillCatalog } from '../../hooks';
import type { SkillTestStatus } from './playgroundTestStatus';
import styles from './PlaygroundSidebar.module.css';
import pgStyles from './AgentsPage.module.css';

interface OciSkill {
  slug: string;
  name: string;
  skillName: string;
  description?: string;
  body?: string;
  lifecycleState?: string;
  tags?: string[];
  version?: string;
  compatibility?: string;
}

interface PlaygroundSidebarProps {
  agentStatus: 'checking' | 'online' | 'offline';
  agentNs?: string;
  agentCapabilities: string[];
  selectedSkill: string;
  onSkillChange: (skill: string) => void;
  skills: OciSkill[];
  bundleName?: string;
  isBundleMode: boolean;
  bundleSkillNames: string[];
  testStatuses: Record<string, SkillTestStatus>;
  testedCount: number;
  onClear: () => void;
  hasMessages: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  draft: '#f59e0b',
  testing: '#3b82f6',
  published: '#10b981',
  deprecated: '#6b7280',
};

function StatusBadge({ status }: { status?: string }) {
  if (!status) return null;
  return (
    <span
      className={styles.statusBadge}
      style={{ backgroundColor: STATUS_COLORS[status] ?? '#6b7280' }}
    >
      {status}
    </span>
  );
}

function parseTags(skill: CatalogSkill): string[] {
  try {
    return JSON.parse(skill.tags_json || '[]');
  } catch {
    return [];
  }
}

export function PlaygroundSidebar({
  agentStatus,
  agentNs,
  agentCapabilities,
  selectedSkill,
  onSkillChange,
  skills: ociSkills,
  bundleName = '',
  isBundleMode,
  bundleSkillNames,
  testStatuses,
  testedCount,
  onClear,
  hasMessages,
}: PlaygroundSidebarProps) {
  const idPrefix = useId();
  const activeSkillSearchId = `${idPrefix}-active-skill-search`;
  const bundleSkillsLabelId = `${idPrefix}-bundle-skills-label`;
  const agentCapsLabelId = `${idPrefix}-agent-caps-label`;

  const catalog = useSkillCatalog(100);
  const [searchTerm, setSearchTerm] = useState('');

  const statusColor =
    agentStatus === 'online'
      ? 'var(--sm-success)'
      : agentStatus === 'offline'
        ? 'var(--sm-danger)'
        : 'var(--sm-warning)';

  const useCatalog = catalog.available && catalog.skills.length > 0;

  const filteredSkills = useMemo(() => {
    if (useCatalog) {
      if (!searchTerm) return catalog.skills;
      const q = searchTerm.toLowerCase();
      return catalog.skills.filter(
        s =>
          s.name.toLowerCase().includes(q) ||
          s.display_name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.namespace.toLowerCase().includes(q),
      );
    }
    if (!searchTerm) return ociSkills;
    const q = searchTerm.toLowerCase();
    return ociSkills.filter(
      s =>
        s.name.toLowerCase().includes(q) ||
        s.skillName.toLowerCase().includes(q) ||
        (s.description || '').toLowerCase().includes(q),
    );
  }, [useCatalog, catalog.skills, ociSkills, searchTerm]);

  const groupedSkills = useMemo(() => {
    if (!useCatalog) return null;
    const groups: Record<string, CatalogSkill[]> = {};
    for (const s of filteredSkills as CatalogSkill[]) {
      const ns = s.namespace || 'general';
      if (!groups[ns]) groups[ns] = [];
      groups[ns].push(s);
    }
    return groups;
  }, [useCatalog, filteredSkills]);

  const selectedCatalogSkill = useCatalog
    ? catalog.skills.find(s => s.name === selectedSkill)
    : undefined;
  const selectedOciSkill = !useCatalog
    ? ociSkills.find(s => s.skillName === selectedSkill)
    : undefined;
  const selectedMeta = selectedCatalogSkill || selectedOciSkill;

  const selectedTags = selectedCatalogSkill
    ? parseTags(selectedCatalogSkill)
    : selectedOciSkill?.tags;

  return (
    <div className={styles.sidebar}>
      <div className={styles.agentCard}>
        <div className={styles.agentHeader}>
          <span
            className={`${styles.agentDot} ${agentStatus === 'online' ? styles.pulse : ''}`}
            style={{ backgroundColor: statusColor }}
          />
          <div>
            <h3 className={styles.agentName}>Skills Agent</h3>
            <span className={styles.agentNs}>
              {agentNs || 'default'} {'\u00B7'} {agentStatus}
            </span>
          </div>
        </div>
        <p className={styles.agentDesc}>
          Enterprise skills agent with tool-use capabilities. Select a skill and
          test it interactively.
        </p>
      </div>

      <div>
        <label className={styles.label} htmlFor={activeSkillSearchId}>
          Active Skill
        </label>
        <input
          id={activeSkillSearchId}
          type="text"
          className={styles.searchInput}
          placeholder="Search skills..."
          aria-label="Search skills"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />

        {useCatalog && groupedSkills ? (
          <select
            className={styles.select}
            value={selectedSkill}
            onChange={e => onSkillChange(e.target.value)}
            aria-label="Select active skill for chat"
          >
            <option value="">No skill (general chat)</option>
            {Object.entries(groupedSkills)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([ns, nsSkills]) => (
                <optgroup
                  key={ns}
                  label={ns.charAt(0).toUpperCase() + ns.slice(1)}
                >
                  {nsSkills.map(s => (
                    <option key={`${s.namespace}/${s.name}`} value={s.name}>
                      {s.display_name || humanize(s.name)} ({s.status})
                    </option>
                  ))}
                </optgroup>
              ))}
          </select>
        ) : (
          <select
            className={styles.select}
            value={selectedSkill}
            onChange={e => onSkillChange(e.target.value)}
            aria-label="Select active skill for chat"
          >
            <option value="">No skill (general chat)</option>
            {(filteredSkills as OciSkill[]).map(s => (
              <option key={s.slug} value={s.skillName}>
                {humanize(s.name)}
              </option>
            ))}
          </select>
        )}

        {selectedSkill && (
          <span className={styles.skillHint}>
            Skill &ldquo;{selectedSkill}&rdquo; context will be provided to the
            agent
          </span>
        )}

        {selectedMeta && (
          <div className={styles.skillMeta}>
            <div className={styles.skillMetaRow}>
              <StatusBadge
                status={
                  selectedCatalogSkill?.status ||
                  selectedOciSkill?.lifecycleState
                }
              />
              {(selectedCatalogSkill?.version || selectedOciSkill?.version) && (
                <span className={styles.versionBadge}>
                  v{selectedCatalogSkill?.version || selectedOciSkill?.version}
                </span>
              )}
              {(selectedCatalogSkill?.compatibility ||
                selectedOciSkill?.compatibility) && (
                <span className={styles.compatBadge}>
                  {selectedCatalogSkill?.compatibility ||
                    selectedOciSkill?.compatibility}
                </span>
              )}
            </div>
            <p className={styles.skillDesc}>
              {selectedCatalogSkill?.description ||
                selectedOciSkill?.description ||
                selectedOciSkill?.body?.slice(0, 120)}
            </p>
            {selectedTags && selectedTags.length > 0 && (
              <div className={styles.tagList}>
                {selectedTags.slice(0, 6).map(t => (
                  <span key={t} className={styles.tagChip}>
                    {t}
                  </span>
                ))}
                {selectedTags.length > 6 && (
                  <span className={styles.tagChip}>
                    +{selectedTags.length - 6}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {isBundleMode && bundleSkillNames.length > 0 && (
          <div className={styles.bundleContext}>
            <div className={styles.bundleHeader}>
              {bundleName
                ? `Bundle: ${bundleName}`
                : `Testing ${bundleSkillNames.length} skills from bundle`}
            </div>
            <div
              className={styles.label}
              id={bundleSkillsLabelId}
              style={{ marginTop: 8 }}
            >
              Bundle Skills
            </div>
            <div
              className={styles.bundleChips}
              role="group"
              aria-labelledby={bundleSkillsLabelId}
            >
              {bundleSkillNames.map(name => {
                const statusIcon =
                  testStatuses[name] === 'passed'
                    ? '✓'
                    : testStatuses[name] === 'failed'
                      ? '✗'
                      : testStatuses[name] === 'tested'
                        ? '●'
                        : '○';
                const statusClass =
                  testStatuses[name] === 'passed'
                    ? styles.chipPassed
                    : testStatuses[name] === 'failed'
                      ? styles.chipFailed
                      : testStatuses[name] === 'tested'
                        ? styles.chipTested
                        : styles.chipUntested;
                const displayName = name.split(':').pop() || name;
                const st = testStatuses[name] || 'untested';
                return (
                  <button
                    key={name}
                    type="button"
                    className={`${styles.bundleChip} ${selectedSkill === name ? styles.bundleChipActive : ''}`}
                    onClick={() => onSkillChange(name)}
                    aria-label={`${displayName}, test status ${st}. Set as active skill for playground testing`}
                    aria-pressed={selectedSkill === name}
                  >
                    <span className={statusClass} aria-hidden="true">
                      {statusIcon}
                    </span>
                    {displayName}
                  </button>
                );
              })}
            </div>
            <span className={styles.skillHint}>
              Click a skill chip to switch the active context.
            </span>
          </div>
        )}
      </div>

      <div>
        <div className={styles.label} id={agentCapsLabelId}>
          Agent Capabilities
        </div>
        <div
          className={styles.toolList}
          role="list"
          aria-labelledby={agentCapsLabelId}
        >
          {agentCapabilities.map(t => (
            <span key={t} className={styles.toolBadge}>
              {t}
            </span>
          ))}
        </div>
      </div>

      {useCatalog && (
        <div className={styles.catalogInfo}>
          <span className={styles.catalogDot} />
          Catalog: {catalog.pagination.total} skills
        </div>
      )}

      {isBundleMode && bundleSkillNames.length > 0 && (
        <div className={pgStyles.testSummary}>
          <details open>
            <summary>Test Summary</summary>
            <div
              className={pgStyles.testSummaryGrid}
              role="list"
              aria-label="Per-skill test status"
            >
              {bundleSkillNames.map(name => {
                const status = testStatuses[name] || 'untested';
                const dotClass =
                  status === 'passed'
                    ? pgStyles.dot_passed
                    : status === 'failed'
                      ? pgStyles.dot_failed
                      : status === 'tested'
                        ? pgStyles.dot_tested
                        : pgStyles.dot_untested;
                return (
                  <div
                    key={name}
                    className={pgStyles.testSummaryRow}
                    role="listitem"
                  >
                    <span
                      className={`${pgStyles.testDot} ${dotClass}`}
                      aria-hidden
                    />
                    <span className={pgStyles.testSummaryName}>
                      {name.split(':').pop() || name}
                    </span>
                    <span className={pgStyles.testSummaryStatus}>{status}</span>
                  </div>
                );
              })}
            </div>
            {testedCount === bundleSkillNames.length && testedCount > 0 && (
              <div className={pgStyles.testComplete} role="status">
                All skills tested! Bundle is ready for status promotion.
              </div>
            )}
          </details>
        </div>
      )}

      <button
        type="button"
        className={styles.clearBtn}
        onClick={onClear}
        disabled={!hasMessages}
        aria-label="Clear conversation and reset chat session"
      >
        Clear Conversation
      </button>
    </div>
  );
}
