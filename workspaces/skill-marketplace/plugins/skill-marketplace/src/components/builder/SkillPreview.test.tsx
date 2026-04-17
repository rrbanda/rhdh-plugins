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
import { render, screen, fireEvent } from '@testing-library/react';
import { SkillPreview } from './SkillPreview';

describe('SkillPreview component', () => {
  describe('raw mode', () => {
    it('renders plain text content', () => {
      render(<SkillPreview content="Hello raw world" mode="raw" />);
      expect(screen.getByText('Hello raw world')).toBeTruthy();
    });

    it('shows cursor indicator when streaming', () => {
      const { container } = render(
        <SkillPreview content="streaming..." mode="raw" streaming />,
      );
      expect(container.querySelector('.sb-cursor')).toBeTruthy();
    });

    it('hides cursor when not streaming', () => {
      const { container } = render(
        <SkillPreview content="done" mode="raw" />,
      );
      expect(container.querySelector('.sb-cursor')).toBeNull();
    });
  });

  describe('rendered mode', () => {
    it('renders markdown content as HTML', () => {
      render(<SkillPreview content="**bold text**" mode="rendered" />);
      const bold = screen.getByText('bold text');
      expect(bold.tagName).toBe('STRONG');
    });

    it('renders single-section content without collapse toggles', () => {
      render(<SkillPreview content="# Title\nSome content" mode="rendered" />);
      expect(screen.queryByRole('button')).toBeNull();
    });

    it('renders multi-section content with collapse toggles', () => {
      const content = '# Section One\nContent one\n# Section Two\nContent two';
      render(<SkillPreview content={content} mode="rendered" />);
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThanOrEqual(2);
    });

    it('collapses and expands sections on toggle click', () => {
      const content = '# First\nFirst content here\n# Second\nSecond content here';
      render(<SkillPreview content={content} mode="rendered" />);

      expect(screen.getByText('First content here')).toBeTruthy();

      const collapseBtn = screen.getByLabelText('Collapse First');
      fireEvent.click(collapseBtn);

      expect(screen.queryByText('First content here')).toBeNull();
      expect(screen.getByLabelText('Expand First')).toBeTruthy();

      fireEvent.click(screen.getByLabelText('Expand First'));
      expect(screen.getByText('First content here')).toBeTruthy();
    });

    it('sets aria-expanded attribute correctly', () => {
      const content = '# A\nContent A\n# B\nContent B';
      render(<SkillPreview content={content} mode="rendered" />);

      const btn = screen.getByLabelText('Collapse A');
      expect(btn.getAttribute('aria-expanded')).toBe('true');

      fireEvent.click(btn);
      expect(screen.getByLabelText('Expand A').getAttribute('aria-expanded')).toBe('false');
    });
  });

  describe('streaming mode', () => {
    it('shows cursor during streaming in rendered mode', () => {
      const { container } = render(
        <SkillPreview content="# Title\nStreaming..." mode="rendered" streaming />,
      );
      expect(container.querySelector('.sb-cursor')).toBeTruthy();
    });

    it('does not show section collapse during streaming', () => {
      const content = '# One\nText\n# Two\nMore text';
      render(<SkillPreview content={content} mode="rendered" streaming />);
      expect(screen.queryByLabelText(/Collapse/)).toBeNull();
    });
  });
});
