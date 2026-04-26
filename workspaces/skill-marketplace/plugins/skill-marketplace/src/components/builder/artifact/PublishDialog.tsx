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
import { useState, useCallback, useEffect } from 'react';
import { Link } from '@backstage/core-components';
import AddToBundleButton from '../../shared/AddToBundleButton';
import styles from './PublishDialog.module.css';

export function extractSkillMetadata(content: string): {
  name?: string;
  version?: string;
  description?: string;
} {
  const result: { name?: string; version?: string; description?: string } = {};

  const titleMatch = content.match(/^#\s+(.+)/m);
  if (titleMatch) {
    result.name = titleMatch[1]
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-\s]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  const versionMatch = content.match(
    /(?:^|\n)\s*(?:version|Version)\s*[:=]\s*["']?(\d+\.\d+(?:\.\d+)?)["']?/,
  );
  if (versionMatch) result.version = versionMatch[1];

  const descMatch = content.match(
    /(?:^|\n)(?:>|##?\s+(?:Description|Summary|Overview))\s*\n+([\s\S]*?)(?=\n##|\n---|\n\n\n|$)/i,
  );
  if (descMatch)
    result.description = descMatch[1].trim().split('\n')[0].slice(0, 200);

  return result;
}

function deriveBuilderSkillSlug(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'builder-skill'
  );
}

interface PublishDialogProps {
  open: boolean;
  onClose: () => void;
  onPublish: (params: {
    skillName: string;
    version: string;
    description: string;
    author: string;
  }) => Promise<{ ociReference: string }>;
  prefill?: { name?: string; version?: string; description?: string };
}

export function PublishDialog({
  open,
  onClose,
  onPublish,
  prefill,
}: PublishDialogProps) {
  const [skillName, setSkillName] = useState('');
  const [version, setVersion] = useState('0.1.0');
  const [description, setDescription] = useState('');
  const [author, setAuthor] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ ociReference: string } | null>(null);

  useEffect(() => {
    if (open && prefill) {
      if (prefill.name) setSkillName(prefill.name);
      if (prefill.version) setVersion(prefill.version);
      if (prefill.description) setDescription(prefill.description);
    }
  }, [open, prefill]);

  const handleSubmit = useCallback(async () => {
    if (!skillName.trim()) return;
    setPublishing(true);
    setError(null);
    try {
      const res = await onPublish({
        skillName: skillName.trim(),
        version: version.trim() || '0.1.0',
        description: description.trim(),
        author: author.trim() || 'skill-marketplace',
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Publish failed');
    } finally {
      setPublishing(false);
    }
  }, [onPublish, skillName, version, description, author]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  if (!open) return null;

  return (
    <div
      className={styles.bldPublishOverlay}
      onClick={onClose}
      onKeyDown={handleKeyDown}
      role="presentation"
    >
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- modal surface; Escape handled on overlay */}
      <div
        className={styles.bldPublishDialog}
        onClick={e => e.stopPropagation()}
        onKeyDown={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Publish skill to OCI registry"
      >
        <div className={styles.bldPublishHeader}>
          <h3>Publish to OCI Registry</h3>
          <button
            onClick={onClose}
            type="button"
            aria-label="Close dialog"
            className={styles.bldPublishCancel}
          >
            ✕
          </button>
        </div>

        {result ? (
          <div className={styles.bldPublishSuccessCard}>
            <div className={styles.bldPublishSuccessCheck}>&#10003;</div>
            <h4>Published Successfully</h4>
            <div className={styles.bldPublishSuccessRef}>
              {result.ociReference}
            </div>
            <div className={styles.bldPublishSuccessActions}>
              <AddToBundleButton
                variant="full"
                skill={{
                  name: skillName.trim(),
                  slug: deriveBuilderSkillSlug(skillName),
                  category: 'General',
                  description: description.trim() || 'Skill from Skill Builder',
                }}
              />
              <Link to="../skills">View in Skills Catalog</Link>
            </div>
          </div>
        ) : (
          <>
            <div className={styles.bldPublishBody}>
              {error && (
                <div className={styles.bldPublishError} role="alert">
                  {error}
                </div>
              )}
              <div className={styles.bldPublishField}>
                <label htmlFor="bld-pub-name">Skill Name *</label>
                <input
                  id="bld-pub-name"
                  value={skillName}
                  onChange={e => setSkillName(e.target.value)}
                  placeholder="e.g. my-new-skill"
                  required
                  aria-required="true"
                  // eslint-disable-next-line jsx-a11y/no-autofocus -- focus first field when dialog opens
                  autoFocus
                />
              </div>
              <div className={styles.bldPublishField}>
                <label htmlFor="bld-pub-version">Version</label>
                <input
                  id="bld-pub-version"
                  value={version}
                  onChange={e => setVersion(e.target.value)}
                  placeholder="0.1.0"
                />
              </div>
              <div className={styles.bldPublishField}>
                <label htmlFor="bld-pub-desc">Description</label>
                <input
                  id="bld-pub-desc"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Brief description of the skill"
                />
              </div>
              <div className={styles.bldPublishField}>
                <label htmlFor="bld-pub-author">Author</label>
                <input
                  id="bld-pub-author"
                  value={author}
                  onChange={e => setAuthor(e.target.value)}
                  placeholder="your-name or team"
                />
              </div>
            </div>
            <div className={styles.bldPublishFooter}>
              <button
                className={styles.bldPublishCancel}
                onClick={onClose}
                type="button"
              >
                Cancel
              </button>
              <button
                className={styles.bldPublishSubmit}
                onClick={handleSubmit}
                disabled={publishing || !skillName.trim()}
                type="button"
                aria-busy={publishing}
              >
                {publishing ? 'Publishing...' : 'Publish'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
