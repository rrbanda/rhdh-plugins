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
import React, { useState, useMemo } from 'react';
import type { PickerSkill } from './SkillPickerList';
import styles from './SkillContextCard.module.css';

interface SkillContextCardProps {
  skill: PickerSkill | null;
  onSendPrompt: (text: string) => void;
  onDeselect: () => void;
}

function generatePrompts(skill: PickerSkill): string[] {
  const name = skill.displayName;
  return [
    `What does the ${name} skill do?`,
    `Show me an example of using ${name}`,
    `When should I use ${name} versus alternatives?`,
  ];
}

export default function SkillContextCard({
  skill,
  onSendPrompt,
  onDeselect,
}: SkillContextCardProps) {
  const [collapsed, setCollapsed] = useState(false);
  const prompts = useMemo(() => (skill ? generatePrompts(skill) : []), [skill]);

  if (!skill) {
    return (
      <div className={styles.empty}>
        <svg
          viewBox="0 0 24 24"
          width={20}
          height={20}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          aria-hidden
        >
          <path
            d="M9.663 17h4.674M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span>Select a skill from the list to begin testing</span>
      </div>
    );
  }

  if (collapsed) {
    return (
      <div className={styles.collapsed}>
        <span className={styles.activeBadge}>
          Testing: <strong>{skill.displayName}</strong>
        </span>
        <button
          type="button"
          className={styles.expandBtn}
          onClick={() => setCollapsed(false)}
          aria-label="Expand skill details"
        >
          Details
        </button>
        <button
          type="button"
          className={styles.deselectBtn}
          onClick={onDeselect}
          aria-label="Deselect skill"
        >
          &times;
        </button>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardTitle}>
          <h3 className={styles.name}>{skill.displayName}</h3>
          <span className={styles.nsBadge}>{skill.namespace}</span>
          <span
            className={`${styles.statusBadge} ${styles[`status_${skill.status}`]}`}
          >
            {skill.status}
          </span>
        </div>
        <div className={styles.cardActions}>
          <button
            type="button"
            className={styles.collapseBtn}
            onClick={() => setCollapsed(true)}
            aria-label="Collapse skill details"
          >
            Collapse
          </button>
          <button
            type="button"
            className={styles.deselectBtn}
            onClick={onDeselect}
            aria-label="Deselect skill"
          >
            &times;
          </button>
        </div>
      </div>
      <p className={styles.desc}>{skill.description}</p>
      <div className={styles.prompts}>
        <span className={styles.promptsLabel}>Try testing with:</span>
        <div className={styles.promptChips}>
          {prompts.map((p, i) => (
            <button
              key={i}
              type="button"
              className={styles.promptChip}
              onClick={() => onSendPrompt(p)}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
