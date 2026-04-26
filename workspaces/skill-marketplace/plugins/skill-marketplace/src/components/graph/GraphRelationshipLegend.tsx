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
import { REL_COLORS, REL_TIPS } from './graphConstants';
import styles from './GraphPage.module.css';

export function GraphRelationshipLegend({
  relationshipTypes,
}: {
  relationshipTypes: { type: string; count: number }[];
}) {
  return (
    <div className={styles.relLegend}>
      <span className={styles.relLegendTitle}>Edges</span>
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
  );
}
