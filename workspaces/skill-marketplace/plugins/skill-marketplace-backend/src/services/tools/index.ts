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
export type { AgentTool, ToolContext } from './types';

import type { AgentTool } from './types';
import { searchSemanticTool } from './searchSemanticTool';
import { searchKeywordTool } from './searchKeywordTool';
import { getSkillDetailsTool } from './getSkillDetailsTool';
import { exploreGraphTool } from './exploreGraphTool';
import { queryRelationshipsTool } from './queryRelationshipsTool';
import { getGraphSchemaTool } from './getGraphSchemaTool';
import { listByDomainTool } from './listByDomainTool';
import { listAgentsTool } from './listAgentsTool';
import { findGapsTool } from './findGapsTool';

const ALL_TOOLS: AgentTool[] = [
  searchSemanticTool,
  searchKeywordTool,
  getSkillDetailsTool,
  exploreGraphTool,
  queryRelationshipsTool,
  getGraphSchemaTool,
  listByDomainTool,
  listAgentsTool,
  findGapsTool,
];

const TOOL_MAP = new Map(ALL_TOOLS.map(t => [t.definition.name, t]));

export function getToolRegistry(): AgentTool[] {
  return ALL_TOOLS;
}

export function getToolByName(name: string): AgentTool | undefined {
  return TOOL_MAP.get(name);
}
