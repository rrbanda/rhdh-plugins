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

export const builderStyles = `
/* ================================================================
   Skill Builder -- Production UI
   Inline styles for RHDH dynamic plugin compatibility.
   Uses PatternFly tokens with fallbacks for dark/light themes.
   ================================================================ */

/* ---- Page layout ---- */
.sb-page {
  display: flex;
  height: calc(100vh - 112px);
  min-height: 0;
  overflow: hidden;
  background: var(--pf-t--global--background--color--primary--default, #fff);
}

@media (max-width: 900px) {
  .sb-page { flex-direction: column; }
}

/* ---- Left: Chat panel ---- */
.sb-chat {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  border-right: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
}

@media (max-width: 900px) {
  .sb-chat { border-right: none; border-bottom: 1px solid var(--pf-t--global--border--color--default, #d2d2d2); min-height: 50%; }
}

.sb-messages {
  flex: 1;
  overflow-y: auto;
  padding: 24px 32px;
}

/* ---- Welcome hero (empty state) ---- */
.sb-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
  padding: 32px 24px;
}

.sb-hero {
  width: 100%;
  max-width: 600px;
  padding: 36px 32px 28px;
  border-radius: 16px;
  background: var(--pf-t--global--background--color--secondary--default, #f0f0f0);
  border: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
  margin-bottom: 32px;
}

.sb-hero-icon {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26px;
  background: var(--pf-t--global--background--color--primary--default, #fff);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  margin: 0 auto 16px;
}

.sb-hero h2 {
  font-size: 26px;
  font-weight: 800;
  letter-spacing: -0.03em;
  margin: 0 0 8px;
  color: var(--pf-t--global--text--color--regular, #151515);
}

.sb-hero p {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
  max-width: 460px;
  margin-inline: auto;
}

.sb-suggestions {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 12px;
  width: 100%;
  max-width: 600px;
}

.sb-suggestion {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  border-radius: 12px;
  border: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
  background: var(--pf-t--global--background--color--primary--default, #fff);
  font-size: 13px;
  line-height: 1.5;
  text-align: left;
  cursor: pointer;
  transition: all 0.2s ease;
}

.sb-suggestion:hover {
  border-color: var(--pf-t--global--color--brand--default, #0066cc);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  transform: translateY(-1px);
}

.sb-sug-icon {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
}

.sb-sug-icon--security { background: rgba(198, 40, 40, 0.1); color: #ef5350; }
.sb-sug-icon--docs { background: rgba(40, 53, 147, 0.1); color: #5c6bc0; }
.sb-sug-icon--web { background: rgba(0, 105, 92, 0.1); color: #26a69a; }

.sb-sug-text { flex: 1; min-width: 0; }

.sb-sug-title {
  display: block;
  font-weight: 600;
  font-size: 13px;
  color: var(--pf-t--global--text--color--regular, #151515);
  margin-bottom: 2px;
}

.sb-sug-desc {
  display: block;
  font-size: 12px;
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
  line-height: 1.4;
}

/* ---- Chat messages ---- */
.sb-msg {
  margin-bottom: 16px;
  max-width: 85%;
}

.sb-msg--user { margin-left: auto; }
.sb-msg--agent { margin-right: auto; }

.sb-msg-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.sb-msg-avatar {
  width: 24px;
  height: 24px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
}

.sb-msg--user .sb-msg-avatar {
  background: var(--pf-t--global--color--brand--default, #0066cc);
  color: #fff;
}

.sb-msg--agent .sb-msg-avatar {
  background: var(--pf-t--global--background--color--secondary--default, #f0f0f0);
  color: var(--pf-t--global--color--brand--default, #0066cc);
}

.sb-msg-role {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
}

.sb-msg-ts {
  font-size: 11px;
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
  opacity: 0.5;
  margin-left: auto;
}

.sb-msg-text {
  padding: 14px 18px;
  border-radius: 14px;
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.sb-msg--user .sb-msg-text {
  background: var(--pf-t--global--color--brand--default, #0066cc);
  color: #fff;
  border-bottom-right-radius: 4px;
}

.sb-msg--agent .sb-msg-text {
  background: var(--pf-t--global--background--color--secondary--default, #f5f5f5);
  border: 1px solid var(--pf-t--global--border--color--default, #e0e0e0);
  border-bottom-left-radius: 4px;
  color: var(--pf-t--global--text--color--regular, #151515);
}

.sb-msg--error .sb-msg-text {
  background: rgba(201, 25, 11, 0.06);
  border: 1px solid rgba(201, 25, 11, 0.2);
  color: var(--pf-t--global--color--status--danger--default, #c9190b);
}

/* ---- Agent activity feed ---- */
.sb-activity {
  margin-bottom: 16px;
  max-width: 85%;
  margin-right: auto;
}

.sb-activity-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.sb-activity-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
}

.sb-activity-body {
  padding: 12px 16px;
  border-radius: 12px;
  border-bottom-left-radius: 4px;
  background: var(--pf-t--global--background--color--secondary--default, #f5f5f5);
  border: 1px solid var(--pf-t--global--border--color--default, #e0e0e0);
}

.sb-activity-events {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sb-evt {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.sb-evt-icon {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
  margin-top: 1px;
}

.sb-evt-icon--agent { background: rgba(0, 102, 204, 0.1); color: var(--pf-t--global--color--brand--default, #0066cc); }
.sb-evt-icon--tool { background: rgba(230, 81, 0, 0.1); color: #ff9800; }
.sb-evt-icon--output { background: rgba(123, 31, 162, 0.1); color: #ba68c8; }
.sb-evt-icon--result { background: rgba(0, 105, 92, 0.1); color: #26a69a; }
.sb-evt-icon--complete { background: rgba(62, 134, 53, 0.1); color: var(--pf-t--global--color--status--success--default, #3e8635); }
.sb-evt-icon--error { background: rgba(201, 25, 11, 0.1); color: var(--pf-t--global--color--status--danger--default, #c9190b); }

.sb-evt-text {
  font-size: 13px;
  line-height: 22px;
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
}

.sb-evt-text strong {
  color: var(--pf-t--global--text--color--regular, #151515);
  font-weight: 600;
}

.sb-evt-text--output {
  font-style: italic;
  font-size: 12px;
  line-height: 1.5;
  max-height: 48px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sb-tool-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 10px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  font-family: 'Red Hat Mono', 'SF Mono', Monaco, Menlo, Consolas, monospace;
  background: rgba(230, 81, 0, 0.1);
  color: #ff9800;
  border: 1px solid rgba(230, 81, 0, 0.25);
  cursor: pointer;
  transition: background 0.15s;
}

.sb-tool-chip:hover { background: rgba(230, 81, 0, 0.18); }

.sb-tool-chip--result {
  background: rgba(0, 105, 92, 0.1);
  color: #26a69a;
  border-color: rgba(0, 105, 92, 0.25);
}

.sb-tool-chip--result:hover { background: rgba(0, 105, 92, 0.18); }

.sb-tool-args {
  margin-top: 4px;
  margin-left: 30px;
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--pf-t--global--background--color--primary--default, #fff);
  font-size: 11px;
  font-family: 'Red Hat Mono', 'SF Mono', Monaco, Menlo, Consolas, monospace;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 120px;
  overflow-y: auto;
  border: 1px solid var(--pf-t--global--border--color--default, #e8e8e8);
  color: var(--pf-t--global--text--color--regular, #151515);
}

/* ---- Typing / streaming indicator ---- */
.sb-typing {
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
  font-style: italic;
}

/* ---- Validation success banner ---- */
.sb-success {
  margin-bottom: 16px;
  max-width: 85%;
  margin-right: auto;
  padding: 12px 16px;
  border-radius: 12px;
  background: rgba(62, 134, 53, 0.08);
  border: 1px solid rgba(62, 134, 53, 0.2);
  border-left: 4px solid var(--pf-t--global--color--status--success--default, #3e8635);
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.sb-success-icon {
  font-size: 16px;
  color: var(--pf-t--global--color--status--success--default, #3e8635);
  line-height: 1;
  margin-top: 2px;
}

.sb-success-body { flex: 1; min-width: 0; }

.sb-success-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--pf-t--global--color--status--success--default, #3e8635);
  margin-bottom: 2px;
}

.sb-success-text {
  font-size: 12px;
  line-height: 1.5;
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
  white-space: pre-wrap;
  word-break: break-word;
}

/* ---- Composer input bar ---- */
.sb-input-bar {
  padding: 16px 32px 20px;
  border-top: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
  background: var(--pf-t--global--background--color--primary--default, #fff);
}

.sb-composer {
  display: flex;
  flex-direction: column;
  border-radius: 14px;
  border: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
  background: var(--pf-t--global--background--color--primary--default, #fff);
  transition: border-color 0.15s, box-shadow 0.15s;
  overflow: hidden;
}

.sb-composer:focus-within {
  border-color: var(--pf-t--global--color--brand--default, #0066cc);
  box-shadow: 0 0 0 3px rgba(0, 102, 204, 0.12);
}

.sb-input {
  width: 100%;
  padding: 14px 18px 8px;
  border: none;
  font-size: 14px;
  resize: none;
  outline: none;
  font-family: inherit;
  min-height: 52px;
  max-height: 160px;
  overflow-y: auto;
  box-sizing: border-box;
  background: transparent;
  color: var(--pf-t--global--text--color--regular, #151515);
}

.sb-input::placeholder {
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
  opacity: 0.6;
}

.sb-composer-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 12px 10px 18px;
  gap: 8px;
}

.sb-composer-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.sb-kbd-hint {
  font-size: 11px;
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
  opacity: 0.6;
  white-space: nowrap;
}

.sb-composer-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.sb-send-btn {
  padding: 8px 20px;
  border-radius: 10px;
  border: none;
  background: var(--pf-t--global--color--brand--default, #0066cc);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, transform 0.1s;
  white-space: nowrap;
}

.sb-send-btn:hover:not(:disabled) {
  background: var(--pf-t--global--color--brand--hover, #004080);
}

.sb-send-btn:active:not(:disabled) { transform: scale(0.97); }

.sb-send-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.sb-stop-btn {
  padding: 8px 16px;
  border-radius: 10px;
  border: 1px solid var(--pf-t--global--color--status--danger--default, #c9190b);
  background: rgba(201, 25, 11, 0.06);
  color: var(--pf-t--global--color--status--danger--default, #c9190b);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
  white-space: nowrap;
}

.sb-stop-btn:hover {
  background: rgba(201, 25, 11, 0.15);
}

.sb-clear-btn {
  padding: 4px 8px;
  border: none;
  border-radius: 6px;
  background: none;
  font-size: 12px;
  font-weight: 500;
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
  cursor: pointer;
  opacity: 0.7;
  transition: all 0.15s;
}

.sb-clear-btn:hover { opacity: 1; background: var(--pf-t--global--background--color--secondary--default, #f5f5f5); }

.sb-advanced-toggle {
  padding: 0;
  border: none;
  background: none;
  font-size: 11px;
  font-weight: 500;
  color: var(--pf-t--global--color--brand--default, #0066cc);
  cursor: pointer;
}

.sb-advanced-toggle:hover { text-decoration: underline; }

.sb-advanced-fields {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 18px 12px;
  border-top: 1px solid var(--pf-t--global--border--color--default, #e8e8e8);
}

.sb-advanced-field {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
  min-width: 140px;
}

.sb-advanced-field label {
  font-size: 11px;
  font-weight: 600;
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
}

.sb-advanced-field select,
.sb-advanced-field input {
  padding: 6px 10px;
  border: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
  border-radius: 8px;
  font-size: 12px;
  outline: none;
  background: var(--pf-t--global--background--color--primary--default, #fff);
  color: var(--pf-t--global--text--color--regular, #151515);
}

.sb-advanced-field select:focus,
.sb-advanced-field input:focus {
  border-color: var(--pf-t--global--color--brand--default, #0066cc);
}

/* ---- Retry button ---- */
.sb-retry-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 14px;
  border: 1px solid rgba(201, 25, 11, 0.2);
  border-radius: 8px;
  background: rgba(201, 25, 11, 0.06);
  color: var(--pf-t--global--color--status--danger--default, #c9190b);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  margin-top: 8px;
  transition: background 0.15s;
}

.sb-retry-btn:hover {
  background: rgba(201, 25, 11, 0.12);
}

/* ---- Right: Artifact panel ---- */
.sb-artifact {
  width: 480px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--pf-t--global--background--color--primary--default, #fff);
}

@media (max-width: 900px) {
  .sb-artifact { width: 100%; flex: 1; }
}

.sb-artifact-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
  padding: 32px;
  margin: 24px;
  border: 2px dashed var(--pf-t--global--border--color--default, #d2d2d2);
  border-radius: 16px;
}

.sb-artifact-empty-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  background: var(--pf-t--global--background--color--secondary--default, #f5f5f5);
  margin-bottom: 16px;
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
}

.sb-artifact-empty h4 {
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 6px;
  color: var(--pf-t--global--text--color--regular, #151515);
}

.sb-artifact-empty p {
  font-size: 13px;
  margin: 0;
  line-height: 1.5;
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
  max-width: 280px;
}

/* ---- Preview section ---- */
.sb-preview {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sb-preview-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  background: var(--pf-t--global--background--color--secondary--default, #f5f5f5);
  border-bottom: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
  font-size: 13px;
  font-weight: 600;
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
  gap: 8px;
  flex-wrap: wrap;
}

.sb-preview-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.sb-preview-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--pf-t--global--color--brand--default, #0066cc);
  animation: sb-pulse 2s ease-in-out infinite;
}

@keyframes sb-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(0, 102, 204, 0.4); }
  50% { box-shadow: 0 0 0 5px rgba(0, 102, 204, 0); }
}

.sb-preview-badge {
  font-size: 11px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--pf-t--global--background--color--secondary--default, #e8e8e8);
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
}

.sb-preview-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* ---- Mode toggle (segmented control) ---- */
.sb-mode-toggle {
  display: flex;
  border: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
  border-radius: 8px;
  overflow: hidden;
}

.sb-mode-btn {
  padding: 4px 12px;
  border: none;
  background: var(--pf-t--global--background--color--primary--default, #fff);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
  transition: all 0.15s;
}

.sb-mode-btn:not(:last-child) {
  border-right: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
}

.sb-mode-btn--active {
  background: var(--pf-t--global--color--brand--default, #0066cc);
  color: #fff;
}

.sb-copy-btn {
  padding: 4px 12px;
  border: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
  border-radius: 8px;
  background: var(--pf-t--global--background--color--primary--default, #fff);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
}

.sb-copy-btn:hover {
  background: var(--pf-t--global--background--color--secondary--default, #f5f5f5);
  border-color: var(--pf-t--global--color--brand--default, #0066cc);
}

/* ---- Preview body ---- */
.sb-preview-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
  font-size: 14px;
  line-height: 1.7;
  word-break: break-word;
}

.sb-preview-raw {
  font-family: 'Red Hat Mono', 'SF Mono', Monaco, Menlo, Consolas, monospace;
  white-space: pre-wrap;
  font-size: 13px;
  line-height: 1.7;
  color: var(--pf-t--global--text--color--regular, #151515);
}

.sb-preview-md { font-size: 14px; line-height: 1.7; }

.sb-preview-md h1,
.sb-preview-md h2,
.sb-preview-md h3,
.sb-preview-md h4 {
  margin: 16px 0 8px;
  font-weight: 600;
  color: var(--pf-t--global--text--color--regular, #151515);
  letter-spacing: -0.01em;
}

.sb-preview-md h1:first-child,
.sb-preview-md h2:first-child,
.sb-preview-md h3:first-child { margin-top: 0; }

.sb-preview-md h1 { font-size: 20px; }
.sb-preview-md h2 { font-size: 17px; }
.sb-preview-md h3 { font-size: 15px; }

.sb-preview-md p { margin: 0 0 12px; color: var(--pf-t--global--text--color--regular, #151515); }

.sb-preview-md ul,
.sb-preview-md ol {
  margin: 0 0 12px;
  padding-left: 20px;
}

.sb-preview-md li { margin-bottom: 4px; color: var(--pf-t--global--text--color--regular, #151515); }

.sb-preview-md code {
  font-family: 'Red Hat Mono', 'SF Mono', Monaco, Menlo, Consolas, monospace;
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--pf-t--global--background--color--secondary--default, #f0f0f0);
  color: var(--pf-t--global--text--color--regular, #151515);
}

.sb-preview-md pre {
  margin: 0 0 12px;
  padding: 14px 16px;
  border-radius: 10px;
  background: #1e1e2e;
  color: #cdd6f4;
  overflow-x: auto;
  font-size: 12px;
  line-height: 1.6;
}

.sb-preview-md pre code {
  background: none;
  padding: 0;
  color: inherit;
  font-size: inherit;
}

.sb-preview-md blockquote {
  margin: 0 0 12px;
  padding: 10px 16px;
  border-left: 3px solid var(--pf-t--global--color--brand--default, #0066cc);
  background: var(--pf-t--global--background--color--secondary--default, #f8f9fa);
  border-radius: 0 8px 8px 0;
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
}

.sb-preview-md strong { font-weight: 600; }

/* ---- Collapsible sections ---- */
.sb-section { margin-bottom: 4px; }

.sb-section-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 4px 0;
  border: none;
  background: none;
  cursor: pointer;
  text-align: left;
  color: inherit;
}

.sb-section-toggle:hover .sb-section-heading {
  color: var(--pf-t--global--color--brand--default, #0066cc);
}

.sb-section-arrow {
  font-size: 10px;
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
  flex-shrink: 0;
  width: 14px;
}

.sb-section-heading {
  margin: 0;
  font-weight: 600;
  color: var(--pf-t--global--text--color--regular, #151515);
  transition: color 0.15s;
}

.sb-section-content {
  padding-left: 20px;
  margin-bottom: 8px;
}

/* ---- Cursor ---- */
.sb-cursor {
  display: inline-block;
  width: 2px;
  height: 16px;
  background: var(--pf-t--global--color--brand--default, #0066cc);
  margin-left: 2px;
  vertical-align: text-bottom;
  animation: sb-blink 1s step-end infinite;
}

@keyframes sb-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

/* ---- Skeleton loading ---- */
.sb-preview-placeholder {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 8px 0;
}

.sb-skeleton-line {
  height: 14px;
  border-radius: 8px;
  background: var(--pf-t--global--background--color--secondary--default, #e8e8e8);
  animation: sb-shimmer 1.5s ease-in-out infinite;
}

.sb-skeleton-line--long { width: 90%; }
.sb-skeleton-line--medium { width: 65%; }
.sb-skeleton-line--short { width: 40%; }

@keyframes sb-shimmer {
  0% { opacity: 0.5; }
  50% { opacity: 1; }
  100% { opacity: 0.5; }
}

/* ---- Diff view ---- */
.sb-diff {
  font-family: 'Red Hat Mono', 'SF Mono', Monaco, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
}

.sb-diff-line {
  display: flex;
  gap: 8px;
  padding: 1px 8px;
}

.sb-diff-line--added { background: rgba(22, 163, 74, 0.1); color: var(--pf-t--global--color--status--success--default, #3e8635); }
.sb-diff-line--removed { background: rgba(201, 25, 11, 0.1); color: var(--pf-t--global--color--status--danger--default, #c9190b); text-decoration: line-through; }
.sb-diff-line--same { color: var(--pf-t--global--text--color--subtle, #6a6e73); }

.sb-diff-marker {
  flex-shrink: 0;
  width: 14px;
  text-align: center;
  font-weight: 700;
  user-select: none;
}

/* ---- Publish section ---- */
.sb-publish {
  border-top: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
  padding: 16px 20px;
  background: var(--pf-t--global--background--color--primary--default, #fff);
}

.sb-publish-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 0;
  border: none;
  background: none;
  font-size: 13px;
  font-weight: 600;
  color: var(--pf-t--global--color--brand--default, #0066cc);
  cursor: pointer;
}

.sb-publish-toggle:hover { text-decoration: underline; }

.sb-publish-form {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sb-publish-error {
  font-size: 13px;
  color: var(--pf-t--global--color--status--danger--default, #c9190b);
  margin-bottom: 4px;
}

.sb-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sb-field-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
}

.sb-field-input {
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
  font-size: 13px;
  outline: none;
  background: var(--pf-t--global--background--color--primary--default, #fff);
  color: var(--pf-t--global--text--color--regular, #151515);
  transition: border-color 0.15s;
}

.sb-field-input:focus {
  border-color: var(--pf-t--global--color--brand--default, #0066cc);
  box-shadow: 0 0 0 2px rgba(0, 102, 204, 0.08);
}

.sb-publish-btn {
  padding: 10px 20px;
  border-radius: 10px;
  border: none;
  background: var(--pf-t--global--color--brand--default, #0066cc);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
  align-self: flex-start;
}

.sb-publish-btn:hover:not(:disabled) {
  background: var(--pf-t--global--color--brand--hover, #004080);
}

.sb-publish-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.sb-publish-success {
  padding: 12px 16px;
  border-radius: 10px;
  background: rgba(62, 134, 53, 0.08);
  border: 1px solid rgba(62, 134, 53, 0.2);
  border-left: 4px solid var(--pf-t--global--color--status--success--default, #3e8635);
}

.sb-publish-success-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--pf-t--global--color--status--success--default, #3e8635);
  margin-bottom: 8px;
}

.sb-oci-ref {
  font-size: 12px;
  font-family: 'Red Hat Mono', 'SF Mono', Monaco, Menlo, Consolas, monospace;
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--pf-t--global--background--color--primary--default, #fff);
  border: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
  word-break: break-all;
  margin-bottom: 8px;
  color: var(--pf-t--global--text--color--regular, #151515);
}

.sb-publish-link {
  font-size: 13px;
  color: var(--pf-t--global--color--brand--default, #0066cc);
  text-decoration: none;
  font-weight: 500;
}

.sb-publish-link:hover { text-decoration: underline; }

/* ---- Pipeline progress (horizontal stepper) ---- */
.bld-pipeline {
  display: flex;
  align-items: flex-start;
  gap: 0;
  margin: 0 0 16px;
  padding: 16px 20px;
  background: var(--pf-t--global--background--color--secondary--default, #f5f5f5);
  border-radius: 12px;
  border: 1px solid var(--pf-t--global--border--color--default, #e0e0e0);
  overflow-x: auto;
}

.bld-stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  flex: 1;
  position: relative;
  min-width: 80px;
}

.bld-stage:not(:last-child)::after {
  content: '';
  position: absolute;
  top: 14px;
  left: calc(50% + 16px);
  right: calc(-50% + 16px);
  height: 2px;
  background: var(--pf-t--global--border--color--default, #d2d2d2);
  z-index: 0;
}

.bld-stage.bld-stage--completed:not(:last-child)::after {
  background: var(--pf-t--global--color--status--success--default, #3e8635);
}

.bld-stage.bld-stage--active:not(:last-child)::after {
  background: linear-gradient(90deg, var(--pf-t--global--color--brand--default, #0066cc), var(--pf-t--global--border--color--default, #d2d2d2));
}

.bld-stage-dot {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
  transition: all 0.3s;
  position: relative;
  z-index: 1;
}

.bld-stage--pending .bld-stage-dot {
  background: var(--pf-t--global--background--color--primary--default, #fff);
  border: 2px solid var(--pf-t--global--border--color--default, #d2d2d2);
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
}

.bld-stage--active .bld-stage-dot {
  background: var(--pf-t--global--color--brand--default, #0066cc);
  color: #fff;
  animation: bld-pulse 2s ease-in-out infinite;
}

.bld-stage--completed .bld-stage-dot {
  background: var(--pf-t--global--color--status--success--default, #3e8635);
  color: #fff;
}

.bld-stage--error .bld-stage-dot {
  background: var(--pf-t--global--color--status--danger--default, #c9190b);
  color: #fff;
}

.bld-stage-label {
  font-size: 10px;
  font-weight: 600;
  text-align: center;
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
  max-width: 90px;
  line-height: 1.3;
}

.bld-stage--active .bld-stage-label {
  color: var(--pf-t--global--color--brand--default, #0066cc);
  font-weight: 700;
}

.bld-stage--completed .bld-stage-label {
  color: var(--pf-t--global--color--status--success--default, #3e8635);
}

@keyframes bld-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(0, 102, 204, 0.4); }
  50% { box-shadow: 0 0 0 8px rgba(0, 102, 204, 0); }
}
`;
