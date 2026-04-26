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
import { NODE_TYPE_COLORS, REL_COLORS, REL_TIPS } from './graphConstants';
import styles from './GraphPage.module.css';

export function GraphLegendBar({
  schemaLabels,
  enabledLabels,
  onToggleLabel,
  relationshipTypes,
}: {
  schemaLabels: { name: string; color: string; count: number }[];
  enabledLabels: Set<string>;
  onToggleLabel: (label: string) => void;
  relationshipTypes: { type: string; count: number }[];
}) {
  return (
    <div className={styles.legendBar}>
      <div className={styles.legendSection}>
        {schemaLabels.map(label => {
          const typeColor = NODE_TYPE_COLORS[label.name] ?? label.color;
          return (
            <button
              key={label.name}
              type="button"
              onClick={() => onToggleLabel(label.name)}
              className={styles.labelChip}
              style={{
                backgroundColor: enabledLabels.has(label.name)
                  ? `${typeColor}20`
                  : 'var(--chip-bg-off)',
                color: enabledLabels.has(label.name)
                  ? typeColor
                  : 'var(--text-muted)',
                borderColor: enabledLabels.has(label.name)
                  ? `${typeColor}40`
                  : 'var(--border)',
                opacity: enabledLabels.has(label.name) ? 1 : 0.4,
              }}
            >
              <span
                className={styles.labelDot}
                style={{ backgroundColor: typeColor }}
              />
              {label.name}
              <span className={styles.labelCount}>({label.count})</span>
            </button>
          );
        })}
      </div>

      {relationshipTypes.length > 0 && (
        <>
          <span className={styles.legendDivider} aria-hidden />
          <div className={styles.legendSection}>
            <span className={styles.legendSectionTitle}>Edges</span>
            {relationshipTypes.map(({ type, count }) => {
              const c = REL_COLORS[type] ?? '#475569';
              return (
                <span
                  key={type}
                  className={styles.relLegendItem}
                  title={REL_TIPS[type] ?? ''}
                >
                  <span
                    className={styles.relLegendLine}
                    style={{ backgroundColor: c }}
                  />
                  {type.replace(/_/g, ' ').toLowerCase()}
                  <span className={styles.relLegendCount}>({count})</span>
                </span>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
