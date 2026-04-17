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

export function extractSkillMetadata(content: string): { name?: string; version?: string; description?: string } {
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

  const versionMatch = content.match(/(?:^|\n)\s*(?:version|Version)\s*[:=]\s*["']?(\d+\.\d+(?:\.\d+)?)["']?/);
  if (versionMatch) {
    result.version = versionMatch[1];
  }

  const descMatch = content.match(/(?:^|\n)(?:>|##?\s+(?:Description|Summary|Overview))\s*\n+([\s\S]*?)(?=\n##|\n---|\n\n\n|$)/i);
  if (descMatch) {
    result.description = descMatch[1].trim().split('\n')[0].slice(0, 200);
  }

  return result;
}

interface PublishFormProps {
  onPublish: (params: {
    skillName: string;
    version: string;
    author: string;
  }) => Promise<{ ociReference: string }>;
  prefill?: { name?: string; version?: string; description?: string };
}

export function PublishForm({ onPublish, prefill }: PublishFormProps) {
  const [show, setShow] = useState(false);
  const [skillName, setSkillName] = useState('');
  const [version, setVersion] = useState('0.1.0');
  const [author, setAuthor] = useState('');
  const [prefilled, setPrefilled] = useState(false);

  useEffect(() => {
    if (prefill && !prefilled) {
      if (prefill.name && !skillName) setSkillName(prefill.name);
      if (prefill.version) setVersion(prefill.version);
      setPrefilled(true);
    }
  }, [prefill, prefilled, skillName]);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ ociReference: string } | null>(null);

  const handlePublish = useCallback(async () => {
    if (!skillName.trim()) return;
    setPublishing(true);
    setError(null);
    try {
      const res = await onPublish({
        skillName: skillName.trim(),
        version: version.trim() || '0.1.0',
        author: author.trim() || 'skill-marketplace',
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Publish failed');
    } finally {
      setPublishing(false);
    }
  }, [onPublish, skillName, version, author]);

  if (result) {
    return (
      <div className="sb-publish-success">
        <div className="sb-publish-success-title">
          {'\u2713'} Published to OCI Registry
        </div>
        <div className="sb-oci-ref">{result.ociReference}</div>
        <Link className="sb-publish-link" to="../skills">
          View in Skills Catalog
        </Link>
      </div>
    );
  }

  return (
    <>
      <button
        className="sb-publish-toggle"
        onClick={() => setShow(prev => !prev)}
        type="button"
      >
        {show ? '\u25BC' : '\u25B6'} Publish to OCI Registry
      </button>
      {show && (
        <div className="sb-publish-form">
          {error && (
            <div style={{ fontSize: 13, color: '#c9190b', marginBottom: 4 }}>
              {error}
            </div>
          )}
          <div className="sb-field">
            <label className="sb-field-label">Skill Name *</label>
            <input
              className="sb-field-input"
              value={skillName}
              onChange={e => setSkillName(e.target.value)}
              placeholder="e.g. my-new-skill"
            />
          </div>
          <div className="sb-field">
            <label className="sb-field-label">Version</label>
            <input
              className="sb-field-input"
              value={version}
              onChange={e => setVersion(e.target.value)}
              placeholder="0.1.0"
            />
          </div>
          <div className="sb-field">
            <label className="sb-field-label">Author</label>
            <input
              className="sb-field-input"
              value={author}
              onChange={e => setAuthor(e.target.value)}
              placeholder="your-name or team"
            />
          </div>
          <button
            className="sb-publish-btn"
            onClick={handlePublish}
            disabled={publishing || !skillName.trim()}
            type="button"
          >
            {publishing ? 'Publishing...' : 'Publish'}
          </button>
        </div>
      )}
    </>
  );
}
