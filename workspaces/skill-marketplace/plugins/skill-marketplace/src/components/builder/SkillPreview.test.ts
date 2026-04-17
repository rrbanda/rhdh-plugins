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
import { parseSections } from './SkillPreview';

describe('parseSections', () => {
  it('returns a single section for plain text with no headings', () => {
    const result = parseSections('Just some text\nand more text');
    expect(result).toHaveLength(1);
    expect(result[0].heading).toBe('');
    expect(result[0].level).toBe(0);
    expect(result[0].content).toBe('Just some text\nand more text');
  });

  it('splits on H1 headings', () => {
    const md = '# First\nContent one\n# Second\nContent two';
    const result = parseSections(md);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ heading: 'First', level: 1, content: 'Content one' });
    expect(result[1]).toEqual({ heading: 'Second', level: 1, content: 'Content two' });
  });

  it('splits on H2 and H3 headings', () => {
    const md = '## Overview\nIntro text\n### Details\nDetail text';
    const result = parseSections(md);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ heading: 'Overview', level: 2, content: 'Intro text' });
    expect(result[1]).toEqual({ heading: 'Details', level: 3, content: 'Detail text' });
  });

  it('does not split on H4+ headings', () => {
    const md = '# Title\nSome text\n#### Sub-detail\nMore text';
    const result = parseSections(md);
    expect(result).toHaveLength(1);
    expect(result[0].heading).toBe('Title');
    expect(result[0].content).toContain('#### Sub-detail');
    expect(result[0].content).toContain('More text');
  });

  it('handles preamble before first heading', () => {
    const md = 'Preamble text\n\n# Title\nContent';
    const result = parseSections(md);
    expect(result).toHaveLength(2);
    expect(result[0].heading).toBe('');
    expect(result[0].content).toBe('Preamble text');
    expect(result[1].heading).toBe('Title');
  });

  it('handles empty content between headings', () => {
    const md = '# First\n# Second\nContent';
    const result = parseSections(md);
    expect(result).toHaveLength(2);
    expect(result[0].heading).toBe('First');
    expect(result[0].content).toBe('');
    expect(result[1].heading).toBe('Second');
  });

  it('handles empty string', () => {
    const result = parseSections('');
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('');
  });

  it('preserves content lines between headings', () => {
    const md = '# Intro\nLine 1\nLine 2\nLine 3\n# Next\nLine 4';
    const result = parseSections(md);
    expect(result[0].content).toBe('Line 1\nLine 2\nLine 3');
    expect(result[1].content).toBe('Line 4');
  });
});
