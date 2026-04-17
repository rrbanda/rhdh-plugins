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
import { slugify, humanize, getComplexity, getPluginColor } from './types';

describe('slugify', () => {
  it('lowercases and removes non-alphanumeric characters', () => {
    expect(slugify('My:Skill_Name')).toBe('my-skillname');
  });

  it('replaces colons with hyphens', () => {
    expect(slugify('docs:code-review')).toBe('docs-code-review');
  });

  it('handles already-slugified input', () => {
    expect(slugify('already-ok-123')).toBe('already-ok-123');
  });

  it('handles empty string', () => {
    expect(slugify('')).toBe('');
  });

  it('handles uppercase input', () => {
    expect(slugify('UPPER-CASE')).toBe('upper-case');
  });
});

describe('humanize', () => {
  it('converts colon-separated names to title case', () => {
    expect(humanize('docs:code-review')).toBe('Code Review');
  });

  it('takes the last segment after colon', () => {
    expect(humanize('category:sub:my-skill')).toBe('My Skill');
  });

  it('handles single word', () => {
    expect(humanize('simple')).toBe('Simple');
  });
});

describe('getComplexity', () => {
  it('returns Simple for < 100 lines', () => {
    expect(getComplexity(50)).toBe('Simple');
  });

  it('returns Medium for 100-249 lines', () => {
    expect(getComplexity(150)).toBe('Medium');
  });

  it('returns Complex for 250-499 lines', () => {
    expect(getComplexity(300)).toBe('Complex');
  });

  it('returns Advanced for >= 500 lines', () => {
    expect(getComplexity(500)).toBe('Advanced');
  });
});

describe('getPluginColor', () => {
  it('returns correct color for known plugin', () => {
    expect(getPluginColor('docs')).toBe('#3b82f6');
  });

  it('returns default gray for unknown plugin', () => {
    expect(getPluginColor('unknown')).toBe('#6b7280');
  });
});
