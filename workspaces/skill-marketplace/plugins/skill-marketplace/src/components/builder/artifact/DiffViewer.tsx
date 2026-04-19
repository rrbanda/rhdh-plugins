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

const diffStyles = `
.bld-diff {
  font-family: var(--pf-t--global--font--family--mono, 'Red Hat Mono', monospace);
  font-size: 13px;
  line-height: 1.6;
  overflow-x: auto;
}
.bld-diff-hunk {
  padding: 4px 0;
}
.bld-diff-line {
  display: flex;
  min-height: 22px;
}
.bld-diff-gutter {
  width: 36px;
  min-width: 36px;
  text-align: right;
  padding: 0 6px 0 0;
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
  user-select: none;
  font-size: 12px;
}
.bld-diff-marker {
  width: 20px;
  min-width: 20px;
  text-align: center;
  font-weight: 600;
  user-select: none;
}
.bld-diff-text {
  flex: 1;
  white-space: pre-wrap;
  word-break: break-word;
  padding-right: 16px;
}
.bld-diff-line--added {
  background: var(--pf-t--global--color--status--success--default, #3e8635)1a;
}
.bld-diff-line--added .bld-diff-marker { color: var(--pf-t--global--color--status--success--default, #3e8635); }
.bld-diff-line--removed {
  background: var(--pf-t--global--color--status--danger--default, #c9190b)1a;
}
.bld-diff-line--removed .bld-diff-marker { color: var(--pf-t--global--color--status--danger--default, #c9190b); }
.bld-diff-line--same .bld-diff-marker { color: transparent; }
.bld-diff-stats {
  display: flex;
  gap: 12px;
  padding: 8px 16px;
  font-size: 12px;
  border-bottom: 1px solid var(--pf-t--global--border--color--default, #e8e8e8);
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
}
.bld-diff-stats-added { color: var(--pf-t--global--color--status--success--default, #3e8635); }
.bld-diff-stats-removed { color: var(--pf-t--global--color--status--danger--default, #c9190b); }
`;

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
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

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
      result.unshift({ type: 'same', text: oldLines[i - 1], oldLineNo: i, newLineNo: j });
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
  const lines = useMemo(() => computeDiff(oldText, newText), [oldText, newText]);
  const stats = useMemo(() => {
    const added = lines.filter(l => l.type === 'added').length;
    const removed = lines.filter(l => l.type === 'removed').length;
    return { added, removed };
  }, [lines]);

  return (
    <>
      <style>{diffStyles}</style>
      <div className="bld-diff">
        <div className="bld-diff-stats">
          <span className="bld-diff-stats-added">+{stats.added} added</span>
          <span className="bld-diff-stats-removed">-{stats.removed} removed</span>
        </div>
        <div className="bld-diff-hunk">
          {lines.map((line, idx) => (
            <div key={idx} className={`bld-diff-line bld-diff-line--${line.type}`}>
              <span className="bld-diff-gutter">{line.oldLineNo ?? ''}</span>
              <span className="bld-diff-gutter">{line.newLineNo ?? ''}</span>
              <span className="bld-diff-marker">
                {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
              </span>
              <span className="bld-diff-text">{line.text || '\u00A0'}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
