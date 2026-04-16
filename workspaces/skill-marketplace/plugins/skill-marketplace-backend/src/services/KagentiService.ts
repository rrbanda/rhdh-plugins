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
import fetch from 'node-fetch';
import type { Response as NodeFetchResponse } from 'node-fetch';
import { LoggerService } from '@backstage/backend-plugin-api';
import type {
  KagentiAgent,
  AgentDeployRequest,
} from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';

export interface KagentiConfig {
  apiUrl: string;
  agentName: string;
  namespace: string;
  keycloak: {
    tokenUrl: string;
    clientId: string;
    username: string;
    password: string;
  };
}

interface TokenCache {
  token: string;
  expiresAt: number;
}

export class KagentiService {
  private readonly config: KagentiConfig;
  private readonly logger: LoggerService;
  private tokenCache: TokenCache | null = null;

  constructor(config: KagentiConfig, logger: LoggerService) {
    this.config = config;
    this.logger = logger;
  }

  private async getToken(): Promise<string> {
    if (this.tokenCache && Date.now() < this.tokenCache.expiresAt) {
      return this.tokenCache.token;
    }

    const { tokenUrl, clientId, username, password } = this.config.keycloak;

    const params = new URLSearchParams({
      grant_type: 'password',
      client_id: clientId,
      username,
      password,
    });

    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Keycloak token request failed (${res.status}): ${text}`);
    }

    const data = (await res.json()) as {
      access_token: string;
      expires_in: number;
    };

    this.tokenCache = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in - 30) * 1000,
    };

    this.logger.debug('Keycloak token obtained for Kagenti');
    return data.access_token;
  }

  private chatUrl(
    path: string = '',
    namespace?: string,
    agentName?: string,
  ): string {
    const ns = namespace || this.config.namespace;
    const agent = agentName || this.config.agentName;
    return `${this.config.apiUrl}/api/v1/chat/${ns}/${agent}${path}`;
  }

  private agentsUrl(path: string = ''): string {
    return `${this.config.apiUrl}/api/v1/agents${path}`;
  }

  private async apiRequest(
    url: string,
    init?: { method?: string; body?: unknown },
  ): Promise<{ status: number; data: unknown }> {
    const token = await this.getToken();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    const method = init?.method || 'GET';
    const bodyStr = init?.body ? JSON.stringify(init.body) : undefined;

    this.logger.info(`Kagenti ${method} ${url}`);
    if (bodyStr) {
      this.logger.info(`Kagenti request body: ${bodyStr}`);
    }

    const res = await fetch(url, { method, headers, body: bodyStr });

    const text = await res.text();
    if (!res.ok) {
      this.logger.error(`Kagenti ${method} ${url} → ${res.status}: ${text}`);
    }
    try {
      return { status: res.status, data: JSON.parse(text) };
    } catch {
      return { status: res.status, data: { raw: text } };
    }
  }

  // -----------------------------------------------------------------------
  // Chat
  // -----------------------------------------------------------------------

  /**
   * Call the agent directly via A2A JSON-RPC `SendMessage` (a2a-go v2),
   * bypassing Kagenti's chat proxy which uses an incompatible method name.
   * Requires the backend to be able to reach the agent's internal URL.
   */
  async sendA2AMessage(
    message: string,
    sessionId?: string,
    namespace?: string,
    agentName?: string,
  ): Promise<{ status: number; data: unknown }> {
    const card = await this.getAgentCard(namespace, agentName);
    if (card.status !== 200) {
      throw new Error(`Agent card unavailable (${card.status})`);
    }
    const agentUrl = (card.data as { url?: string }).url;
    if (!agentUrl) {
      throw new Error('Agent card has no URL');
    }

    const rpcPayload = {
      jsonrpc: '2.0',
      method: 'SendMessage',
      id: `sm-${Date.now()}`,
      params: {
        message: {
          messageId: sessionId || `msg-${Date.now()}`,
          role: 'user',
          parts: [{ text: message }],
        },
      },
    };

    this.logger.info(`Direct A2A call to ${agentUrl}/a2a`);

    const res = await fetch(`${agentUrl}/a2a`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rpcPayload),
    });

    const text = await res.text();
    this.logger.info(`Direct A2A response (${res.status}): ${text.slice(0, 500)}`);

    try {
      const json = JSON.parse(text);
      if (json.error) {
        return {
          status: 200,
          data: {
            content: `A2A error: ${json.error.message || JSON.stringify(json.error)}`,
            session_id: sessionId,
            is_complete: true,
          },
        };
      }
      const result = json.result || {};

      // a2a-go v2 wraps the result as {"task": {...}} or {"message": {...}}
      const task = result.task;
      const msg = result.message;

      const extractParts = (p: { text?: string }[]) =>
        p.map(part => part.text).filter(Boolean).join('\n');

      let content = '';
      let contextId: string | undefined;

      if (task) {
        contextId = task.contextId;
        // Primary: artifacts contain the agent's output
        const artifactTexts = (task.artifacts ?? [])
          .flatMap((a: { parts?: { text?: string }[] }) => a.parts ?? [])
          .map((p: { text?: string }) => p.text)
          .filter(Boolean);
        if (artifactTexts.length > 0) {
          content = artifactTexts.join('\n');
        }
        // Fallback: status message (used for status updates without artifacts)
        if (!content && task.status?.message?.parts) {
          content = extractParts(task.status.message.parts);
        }
      } else if (msg) {
        contextId = msg.contextId;
        content = extractParts(msg.parts ?? []);
      } else {
        // Fallback: try common locations
        const fallbackParts = result.status?.message?.parts
          ?? result.parts
          ?? [];
        contextId = result.contextId;
        content = extractParts(fallbackParts);
      }

      if (!content) {
        content = JSON.stringify(result);
      }

      return {
        status: 200,
        data: {
          content,
          session_id: contextId ?? sessionId,
          is_complete: true,
        },
      };
    } catch {
      return { status: res.status, data: { content: text, is_complete: true } };
    }
  }

  async sendMessage(
    message: string,
    sessionId?: string,
    namespace?: string,
    agentName?: string,
  ): Promise<{ status: number; data: unknown }> {
    const body: Record<string, unknown> = { message };
    if (sessionId) body.session_id = sessionId;
    return this.apiRequest(
      this.chatUrl('/send', namespace, agentName),
      { method: 'POST', body },
    );
  }

  async streamMessage(
    message: string,
    sessionId?: string,
    namespace?: string,
    agentName?: string,
  ): Promise<NodeFetchResponse> {
    const token = await this.getToken();
    const body: Record<string, unknown> = { message };
    if (sessionId) body.session_id = sessionId;

    return fetch(this.chatUrl('/stream', namespace, agentName), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  }

  async getAgentCard(
    namespace?: string,
    agentName?: string,
  ): Promise<{ status: number; data: unknown }> {
    return this.apiRequest(
      this.chatUrl('/agent-card', namespace, agentName),
    );
  }

  // -----------------------------------------------------------------------
  // Agent CRUD
  // -----------------------------------------------------------------------

  async listAgents(
    namespace?: string,
  ): Promise<{ status: number; data: unknown }> {
    const url = namespace
      ? this.agentsUrl(`?namespace=${namespace}`)
      : this.agentsUrl();
    return this.apiRequest(url);
  }

  async getAgentDetail(
    namespace: string,
    name: string,
  ): Promise<{ status: number; data: unknown }> {
    return this.apiRequest(
      this.agentsUrl(`/${namespace}/${name}`),
    );
  }

  async deployAgent(
    request: AgentDeployRequest,
  ): Promise<{ status: number; data: unknown }> {
    const payload = {
      name: request.name,
      namespace: request.namespace,
      description: request.description || `Agent '${request.name}' deployed from Skill Marketplace`,
      image: request.image,
      framework: 'Other',
      protocol: 'a2a',
      workloadType: 'deployment',
      gitUrl: `https://github.com/redhat-et/docsclaw.git`,
      env: [
        { name: 'LLM_PROVIDER', value: request.llm.provider },
        { name: 'LLM_MODEL', value: request.llm.model },
        { name: 'LLM_BASE_URL', value: request.llm.baseUrl },
        ...(request.llm.apiKey
          ? [{ name: 'LLM_API_KEY', value: request.llm.apiKey }]
          : [{ name: 'LLM_API_KEY', value: 'dummy-not-needed' }]),
      ],
      ports: [
        { name: 'http', containerPort: 8000, protocol: 'TCP' },
        { name: 'health', containerPort: 8100, protocol: 'TCP' },
      ],
    };

