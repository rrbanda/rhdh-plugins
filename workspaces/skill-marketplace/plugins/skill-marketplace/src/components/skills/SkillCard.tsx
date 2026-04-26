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
import { useNavigate } from 'react-router-dom';
import type {
  SkillData,
  ComplexityLevel,
} from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import { humanize } from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import AddToBundleButton from '../shared/AddToBundleButton';
import styles from './SkillCard.module.css';

interface SkillCardProps {
  skill: SkillData;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (slug: string) => void;
  /** When set (and not in selection mode), opens the callback instead of navigating to the full skill page. */
  onOpenDetail?: (skill: SkillData) => void;
}

const COMPLEXITY_STYLES: Record<string, { bg: string; fg: string }> = {
  Simple: { bg: 'rgba(16,185,129,0.09)', fg: '#059669' },
  Medium: { bg: 'rgba(59,130,246,0.09)', fg: '#2563eb' },
  Complex: { bg: 'rgba(245,158,11,0.09)', fg: '#d97706' },
  Advanced: { bg: 'rgba(239,68,68,0.09)', fg: '#dc2626' },
};

const LIFECYCLE_STYLES: Record<
  string,
  { bg: string; fg: string; label: string }
> = {
  draft: { bg: 'rgba(245,158,11,0.09)', fg: '#d97706', label: 'Draft' },
  testing: { bg: 'rgba(59,130,246,0.09)', fg: '#2563eb', label: 'Testing' },
  published: { bg: 'rgba(16,185,129,0.09)', fg: '#059669', label: 'Published' },
  deprecated: {
    bg: 'rgba(249,115,22,0.09)',
    fg: '#ea580c',
    label: 'Deprecated',
  },
  archived: { bg: 'rgba(107,114,128,0.09)', fg: '#4b5563', label: 'Archived' },
};

function estimateComplexity(skill: SkillData): ComplexityLevel {
  const tagCount = skill.tags?.length ?? 0;
  const hasWorkflow = skill.sections.workflow.length > 0;
  const descLen = skill.description.length;
  if (hasWorkflow || tagCount > 4 || descLen > 300) return 'Advanced';
  if (tagCount > 2 || descLen > 150) return 'Complex';
  if (descLen > 60) return 'Medium';
  return 'Simple';
}

