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
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRouteRef } from '@backstage/core-plugin-api';
import { rootRouteRef } from '../../routes';
import { useBundle, useSkills, useSkillAdvisor, useBundleValidator } from '../../hooks';

export default function BundleCart() {
  const { skills, resolved, resolving, drawerOpen, setDrawerOpen, removeSkill, clearCart, saveBundle, exportBundle, addSkill, hasSkill } = useBundle();
  const { skills: catalogSkills } = useSkills();
  const advisor = useSkillAdvisor(catalogSkills);
  const validator = useBundleValidator();
  const navigate = useNavigate();
  const basePath = useRouteRef(rootRouteRef)();

  const [saving, setSaving] = useState(false);
  const [bundleName, setBundleName] = useState('');
  const [bundleDesc, setBundleDesc] = useState('');
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState('');
  const [saveError, setSaveError] = useState('');
  const [advisorInput, setAdvisorInput] = useState('');
  const [activePanel, setActivePanel] = useState<'none' | 'advisor' | 'validator'>('none');

  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawerOpen(false); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen, setDrawerOpen]);

  if (!drawerOpen) return null;

  const handleSave = async () => {
    if (!bundleName.trim()) return;
    setSaving(true);
    try {
      await saveBundle(bundleName, bundleDesc);
      setSaveError('');
      setSaveSuccess(`Bundle "${bundleName}" saved!`);
      setBundleName('');
      setBundleDesc('');
      setShowSaveForm(false);
      setTimeout(() => setSaveSuccess(''), 3000);
    } catch {
      setSaveSuccess('');
      setSaveError('Failed to save bundle');
      setTimeout(() => setSaveError(''), 4000);
    } finally {
      setSaving(false);
    }
  };

  const handleExport = () => {
    const name = bundleName.trim() || 'skill-bundle';
    exportBundle(name, bundleDesc);
  };

  const handleAdvisorAsk = () => {
    if (!advisorInput.trim()) return;
    const cartNames = skills.map(s => s.name);
    advisor.ask(advisorInput.trim(), cartNames);
  };

  const handleValidate = () => {
    const names = skills.map(s => s.name);
    const deps = resolved?.dependencies?.map(d => (d as { name: string }).name) ?? [];
    const tools = resolved?.tools?.map(t => (t as { name: string }).name) ?? [];
    validator.validate(names, deps, tools);
  };

  const handleTestBundle = () => {
    const skillNames = skills.map(s => s.name).join(',');
    navigate(`${basePath}/playground?skills=${encodeURIComponent(skillNames)}`);
    setDrawerOpen(false);
  };

  return (
    <div className="bc-overlay" onClick={() => setDrawerOpen(false)}>
      <style>{cartStyles}</style>
      <div className="bc-drawer" role="dialog" aria-label="Skill Bundle Cart" onClick={e => e.stopPropagation()}>
        <div className="bc-header">
          <h3 className="bc-title">Skill Bundle</h3>
          <span className="bc-count">{skills.length} skill{skills.length !== 1 ? 's' : ''}</span>
          <div style={{ flex: 1 }} />
          <button className="bc-close" onClick={() => setDrawerOpen(false)}>&times;</button>
        </div>

        {saveSuccess && (
          <div className="bc-toast bc-toast-success">{saveSuccess}</div>
        )}
        {saveError && (
          <div className="bc-toast bc-toast-error">{saveError}</div>
        )}

        {/* AI Action Bar */}
        <div className="bc-ai-bar">
          <button
            className={`bc-ai-tab ${activePanel === 'advisor' ? 'bc-ai-tab-active' : ''}`}
            onClick={() => setActivePanel(activePanel === 'advisor' ? 'none' : 'advisor')}
          >
            <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M12 2a4 4 0 014 4c0 1.95-1.4 3.58-3.25 3.93L12 10l-.75-.07A4.001 4.001 0 0112 2z" />
              <path d="M12 10v4" /><path d="M8 18h8" /><path d="M7 22h10" />
            </svg>
            AI Advisor
          </button>
          <button
            className={`bc-ai-tab ${activePanel === 'validator' ? 'bc-ai-tab-active' : ''}`}
            onClick={() => { setActivePanel(activePanel === 'validator' ? 'none' : 'validator'); }}
            disabled={skills.length < 2}
            title={skills.length < 2 ? 'Add at least 2 skills to validate' : 'Validate bundle completeness'}
          >
            <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="10" />
            </svg>
            Validate
          </button>
          {skills.length > 0 && (
            <button
              className="bc-ai-tab"
              onClick={handleTestBundle}
              title="Test this bundle in the Skills Playground"
            >
              <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2}>
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              Test
            </button>
          )}
        </div>

        {/* AI Advisor Panel */}
        {activePanel === 'advisor' && (
          <div className="bc-advisor">
            <div className="bc-advisor-input-row">
              <input
                className="bc-input bc-advisor-input"
                placeholder="Describe what you need..."
                value={advisorInput}
                onChange={e => setAdvisorInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAdvisorAsk(); } }}
                disabled={advisor.status === 'thinking' || advisor.status === 'searching'}
              />
              <button
                className="bc-btn bc-btn-primary bc-advisor-btn"
                onClick={handleAdvisorAsk}
                disabled={!advisorInput.trim() || advisor.status === 'thinking' || advisor.status === 'searching'}
              >
                {advisor.status === 'thinking' || advisor.status === 'searching' ? '...' : 'Ask'}
              </button>
            </div>
            {advisor.status !== 'idle' && advisor.statusText && (
              <div className="bc-advisor-status">
                <span className="bc-advisor-spinner" />
                {advisor.statusText}
              </div>
            )}
            {advisor.error && (
              <div className="bc-advisor-error">{advisor.error}</div>
            )}
            {advisor.answer && (
              <div className="bc-advisor-answer">{advisor.answer}</div>
            )}
            {advisor.suggestions.length > 0 && (
              <div className="bc-advisor-suggestions">
                <div className="bc-section-label">Suggested Skills</div>
                {advisor.suggestions.map(s => (
                  <div key={s.name} className="bc-advisor-suggestion">
                    <div className="bc-skill-info">
                      <span className="bc-skill-category" style={{ background: '#8b5cf620', color: '#7c3aed' }}>{s.category}</span>
                      <span className="bc-skill-name">{s.name.split(':').pop() || s.name}</span>
                    </div>
                    <button
                      className={`bc-advisor-add ${hasSkill(s.name) ? 'bc-advisor-added' : ''}`}
                      onClick={() => { if (!hasSkill(s.name)) addSkill(s); }}
                      disabled={hasSkill(s.name)}
                    >
                      {hasSkill(s.name) ? '✓' : '+'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Validator Panel */}
        {activePanel === 'validator' && (
          <div className="bc-validator">
            {validator.status === 'idle' && (
              <div className="bc-validator-start">
                <p>AI will analyze your {skills.length} skills for completeness, redundancy, and gaps.</p>
                <button className="bc-btn bc-btn-primary" onClick={handleValidate}>
                  Run Validation
                </button>
              </div>
            )}
            {validator.status === 'validating' && (
              <div className="bc-advisor-status">
                <span className="bc-advisor-spinner" />
                {validator.statusText}
              </div>
            )}
            {validator.error && (
              <div className="bc-advisor-error">{validator.error}</div>
            )}
            {validator.status === 'done' && (
              <div className="bc-validator-findings">
                {validator.findings.length === 0 ? (
                  <div className="bc-finding bc-finding-success">
                    <span className="bc-finding-icon">✓</span>
                    <div className="bc-finding-body">
                      <span className="bc-finding-title">Bundle looks good!</span>
                      <span className="bc-finding-detail">No issues detected. Your skill selection appears complete and well-structured.</span>
                    </div>
                  </div>
                ) : (
                  validator.findings.map((f, i) => (
                    <div key={i} className={`bc-finding bc-finding-${f.severity}`}>
                      <span className="bc-finding-icon">
                        {f.severity === 'success' ? '✓' : f.severity === 'warning' ? '⚠' : f.severity === 'error' ? '✕' : 'ℹ'}
                      </span>
                      <div className="bc-finding-body">
                        <span className="bc-finding-title">{f.title}</span>
                        {f.detail && <span className="bc-finding-detail">{f.detail}</span>}
                      </div>
                    </div>
                  ))
                )}
                <button className="bc-btn bc-btn-secondary" onClick={validator.reset} style={{ marginTop: 8 }}>
                  Dismiss
                </button>
              </div>
            )}
          </div>
        )}

        <div className="bc-body">
          {skills.length === 0 ? (
            <div className="bc-empty">
              <p>Your bundle is empty.</p>
              <p style={{ fontSize: 13, color: '#6a6e73' }}>
                Click "Add to Bundle" on any skill, or use the AI Advisor above.
              </p>
            </div>
          ) : (
            <>
              <div className="bc-section-label">Selected Skills</div>
              {skills.map(skill => (
                <div key={skill.name} className="bc-skill-row">
                  <div className="bc-skill-info">
                    <span className="bc-skill-category" style={{ background: '#0066cc20', color: '#0066cc' }}>{skill.category}</span>
                    <span className="bc-skill-name">{skill.name.split(':').pop() || skill.name}</span>
                  </div>
                  <button className="bc-remove" onClick={() => removeSkill(skill.name)} title="Remove">&times;</button>
                </div>
              ))}

              {resolving && (
                <div className="bc-resolving">Resolving dependencies...</div>
              )}

              {resolved && resolved.dependencies.length > 0 && (
                <>
                  <div className="bc-section-label">
                    Dependencies
                    <span className="bc-badge">{resolved.dependencies.length}</span>
                  </div>
                  {resolved.dependencies.map(dep => (
                    <div key={dep.name} className="bc-skill-row bc-dep-row">
                      <div className="bc-skill-info">
                        <span className="bc-skill-category bc-dep-cat">{dep.category || 'dep'}</span>
                        <span className="bc-skill-name bc-dep-name">{dep.name.split(':').pop() || dep.name}</span>
                      </div>
                      <span className="bc-dep-of">required by {dep.dependencyOf.split(':').pop()}</span>
                    </div>
                  ))}
                </>
              )}

              {resolved && resolved.tools.length > 0 && (
                <>
                  <div className="bc-section-label">
                    Tool Requirements
                    <span className="bc-badge">{resolved.tools.length}</span>
                  </div>
                  <div className="bc-tools">
                    {resolved.tools.map(tool => (
                      <span key={tool.name} className="bc-tool-chip" title={tool.description}>
                        {tool.name}
                      </span>
                    ))}
                  </div>
                </>
              )}

              {resolved && resolved.similar.length > 0 && (
                <>
                  <div className="bc-section-label">You Might Also Consider</div>
                  {resolved.similar.slice(0, 5).map(sim => (
                    <div key={sim.name} className="bc-skill-row bc-sim-row">
                      <div className="bc-skill-info">
                        <span className="bc-skill-category" style={{ background: '#06b6d420', color: '#06b6d4' }}>{sim.category || 'similar'}</span>
                        <span className="bc-skill-name">{sim.name.split(':').pop() || sim.name}</span>
                      </div>
                      <span className="bc-sim-of">similar to {sim.similarTo.split(':').pop()}</span>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>

        {skills.length > 0 && (
          <div className="bc-footer">
            {showSaveForm ? (
              <div className="bc-save-form">
                <input
                  className="bc-input"
                  placeholder="Bundle name"
                  value={bundleName}
                  onChange={e => setBundleName(e.target.value)}
                  autoFocus
                />
                <input
                  className="bc-input"
                  placeholder="Description (optional)"
                  value={bundleDesc}
                  onChange={e => setBundleDesc(e.target.value)}
                />
                <div className="bc-save-actions">
                  <button className="bc-btn bc-btn-primary" onClick={handleSave} disabled={saving || !bundleName.trim()}>
                    {saving ? 'Saving...' : 'Save Bundle'}
                  </button>
                  <button className="bc-btn bc-btn-secondary" onClick={() => setShowSaveForm(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div className="bc-actions">
                <button className="bc-btn bc-btn-primary" onClick={() => setShowSaveForm(true)}>Save Bundle</button>
                <button className="bc-btn bc-btn-secondary" onClick={handleExport}>Export JSON</button>
                <button className="bc-btn bc-btn-ghost" onClick={clearCart}>Clear</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const cartStyles = `
.bc-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.3);
  z-index: 1000;
  display: flex;
  justify-content: flex-end;
}
.bc-drawer {
  width: 420px;
  max-width: 90vw;
  background: var(--pf-t--global--background--color--primary--default, #fff);
  display: flex;
  flex-direction: column;
  box-shadow: -4px 0 24px rgba(0,0,0,0.15);
  animation: bc-slide-in 0.2s ease-out;
}
@keyframes bc-slide-in {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}
.bc-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
  flex-shrink: 0;
}
.bc-title {
  font-size: 16px;
  font-weight: 700;
  margin: 0;
}
.bc-count {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--pf-t--global--color--brand--default, #0066cc);
  color: #fff;
  font-weight: 600;
}
.bc-close {
  width: 28px;
  height: 28px;
  border: none;
  background: none;
  font-size: 20px;
  cursor: pointer;
  border-radius: 6px;
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
  display: flex;
  align-items: center;
  justify-content: center;
}
.bc-close:hover { background: rgba(0,0,0,0.05); }
.bc-toast {
  padding: 8px 20px;
  font-size: 13px;
  font-weight: 600;
}
.bc-toast-success {
  background: #10b98120;
  color: #059669;
}
.bc-toast-error {
  background: #ef444415;
  color: #dc2626;
}
.bc-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 20px;
}
.bc-empty {
  text-align: center;
  padding: 40px 0;
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
}
.bc-section-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
  margin: 16px 0 8px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.bc-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--pf-t--global--background--color--secondary--default, #f0f0f0);
}
.bc-skill-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid var(--pf-t--global--border--color--default, #f0f0f0);
}
.bc-skill-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}
.bc-skill-category {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  white-space: nowrap;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}
.bc-skill-name {
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bc-remove {
  width: 22px;
  height: 22px;
  border: none;
  background: none;
  cursor: pointer;
  border-radius: 4px;
  color: #ef4444;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  opacity: 0.5;
}
.bc-remove:hover { opacity: 1; background: #ef444410; }
.bc-dep-row { opacity: 0.7; }
.bc-dep-cat { background: #f59e0b20 !important; color: #d97706 !important; }
.bc-dep-name { font-style: italic; }
.bc-dep-of, .bc-sim-of {
  font-size: 10px;
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
  white-space: nowrap;
}
.bc-sim-row { opacity: 0.6; }
.bc-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}
.bc-tool-chip {
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 6px;
  background: var(--pf-t--global--background--color--secondary--default, #f0f0f0);
  color: var(--pf-t--global--text--color--regular, #151515);
  font-weight: 500;
}
.bc-resolving {
  padding: 12px 0;
  font-size: 13px;
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
  font-style: italic;
}
.bc-footer {
  border-top: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
  padding: 16px 20px;
  flex-shrink: 0;
}
.bc-actions {
  display: flex;
  gap: 8px;
}
.bc-save-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.bc-save-actions {
  display: flex;
  gap: 8px;
}
.bc-input {
  width: 100%;
  height: 36px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
  font-size: 13px;
  outline: none;
  font-family: inherit;
}
.bc-input:focus {
  border-color: var(--pf-t--global--color--brand--default, #0066cc);
}
.bc-btn {
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  font-family: inherit;
  white-space: nowrap;
}
.bc-btn:disabled { opacity: 0.5; cursor: default; }
.bc-btn-primary {
  background: var(--pf-t--global--color--brand--default, #0066cc);
  color: #fff;
}
.bc-btn-primary:hover:not(:disabled) { opacity: 0.9; }
.bc-btn-secondary {
  background: var(--pf-t--global--background--color--primary--default, #fff);
  border-color: var(--pf-t--global--border--color--default, #d2d2d2);
  color: var(--pf-t--global--text--color--regular, #151515);
}
.bc-btn-secondary:hover { background: var(--pf-t--global--background--color--secondary--default, #f5f5f5); }
.bc-btn-ghost {
  background: none;
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
}
.bc-btn-ghost:hover { background: rgba(0,0,0,0.04); }

/* AI Action Bar */
.bc-ai-bar {
  display: flex;
  gap: 4px;
  padding: 8px 20px;
  border-bottom: 1px solid var(--pf-t--global--border--color--default, #f0f0f0);
  flex-shrink: 0;
}
.bc-ai-tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  border-radius: 6px;
  border: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
  background: transparent;
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s;
}
.bc-ai-tab:hover:not(:disabled) {
  border-color: var(--pf-t--global--color--brand--default, #0066cc);
  color: var(--pf-t--global--color--brand--default, #0066cc);
}
.bc-ai-tab:disabled { opacity: 0.4; cursor: default; }
.bc-ai-tab-active {
  background: var(--pf-t--global--color--brand--default, #0066cc);
  border-color: var(--pf-t--global--color--brand--default, #0066cc);
  color: #fff;
}

/* AI Advisor */
.bc-advisor {
  padding: 12px 20px;
  border-bottom: 1px solid var(--pf-t--global--border--color--default, #f0f0f0);
  flex-shrink: 0;
  max-height: 300px;
  overflow-y: auto;
}
.bc-advisor-input-row {
  display: flex;
  gap: 6px;
}
.bc-advisor-input {
  flex: 1;
}
.bc-advisor-btn {
  flex-shrink: 0;
  padding: 0 16px;
}
.bc-advisor-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  font-size: 12px;
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
  font-style: italic;
}
.bc-advisor-spinner {
  width: 12px;
  height: 12px;
  border: 2px solid var(--pf-t--global--border--color--default, #d2d2d2);
  border-top-color: var(--pf-t--global--color--brand--default, #0066cc);
  border-radius: 50%;
  animation: bc-spin 0.6s linear infinite;
  flex-shrink: 0;
}
@keyframes bc-spin { to { transform: rotate(360deg); } }
.bc-advisor-error {
  padding: 6px 0;
  font-size: 12px;
  color: #c9190b;
}
.bc-advisor-answer {
  padding: 8px 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--pf-t--global--text--color--regular, #151515);
  white-space: pre-wrap;
  max-height: 140px;
  overflow-y: auto;
}
.bc-advisor-suggestions {
  padding-top: 4px;
}
.bc-advisor-suggestion {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid var(--pf-t--global--border--color--default, #f0f0f0);
}
.bc-advisor-add {
  width: 26px;
  height: 26px;
  border: 1px solid var(--pf-t--global--color--brand--default, #0066cc);
  border-radius: 6px;
  background: transparent;
  color: var(--pf-t--global--color--brand--default, #0066cc);
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.15s;
}
.bc-advisor-add:hover:not(:disabled) {
  background: var(--pf-t--global--color--brand--default, #0066cc);
  color: #fff;
}
.bc-advisor-added {
  border-color: #10b981;
  color: #10b981;
  cursor: default;
}

/* Validator */
.bc-validator {
  padding: 12px 20px;
  border-bottom: 1px solid var(--pf-t--global--border--color--default, #f0f0f0);
  flex-shrink: 0;
  max-height: 300px;
  overflow-y: auto;
}
.bc-validator-start {
  text-align: center;
}
.bc-validator-start p {
  font-size: 13px;
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
  margin: 0 0 10px;
}
.bc-validator-findings {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.bc-finding {
  display: flex;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.5;
}
.bc-finding-success { background: #10b98110; }
.bc-finding-warning { background: #f59e0b10; }
.bc-finding-error { background: #ef444410; }
.bc-finding-info { background: #3b82f610; }
.bc-finding-icon {
  flex-shrink: 0;
  width: 18px;
  text-align: center;
  font-size: 13px;
}
.bc-finding-success .bc-finding-icon { color: #10b981; }
.bc-finding-warning .bc-finding-icon { color: #f59e0b; }
.bc-finding-error .bc-finding-icon { color: #ef4444; }
.bc-finding-info .bc-finding-icon { color: #3b82f6; }
.bc-finding-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.bc-finding-title {
  font-weight: 600;
  color: var(--pf-t--global--text--color--regular, #151515);
}
.bc-finding-detail {
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
}
`;
