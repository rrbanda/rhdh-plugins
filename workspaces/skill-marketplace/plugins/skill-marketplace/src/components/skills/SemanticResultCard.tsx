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
  GraphRAGSkill,
  SkillData,
} from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import { getPluginColor } from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import AddToBundleButton from '../shared/AddToBundleButton';
import styles from './SkillsPage.module.css';

const MATCH_LABELS: Record<string, string> = {
  semantic: 'AI',
  fulltext: 'Text',
  graph: 'Graph',
};
const MATCH_STYLES: Record<string, string> = {
  semantic: styles.ssMatchSemantic,
  fulltext: styles.ssMatchFulltext,
  graph: styles.ssMatchGraph,
};

function hitToSkillData(hit: GraphRAGSkill): SkillData {
  const cat = hit.skill.category || hit.domain || 'general';
  return {
    slug: `${cat}-${hit.skill.name}`,
    pluginName: cat,
    skillName: hit.skill.name,
    name: hit.skill.name,
    description: hit.skill.description || '',
    version: hit.skill.version,
    body: hit.skill.description || '',
    rawContent: '',
    sections: { title: hit.skill.name, workflow: [], relatedSkills: [] },
    assets: { references: [], templates: [], examples: [] },
    plugin: {
      name: cat,
      source: hit.skill.ociReference || '',
      description: `${cat} skills`,
      version: hit.skill.version || '1.0.0',
      tags: hit.tools || [],
      icon: 'cube',
      color: getPluginColor(cat),
    },
    gitPath: hit.skill.ociReference || '',
    authors: hit.skill.author,
  };
}

export function SemanticResultCard({
  hit,
  onOpenDetail,
}: {
  hit: GraphRAGSkill;
  onOpenDetail?: (skill: SkillData) => void;
}) {
  const scorePercent = Math.round(hit.score * 100);
  const matchBadge = MATCH_LABELS[hit.matchType] ?? hit.matchType;
  const badgeClass = MATCH_STYLES[hit.matchType] ?? styles.ssMatchBadge;

  const handleClick = onOpenDetail
    ? () => onOpenDetail(hitToSkillData(hit))
    : undefined;

  return (
    <div
      className={styles.ssResult}
      onClick={handleClick}
      onKeyDown={
        handleClick
          ? e => {
              if (e.key === 'Enter' || e.key === ' ') handleClick();
            }
          : undefined
      }
      role={handleClick ? 'button' : undefined}
      tabIndex={handleClick ? 0 : undefined}
      aria-label={
        handleClick ? `View details for ${hit.skill.name}` : undefined
      }
      style={handleClick ? { cursor: 'pointer' } : undefined}
    >
      <div className={styles.ssResultHeader}>
        <span className={styles.ssResultCategory}>
          {hit.domain || hit.skill.category}
        </span>
        <span className={badgeClass}>{matchBadge}</span>
        <span className={styles.ssScore}>{scorePercent}%</span>
      </div>
      <h4 className={styles.ssResultName}>{hit.skill.name}</h4>
      {hit.skill.description && (
        <p className={styles.ssResultDesc}>
          {hit.skill.description.slice(0, 180)}
        </p>
      )}
      <div className={styles.ssResultReason}>{hit.reason}</div>
      <div className={styles.ssResultFooter}>
        {hit.tools.length > 0 && (
          <div className={styles.ssResultTools}>
            {hit.tools.slice(0, 4).map(t => (
              <span key={t} className={styles.ssToolChip}>
                {t}
              </span>
            ))}
            {hit.tools.length > 4 && (
              <span className={`${styles.ssToolChip} ${styles.ssToolMore}`}>
                +{hit.tools.length - 4}
              </span>
            )}
          </div>
        )}
        <AddToBundleButton
          skill={{
            name: hit.skill.name,
            slug: `${hit.skill.category}-${hit.skill.name}`,
            category: hit.skill.category || hit.domain,
            description: hit.skill.description,
          }}
          variant="full"
        />
      </div>
    </div>
  );
}
