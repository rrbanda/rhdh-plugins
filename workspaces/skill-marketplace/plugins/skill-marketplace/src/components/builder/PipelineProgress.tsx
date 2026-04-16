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
import { PIPELINE_STAGES } from './types';
import type { StageStatus } from './types';

interface PipelineProgressProps {
  currentAgent: string;
  completed: boolean;
  hasError: boolean;
}

function getStageStatuses(
  currentAgent: string,
  completed: boolean,
  hasError: boolean,
): StageStatus[] {
  if (completed) return PIPELINE_STAGES.map(() => 'completed');
  if (!currentAgent) return PIPELINE_STAGES.map(() => 'pending');

  const idx = PIPELINE_STAGES.findIndex(s => s.key === currentAgent);
  if (idx < 0) return PIPELINE_STAGES.map(() => 'pending');

  return PIPELINE_STAGES.map((_, i) => {
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
}: PipelineProgressProps) {
  const statuses = getStageStatuses(currentAgent, completed, hasError);

  return (
    <div className="bld-pipeline">
      {PIPELINE_STAGES.map((stage, i) => (
        <div
          key={stage.key}
          className={`bld-stage bld-stage--${statuses[i]}`}
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
