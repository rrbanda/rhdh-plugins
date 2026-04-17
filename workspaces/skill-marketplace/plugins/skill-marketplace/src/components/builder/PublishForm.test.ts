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
import { extractSkillMetadata } from './PublishForm';

describe('extractSkillMetadata', () => {
  it('extracts name from H1 heading and slugifies it', () => {
    const content = '# My Great Skill\n\nSome content here.';
    const result = extractSkillMetadata(content);
    expect(result.name).toBe('my-great-skill');
  });

  it('strips special characters from name', () => {
    const content = '# Skill: Code Review (v2)!\n\nContent';
    const result = extractSkillMetadata(content);
    expect(result.name).toBe('skill-code-review-v2');
  });

  it('extracts version from "version: X.Y.Z" line', () => {
    const content = '# Test\nversion: 1.2.3\n\nContent';
    const result = extractSkillMetadata(content);
    expect(result.version).toBe('1.2.3');
  });

  it('extracts version from "Version = X.Y" format', () => {
    const content = '# Test\nVersion = 2.0\n\nContent';
    const result = extractSkillMetadata(content);
    expect(result.version).toBe('2.0');
  });

  it('extracts version with quotes', () => {
    const content = '# Test\nversion: "3.1.4"\n\nContent';
    const result = extractSkillMetadata(content);
    expect(result.version).toBe('3.1.4');
  });

  it('extracts description from ## Description section', () => {
    const content = '# Test\n\n## Description\n\nThis is a great skill for testing.\n\n## Usage\n\nSome usage info.';
    const result = extractSkillMetadata(content);
    expect(result.description).toBe('This is a great skill for testing.');
  });

  it('extracts description from blockquote', () => {
    const content = '# Test\n>\nThis is the summary line.\n\n## Details\n\nMore info.';
    const result = extractSkillMetadata(content);
    expect(result.description).toBe('This is the summary line.');
  });

  it('truncates description at 200 characters', () => {
    const longDesc = 'A'.repeat(300);
    const content = `# Test\n\n## Description\n\n${longDesc}\n\n## End`;
    const result = extractSkillMetadata(content);
    expect(result.description).toHaveLength(200);
  });

  it('returns empty object for content with no parseable metadata', () => {
    const content = 'Just some plain text with no headings or metadata.';
    const result = extractSkillMetadata(content);
    expect(result).toEqual({});
  });

  it('handles empty string', () => {
    const result = extractSkillMetadata('');
    expect(result).toEqual({});
  });

  it('uses first H1 when multiple exist', () => {
    const content = '# First Title\n\nContent\n\n# Second Title\n\nMore content';
    const result = extractSkillMetadata(content);
    expect(result.name).toBe('first-title');
  });

  it('collapses multiple dashes in slugified name', () => {
    const content = '# Hello -- World --- Test\n\nContent';
    const result = extractSkillMetadata(content);
    expect(result.name).toBe('hello-world-test');
  });

  it('strips leading and trailing dashes from name', () => {
    const content = '# ---Leading and Trailing---\n\nContent';
    const result = extractSkillMetadata(content);
    expect(result.name).toBe('leading-and-trailing');
  });
});
