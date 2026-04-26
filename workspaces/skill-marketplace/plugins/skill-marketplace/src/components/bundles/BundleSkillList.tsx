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
import { useId, useState } from 'react';
import type { ResolvedDependencyTree } from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import type { BundleSkill } from '../../hooks';
import AddToBundleButton from '../shared/AddToBundleButton';
import styles from './BundleCart.module.css';
import treeStyles from './BundleDependencyTree.module.css';

export type DepsByParent = Record<
  string,
  ResolvedDependencyTree['dependencies']
>;

export type BundleSkillListProps = {
  skills: BundleSkill[];
  onRemoveSkill: (name: string) => void;
  onReorderSkill: (slug: string, direction: 'up' | 'down') => void;
  depsByParent: DepsByParent;
};

function shortName(n: string) {
  return n.split(':').pop() || n;
}

type ExpandableSkillBranchProps = {
  skill: BundleSkill;
  childDeps: ResolvedDependencyTree['dependencies'];
  index: number;
  skills: BundleSkill[];
  display: string;
  onRemoveSkill: (name: string) => void;
  onReorderSkill: (slug: string, direction: 'up' | 'down') => void;
};

function ExpandableSkillBranch({
  skill,
  childDeps,
  index,
  skills,
  display,
  onRemoveSkill,
  onReorderSkill,
}: ExpandableSkillBranchProps) {
  const [open, setOpen] = useState(true);
  const depsHeadingId = useId();

  return (
    <div
      className={treeStyles.branch}
      role="treeitem"
      aria-selected={false}
      aria-level={1}
      aria-label={display}
      aria-expanded={open}
    >
      <details
        className={treeStyles.details}
        open={open}
        onToggle={e => {
          setOpen(e.currentTarget.open);
        }}
      >
        <summary
          className={treeStyles.summary}
          aria-label={`${display}, ${childDeps.length} dependenc${childDeps.length === 1 ? 'y' : 'ies'}`}
        >
          <span className={treeStyles.chevron} aria-hidden>
            {open ? '▾' : '▸'}
          </span>
          <div className={styles.skillInfo}>
            <span className={styles.skillCategory}>{skill.category}</span>
            <span className={styles.skillName}>{display}</span>
          </div>
          <div className={styles.rowActions}>
            <div
              className={styles.reorderGroup}
              role="group"
              aria-label={`Reorder ${display}`}
            >
              <button
                type="button"
                className={styles.reorderBtn}
                onClick={e => {
                  e.stopPropagation();
                  e.preventDefault();
                  onReorderSkill(skill.slug, 'up');
                }}
                disabled={index === 0}
                aria-label={`Move ${display} up`}
              >
                ▲
              </button>
              <button
                type="button"
                className={styles.reorderBtn}
                onClick={e => {
                  e.stopPropagation();
                  e.preventDefault();
                  onReorderSkill(skill.slug, 'down');
                }}
                disabled={index === skills.length - 1}
                aria-label={`Move ${display} down`}
              >
                ▼
              </button>
            </div>
            <button
              type="button"
              className={styles.removeButton}
              onClick={e => {
                e.stopPropagation();
                e.preventDefault();
                onRemoveSkill(skill.name);
              }}
              title="Remove"
              aria-label={`Remove ${display} from bundle`}
            >
              &times;
            </button>
          </div>
        </summary>
        <div
          className={treeStyles.nested}
          role="group"
          aria-labelledby={depsHeadingId}
        >
          <div className={treeStyles.depsGroupLabel} id={depsHeadingId}>
            Dependencies
          </div>
          {childDeps.map(dep => {
            const depDisplay = shortName(dep.name);
            return (
              <div
                key={`${dep.name}-${dep.dependencyOf}`}
                className={treeStyles.depItem}
                role="treeitem"
                aria-selected={false}
                aria-level={2}
              >
                <div className={styles.skillInfo}>
                  <span
                    className={`${styles.skillCategory} ${styles.depCategory}`}
                  >
                    {dep.category || 'dep'}
                  </span>
                  <span className={`${styles.skillName} ${styles.depName}`}>
                    {depDisplay}
                  </span>
                </div>
                <AddToBundleButton
                  skill={{
                    name: dep.name,
                    slug: `${dep.category || 'dep'}-${dep.name.replace(/[:/\\s]+/g, '-')}`,
                    category: dep.category,
                    description: dep.description,
                  }}
                  variant="icon"
                />
              </div>
            );
          })}
        </div>
      </details>
    </div>
  );
}

export function BundleSkillList({
  skills,
  onRemoveSkill,
  onReorderSkill,
  depsByParent,
}: BundleSkillListProps) {
  return (
    <>
      <div className={styles.sectionLabel}>Selected Skills</div>
      <div
        className={treeStyles.tree}
        role="tree"
        aria-label="Selected skills and resolved dependencies for each skill"
      >
        {skills.map((skill, index) => {
          const childDeps = depsByParent[skill.name] ?? [];
          const hasDeps = childDeps.length > 0;
          const display = shortName(skill.name);
          if (hasDeps) {
            return (
              <ExpandableSkillBranch
                key={skill.slug}
                skill={skill}
                childDeps={childDeps}
                index={index}
                skills={skills}
                display={display}
                onRemoveSkill={onRemoveSkill}
                onReorderSkill={onReorderSkill}
              />
            );
          }
          return (
            <div
              key={skill.slug}
              className={treeStyles.branch}
              role="treeitem"
              aria-selected={false}
              aria-level={1}
              aria-label={display}
            >
              <div className={treeStyles.treeRowFlat} role="presentation">
                <span className={treeStyles.chevronSpacer} aria-hidden />
                <div className={styles.skillInfo}>
                  <span className={styles.skillCategory}>{skill.category}</span>
                  <span className={styles.skillName}>{display}</span>
                </div>
                <div className={styles.rowActions}>
                  <div
                    className={styles.reorderGroup}
                    role="group"
                    aria-label={`Reorder ${display}`}
                  >
                    <button
                      type="button"
                      className={styles.reorderBtn}
                      onClick={() => onReorderSkill(skill.slug, 'up')}
                      disabled={index === 0}
                      aria-label={`Move ${display} up`}
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      className={styles.reorderBtn}
                      onClick={() => onReorderSkill(skill.slug, 'down')}
                      disabled={index === skills.length - 1}
                      aria-label={`Move ${display} down`}
                    >
                      ▼
                    </button>
                  </div>
                  <button
                    type="button"
                    className={styles.removeButton}
                    onClick={() => onRemoveSkill(skill.name)}
                    title="Remove"
                    aria-label={`Remove ${display} from bundle`}
                  >
                    &times;
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
