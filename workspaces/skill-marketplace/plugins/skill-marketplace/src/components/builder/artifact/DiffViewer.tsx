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
import styles from './DiffViewer.module.css';

interface DiffLine {
  type: 'same' | 'added' | 'removed';
  text: string;
  oldLineNo?: number;
  newLineNo?: number;
}

/**
 * Compute a proper line-level diff using the Myers algorithm (LCS-based).
 */
export function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');

  // LCS-based diff
  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0),
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const result: DiffLine[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.unshift({
        type: 'same',
        text: oldLines[i - 1],
        oldLineNo: i,
        newLineNo: j,
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: 'added', text: newLines[j - 1], newLineNo: j });
      j--;
    } else {
      result.unshift({ type: 'removed', text: oldLines[i - 1], oldLineNo: i });
      i--;
    }
  }

  return result;
}

interface DiffViewerProps {
  oldText: string;
  newText: string;
}

export function DiffViewer({ oldText, newText }: DiffViewerProps) {
  const lines = useMemo(
    () => computeDiff(oldText, newText),
    [oldText, newText],
  );
  const stats = useMemo(() => {
    const added = lines.filter(l => l.type === 'added').length;
    const removed = lines.filter(l => l.type === 'removed').length;
    return { added, removed };
  }, [lines]);

  return (
    <div className={styles.bldDiff}>
      <div className={styles.bldDiffStats}>
        <span className={styles.bldDiffStatsAdded}>+{stats.added} added</span>
        <span className={styles.bldDiffStatsRemoved}>
          -{stats.removed} removed
        </span>
      </div>
      <div className={styles.bldDiffHunk}>
        {lines.map((line, idx) => (
          <div
            key={idx}
            className={`${styles.bldDiffLine} ${
              line.type === 'added'
                ? styles.bldDiffLineAdded
                : line.type === 'removed'
                  ? styles.bldDiffLineRemoved
                  : styles.bldDiffLineSame
            }`}
          >
            <span className={styles.bldDiffGutter}>{line.oldLineNo ?? ''}</span>
            <span className={styles.bldDiffGutter}>{line.newLineNo ?? ''}</span>
            <span className={styles.bldDiffMarker}>
              {line.type === 'added'
                ? '+'
                : line.type === 'removed'
                  ? '-'
                  : ' '}
            </span>
            <span className={styles.bldDiffText}>{line.text || '\u00A0'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
