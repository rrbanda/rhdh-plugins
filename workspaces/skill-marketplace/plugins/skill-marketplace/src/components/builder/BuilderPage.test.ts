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
import { computeLineDiff } from './BuilderPage';

describe('computeLineDiff', () => {
  it('returns all "same" for identical content', () => {
    const text = 'line1\nline2\nline3';
    const result = computeLineDiff(text, text);
    expect(result).toEqual([
      { type: 'same', text: 'line1' },
      { type: 'same', text: 'line2' },
      { type: 'same', text: 'line3' },
    ]);
  });

  it('detects added lines', () => {
    const result = computeLineDiff('line1\nline3', 'line1\nline2\nline3');
    expect(result).toContainEqual({ type: 'added', text: 'line2' });
    expect(result.filter(r => r.type === 'same')).toHaveLength(2);
  });

  it('detects removed lines', () => {
    const result = computeLineDiff('line1\nline2\nline3', 'line1\nline3');
    expect(result).toContainEqual({ type: 'removed', text: 'line2' });
    expect(result.filter(r => r.type === 'same')).toHaveLength(2);
  });

  it('handles complete replacement', () => {
    const result = computeLineDiff('old line', 'new line');
    const types = result.map(r => r.type);
    expect(types).toContain('removed');
    expect(types).toContain('added');
  });

  it('handles empty old text', () => {
    const result = computeLineDiff('', 'line1\nline2');
    expect(result.filter(r => r.type === 'added')).toHaveLength(2);
  });

  it('handles empty new text', () => {
    const result = computeLineDiff('line1\nline2', '');
    expect(result.filter(r => r.type === 'removed')).toHaveLength(2);
  });

  it('handles both empty', () => {
    const result = computeLineDiff('', '');
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('same');
  });

  it('preserves order with interleaved changes', () => {
    const result = computeLineDiff(
      'header\nold-middle\nfooter',
      'header\nnew-middle\nfooter',
    );
    expect(result[0]).toEqual({ type: 'same', text: 'header' });
    expect(result[result.length - 1]).toEqual({ type: 'same', text: 'footer' });
  });
});
