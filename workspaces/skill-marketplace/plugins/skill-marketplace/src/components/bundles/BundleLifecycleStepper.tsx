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
import React from 'react';
import styles from './BundleLifecycleStepper.module.css';

type LifecycleStep =
  | 'draft'
  | 'testing'
  | 'published'
  | 'deprecated'
  | 'archived';

interface BundleLifecycleStepperProps {
  currentStatus: LifecycleStep;
  ociReference?: string;
}

const STEPS: { key: LifecycleStep; label: string; sdlcLabel: string }[] = [
  { key: 'draft', label: 'Draft', sdlcLabel: 'Author' },
  { key: 'testing', label: 'Testing', sdlcLabel: 'Review & Test' },
  { key: 'published', label: 'Published', sdlcLabel: 'Release' },
  { key: 'deprecated', label: 'Deprecated', sdlcLabel: 'Maintain' },
  { key: 'archived', label: 'Archived', sdlcLabel: 'Retired' },
];

function getStepIndex(status: LifecycleStep): number {
  return STEPS.findIndex(s => s.key === status);
}

export default function BundleLifecycleStepper({
  currentStatus,
  ociReference,
}: BundleLifecycleStepperProps) {
  const currentIdx = getStepIndex(currentStatus);

  return (
    <div className={styles.stepper}>
      <div className={styles.track}>
        {STEPS.map((step, i) => {
          const isComplete = i < currentIdx;
          const isCurrent = i === currentIdx;
          const isFuture = i > currentIdx;

          return (
            <React.Fragment key={step.key}>
              {i > 0 && (
                <div
                  className={`${styles.connector} ${isComplete ? styles.connectorComplete : ''}`}
                />
              )}
              <div
                className={`${styles.step} ${
                  isCurrent
                    ? styles.stepCurrent
                    : isComplete
                      ? styles.stepComplete
                      : styles.stepFuture
                }`}
                aria-current={isCurrent ? 'step' : undefined}
              >
                <div className={styles.dot}>
                  {isComplete && (
                    <svg
                      viewBox="0 0 16 16"
                      width={10}
                      height={10}
                      fill="currentColor"
                      aria-hidden
                    >
                      <path d="M13.485 1.431a.75.75 0 010 1.06l-7.5 7.5a.75.75 0 01-1.06 0l-3.5-3.5a.75.75 0 011.06-1.06l2.97 2.97 6.97-6.97a.75.75 0 011.06 0z" />
                    </svg>
                  )}
                  {isCurrent && <span className={styles.dotPulse} />}
                  {isFuture && <span className={styles.dotEmpty} />}
                </div>
                <div className={styles.labels}>
                  <span className={styles.sdlcLabel}>{step.sdlcLabel}</span>
                  <span className={styles.stepLabel}>{step.label}</span>
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>
      {ociReference && (
        <div className={styles.ociRef}>
          <svg
            viewBox="0 0 16 16"
            width={12}
            height={12}
            fill="currentColor"
            aria-hidden
          >
            <path d="M8 0a8 8 0 100 16A8 8 0 008 0zm3.28 5.78l-4 4a.75.75 0 01-1.06 0l-2-2a.75.75 0 111.06-1.06L6.5 8.44l3.47-3.47a.75.75 0 111.06 1.06z" />
          </svg>
          <span className={styles.ociRefText}>
            Registry: <code>{ociReference}</code>
          </span>
        </div>
      )}
    </div>
  );
}
