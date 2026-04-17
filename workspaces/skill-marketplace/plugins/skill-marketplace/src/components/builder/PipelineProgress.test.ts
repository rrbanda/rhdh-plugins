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
import { buildStages, getStageStatuses } from './PipelineProgress';
import { PIPELINE_STAGES } from './types';
import type { BuilderEvent } from './types';

describe('buildStages', () => {
  it('returns default 4 stages when no events provided', () => {
    expect(buildStages()).toEqual(PIPELINE_STAGES);
    expect(buildStages([])).toEqual(PIPELINE_STAGES);
  });

  it('returns default stages when events only contain known agents', () => {
    const events: BuilderEvent[] = [
      { type: 'agent_start', agent: 'RequirementsAnalyzerAgent', ts: 1 },
      { type: 'agent_start', agent: 'SkillGeneratorAgent', ts: 2 },
    ];
    expect(buildStages(events)).toEqual(PIPELINE_STAGES);
  });

  it('appends dynamic stages for unknown agents', () => {
    const events: BuilderEvent[] = [
      { type: 'agent_start', agent: 'RequirementsAnalyzerAgent', ts: 1 },
      { type: 'agent_start', agent: 'CustomReviewerAgent', ts: 2 },
    ];
    const stages = buildStages(events);
    expect(stages).toHaveLength(5);
    expect(stages[4].key).toBe('CustomReviewerAgent');
    expect(stages[4].label).toBe('Custom Reviewer');
  });

  it('auto-generates readable label by stripping Agent suffix and splitting camelCase', () => {
    const events: BuilderEvent[] = [
      { type: 'agent_start', agent: 'DeepAnalysisAgent', ts: 1 },
    ];
    const stages = buildStages(events);
    const dynamic = stages.find(s => s.key === 'DeepAnalysisAgent');
    expect(dynamic?.label).toBe('Deep Analysis');
  });

  it('does not duplicate already-seen agents', () => {
    const events: BuilderEvent[] = [
      { type: 'agent_start', agent: 'NewAgent', ts: 1 },
      { type: 'agent_start', agent: 'NewAgent', ts: 2 },
    ];
    const stages = buildStages(events);
    expect(stages.filter(s => s.key === 'NewAgent')).toHaveLength(1);
  });

  it('ignores non-agent_start events', () => {
    const events: BuilderEvent[] = [
      { type: 'tool_call', agent: 'UnknownAgent', tool: 'search', args: {}, ts: 1 },
      { type: 'error', error: 'fail', ts: 2 },
    ];
    const stages = buildStages(events);
    expect(stages).toEqual(PIPELINE_STAGES);
  });
});

describe('getStageStatuses', () => {
  it('returns all completed when completed flag is true', () => {
    const statuses = getStageStatuses(PIPELINE_STAGES, 'SkillGeneratorAgent', true, false);
    expect(statuses).toEqual(['completed', 'completed', 'completed', 'completed']);
  });

  it('returns all pending when no currentAgent', () => {
    const statuses = getStageStatuses(PIPELINE_STAGES, '', false, false);
    expect(statuses).toEqual(['pending', 'pending', 'pending', 'pending']);
  });

  it('marks stages before current as completed, current as active, rest as pending', () => {
    const statuses = getStageStatuses(PIPELINE_STAGES, 'SkillGeneratorAgent', false, false);
    expect(statuses).toEqual(['completed', 'completed', 'active', 'pending']);
  });

  it('marks first agent as active with no completed stages', () => {
    const statuses = getStageStatuses(PIPELINE_STAGES, 'RequirementsAnalyzerAgent', false, false);
    expect(statuses).toEqual(['active', 'pending', 'pending', 'pending']);
  });

  it('marks last agent as active with all prior completed', () => {
    const statuses = getStageStatuses(PIPELINE_STAGES, 'SkillValidatorAgent', false, false);
    expect(statuses).toEqual(['completed', 'completed', 'completed', 'active']);
  });

  it('marks current stage as error when hasError is true', () => {
    const statuses = getStageStatuses(PIPELINE_STAGES, 'SkillResearcherAgent', false, true);
    expect(statuses).toEqual(['completed', 'error', 'pending', 'pending']);
  });

  it('returns all pending when currentAgent is unknown', () => {
    const statuses = getStageStatuses(PIPELINE_STAGES, 'NonExistentAgent', false, false);
    expect(statuses).toEqual(['pending', 'pending', 'pending', 'pending']);
  });

  it('works with dynamic stages', () => {
    const stages = [...PIPELINE_STAGES, { key: 'ExtraAgent', label: 'Extra', description: '' }];
    const statuses = getStageStatuses(stages, 'ExtraAgent', false, false);
    expect(statuses).toEqual(['completed', 'completed', 'completed', 'completed', 'active']);
  });
});
