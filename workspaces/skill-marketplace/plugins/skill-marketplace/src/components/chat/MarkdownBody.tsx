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
import React from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import { CopyButton } from './CopyButton';
import styles from './MarkdownBody.module.css';

interface MarkdownBodyProps {
  text: string;
  thought?: boolean;
  className?: string;
}

export const MarkdownBody = React.memo(function MarkdownBody({
  text,
  thought,
  className,
}: MarkdownBodyProps) {
  return (
    <div
      className={`${styles.markdown} ${thought ? styles.thought : ''} ${className ?? ''}`}
    >
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          pre({ children, ...props }) {
            const codeChild = React.Children.toArray(children).find(
              (child): child is React.ReactElement =>
                React.isValidElement(child) && child.type === 'code',
            );
            const codeText = codeChild
              ? extractText(codeChild.props.children)
              : '';
            return (
              <div className={styles.codeBlock}>
                <div className={styles.codeHeader}>
                  <span className={styles.codeLang}>
                    {extractLang(codeChild?.props?.className)}
                  </span>
                  <CopyButton text={codeText} />
                </div>
                <pre {...props}>{children}</pre>
              </div>
            );
          },
          code({ className: cn, children, ...props }) {
            const isInline = !cn;
            if (isInline) {
              return (
                <code className={styles.inlineCode} {...props}>
                  {children}
                </code>
              );
            }
            return (
              <code className={cn} {...props}>
                {children}
              </code>
            );
          },
          table({ children, ...props }) {
            return (
              <div className={styles.tableWrap}>
                <table {...props} aria-label="Data table">
                  {children}
                </table>
              </div>
            );
          },
          a({ children, href, ...props }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                {...props}
              >
                {children}
              </a>
            );
          },
        }}
      >
        {text}
      </Markdown>
    </div>
  );
});

function extractText(children: React.ReactNode): string {
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) return children.map(extractText).join('');
  if (React.isValidElement(children))
    return extractText(
      (children.props as { children?: React.ReactNode }).children,
    );
  return '';
}

function extractLang(className?: string): string {
  if (!className) return '';
  const match = className.match(/language-(\w+)/);
  return match ? match[1] : '';
}