export function SkillCard({
  skill,
  selectionMode = false,
  selected = false,
  onToggleSelect,
  onOpenDetail,
}: SkillCardProps) {
  const navigate = useNavigate();
  const complexity = estimateComplexity(skill);
  const pluginColor = skill.plugin.color ?? '#6b7280';
  const cStyles = COMPLEXITY_STYLES[complexity] ?? COMPLEXITY_STYLES.Medium;

  const title = skill.sections.title || humanize(skill.name);

  const cleanDescription = skill.description
    .replace(/^Use when (the user asks to |you need to )/i, '')
    .replace(/^[a-z]/, c => c.toUpperCase());

  const handleClick = () => {
    if (selectionMode && onToggleSelect) {
      onToggleSelect(skill.slug);
    } else if (onOpenDetail) {
      onOpenDetail(skill);
    } else {
      navigate(skill.slug);
    }
  };

  return (
    <div
      role={selectionMode ? 'checkbox' : 'link'}
      aria-checked={selectionMode ? selected : undefined}
      tabIndex={0}
      className={`${styles.smCard} ${selectionMode && selected ? styles.smCardSelected : ''}`}
      onClick={handleClick}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      aria-label={
        selectionMode
          ? `${selected ? 'Deselect' : 'Select'} skill ${title}`
          : `Open skill ${title}`
      }
    >
      {/* Left color bar */}
      <span
        className={styles.smCardBar}
        style={{ backgroundColor: pluginColor }}
      />

      <div className={styles.smCardInner}>
        {/* Top row: plugin badge + lifecycle + version */}
        <div className={styles.smCardTop}>
          <span
            className={styles.smCardPlugin}
            style={{ backgroundColor: pluginColor }}
          >
            {skill.pluginName}
          </span>
          {skill.lifecycleState &&
            (() => {
              const ls =
                LIFECYCLE_STYLES[skill.lifecycleState] ??
                LIFECYCLE_STYLES.draft;
              return (
                <span
                  className={styles.smCardLifecycle}
                  style={{ backgroundColor: ls.bg, color: ls.fg }}
                >
                  {ls.label}
                </span>
              );
            })()}
          {skill.version && (
            <span className={styles.smCardVersion}>v{skill.version}</span>
          )}
          {skill.bundle && (
            <span
              className={styles.smCardLifecycle}
              style={{
                backgroundColor: 'rgba(139,92,246,0.09)',
                color: '#7c3aed',
              }}
            >
              Skill Bundle
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className={styles.smCardTitle}>{title}</h3>

        {/* Description */}
        <p className={styles.smCardDesc}>{cleanDescription}</p>

        {/* Tags */}
        {skill.tags && skill.tags.length > 0 && (
          <div className={styles.smCardTags}>
            {skill.tags.slice(0, 4).map(t => (
              <span key={t} className={styles.smCardTag}>
                {t}
              </span>
            ))}
            {skill.tags.length > 4 && (
              <span className={`${styles.smCardTag} ${styles.smCardTagMore}`}>
                +{skill.tags.length - 4}
              </span>
            )}
          </div>
        )}

        {/* Authors */}
        {skill.authors && (
          <span className={styles.smCardAuthors}>{skill.authors}</span>
        )}

        {/* Bottom row: complexity + meta + arrow */}
        <div className={styles.smCardBottom}>
          <div className={styles.smCardBadges}>
            <span
              className={styles.smCardComplexity}
              style={{ backgroundColor: cStyles.bg, color: cStyles.fg }}
            >
              {complexity}
            </span>

            {skill.sections.workflow.length > 0 && (
              <span className={styles.smCardMetaBadge}>
                <svg
                  width={12}
                  height={12}
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  opacity={0.5}
                >
                  <path d="M2 2.5A.5.5 0 012.5 2h3a.5.5 0 01.5.5v3a.5.5 0 01-.5.5h-3a.5.5 0 01-.5-.5v-3zm8 0a.5.5 0 01.5-.5h3a.5.5 0 01.5.5v3a.5.5 0 01-.5.5h-3a.5.5 0 01-.5-.5v-3zm-8 8a.5.5 0 01.5-.5h3a.5.5 0 01.5.5v3a.5.5 0 01-.5.5h-3a.5.5 0 01-.5-.5v-3zm8 0a.5.5 0 01.5-.5h3a.5.5 0 01.5.5v3a.5.5 0 01-.5.5h-3a.5.5 0 01-.5-.5v-3z" />
                </svg>
                {skill.sections.workflow.length} steps
              </span>
            )}

            {(skill.model || skill.compatibility) && (
              <span className={styles.smCardMetaBadge}>
                <svg
                  width={12}
                  height={12}
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  opacity={0.5}
                >
                  <path d="M6 12.5a.5.5 0 01.5-.5h3a.5.5 0 010 1h-3a.5.5 0 01-.5-.5zM3 8.06a.5.5 0 01.5-.5h9a.5.5 0 010 1h-9a.5.5 0 01-.5-.5zm-2-4a.5.5 0 01.5-.5h13a.5.5 0 010 1H1.5a.5.5 0 01-.5-.5z" />
                </svg>
                {skill.compatibility || skill.model}
              </span>
            )}

            {typeof skill.wordCount === 'number' && skill.wordCount > 0 && (
              <span className={styles.smCardMetaBadge}>
                <svg
                  width={12}
                  height={12}
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  opacity={0.5}
                >
                  <path d="M2 2a2 2 0 012-2h8a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V2zm2-1a1 1 0 00-1 1v12a1 1 0 001 1h8a1 1 0 001-1V2a1 1 0 00-1-1H4z" />
                  <path d="M5 4h6v1H5V4zm0 3h6v1H5V7zm0 3h4v1H5v-1z" />
                </svg>
                {skill.wordCount} words
              </span>
            )}

            {skill.license && (
              <span className={styles.smCardMetaBadge}>
                <svg
                  width={12}
                  height={12}
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  opacity={0.5}
                >
                  <path d="M8 0a8 8 0 100 16A8 8 0 008 0zM2.04 4.326c.325 1.329 2.532 2.54 3.717 3.19.48.263.793.434.743.484-.08.08-.162.158-.242.234-.416.396-.787.749-.758 1.266.035.634.618.824 1.214 1.017.577.188 1.168.38 1.286.983.082.417-.075.988-.22 1.52-.215.782-.406 1.48.22 1.48 1.5-.5 3.798-2.186 4.628-4.5H12c0-1-.876-1.573-1.543-1.573-.332 0-.665.14-.97.485-.577.653-1.24.453-1.57.205-.27-.206-.293-.555-.273-.793l.002-.023c.037-.38-.254-.94-.508-1.126-.065-.047-.237-.128-.474-.21.135-.66.402-1.294.779-1.853a7.015 7.015 0 011.105-1.286 6.963 6.963 0 013.452.135A7.96 7.96 0 008 1a7.96 7.96 0 00-5.96 3.326z" />
                </svg>
                {skill.license}
              </span>
            )}

            {skill.created && (
              <span className={styles.smCardMetaBadge}>
                {new Date(skill.created).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            )}
          </div>

          {selectionMode ? (
            <span
              className={`${styles.smCardCheckbox} ${selected ? styles.smCardCheckboxChecked : ''}`}
            >
              {selected && (
                <svg
                  viewBox="0 0 16 16"
                  width={12}
                  height={12}
                  fill="currentColor"
                >
                  <path d="M13.485 1.929a1 1 0 010 1.414l-7.071 7.071a1 1 0 01-1.414 0L1.929 7.343a1 1 0 111.414-1.414L5.707 8.293l6.364-6.364a1 1 0 011.414 0z" />
                </svg>
              )}
            </span>
          ) : (
            <AddToBundleButton
              skill={{
                name: skill.skillName,
                slug: skill.slug,
                category: skill.pluginName,
                description: skill.description,
              }}
              variant="icon"
            />
          )}
          {!selectionMode && <span className={styles.smCardArrow}>→</span>}
        </div>
      </div>
    </div>
  );
}
