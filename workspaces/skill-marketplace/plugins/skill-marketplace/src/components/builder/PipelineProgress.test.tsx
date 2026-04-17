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
import { render, screen } from '@testing-library/react';
import { PipelineProgress } from './PipelineProgress';
import type { BuilderEvent } from './types';

describe('PipelineProgress component', () => {
  it('renders 4 default stages', () => {
    render(
      <PipelineProgress currentAgent="" completed={false} hasError={false} />,
    );
    expect(screen.getByText('Analyzing Requirements')).toBeTruthy();
    expect(screen.getByText('Researching Examples')).toBeTruthy();
    expect(screen.getByText('Generating Skill')).toBeTruthy();
    expect(screen.getByText('Validating')).toBeTruthy();
  });

  it('appends dynamic stage from unknown agent events', () => {
    const events: BuilderEvent[] = [
      { type: 'agent_start', agent: 'CustomReviewerAgent', ts: 1 },
    ];
    render(
      <PipelineProgress
        currentAgent="CustomReviewerAgent"
        completed={false}
        hasError={false}
        events={events}
      />,
    );
    expect(screen.getByText('Custom Reviewer')).toBeTruthy();
  });

  it('has role="progressbar" with correct aria attributes', () => {
    render(
      <PipelineProgress
        currentAgent="SkillGeneratorAgent"
        completed={false}
        hasError={false}
      />,
    );
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('100');
    expect(bar.getAttribute('aria-valuenow')).toBe('50');
  });

  it('sets aria-valuenow to 100 when completed', () => {
    render(
      <PipelineProgress currentAgent="" completed hasError={false} />,
    );
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('100');
  });

  it('marks active stage with aria-current="step"', () => {
    const { container } = render(
      <PipelineProgress
        currentAgent="SkillResearcherAgent"
        completed={false}
        hasError={false}
      />,
    );
    const activeDivs = container.querySelectorAll('[aria-current="step"]');
    expect(activeDivs).toHaveLength(1);
    expect(activeDivs[0].textContent).toContain('Researching Examples');
  });

  it('shows checkmark for completed stages', () => {
    const { container } = render(
      <PipelineProgress
        currentAgent="SkillGeneratorAgent"
        completed={false}
        hasError={false}
      />,
    );
    const completedDots = container.querySelectorAll('.bld-stage--completed .bld-stage-dot');
    expect(completedDots).toHaveLength(2);
    completedDots.forEach(dot => {
      expect(dot.textContent).toBe('\u2713');
    });
  });

  it('shows error marker for stage with error', () => {
    const { container } = render(
      <PipelineProgress
        currentAgent="SkillGeneratorAgent"
        completed={false}
        hasError
      />,
    );
    const errorDot = container.querySelector('.bld-stage--error .bld-stage-dot');
    expect(errorDot?.textContent).toBe('\u2717');
  });
});
