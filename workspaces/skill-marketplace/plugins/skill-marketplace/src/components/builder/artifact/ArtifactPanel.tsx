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
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { skillMarketplaceApiRef } from '../../../api';
import { SkillEditor } from './SkillEditor';
import { DiffViewer } from './DiffViewer';
import { PublishDialog, extractSkillMetadata } from './PublishDialog';

const artifactStyles = `
.bld-artifact {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--pf-t--global--background--color--primary--default, #fff);
}
.bld-artifact-waiting {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 8px;
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
}
.bld-artifact-waiting-spinner {
  width: 24px;
  height: 24px;
  border: 3px solid var(--pf-t--global--color--brand--default, #0066cc)22;
  border-top-color: var(--pf-t--global--color--brand--default, #0066cc);
  border-radius: 50%;
  animation: bld-spin 0.8s linear infinite;
}
@keyframes bld-spin { to { transform: rotate(360deg); } }
.bld-artifact-waiting-text {
  font-size: 13px;
}

.bld-artifact-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  border-bottom: 1px solid var(--pf-t--global--border--color--default, #e8e8e8);
  gap: 8px;
  min-height: 44px;
  flex-shrink: 0;
}

.bld-artifact-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--pf-t--global--text--color--regular, #151515);
}
.bld-artifact-live-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--pf-t--global--color--brand--default, #0066cc);
  animation: bld-pulse 1.5s ease-in-out infinite;
}
@keyframes bld-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

.bld-artifact-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--pf-t--global--background--color--secondary--default, #f0f0f0);
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
}

.bld-artifact-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.bld-mode-group {
  display: flex;
  border: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
  border-radius: 6px;
  overflow: hidden;
}
.bld-mode-btn {
  padding: 4px 10px;
  font-size: 12px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
  transition: all 0.15s;
}
.bld-mode-btn:not(:last-child) { border-right: 1px solid var(--pf-t--global--border--color--default, #d2d2d2); }
.bld-mode-btn--active {
  background: var(--pf-t--global--color--brand--default, #0066cc);
  color: #fff;
}
.bld-mode-btn:hover:not(.bld-mode-btn--active) {
  background: var(--pf-t--global--background--color--secondary--default, #f0f0f0);
}

.bld-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 6px;
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
  font-size: 14px;
}
.bld-icon-btn:hover {
  background: var(--pf-t--global--background--color--secondary--default, #f0f0f0);
}

.bld-artifact-body {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.bld-artifact-generating {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 8px;
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
}
.bld-artifact-gen-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--pf-t--global--color--brand--default, #0066cc)33;
  border-top-color: var(--pf-t--global--color--brand--default, #0066cc);
  border-radius: 50%;
  animation: bld-spin 0.8s linear infinite;
}
.bld-artifact-gen-text {
  font-size: 13px;
}

.bld-artifact-footer {
  padding: 12px 16px;
  border-top: 1px solid var(--pf-t--global--border--color--default, #e8e8e8);
  flex-shrink: 0;
}
.bld-publish-btn {
  width: 100%;
  padding: 10px 16px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  background: var(--pf-t--global--color--brand--default, #0066cc);
  color: #fff;
  transition: opacity 0.15s;
}
.bld-publish-btn:hover { opacity: 0.9; }
`;

type PreviewMode = 'rendered' | 'raw' | 'diff';

interface ArtifactPanelProps {
  generatedContent: string;
  previousContent: string;
  isGenerating: boolean;
}

export function ArtifactPanel({ generatedContent, previousContent, isGenerating }: ArtifactPanelProps) {
  const api = useApi(skillMarketplaceApiRef);
  const [previewMode, setPreviewMode] = useState<PreviewMode>('rendered');
  const [copied, setCopied] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  const lineCount = generatedContent ? generatedContent.split('\n').length : 0;
  const prefill = useMemo(
    () => (generatedContent ? extractSkillMetadata(generatedContent) : undefined),
    [generatedContent],
  );

  useEffect(() => {
    if (isGenerating && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [generatedContent, isGenerating]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(generatedContent).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [generatedContent]);

  const handlePublish = useCallback(
    async (params: { skillName: string; version: string; description: string; author: string }) => {
      const result = (await api.publishSkill({
        skillName: params.skillName,
        version: params.version,
        description: params.description,
        author: params.author,
        content: generatedContent,
      })) as { ociReference: string };
      return result;
    },
    [api, generatedContent],
  );

  if (!generatedContent && !isGenerating) {
    return null;
  }

  const modes: PreviewMode[] = previousContent
    ? ['rendered', 'raw', 'diff']
    : ['rendered', 'raw'];

  return (
    <>
      <style>{artifactStyles}</style>
      <div className="bld-artifact">
        <div className="bld-artifact-toolbar">
          <div className="bld-artifact-status">
            {isGenerating && <span className="bld-artifact-live-dot" />}
            <span>{isGenerating ? 'Generating...' : 'SKILL.md'}</span>
            {!isGenerating && generatedContent && (
              <span className="bld-artifact-badge">{lineCount} lines</span>
            )}
          </div>
          <div className="bld-artifact-actions">
            {!isGenerating && generatedContent && (
              <div className="bld-mode-group" role="tablist" aria-label="Preview mode">
                {modes.map(m => (
                  <button
                    key={m}
                    className={`bld-mode-btn${previewMode === m ? ' bld-mode-btn--active' : ''}`}
                    onClick={() => setPreviewMode(m)}
                    type="button"
                    role="tab"
                    aria-selected={previewMode === m}
                  >
                    {m === 'rendered' ? 'Preview' : m === 'raw' ? 'Raw' : 'Diff'}
                  </button>
                ))}
              </div>
            )}
            {generatedContent && !isGenerating && (
              <button
                className="bld-icon-btn"
                onClick={handleCopy}
                type="button"
                title={copied ? 'Copied!' : 'Copy content'}
                aria-label="Copy skill content"
              >
                {copied ? '\u2713' : '\u2398'}
              </button>
            )}
          </div>
        </div>

        <div className="bld-artifact-body" ref={bodyRef}>
          {generatedContent ? (
            previewMode === 'diff' && previousContent ? (
              <DiffViewer oldText={previousContent} newText={generatedContent} />
            ) : (
              <SkillEditor
                content={generatedContent}
                streaming={isGenerating}
                mode={previewMode === 'diff' ? 'raw' : previewMode}
              />
            )
          ) : (
            <div className="bld-artifact-generating">
              <span className="bld-artifact-gen-spinner" />
              <span className="bld-artifact-gen-text">Agent is generating content...</span>
            </div>
          )}
        </div>

        {generatedContent && !isGenerating && (
          <div className="bld-artifact-footer">
            <button
              className="bld-publish-btn"
              onClick={() => setPublishOpen(true)}
              type="button"
            >
              Publish to OCI Registry
            </button>
          </div>
        )}
      </div>

      <PublishDialog
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        onPublish={handlePublish}
        prefill={prefill}
      />
    </>
  );
}
