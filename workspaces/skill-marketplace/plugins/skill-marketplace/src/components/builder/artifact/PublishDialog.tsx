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

const publishDialogStyles = `
.bld-publish-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  animation: bld-fadeIn 0.15s ease;
}
@keyframes bld-fadeIn { from { opacity: 0; } to { opacity: 1; } }

.bld-publish-dialog {
  background: var(--pf-t--global--background--color--primary--default, #fff);
  border: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
  border-radius: 12px;
  width: 420px;
  max-width: 90vw;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
  overflow: hidden;
}

.bld-publish-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
}
.bld-publish-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.bld-publish-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.bld-publish-field label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 4px;
  color: var(--pf-t--global--text--color--regular, #151515);
}
.bld-publish-field input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
  border-radius: 6px;
  font-size: 14px;
  background: var(--pf-t--global--background--color--primary--default, #fff);
  color: var(--pf-t--global--text--color--regular, #151515);
  box-sizing: border-box;
}
.bld-publish-field input:focus {
  outline: 2px solid var(--pf-t--global--color--brand--default, #0066cc);
  outline-offset: -1px;
}

.bld-publish-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 20px;
  border-top: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
}
.bld-publish-cancel, .bld-publish-submit {
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border: none;
}
.bld-publish-cancel {
  background: transparent;
  color: var(--pf-t--global--text--color--regular, #151515);
}
.bld-publish-cancel:hover { background: var(--pf-t--global--background--color--secondary--default, #f0f0f0); }
.bld-publish-submit {
  background: var(--pf-t--global--color--brand--default, #0066cc);
  color: #fff;
}
.bld-publish-submit:hover { opacity: 0.9; }
.bld-publish-submit:disabled { opacity: 0.5; cursor: not-allowed; }

.bld-publish-error {
  padding: 10px 14px;
  background: var(--pf-t--global--color--status--danger--default, #c9190b);
  color: #fff;
  border-radius: 6px;
  font-size: 13px;
}

.bld-publish-success-card {
  text-align: center;
  padding: 24px 20px;
}
.bld-publish-success-check {
  font-size: 32px;
  color: var(--pf-t--global--color--status--success--default, #3e8635);
  margin-bottom: 8px;
}
.bld-publish-success-ref {
  font-size: 13px;
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
  word-break: break-all;
  margin: 8px 0;
}
`;

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
  if (descMatch) result.description = descMatch[1].trim().split('\n')[0].slice(0, 200);

  return result;
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

export function PublishDialog({ open, onClose, onPublish, prefill }: PublishDialogProps) {
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
    <>
      <style>{publishDialogStyles}</style>
      <div className="bld-publish-overlay" onClick={onClose} onKeyDown={handleKeyDown} role="presentation">
        <div
          className="bld-publish-dialog"
          onClick={e => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="Publish skill to OCI registry"
        >
          <div className="bld-publish-header">
            <h3>Publish to OCI Registry</h3>
            <button onClick={onClose} type="button" aria-label="Close dialog" className="bld-publish-cancel">
              ✕
            </button>
          </div>

          {result ? (
            <div className="bld-publish-success-card">
              <div className="bld-publish-success-check">&#10003;</div>
              <h4>Published Successfully</h4>
              <div className="bld-publish-success-ref">{result.ociReference}</div>
              <Link to="../skills">View in Skills Catalog</Link>
            </div>
          ) : (
            <>
              <div className="bld-publish-body">
                {error && (
                  <div className="bld-publish-error" role="alert">
                    {error}
                  </div>
                )}
                <div className="bld-publish-field">
                  <label htmlFor="bld-pub-name">Skill Name *</label>
                  <input
                    id="bld-pub-name"
                    value={skillName}
                    onChange={e => setSkillName(e.target.value)}
                    placeholder="e.g. my-new-skill"
                    required
                    aria-required="true"
                    autoFocus
                  />
                </div>
                <div className="bld-publish-field">
                  <label htmlFor="bld-pub-version">Version</label>
                  <input
                    id="bld-pub-version"
                    value={version}
                    onChange={e => setVersion(e.target.value)}
                    placeholder="0.1.0"
                  />
                </div>
                <div className="bld-publish-field">
                  <label htmlFor="bld-pub-desc">Description</label>
                  <input
                    id="bld-pub-desc"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Brief description of the skill"
                  />
                </div>
                <div className="bld-publish-field">
                  <label htmlFor="bld-pub-author">Author</label>
                  <input
                    id="bld-pub-author"
                    value={author}
                    onChange={e => setAuthor(e.target.value)}
                    placeholder="your-name or team"
                  />
                </div>
              </div>
              <div className="bld-publish-footer">
                <button className="bld-publish-cancel" onClick={onClose} type="button">
                  Cancel
                </button>
                <button
                  className="bld-publish-submit"
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
    </>
  );
}
