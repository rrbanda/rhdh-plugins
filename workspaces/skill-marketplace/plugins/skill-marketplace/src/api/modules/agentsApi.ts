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
import type { AgenticQuery } from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import type { RequestFn } from './types';

/** @deprecated Use askSmpAgent('kgqa', ...) instead */
export async function agenticQuery(
  request: RequestFn,
  query: AgenticQuery,
): Promise<{ answer: string; query: string }> {
  return request('/agents/kgqa', {
    method: 'POST',
    body: JSON.stringify({ message: query.query, contextId: query.sessionId }),
  });
}

export async function askSmpAgent(
  request: RequestFn,
  agent: string,
  message: string,
  contextId?: string,
  signal?: AbortSignal,
): Promise<{ answer: string; contextId?: string; agent?: string }> {
  return request(`/agents/${encodeURIComponent(agent)}`, {
    method: 'POST',
    body: JSON.stringify({ message, contextId }),
    signal,
  }) as Promise<{ answer: string; contextId?: string; agent?: string }>;
}

export async function getAgentDetail(
  request: RequestFn,
  namespace: string,
  name: string,
): Promise<unknown> {
  return request(`/kagenti/agents/${namespace}/${name}`);
}

export async function getAgentLogs(
  request: RequestFn,
  namespace: string,
  name: string,
  tail?: number,
): Promise<unknown> {
  const query = tail ? `?tail=${tail}` : '';
  return request(`/kagenti/agents/${namespace}/${name}/logs${query}`);
}

export async function getAgentCard(
  request: RequestFn,
  namespace?: string,
  agentName?: string,
): Promise<unknown> {
  const params = new URLSearchParams();
  if (namespace) params.set('namespace', namespace);
  if (agentName) params.set('agent', agentName);
  const query = params.toString() ? `?${params}` : '';
  return request(`/kagenti/agent-card${query}`);
}

export async function chatWithAgent(
  request: RequestFn,
  message: string,
  sessionId?: string,
  _namespace?: string,
  agentName?: string,
  activeSkill?: string,
  signal?: AbortSignal,
): Promise<unknown> {
  return request('/kagenti/chat', {
    method: 'POST',
    body: JSON.stringify({
      message,
      sessionId,
      agentName,
      activeSkill,
    }),
    signal,
  });
}

export async function listAgentNamespaces(
  request: RequestFn,
): Promise<{ namespaces: string[] }> {
  return request('/kagenti/namespaces');
}

export async function getHealth(
  request: RequestFn,
): Promise<Record<string, unknown>> {
  return request('/health');
}

export interface SmpAgentHealthEntry {
  configured: boolean;
  healthy: boolean;
  error?: string;
}

export async function getAgentsHealth(
  request: RequestFn,
): Promise<Record<string, SmpAgentHealthEntry>> {
  return request('/agents/health');
}
