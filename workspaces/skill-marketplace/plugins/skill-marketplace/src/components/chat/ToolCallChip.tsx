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
import { useState, useRef, useEffect, useCallback } from 'react';
import type { ToolCall } from './types';
import { CopyButton } from './CopyButton';
import styles from './ToolCallChip.module.css';

interface ToolCallChipProps {
  tool: ToolCall;
}

export function ToolCallChip({ tool }: ToolCallChipProps) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
      setOpen(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () =>
        document.removeEventListener('mousedown', handleClickOutside);
    }
    return undefined;
  }, [open, handleClickOutside]);

  const isRunning = tool.status === 'running';
  const isError = tool.status === 'error';

  const argsJson = tool.args ? JSON.stringify(tool.args, null, 2) : null;

  return (
    <div className={styles.wrapper} ref={popoverRef}>
      <button
        type="button"
        className={`${styles.chip} ${isRunning ? styles.running : ''} ${isError ? styles.error : ''}`}
        onClick={() => setOpen(prev => !prev)}
        title={`Tool: ${tool.name}`}
        aria-expanded={open}
      >
        {isRunning ? (
          <svg
            className={styles.spinner}
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" />
          </svg>
        ) : (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
        )}
        <span className={styles.chipLabel}>{tool.name}</span>
        {tool.agent && <span className={styles.chipAgent}>{tool.agent}</span>}
        {tool.status === 'complete' && (
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--sm-success)"
            strokeWidth="3"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
        {isError && (
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--sm-danger)"
            strokeWidth="3"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        )}
        {tool.elapsed !== undefined && (
          <span className={styles.chipTime}>{formatElapsed(tool.elapsed)}</span>
        )}
      </button>

      {open && (argsJson || tool.result) && (
        <div className={styles.popover}>
          {argsJson && (
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <span>Arguments</span>
                <CopyButton text={argsJson} />
              </div>
              <pre className={styles.json}>{argsJson}</pre>
            </div>
          )}
          {tool.result && (
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <span>Result</span>
                <CopyButton text={tool.result} />
              </div>
              <pre className={styles.json}>{tool.result}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
