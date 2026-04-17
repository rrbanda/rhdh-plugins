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
import { useState, useCallback, useMemo } from 'react';
import Markdown from 'react-markdown';

interface SkillSection {
  heading: string;
  level: number;
  content: string;
}

export function parseSections(md: string): SkillSection[] {
  const lines = md.split('\n');
  const sections: SkillSection[] = [];
  let currentHeading = '';
  let currentLevel = 0;
  let buffer: string[] = [];

  for (const line of lines) {
    const match = line.match(/^(#{1,3})\s+(.+)/);
    if (match) {
      if (currentHeading || buffer.length > 0) {
        sections.push({
          heading: currentHeading,
          level: currentLevel,
          content: buffer.join('\n').trim(),
        });
      }
      currentLevel = match[1].length;
      currentHeading = match[2];
      buffer = [];
    } else {
      buffer.push(line);
    }
  }

  if (currentHeading || buffer.length > 0) {
    sections.push({
      heading: currentHeading,
      level: currentLevel,
      content: buffer.join('\n').trim(),
    });
  }

  return sections;
}

interface SkillPreviewProps {
  content: string;
  streaming?: boolean;
  mode: 'rendered' | 'raw';
}

export function SkillPreview({ content, streaming, mode }: SkillPreviewProps) {
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  const toggleSection = useCallback((idx: number) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const sections = useMemo(() => parseSections(content), [content]);

  if (mode === 'raw') {
    return (
      <div className="sb-preview-raw">
        {content}
        {streaming && <span className="sb-cursor" />}
      </div>
    );
  }

  if (sections.length <= 1 || streaming) {
    return (
      <div className="sb-preview-md">
        <Markdown>{content}</Markdown>
        {streaming && <span className="sb-cursor" />}
      </div>
    );
  }

  return (
    <div className="sb-preview-md">
      {sections.map((section, idx) => {
        if (!section.heading) {
          return (
            <div key={idx} className="sb-section-content">
              <Markdown>{section.content}</Markdown>
            </div>
          );
        }

        const isCollapsed = collapsed.has(idx);
        const HeadingTag = `h${Math.min(section.level, 6)}` as keyof JSX.IntrinsicElements;

        return (
          <div key={idx} className="sb-section">
            <button
              className="sb-section-toggle"
              onClick={() => toggleSection(idx)}
              type="button"
              aria-expanded={!isCollapsed}
              aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${section.heading}`}
            >
              <span className="sb-section-arrow">
                {isCollapsed ? '\u25B6' : '\u25BC'}
              </span>
              <HeadingTag className="sb-section-heading">
                {section.heading}
              </HeadingTag>
            </button>
            {!isCollapsed && section.content && (
              <div className="sb-section-content">
                <Markdown>{section.content}</Markdown>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
