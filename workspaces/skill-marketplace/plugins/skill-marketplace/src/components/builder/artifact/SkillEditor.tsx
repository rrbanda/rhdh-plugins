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

const skillEditorStyles = `
.bld-editor-raw {
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--pf-t--global--font--family--mono, 'Red Hat Mono', monospace);
  font-size: 13px;
  line-height: 1.6;
  padding: 16px;
  color: var(--pf-t--global--text--color--regular, #151515);
}
.bld-editor-md {
  padding: 16px;
  line-height: 1.6;
  color: var(--pf-t--global--text--color--regular, #151515);
}
.bld-editor-md h1, .bld-editor-md h2, .bld-editor-md h3 {
  margin: 1em 0 0.5em;
  font-weight: 600;
  line-height: 1.3;
}
.bld-editor-md h1 { font-size: 1.5em; }
.bld-editor-md h2 { font-size: 1.25em; }
.bld-editor-md h3 { font-size: 1.1em; }
.bld-editor-md p { margin: 0.5em 0; }
.bld-editor-md ul, .bld-editor-md ol { padding-left: 1.5em; margin: 0.5em 0; }
.bld-editor-md code {
  background: var(--pf-t--global--background--color--secondary--default, #f0f0f0);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.9em;
  font-family: var(--pf-t--global--font--family--mono, 'Red Hat Mono', monospace);
}
.bld-editor-md pre {
  background: var(--pf-t--global--background--color--secondary--default, #f5f5f5);
  padding: 12px 16px;
  border-radius: 8px;
  overflow-x: auto;
  font-size: 13px;
  margin: 0.5em 0;
}
.bld-editor-md pre code {
  background: none;
  padding: 0;
}
.bld-editor-md blockquote {
  border-left: 3px solid var(--pf-t--global--border--color--default, #d2d2d2);
  margin: 0.5em 0;
  padding: 4px 16px;
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
}
.bld-editor-cursor {
  display: inline-block;
  width: 2px;
  height: 1em;
  background: var(--pf-t--global--color--brand--default, #0066cc);
  animation: bld-blink 1s step-end infinite;
  vertical-align: text-bottom;
  margin-left: 1px;
}
@keyframes bld-blink { 50% { opacity: 0; } }

.bld-section {
  border-bottom: 1px solid var(--pf-t--global--border--color--default, #e8e8e8);
}
.bld-section:last-child { border-bottom: none; }

.bld-section-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  border: none;
  background: none;
  cursor: pointer;
  padding: 8px 0;
  text-align: left;
  color: var(--pf-t--global--text--color--regular, #151515);
}
.bld-section-toggle:hover { opacity: 0.8; }
.bld-section-arrow {
  font-size: 10px;
  transition: transform 0.15s;
}
.bld-section-heading {
  font-weight: 600;
  margin: 0;
}
.bld-section-content {
  padding: 0 0 8px 18px;
}
`;

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

interface SkillEditorProps {
  content: string;
  streaming?: boolean;
  mode: 'rendered' | 'raw';
}

export function SkillEditor({ content, streaming, mode }: SkillEditorProps) {
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
      <>
        <style>{skillEditorStyles}</style>
        <div className="bld-editor-raw">
          {content}
          {streaming && <span className="bld-editor-cursor" />}
        </div>
      </>
    );
  }

  if (sections.length <= 1 || streaming) {
    return (
      <>
        <style>{skillEditorStyles}</style>
        <div className="bld-editor-md">
          <Markdown>{content}</Markdown>
          {streaming && <span className="bld-editor-cursor" />}
        </div>
      </>
    );
  }

  return (
    <>
      <style>{skillEditorStyles}</style>
      <div className="bld-editor-md">
        {sections.map((section, idx) => {
          if (!section.heading) {
            return (
              <div key={idx} className="bld-section-content">
                <Markdown>{section.content}</Markdown>
              </div>
            );
          }

          const isCollapsed = collapsed.has(idx);
          const HeadingTag = `h${Math.min(section.level, 6)}` as keyof React.JSX.IntrinsicElements;

          return (
            <div key={idx} className="bld-section">
              <button
                className="bld-section-toggle"
                onClick={() => toggleSection(idx)}
                type="button"
                aria-expanded={!isCollapsed}
                aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${section.heading}`}
              >
                <span className="bld-section-arrow">{isCollapsed ? '\u25B6' : '\u25BC'}</span>
                <HeadingTag className="bld-section-heading">{section.heading}</HeadingTag>
              </button>
              {!isCollapsed && section.content && (
                <div className="bld-section-content">
                  <Markdown>{section.content}</Markdown>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
