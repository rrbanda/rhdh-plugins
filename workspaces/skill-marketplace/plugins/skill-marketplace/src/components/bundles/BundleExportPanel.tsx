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
import {
  useState,
  type ChangeEvent,
  type Dispatch,
  type SetStateAction,
} from 'react';
import styles from './BundleCart.module.css';
import exportStyles from './BundleExportPanel.module.css';

export type BundleExportFormat = 'json' | 'yaml';

export type BundleExportPanelProps = {
  skillCount: number;
  showSaveForm: boolean;
  setShowSaveForm: Dispatch<SetStateAction<boolean>>;
  bundleName: string;
  setBundleName: Dispatch<SetStateAction<string>>;
  bundleDesc: string;
  setBundleDesc: Dispatch<SetStateAction<string>>;
  saving: boolean;
  onSave: () => void;
  onExport: (format: BundleExportFormat) => void;
  onClearCart: () => void;
};

export function BundleExportPanel({
  skillCount,
  showSaveForm,
  setShowSaveForm,
  bundleName,
  setBundleName,
  bundleDesc,
  setBundleDesc,
  saving,
  onSave,
  onExport,
  onClearCart,
}: BundleExportPanelProps) {
  const [exportFormat, setExportFormat] = useState<BundleExportFormat>('json');

  if (skillCount === 0) {
    return null;
  }

  return (
    <div className={styles.footer}>
      {showSaveForm ? (
        <div className={styles.saveForm}>
          <input
            className={styles.input}
            placeholder="Bundle name"
            value={bundleName}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setBundleName(e.target.value)
            }
            // eslint-disable-next-line jsx-a11y/no-autofocus -- focus name field when save form is shown
            autoFocus
            aria-label="Bundle name"
          />
          <input
            className={styles.input}
            placeholder="Description (optional)"
            value={bundleDesc}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setBundleDesc(e.target.value)
            }
            aria-label="Bundle description"
          />
          <div className={styles.saveActions}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={onSave}
              disabled={saving || !bundleName.trim()}
              aria-label="Save bundle to the server"
            >
              {saving ? 'Saving...' : 'Save Bundle'}
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnSecondary}`}
              onClick={() => setShowSaveForm(false)}
              aria-label="Cancel save bundle form"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={() => setShowSaveForm(true)}
            aria-label="Open form to save bundle to the server"
          >
            Save Bundle
          </button>
          <div className={exportStyles.formatRow}>
            <div
              className={exportStyles.formatToggle}
              role="group"
              aria-label="Export file format"
            >
              <button
                type="button"
                className={`${exportStyles.formatOption} ${exportFormat === 'json' ? exportStyles.formatOptionActive : ''}`}
                aria-pressed={exportFormat === 'json'}
                aria-label="Select JSON export format"
                onClick={() => setExportFormat('json')}
              >
                JSON
              </button>
              <button
                type="button"
                className={`${exportStyles.formatOption} ${exportFormat === 'yaml' ? exportStyles.formatOptionActive : ''}`}
                aria-pressed={exportFormat === 'yaml'}
                aria-label="Select YAML export format"
                onClick={() => setExportFormat('yaml')}
              >
                YAML
              </button>
            </div>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnSecondary}`}
              onClick={() => onExport(exportFormat)}
              aria-label={
                exportFormat === 'json'
                  ? 'Export bundle as a JSON file'
                  : 'Export bundle as a YAML file'
              }
            >
              Export
            </button>
          </div>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnGhost}`}
            onClick={() => {
              if (
                window.confirm(
                  `Clear all ${skillCount} skill(s) from your cart?`,
                )
              )
                onClearCart();
            }}
            aria-label="Remove all skills from the bundle cart"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
