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
import styles from './GraphFocusOverlay.module.css';

export interface GraphFocusOverlayProps {
  focusQuery: string | null;
  nodeCount: number;
  relCount: number;
  onClear: () => void;
  /** When the relationship legend strip is visible, lower this bar so it does not cover it. */
  offsetForLegend?: boolean;
}

export function GraphFocusOverlay({
  focusQuery,
  nodeCount,
  relCount,
  onClear,
  offsetForLegend,
}: GraphFocusOverlayProps) {
  return (
    <div
      className={`${styles.focusOverlay} ${
        offsetForLegend ? styles.focusOverlayWithLegend : ''
      }`}
      role="status"
      aria-live="polite"
    >
      <span className={styles.focusQueryLine}>
        Showing results for:{' '}
        <q className={styles.focusQueryText}>
          {focusQuery && focusQuery.trim() ? focusQuery : '—'}
        </q>
      </span>
      <span
        className={styles.focusStats}
        aria-label={`${nodeCount} nodes, ${relCount} relationships`}
      >
        {nodeCount} nodes, {relCount} rels
      </span>
      <button
        type="button"
        className={styles.focusClear}
        onClick={onClear}
        aria-label="Clear graph focus and show the full knowledge graph"
      >
        Clear
      </button>
    </div>
  );
}
