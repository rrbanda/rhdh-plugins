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
import type { SkillData } from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import {
  getComplexity,
  humanize,
} from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';

interface SkillCardProps {
  skill: SkillData;
}

const COMPLEXITY_STYLES: Record<string, { bg: string; fg: string }> = {
  Simple: { bg: '#10b98118', fg: '#059669' },
  Medium: { bg: '#3b82f618', fg: '#2563eb' },
  Complex: { bg: '#f59e0b18', fg: '#d97706' },
  Advanced: { bg: '#ef444418', fg: '#dc2626' },
};

const LIFECYCLE_STYLES: Record<string, { bg: string; fg: string; label: string }> = {
  draft: { bg: '#f59e0b18', fg: '#d97706', label: 'Draft' },
  testing: { bg: '#3b82f618', fg: '#2563eb', label: 'Testing' },
  published: { bg: '#10b98118', fg: '#059669', label: 'Published' },
  deprecated: { bg: '#f9731618', fg: '#ea580c', label: 'Deprecated' },
  archived: { bg: '#6b728018', fg: '#4b5563', label: 'Archived' },
};

export function SkillCard({ skill }: SkillCardProps) {
  const navigate = useNavigate();
  const complexity = getComplexity(skill.rawContent.split('\n').length);
  const pluginColor = skill.plugin.color ?? '#6b7280';
  const cStyles = COMPLEXITY_STYLES[complexity] ?? COMPLEXITY_STYLES.Medium;

  const title =
    skill.sections.title || humanize(skill.name);

  const cleanDescription = skill.description
    .replace(/^Use when (the user asks to |you need to )/i, '')
    .replace(/^[a-z]/, c => c.toUpperCase());

  return (
    <button
      type="button"
      className="sm-card"
      onClick={() => navigate(skill.slug)}
    >
      {/* Left color bar */}
      <span className="sm-card-bar" style={{ backgroundColor: pluginColor }} />

      <div className="sm-card-inner">
        {/* Top row: plugin badge + lifecycle + version */}
        <div className="sm-card-top">
          <span
            className="sm-card-plugin"
            style={{ backgroundColor: pluginColor }}
          >
            {skill.pluginName}
          </span>
          {skill.lifecycleState && (() => {
            const ls = LIFECYCLE_STYLES[skill.lifecycleState] ?? LIFECYCLE_STYLES.draft;
            return (
              <span
                className="sm-card-lifecycle"
                style={{ backgroundColor: ls.bg, color: ls.fg }}
              >
                {ls.label}
              </span>
            );
          })()}
          {skill.version && (
            <span className="sm-card-version">v{skill.version}</span>
          )}
        </div>

        {/* Title */}
        <h3 className="sm-card-title">{title}</h3>

        {/* Description */}
        <p className="sm-card-desc">{cleanDescription}</p>

        {/* Tags */}
        {skill.tags && skill.tags.length > 0 && (
          <div className="sm-card-tags">
            {skill.tags.slice(0, 4).map(t => (
              <span key={t} className="sm-card-tag">{t}</span>
            ))}
            {skill.tags.length > 4 && (
              <span className="sm-card-tag sm-card-tag-more">+{skill.tags.length - 4}</span>
            )}
          </div>
        )}

        {/* Authors */}
        {skill.authors && (
          <span className="sm-card-authors">{skill.authors}</span>
        )}

        {/* Bottom row: complexity + meta + arrow */}
        <div className="sm-card-bottom">
          <div className="sm-card-badges">
            <span
              className="sm-card-complexity"
              style={{ backgroundColor: cStyles.bg, color: cStyles.fg }}
            >
              {complexity}
            </span>

            {skill.sections.workflow.length > 0 && (
              <span className="sm-card-meta-badge">
                <svg width={12} height={12} viewBox="0 0 16 16" fill="currentColor" opacity={0.5}>
                  <path d="M2 2.5A.5.5 0 012.5 2h3a.5.5 0 01.5.5v3a.5.5 0 01-.5.5h-3a.5.5 0 01-.5-.5v-3zm8 0a.5.5 0 01.5-.5h3a.5.5 0 01.5.5v3a.5.5 0 01-.5.5h-3a.5.5 0 01-.5-.5v-3zm-8 8a.5.5 0 01.5-.5h3a.5.5 0 01.5.5v3a.5.5 0 01-.5.5h-3a.5.5 0 01-.5-.5v-3zm8 0a.5.5 0 01.5-.5h3a.5.5 0 01.5.5v3a.5.5 0 01-.5.5h-3a.5.5 0 01-.5-.5v-3z" />
                </svg>
                {skill.sections.workflow.length} steps
              </span>
            )}

            {skill.model && (
              <span className="sm-card-meta-badge">
                <svg width={12} height={12} viewBox="0 0 16 16" fill="currentColor" opacity={0.5}>
                  <path d="M6 12.5a.5.5 0 01.5-.5h3a.5.5 0 010 1h-3a.5.5 0 01-.5-.5zM3 8.06a.5.5 0 01.5-.5h9a.5.5 0 010 1h-9a.5.5 0 01-.5-.5zm-2-4a.5.5 0 01.5-.5h13a.5.5 0 010 1H1.5a.5.5 0 01-.5-.5z" />
                </svg>
                {skill.model}
              </span>
            )}
          </div>

          <span className="sm-card-arrow">→</span>
        </div>
      </div>
    </button>
  );
}
