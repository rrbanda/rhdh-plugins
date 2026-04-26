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
import type { Dispatch, SetStateAction } from 'react';
import styles from './BundleCart.module.css';

type Panel = 'none' | 'advisor' | 'validator';

export type BundleCartAiBarProps = {
  activePanel: Panel;
  setActivePanel: Dispatch<SetStateAction<Panel>>;
  aiUnavailable: boolean;
  skillCount: number;
  onTestInPlayground: () => void;
};

export function BundleCartAiBar({
  activePanel,
  setActivePanel,
  aiUnavailable,
  skillCount,
  onTestInPlayground,
}: BundleCartAiBarProps) {
  return (
    <div className={styles.aiBar}>
      <button
        type="button"
        className={`${styles.aiTab} ${activePanel === 'advisor' ? styles.aiTabActive : ''}`}
        onClick={() =>
          setActivePanel(activePanel === 'advisor' ? 'none' : 'advisor')
        }
        disabled={aiUnavailable}
        aria-pressed={activePanel === 'advisor'}
        title={
          aiUnavailable
            ? 'AI Advisor requires agentic backend configuration'
            : 'Get AI skill recommendations'
        }
        aria-label={
          aiUnavailable ? 'AI Advisor unavailable' : 'Toggle AI Advisor panel'
        }
      >
        <svg
          viewBox="0 0 24 24"
          width={14}
          height={14}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          <path d="M12 2a4 4 0 014 4c0 1.95-1.4 3.58-3.25 3.93L12 10l-.75-.07A4.001 4.001 0 0112 2z" />
          <path d="M12 10v4" />
          <path d="M8 18h8" />
          <path d="M7 22h10" />
        </svg>
        AI Advisor
      </button>
      <button
        type="button"
        className={`${styles.aiTab} ${activePanel === 'validator' ? styles.aiTabActive : ''}`}
        onClick={() => {
          setActivePanel(activePanel === 'validator' ? 'none' : 'validator');
        }}
        disabled={skillCount < 2 || aiUnavailable}
        aria-pressed={activePanel === 'validator'}
        title={
          aiUnavailable
            ? 'Validation requires agentic backend configuration'
            : skillCount < 2
              ? 'Add at least 2 skills to validate'
              : 'Validate skill bundle completeness'
        }
        aria-label={
          aiUnavailable
            ? 'Skill bundle validation unavailable'
            : skillCount < 2
              ? 'Add at least two skills to use validation'
              : 'Toggle skill bundle validation panel'
        }
      >
        <svg
          viewBox="0 0 24 24"
          width={14}
          height={14}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          <path d="M9 12l2 2 4-4" />
          <circle cx="12" cy="12" r="10" />
        </svg>
        Validate
      </button>
      {skillCount > 0 && (
        <button
          type="button"
          className={styles.aiTab}
          onClick={onTestInPlayground}
          title="Test these skills in the Skills Playground"
          aria-label="Open skills playground with current skill bundle"
        >
          <svg
            viewBox="0 0 24 24"
            width={14}
            height={14}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden
          >
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          Test in Playground
        </button>
      )}
    </div>
  );
}
