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
import type { ValidationFinding, ValidationState } from '../../hooks';
import styles from './BundleCart.module.css';

type Validator = ValidationState & { reset: () => void };

function findingClassFor(severity: ValidationFinding['severity']) {
  switch (severity) {
    case 'success':
      return styles.findingSuccess;
    case 'warning':
      return styles.findingWarning;
    case 'error':
      return styles.findingError;
    case 'info':
    default:
      return styles.findingInfo;
  }
}

export type BundleValidatorTabProps = {
  validator: Validator;
  skillCount: number;
  isValidatorCooling: boolean;
  onValidate: () => void;
};

export function BundleValidatorTab({
  validator,
  skillCount,
  isValidatorCooling,
  onValidate,
}: BundleValidatorTabProps) {
  return (
    <div className={styles.validator}>
      {validator.status === 'idle' && (
        <div className={styles.validatorStart}>
          <p>
            AI will analyze your {skillCount} skills for completeness,
            redundancy, and gaps.
          </p>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={onValidate}
            disabled={isValidatorCooling}
            title={
              isValidatorCooling
                ? 'Please wait before validating again'
                : undefined
            }
          >
            {isValidatorCooling ? 'Wait...' : 'Run Validation'}
          </button>
        </div>
      )}
      {validator.status === 'validating' && (
        <div className={styles.advisorStatus}>
          <span className={styles.advisorSpinner} />
          {validator.statusText}
        </div>
      )}
      {validator.error && (
        <div className={styles.advisorError}>{validator.error}</div>
      )}
      {validator.status === 'done' && (
        <div className={styles.validatorFindings}>
          {validator.findings.length === 0 ? (
            <div className={`${styles.finding} ${styles.findingSuccess}`}>
              <span className={styles.findingIcon}>✓</span>
              <div className={styles.findingBody}>
                <span className={styles.findingTitle}>Bundle looks good!</span>
                <span className={styles.findingDetail}>
                  No issues detected. Your skill selection appears complete and
                  well-structured.
                </span>
              </div>
            </div>
          ) : (
            validator.findings.map((f, i) => (
              <div
                key={i}
                className={`${styles.finding} ${findingClassFor(f.severity)}`}
              >
                <span className={styles.findingIcon}>
                  {f.severity === 'success'
                    ? '✓'
                    : f.severity === 'warning'
                      ? '⚠'
                      : f.severity === 'error'
                        ? '✕'
                        : 'ℹ'}
                </span>
                <div className={styles.findingBody}>
                  <span className={styles.findingTitle}>{f.title}</span>
                  {f.detail && (
                    <span className={styles.findingDetail}>{f.detail}</span>
                  )}
                </div>
              </div>
            ))
          )}
          <button
            type="button"
            className={`${styles.btn} ${styles.btnSecondary} ${styles.dismissButton}`}
            onClick={validator.reset}
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
