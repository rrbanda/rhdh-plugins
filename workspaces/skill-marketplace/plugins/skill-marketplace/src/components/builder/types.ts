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

export type BuilderEvent =
  | { type: 'agent_start'; agent: string; ts: number }
  | {
      type: 'tool_call';
      agent: string;
      tool: string;
      args: Record<string, unknown>;
      ts: number;
    }
  | { type: 'tool_result'; agent: string; tool: string; result: string; ts: number }
  | { type: 'agent_output'; agent: string; text: string; ts: number }
  | {
      type: 'complete';
      skillContent: string;
      validation: string;
      ts: number;
    }
  | { type: 'stream_end'; ts: number }
  | { type: 'error'; error: string; ts: number };

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  text: string;
  timestamp: number;
  events?: BuilderEvent[];
  isError?: boolean;
  validation?: string;
}

export interface PipelineStage {
  key: string;
  label: string;
  description: string;
}

export const PIPELINE_STAGES: PipelineStage[] = [
  {
    key: 'RequirementsAnalyzerAgent',
    label: 'Analyzing Requirements',
    description: 'Breaking down your description into structured requirements',
  },
  {
    key: 'SkillResearcherAgent',
    label: 'Researching Examples',
    description: 'Searching the knowledge graph for similar skills',
  },
  {
    key: 'SkillGeneratorAgent',
    label: 'Generating Skill',
    description: 'Writing the SKILL.md based on requirements and examples',
  },
  {
    key: 'SkillValidatorAgent',
    label: 'Validating',
    description: 'Checking skill structure, completeness, and quality',
  },
];

export type StageStatus = 'pending' | 'active' | 'completed' | 'error';
