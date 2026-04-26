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
  ChangeEvent,
  KeyboardEvent,
  Dispatch,
  SetStateAction,
} from 'react';
import type { AdvisorState } from '../../hooks';
import AddToBundleButton from '../shared/AddToBundleButton';
import styles from './BundleCart.module.css';

type Advisor = AdvisorState & {
  ask: (query: string, currentCartSkills?: string[]) => Promise<void>;
};

export type BundleAdvisorTabProps = {
  advisor: Advisor;
  advisorInput: string;
  setAdvisorInput: Dispatch<SetStateAction<string>>;
  isAdvisorCooling: boolean;
  onAdvisorAsk: () => void;
};

export function BundleAdvisorTab({
  advisor,
  advisorInput,
  setAdvisorInput,
  isAdvisorCooling,
  onAdvisorAsk,
}: BundleAdvisorTabProps) {
  return (
    <div className={styles.advisor}>
      <div className={styles.advisorInputRow}>
        <input
          className={`${styles.input} ${styles.advisorInput}`}
          placeholder="Describe what you need..."
          aria-label="Describe what you need for bundle advice"
          value={advisorInput}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            setAdvisorInput(e.target.value)
          }
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onAdvisorAsk();
            }
          }}
          disabled={
            advisor.status === 'thinking' || advisor.status === 'searching'
          }
        />
        <button
          type="button"
          className={`${styles.btn} ${styles.btnPrimary} ${styles.advisorBtn}`}
          onClick={onAdvisorAsk}
          disabled={
            !advisorInput.trim() ||
            advisor.status === 'thinking' ||
            advisor.status === 'searching' ||
            isAdvisorCooling
          }
          title={
            isAdvisorCooling ? 'Please wait before asking again' : undefined
          }
          aria-label={
            advisor.status === 'thinking' || advisor.status === 'searching'
              ? 'AI advisor is working'
              : isAdvisorCooling
                ? 'Please wait before asking the advisor again'
                : 'Send question to AI advisor'
          }
        >
          {advisor.status === 'thinking' || advisor.status === 'searching'
            ? '...'
            : isAdvisorCooling
              ? 'Wait...'
              : 'Ask'}
        </button>
      </div>
      {advisor.status !== 'idle' && advisor.statusText && (
        <div className={styles.advisorStatus}>
          <span className={styles.advisorSpinner} />
          {advisor.statusText}
        </div>
      )}
      {advisor.error && (
        <div className={styles.advisorError}>{advisor.error}</div>
      )}
      {advisor.answer && (
        <div className={styles.advisorAnswer}>{advisor.answer}</div>
      )}
      {advisor.suggestions.length > 0 && (
        <div className={styles.advisorSuggestions}>
          <div className={styles.sectionLabel}>Suggested Skills</div>
          {advisor.suggestions.map(s => (
            <div key={s.name} className={styles.advisorSuggestion}>
              <div className={styles.skillInfo}>
                <span className={styles.skillCategory}>{s.category}</span>
                <span className={styles.skillName}>
                  {s.name.split(':').pop() || s.name}
                </span>
              </div>
              <AddToBundleButton skill={s} variant="icon" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
