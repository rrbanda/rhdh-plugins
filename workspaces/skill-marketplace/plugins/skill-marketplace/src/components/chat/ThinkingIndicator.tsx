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
import styles from './ThinkingIndicator.module.css';

interface ThinkingIndicatorProps {
  agentName?: string;
}

function formatAgent(name: string): string {
  return name.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function ThinkingIndicator({ agentName }: ThinkingIndicatorProps) {
  const label = agentName ? formatAgent(agentName) : 'Agent';
  return (
    <div
      className={styles.thinking}
      role="status"
      aria-label={`${label} is thinking`}
    >
      <span className={styles.avatar}>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41" />
        </svg>
      </span>
      <div className={styles.content}>
        <span className={styles.label}>{label}</span>
        <div className={styles.bar}>
          <div className={styles.barFill} />
        </div>
      </div>
      <span className={styles.dots}>
        <span />
        <span />
        <span />
      </span>
    </div>
  );
}
