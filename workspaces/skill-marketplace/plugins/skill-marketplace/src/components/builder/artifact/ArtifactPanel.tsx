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
import { useBundle } from '../../../hooks';
import AddToBundleButton from '../../shared/AddToBundleButton';
import { SkillEditor } from './SkillEditor';
import { DiffViewer } from './DiffViewer';
import { PublishDialog, extractSkillMetadata } from './PublishDialog';
import styles from './ArtifactPanel.module.css';

type PreviewMode = 'rendered' | 'raw' | 'diff';

interface ArtifactPanelProps {
  generatedContent: string;
  publishContent: string;
  previousContent: string;
  isGenerating: boolean;
}

export function ArtifactPanel({
  generatedContent,
  publishContent,
  previousContent,
  isGenerating,
}: ArtifactPanelProps) {
  const api = useApi(skillMarketplaceApiRef);
  const { setDrawerOpen } = useBundle();
  const [previewMode, setPreviewMode] = useState<PreviewMode>('rendered');
  const [copied, setCopied] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  const effectivePublish = publishContent || generatedContent;
  const lineCount = generatedContent ? generatedContent.split('\n').length : 0;
  const prefill = useMemo(
    () =>
      effectivePublish ? extractSkillMetadata(effectivePublish) : undefined,
    [effectivePublish],
  );
  const builderBundleSkill = useMemo(() => {
    if (!generatedContent) return null;
    const meta = extractSkillMetadata(generatedContent);
    const slug = meta.name || 'builder-skill';
    return {
      name: slug,
      slug,
      category: 'General' as const,
      description: meta.description || 'Skill from Skill Builder',
    };
  }, [generatedContent]);

  useEffect(() => {
    if (isGenerating && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [generatedContent, isGenerating]);

  const handleCopy = useCallback(() => {
    window.navigator.clipboard.writeText(generatedContent).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [generatedContent]);

  const handlePublish = useCallback(
    async (params: {
      skillName: string;
      version: string;
      description: string;
      author: string;
    }) => {
      const result = (await api.publishSkill({
        skillName: params.skillName,
        version: params.version,
        description: params.description,
        author: params.author,
        content: effectivePublish,
      })) as { ociReference: string };
      return result;
    },
    [api, effectivePublish],
  );

  if (!generatedContent) {
    return null;
  }

  const modes: PreviewMode[] = previousContent
    ? ['rendered', 'raw', 'diff']
    : ['rendered', 'raw'];

  return (
    <>
      <div className={styles.bldArtifact}>
        <div className={styles.bldArtifactToolbar}>
          <div className={styles.bldArtifactStatus}>
            {isGenerating && <span className={styles.bldArtifactLiveDot} />}
            <span>{isGenerating ? 'Generating...' : 'Skill Package'}</span>
            {!isGenerating && generatedContent && (
              <span className={styles.bldArtifactBadge}>{lineCount} lines</span>
            )}
          </div>
          <div className={styles.bldArtifactActions}>
            {!isGenerating && generatedContent && (
              <div
                className={styles.bldModeGroup}
                role="tablist"
                aria-label="Preview mode"
              >
                {modes.map(m => (
                  <button
                    key={m}
                    className={`${styles.bldModeBtn} ${
                      previewMode === m ? styles.bldModeBtnActive : ''
                    }`}
                    onClick={() => setPreviewMode(m)}
                    type="button"
                    role="tab"
                    aria-selected={previewMode === m}
                  >
                    {m === 'rendered'
                      ? 'Preview'
                      : m === 'raw'
                        ? 'Raw'
                        : 'Diff'}
                  </button>
                ))}
              </div>
            )}
            {generatedContent && !isGenerating && (
              <button
                className={styles.bldIconBtn}
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

        <div className={styles.bldArtifactBody} ref={bodyRef}>
          {previewMode === 'diff' && previousContent ? (
            <DiffViewer oldText={previousContent} newText={generatedContent} />
          ) : (
            <SkillEditor
              content={generatedContent}
              streaming={isGenerating}
              mode={previewMode === 'diff' ? 'raw' : previewMode}
            />
          )}
        </div>

        {generatedContent && !isGenerating && (
          <div className={styles.bldArtifactFooter}>
            <div className={styles.bldArtifactFooterRow}>
              {builderBundleSkill && (
                <AddToBundleButton
                  variant="full"
                  skill={builderBundleSkill}
                  className={styles.bldAddToBundle}
                />
              )}
              <button
                className={styles.bldPublishBtn}
                onClick={() => setPublishOpen(true)}
                type="button"
                aria-label="Publish skill to OCI registry"
              >
                Publish to OCI Registry
              </button>
              <button
                type="button"
                className={styles.bldViewCartLink}
                onClick={() => setDrawerOpen(true)}
                aria-label="Open skill bundle shopping cart"
              >
                View skill bundle cart
              </button>
            </div>
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
