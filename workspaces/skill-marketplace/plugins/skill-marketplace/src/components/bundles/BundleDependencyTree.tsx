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
import { useMemo } from 'react';
import type { ResolvedDependencyTree } from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import type { BundleSkill } from '../../hooks';
import AddToBundleButton from '../shared/AddToBundleButton';
import { BundleSkillList, type DepsByParent } from './BundleSkillList';
import styles from './BundleCart.module.css';
import treeStyles from './BundleDependencyTree.module.css';

function shortName(n: string) {
  return n.split(':').pop() || n;
}

function buildDepsByParent(
  dependencies: ResolvedDependencyTree['dependencies'],
): DepsByParent {
  const acc: DepsByParent = {};
  for (const d of dependencies) {
    if (!acc[d.dependencyOf]) {
      acc[d.dependencyOf] = [];
    }
    acc[d.dependencyOf]!.push(d);
  }
  return acc;
}

export type BundleDependencyTreeProps = {
  skills: BundleSkill[];
  onRemoveSkill: (name: string) => void;
  onReorderSkill: (slug: string, direction: 'up' | 'down') => void;
  resolved: ResolvedDependencyTree | null;
  resolving: boolean;
  resolveError: string | null;
};

export function BundleDependencyTree({
  skills,
  onRemoveSkill,
  onReorderSkill,
  resolved,
  resolving,
  resolveError,
}: BundleDependencyTreeProps) {
  const depsByParent = useMemo(
    () =>
      resolved
        ? buildDepsByParent(resolved.dependencies)
        : ({} as DepsByParent),
    [resolved],
  );

  if (skills.length === 0) {
    return (
      <div className={styles.body}>
        <div className={styles.empty}>
          <p>Your bundle is empty.</p>
          <p className={styles.emptyHint}>
            Click &quot;Add to Bundle&quot; on any skill, or use the AI Advisor
            above.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.body}>
      <BundleSkillList
        skills={skills}
        onRemoveSkill={onRemoveSkill}
        onReorderSkill={onReorderSkill}
        depsByParent={depsByParent}
      />

      {resolving && (
        <div
          className={treeStyles.skeletonContainer}
          aria-busy="true"
          aria-label="Loading dependencies"
        >
          <div className={treeStyles.skeletonHeader} />
          <div className={treeStyles.skeletonRow} />
          <div className={treeStyles.skeletonRow} />
          <div className={treeStyles.skeletonRow} style={{ width: '60%' }} />
          <div className={treeStyles.skeletonHeader} />
          <div className={treeStyles.skeletonRow} />
          <div className={treeStyles.skeletonRow} style={{ width: '80%' }} />
        </div>
      )}

      {resolveError && !resolving && (
        <div className={styles.resolveError}>
          <svg
            viewBox="0 0 24 24"
            width={14}
            height={14}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4" />
            <path d="M12 16h.01" />
          </svg>
          {resolveError}
        </div>
      )}

      {resolved && resolved.tools.length > 0 && (
        <>
          <div className={styles.sectionLabel} role="presentation">
            Tools Required
            <span className={styles.badge}>{resolved.tools.length}</span>
          </div>
          <div
            className={`${treeStyles.tree} ${treeStyles.treeIndent}`}
            role="tree"
            aria-label="Tool requirements for this bundle"
          >
            {resolved.tools.map(tool => (
              <div
                key={tool.name}
                className={treeStyles.toolBranch}
                role="treeitem"
                aria-selected={false}
                aria-level={1}
                aria-label={tool.name}
              >
                <div className={treeStyles.toolLeaf} title={tool.description}>
                  {tool.name}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {resolved && resolved.similar.length > 0 && (
        <>
          <div className={styles.sectionLabel} role="presentation">
            You Might Also Consider
          </div>
          <div
            className={`${treeStyles.tree} ${treeStyles.treeIndent}`}
            role="tree"
            aria-label="Similar skills you might add to this bundle"
          >
            {resolved.similar.slice(0, 5).map(sim => {
              const n = sim.name.split(':').pop() || sim.name;
              const similarTo = shortName(sim.similarTo);
              return (
                <div
                  key={sim.name}
                  className={treeStyles.toolBranch}
                  role="treeitem"
                  aria-selected={false}
                  aria-level={1}
                  aria-label={`${n} similar to ${similarTo}`}
                >
                  <div className={treeStyles.simLeaf}>
                    <div className={styles.skillInfo}>
                      <span
                        className={`${styles.skillCategory} ${styles.skillCategoryLink}`}
                      >
                        {sim.category || 'similar'}
                      </span>
                      <span className={treeStyles.similarName}>{n}</span>
                    </div>
                    <span className={treeStyles.similarMeta}>
                      (similar to {similarTo})
                    </span>
                    <AddToBundleButton
                      skill={{
                        name: sim.name,
                        slug: `${sim.category}-${sim.name}`,
                        category: sim.category,
                        description: sim.description,
                      }}
                      variant="icon"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