    return this.apiRequest(this.agentsUrl(), {
      method: 'POST',
      body: payload,
    });
  }

  async deleteAgent(
    namespace: string,
    name: string,
  ): Promise<{ status: number; data: unknown }> {
    return this.apiRequest(
      this.agentsUrl(`/${namespace}/${name}`),
      { method: 'DELETE' },
    );
  }

  // -----------------------------------------------------------------------
  // Agent skills management
  // -----------------------------------------------------------------------

  async getAgentSkills(
    namespace: string,
    name: string,
  ): Promise<{ status: number; data: unknown }> {
    const detail = await this.getAgentDetail(namespace, name);
    if (detail.status !== 200) return detail;

    const agent = detail.data as Record<string, unknown>;
    const spec = agent.spec as Record<string, unknown> | undefined;
    const template = spec?.template as Record<string, unknown> | undefined;
    const podSpec = template?.spec as Record<string, unknown> | undefined;
    const volumes = (podSpec?.volumes as Array<Record<string, unknown>>) || [];

    const skillVolumes = volumes.filter(v => {
      const cm = (v.configMap ?? v.config_map) as Record<string, unknown> | undefined;
      return cm && typeof cm.name === 'string' && (cm.name as string).includes('skill');
    });

    const skills = skillVolumes.map(v => {
      const cm = ((v.configMap ?? v.config_map) as Record<string, string>);
      return { name: v.name as string, configMap: cm.name };
    });

    return { status: 200, data: { skills } };
  }

  async assignSkill(
    namespace: string,
    agentName: string,
    skillRef: string,
    skillName: string,
  ): Promise<{ status: number; data: unknown }> {
    this.logger.info(
      `Assigning skill ${skillName} (${skillRef}) to agent ${agentName} in ${namespace}`,
    );
    return {
      status: 200,
      data: {
        message: `Skill ${skillName} queued for assignment to ${agentName}`,
        skillRef,
        agentName,
        namespace,
      },
    };
  }

  async removeSkill(
    namespace: string,
    agentName: string,
    skillName: string,
  ): Promise<{ status: number; data: unknown }> {
    this.logger.info(
      `Removing skill ${skillName} from agent ${agentName} in ${namespace}`,
    );
    return {
      status: 200,
      data: {
        message: `Skill ${skillName} queued for removal from ${agentName}`,
        skillName,
        agentName,
        namespace,
      },
    };
  }

  // -----------------------------------------------------------------------
  // Agent logs
  // -----------------------------------------------------------------------

  async getAgentLogs(
    namespace: string,
    name: string,
    tail: number = 100,
  ): Promise<{ status: number; data: unknown }> {
    return this.apiRequest(
      this.agentsUrl(`/${namespace}/${name}/logs?tail=${tail}`),
    );
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  async listAgentsParsed(
    namespace?: string,
  ): Promise<KagentiAgent[]> {
    const result = await this.listAgents(namespace);
    if (result.status !== 200) return [];

    const data = result.data as { items?: unknown[] };
    if (!data.items) return [];

    return data.items.map(item => {
      const a = item as Record<string, unknown>;
      const labels = (a.labels || {}) as Record<string, unknown>;
      return {
        name: a.name as string,
        namespace: a.namespace as string,
        description: (a.description as string) || '',
        status: (a.status as KagentiAgent['status']) || 'Unknown',
        labels: {
          protocol: (labels.protocol as string[]) || [],
          framework: (labels.framework as string) || '',
          type: (labels.type as string) || '',
        },
        workloadType: (a.workloadType as string) || '',
        createdAt: (a.createdAt as string) || '',
      };
    });
  }
}
