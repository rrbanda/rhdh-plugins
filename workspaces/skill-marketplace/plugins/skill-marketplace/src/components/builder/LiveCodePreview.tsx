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
import { useRef, useEffect, useCallback, useState } from 'react';

interface LiveCodePreviewProps {
  content: string;
  streaming: boolean;
}

export function LiveCodePreview({ content, streaming }: LiveCodePreviewProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (streaming && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [content, streaming]);

  const lineCount = content ? content.split('\n').length : 0;

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [content]);

  return (
    <div className="bld-preview">
      <div className="bld-preview-toolbar">
        <span>
          {streaming
            ? 'Generating SKILL.md...'
            : content
              ? `SKILL.md \u00B7 ${lineCount} lines`
              : 'SKILL.md'}
        </span>
        {content && !streaming && (
          <button
            className="bld-copy-btn"
            onClick={handleCopy}
            type="button"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        )}
      </div>
      <div className="bld-preview-body" ref={bodyRef}>
        {content ? (
          <>
            {content}
            {streaming && <span className="bld-cursor" />}
          </>
        ) : (
          <div className="bld-preview-empty">
            {streaming
              ? 'Waiting for output...'
              : 'Skill content will appear here'}
          </div>
        )}
      </div>
    </div>
  );
}
