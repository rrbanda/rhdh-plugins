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

import { sanitizeResponseText } from './sanitize';
import { formatResponseText } from './formatResponse';

function pipeline(text: string): string {
  return formatResponseText(sanitizeResponseText(text));
}

describe('sanitize -> format text pipeline', () => {
  it('passes through clean markdown unchanged', () => {
    const md = '## Hello\n\n- item 1\n- item 2\n\n**bold** text';
    expect(pipeline(md)).toBe(md);
  });

  it('strips file reference tokens then preserves remaining text', () => {
    const input = 'The answer is <|file-abc123def456|> 42';
    const result = pipeline(input);
    expect(result).not.toContain('<|file-');
    expect(result).toContain('42');
  });

  it('strips tool execution patterns then formats remaining', () => {
    const input =
      '[Execute rag_search tool with query "test"]\nHere are the results: a, b, c, d, e, f';
    const result = pipeline(input);
    expect(result).not.toContain('[Execute');
    expect(result).toContain('results');
  });

  it('strips wrapping code fences around markdown prose', () => {
    const input = '```markdown\n## Title\n\nSome **bold** text\n```';
    const result = pipeline(input);
    expect(result).not.toMatch(/^```/);
    expect(result).toContain('## Title');
  });

  it('preserves intentional code fences with language tag', () => {
    const input = '```python\nprint("hello")\n```';
    const result = pipeline(input);
    expect(result).toContain('```python');
  });

  it('formats key-value pairs when no markdown present', () => {
    const input = 'Name: Alice\nAge: 30\nCity: NYC\nRole: dev';
    const result = pipeline(input);
    expect(result).toContain('**Name:**');
    expect(result).toContain('**Age:**');
  });

  it('does not format key-value pairs when markdown is present', () => {
    const input = '## Info\n\nName: Alice\nAge: 30\n\n- item 1';
    const result = pipeline(input);
    expect(result).not.toContain('**Name:**');
  });

  it('handles empty string', () => {
    expect(pipeline('')).toBe('');
  });

  it('handles null-ish input', () => {
    expect(pipeline(undefined as unknown as string)).toBeFalsy();
  });

  it('sanitizes then formats inline JSON', () => {
    const input =
      '<|file-aaa111bbb222|>The config is {"key": "value", "nested": {"a": 1}}';
    const result = pipeline(input);
    expect(result).not.toContain('<|file-');
    expect(result).toContain('key');
  });
});
