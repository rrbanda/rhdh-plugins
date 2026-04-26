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
import { useCallback, useEffect, useRef } from 'react';
import { BundleAdvisorTab } from './BundleAdvisorTab';
import { BundleCartAiBar } from './BundleCartAiBar';
import { BundleValidatorTab } from './BundleValidatorTab';
import { BundleDependencyTree } from './BundleDependencyTree';
import { BundleExportPanel } from './BundleExportPanel';
import { useBundleCartDrawer } from './useBundleCartDrawer';
import styles from './BundleCart.module.css';

export default function BundleCart() {
  const {
    skills,
    resolved,
    resolving,
    resolveError,
    drawerOpen,
    setDrawerOpen,
    removeSkill,
    reorderSkill,
    clearCart,
    advisor,
    validator,
    saving,
    bundleName,
    setBundleName,
    bundleDesc,
    setBundleDesc,
    showSaveForm,
    setShowSaveForm,
    saveSuccess,
    saveError,
    advisorInput,
    setAdvisorInput,
    activePanel,
    setActivePanel,
    isAdvisorCooling,
    isValidatorCooling,
    aiUnavailable,
    handleSave,
    handleExport,
    handleAdvisorAsk,
    handleValidate,
    handleTestBundle,
  } = useBundleCartDrawer();

  const drawerRef = useRef<HTMLDivElement>(null);

  const onClose = useCallback(() => setDrawerOpen(false), [setDrawerOpen]);

  useEffect(() => {
    if (!drawerOpen) {
      return undefined;
    }

    const drawerEl = drawerRef.current;
    if (!drawerEl) {
      return undefined;
    }

    const previouslyFocused = document.activeElement as HTMLElement | null;

    const getFocusable = () =>
      Array.from(
        drawerEl.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter(el => !el.hasAttribute('disabled'));

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      const focusable = getFocusable();
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    drawerEl.addEventListener('keydown', handleKeyDown);

    requestAnimationFrame(() => {
      const focusable = getFocusable();
      if (focusable.length > 0) focusable[0].focus();
    });

    return () => {
      drawerEl.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    };
  }, [drawerOpen, onClose]);

  if (!drawerOpen) return null;

  return (
    <div
      className={styles.overlay}
      onClick={onClose}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClose();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label="Close skill bundle cart"
    >
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- click/key stop propagation to overlay; focus stays in dialog */}
      <div
        ref={drawerRef}
        className={styles.drawer}
        role="dialog"
        aria-label="Skill Bundle Cart"
        aria-modal="true"
        onClick={e => e.stopPropagation()}
        onKeyDown={e => e.stopPropagation()}
      >
        <div className={styles.header}>
          <h3 className={styles.title}>Skill Bundle</h3>
          <span className={styles.count}>
            {skills.length} skill{skills.length !== 1 ? 's' : ''}
          </span>
          <div className={styles.headerSpacer} />
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close skill bundle cart"
          >
            &times;
          </button>
        </div>

        {saveSuccess && (
          <div
            className={`${styles.toast} ${styles.toastSuccess}`}
            role="status"
          >
            {saveSuccess}
          </div>
        )}
        {saveError && (
          <div className={`${styles.toast} ${styles.toastError}`} role="alert">
            {saveError}
          </div>
        )}

        {aiUnavailable && (
          <div className={styles.aiBanner}>
            <svg
              viewBox="0 0 24 24"
              width={14}
              height={14}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4" />
              <path d="M12 16h.01" />
            </svg>
            AI features require backend configuration. Advisor and Validation
            are unavailable.
          </div>
        )}

        <BundleCartAiBar
          activePanel={activePanel}
          setActivePanel={setActivePanel}
          aiUnavailable={aiUnavailable}
          skillCount={skills.length}
          onTestInPlayground={handleTestBundle}
        />

        {activePanel === 'advisor' && (
          <BundleAdvisorTab
            advisor={advisor}
            advisorInput={advisorInput}
            setAdvisorInput={setAdvisorInput}
            isAdvisorCooling={isAdvisorCooling}
            onAdvisorAsk={handleAdvisorAsk}
          />
        )}

        {activePanel === 'validator' && (
          <BundleValidatorTab
            validator={validator}
            skillCount={skills.length}
            isValidatorCooling={isValidatorCooling}
            onValidate={handleValidate}
          />
        )}

        <BundleDependencyTree
          skills={skills}
          onRemoveSkill={removeSkill}
          onReorderSkill={reorderSkill}
          resolved={resolved}
          resolving={resolving}
          resolveError={resolveError}
        />

        <BundleExportPanel
          skillCount={skills.length}
          showSaveForm={showSaveForm}
          setShowSaveForm={setShowSaveForm}
          bundleName={bundleName}
          setBundleName={setBundleName}
          bundleDesc={bundleDesc}
          setBundleDesc={setBundleDesc}
          saving={saving}
          onSave={handleSave}
          onExport={handleExport}
          onClearCart={clearCart}
        />
      </div>
    </div>
  );
}
