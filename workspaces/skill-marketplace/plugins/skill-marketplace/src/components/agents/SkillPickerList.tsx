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
import React, { useMemo, useState } from 'react';
import styles from './SkillPickerList.module.css';

export interface PickerSkill {
  id: string;
  name: string;
  displayName: string;
  namespace: string;
  status: string;
  description: string;
}

interface SkillPickerListProps {
  skills: PickerSkill[];
  selectedSkillId: string;
  onSelect: (id: string) => void;
}

export default function SkillPickerList({
  skills,
  selectedSkillId,
  onSelect,
}: SkillPickerListProps) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search) return skills;
    const q = search.toLowerCase();
    return skills.filter(
      s =>
        s.displayName.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.namespace.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q),
    );
  }, [skills, search]);

  const grouped = useMemo(() => {
    const groups: Record<string, PickerSkill[]> = {};
    for (const s of filtered) {
      const ns = s.namespace || 'general';
      if (!groups[ns]) groups[ns] = [];
      groups[ns].push(s);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  return (
    <div className={styles.picker}>
      <div className={styles.header}>
        <span className={styles.title}>Skills</span>
        <span className={styles.count}>{skills.length}</span>
      </div>
      <input
        className={styles.search}
        type="text"
        placeholder="Search skills..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        aria-label="Filter skills"
      />
      <div className={styles.list}>
        {grouped.map(([ns, nsSkills]) => (
          <div key={ns} className={styles.group}>
            <span className={styles.groupLabel}>{ns}</span>
            {nsSkills.map(s => (
              <button
                key={s.id}
                type="button"
                className={`${styles.item} ${s.id === selectedSkillId ? styles.itemActive : ''}`}
                onClick={() => onSelect(s.id === selectedSkillId ? '' : s.id)}
                aria-pressed={s.id === selectedSkillId}
              >
                <span className={styles.dot} data-status={s.status} />
                <span className={styles.itemName}>{s.displayName}</span>
              </button>
            ))}
          </div>
        ))}
        {filtered.length === 0 && (
          <p className={styles.empty}>No skills match your search.</p>
        )}
      </div>
    </div>
  );
}
