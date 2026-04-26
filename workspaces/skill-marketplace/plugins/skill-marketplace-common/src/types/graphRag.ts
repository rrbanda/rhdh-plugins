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

/** @public */
export interface GraphRAGQuery {
  query: string;
  context?: string;
  maxResults?: number;
  includeRelated?: boolean;
  filters?: {
    domain?: string;
    tools?: string[];
    minSimilarity?: number;
  };
}

/** @public */
export interface RagSkillHit {
  name: string;
  description: string;
  category: string;
  version: string;
  author: string;
  ociReference: string;
}

/** @public */
export interface GraphRAGSkill {
  skill: RagSkillHit;
  score: number;
  matchType: 'semantic' | 'fulltext' | 'graph';
  reason: string;
  related: RagSkillHit[];
  tools: string[];
  domain: string;
}

/** @public */
export interface GraphRAGResult {
  skills: GraphRAGSkill[];
  graphContext: {
    totalSkills: number;
    domainsSearched: string[];
    queryEmbeddingUsed: boolean;
  };
}

/** @public */
export interface AgenticQuery {
  query: string;
  context?: string;
  sessionId?: string;
  maxIterations?: number;
}

/** @public */
export interface ReasoningStep {
  tool: string;
  input: Record<string, unknown>;
  output: unknown;
  durationMs: number;
}

/** @public */
export interface AgenticResult {
  answer: string;
  steps: ReasoningStep[];
  iterations: number;
  sources: string[];
  durationMs: number;
}

/** @public */
export interface AgenticStreamEvent {
  type: 'thinking' | 'tool_call' | 'tool_result' | 'answer' | 'error' | 'done';
  data: unknown;
}
