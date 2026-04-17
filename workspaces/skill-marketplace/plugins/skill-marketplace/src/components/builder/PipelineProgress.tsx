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
import { useMemo } from 'react';
import { PIPELINE_STAGES } from './types';
import type { PipelineStage, StageStatus, BuilderEvent } from './types';

interface PipelineProgressProps {
  currentAgent: string;
  completed: boolean;
  hasError: boolean;
  events?: BuilderEvent[];
}

export function buildStages(events?: BuilderEvent[]): PipelineStage[] {
  if (!events || events.length === 0) return PIPELINE_STAGES;

  const seenAgents = events
    .filter((e): e is Extract<BuilderEvent, { type: 'agent_start' }> => e.type === 'agent_start')
    .map(e => e.agent);

  const knownKeys = new Set(PIPELINE_STAGES.map(s => s.key));
  const dynamicStages = [...PIPELINE_STAGES];

  for (const agent of seenAgents) {
    if (!knownKeys.has(agent)) {
      knownKeys.add(agent);
      dynamicStages.push({
        key: agent,
        label: agent.replace(/Agent$/, '').replace(/([A-Z])/g, ' $1').trim(),
        description: '',
      });
    }
  }

  return dynamicStages;
}

export function getStageStatuses(
  stages: PipelineStage[],
  currentAgent: string,
  completed: boolean,
  hasError: boolean,
): StageStatus[] {
  if (completed) return stages.map(() => 'completed');
  if (!currentAgent) return stages.map(() => 'pending');

  const idx = stages.findIndex(s => s.key === currentAgent);
  if (idx < 0) return stages.map(() => 'pending');

  return stages.map((_, i) => {
    if (hasError && i === idx) return 'error';
    if (i < idx) return 'completed';
    if (i === idx) return 'active';
    return 'pending';
  });
}

export function PipelineProgress({
  currentAgent,
  completed,
  hasError,
  events,
}: PipelineProgressProps) {
  const stages = useMemo(() => buildStages(events), [events]);
  const statuses = getStageStatuses(stages, currentAgent, completed, hasError);

  const activeIdx = statuses.findIndex(s => s === 'active');
  const completedCount = statuses.filter(s => s === 'completed').length;
  const progressValue = completed ? 100 : Math.round((completedCount / stages.length) * 100);

  return (
    <div
      className="bld-pipeline"
      role="progressbar"
      aria-valuenow={progressValue}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Build progress: ${activeIdx >= 0 ? stages[activeIdx].label : completed ? 'Complete' : 'Pending'}`}
    >
      {stages.map((stage, i) => (
        <div
          key={stage.key}
          className={`bld-stage bld-stage--${statuses[i]}`}
          aria-current={statuses[i] === 'active' ? 'step' : undefined}
        >
          <div className="bld-stage-dot">
            {statuses[i] === 'completed'
              ? '\u2713'
              : statuses[i] === 'error'
                ? '\u2717'
                : i + 1}
          </div>
          <span className="bld-stage-label">{stage.label}</span>
        </div>
      ))}
    </div>
  );
}
