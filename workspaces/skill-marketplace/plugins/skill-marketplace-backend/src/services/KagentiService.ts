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
import { LoggerService } from '@backstage/backend-plugin-api';
import type {
  KagentiAgent,
  AgentDeployRequest,
  AgentCardData,
  AgentSkillRef,
} from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';

export interface KagentiConfig {
  apiUrl: string;
  agentName: string;
  namespace: string;
  requestTimeoutMs?: number;
  tokenTimeoutMs?: number;
  directA2AUrl?: string;
  keycloak: {
    tokenUrl: string;
    clientId: string;
    username: string;
    password: string;
  };
}

const KAGENTI_DEFAULT_REQUEST_TIMEOUT_MS = 120_000;
const KAGENTI_DEFAULT_TOKEN_TIMEOUT_MS = 10_000;

interface TokenCache {
  token: string;
  expiresAt: number;
}

export class KagentiService {
  private readonly config: KagentiConfig;
  private readonly logger: LoggerService;
  private tokenCache: TokenCache | null = null;
  private readonly requestTimeoutMs: number;
  private readonly tokenTimeoutMs: number;

  constructor(config: KagentiConfig, logger: LoggerService) {
    if (!config.apiUrl) {
      throw new Error('KagentiService: apiUrl is required');
    }
    if (
      !config.keycloak?.tokenUrl ||
      !config.keycloak?.clientId ||
      !config.keycloak?.username ||
      !config.keycloak?.password
    ) {
      throw new Error(
        'KagentiService: keycloak.tokenUrl, clientId, username, and password are all required',
      );
    }
    this.config = config;
    this.logger = logger;
    this.requestTimeoutMs =
      config.requestTimeoutMs ?? KAGENTI_DEFAULT_REQUEST_TIMEOUT_MS;
    this.tokenTimeoutMs =
      config.tokenTimeoutMs ?? KAGENTI_DEFAULT_TOKEN_TIMEOUT_MS;
  }

  private createSignal(ms?: number): AbortSignal {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), ms ?? this.requestTimeoutMs);
    return controller.signal;
  }

  async getToken(): Promise<string> {
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
      signal: this.createSignal(this.tokenTimeoutMs),
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

  invalidateToken(): void {
    this.tokenCache = null;
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
      const redacted = bodyStr.replace(
        /"(LLM_API_KEY|password|token|secret|apiKey)"\s*:\s*"[^"]*"/gi,
        '"$1":"[REDACTED]"',
      );
      this.logger.debug(`Kagenti request body: ${redacted}`);
    }

    const res = await fetch(url, {
      method,
      headers,
      body: bodyStr,
      signal: this.createSignal(),
    });

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

  async getAgentCard(
    namespace?: string,
    agentName?: string,
  ): Promise<{ status: number; data: unknown }> {
    return this.apiRequest(this.chatUrl('/agent-card', namespace, agentName));
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
    return this.apiRequest(this.agentsUrl(`/${namespace}/${name}`));
  }

  async deployAgent(
    request: AgentDeployRequest,
  ): Promise<{ status: number; data: unknown }> {
    const payload: Record<string, unknown> = {
      name: request.name,
      namespace: request.namespace,
      protocol: request.protocol ?? 'a2a',
      framework: request.framework ?? 'Other',
      workloadType: request.workloadType ?? 'deployment',
      deploymentMethod:
        request.deploymentMethod ??
        (request.containerImage ? 'image' : 'source'),
    };

    if (request.containerImage) {
      payload.containerImage = request.containerImage;
    }
    if (request.gitUrl) {
      payload.gitUrl = request.gitUrl;
    }
    if (request.gitPath) {
      payload.gitPath = request.gitPath;
    }
    if (request.gitBranch) {
      payload.gitBranch = request.gitBranch;
    }
    if (request.imageTag) {
      payload.imageTag = request.imageTag;
    }
    if (request.envVars && request.envVars.length > 0) {
      payload.envVars = request.envVars;
    }
    if (request.servicePorts && request.servicePorts.length > 0) {
      payload.servicePorts = request.servicePorts;
    }
    if (request.createHttpRoute !== undefined) {
      payload.createHttpRoute = request.createHttpRoute;
    }
    if (request.authBridgeEnabled !== undefined) {
      payload.authBridgeEnabled = request.authBridgeEnabled;
    }

    return this.apiRequest(this.agentsUrl(), {
      method: 'POST',
      body: payload,
    });
  }

  async deleteAgent(
    namespace: string,
    name: string,
  ): Promise<{ status: number; data: unknown }> {
    return this.apiRequest(this.agentsUrl(`/${namespace}/${name}`), {
      method: 'DELETE',
    });
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

    const skills: Array<{ name: string; source: string }> = [];

    const volumes = (podSpec?.volumes as Array<Record<string, unknown>>) || [];
    for (const v of volumes) {
      const cm = (v.config_map ?? v.configMap) as
        | Record<string, unknown>
        | undefined;
      if (
        cm &&
        typeof cm.name === 'string' &&
        (cm.name as string).toLowerCase().includes('skill')
      ) {
        skills.push({ name: v.name as string, source: `configMap:${cm.name}` });
      }
      const volName = v.name as string;
      if (volName.toLowerCase().includes('skill')) {
        const hasPvc = v.persistent_volume_claim || v.persistentVolumeClaim;
        const hasEmptyDir = v.empty_dir || v.emptyDir;
        if (hasPvc) {
          const claimName =
            (hasPvc as Record<string, string>).claim_name ??
            (hasPvc as Record<string, string>).claimName;
          if (!skills.some(s => s.name === volName)) {
            skills.push({ name: volName, source: `pvc:${claimName}` });
          }
        } else if (hasEmptyDir && !skills.some(s => s.name === volName)) {
          skills.push({
            name: volName,
            source: 'emptyDir (populated by init container)',
          });
        }
      }
    }

    return { status: 200, data: { skills } };
  }

  async assignSkill(
    _namespace: string,
    _agentName: string,
    _skillRef: string,
    _skillName: string,
  ): Promise<{ status: number; data: unknown }> {
    return {
      status: 501,
      data: { error: 'Skill assignment is not yet implemented' },
    };
  }

  async removeSkill(
    _namespace: string,
    _agentName: string,
    _skillName: string,
  ): Promise<{ status: number; data: unknown }> {
    return {
      status: 501,
      data: { error: 'Skill removal is not yet implemented' },
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
  // Namespaces
  // -----------------------------------------------------------------------

  async listNamespaces(
    enabledOnly: boolean = true,
  ): Promise<{ status: number; data: unknown }> {
    const query = enabledOnly ? '?enabled_only=true' : '';
    return this.apiRequest(`${this.config.apiUrl}/api/v1/namespaces${query}`);
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  async listAgentsParsed(namespace?: string): Promise<KagentiAgent[]> {
    const result = await this.listAgents(namespace);
    if (result.status !== 200) return [];

    const data = result.data as { items?: unknown[] };
    if (!data.items) return [];

    return data.items.map(item => {
      const a = item as Record<string, unknown>;
      const meta = a.metadata as Record<string, unknown> | undefined;
      const agentName = (a.name ?? meta?.name) as string;
      const agentNs = (a.namespace ?? meta?.namespace) as string;
      const agentLabels = (a.labels ?? meta?.labels ?? {}) as Record<
        string,
        unknown
      >;
      const agentCreatedAt = (a.createdAt ?? meta?.creationTimestamp) as string;

      return {
        name: agentName,
        namespace: agentNs,
        description: (a.description as string) || '',
        status: (a.status ??
          a.readyStatus ??
          'Unknown') as KagentiAgent['status'],
        labels: {
          protocol: (agentLabels.protocol as string[]) || [],
          framework:
            (agentLabels.framework as string) ||
            (agentLabels['kagenti.io/framework'] as string) ||
            '',
          type:
            (agentLabels.type as string) ||
            (agentLabels['kagenti.io/type'] as string) ||
            '',
        },
        workloadType: (a.workloadType as string) || '',
        createdAt: agentCreatedAt || '',
      };
    });
  }

  private static readonly AGENT_CARD_TIMEOUT_MS = 5_000;

  private parseAgentCard(raw: unknown): AgentCardData | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    const d = raw as Record<string, unknown>;
    if (!d.name || !d.url) return undefined;

    const parseSkills = (arr: unknown): AgentSkillRef[] => {
      if (!Array.isArray(arr)) return [];
      return arr
        .filter(
          (s): s is Record<string, unknown> =>
            !!s && typeof s === 'object' && typeof s.id === 'string',
        )
        .map(s => ({
          id: String(s.id),
          name: String(s.name ?? s.id),
          description: String(s.description ?? ''),
          tags: Array.isArray(s.tags) ? s.tags.map(String) : [],
          examples: Array.isArray(s.examples)
            ? s.examples.map(String)
            : undefined,
          inputModes: Array.isArray(s.inputModes)
            ? s.inputModes.map(String)
            : undefined,
          outputModes: Array.isArray(s.outputModes)
            ? s.outputModes.map(String)
            : undefined,
        }));
    };

    const caps = (d.capabilities ?? {}) as Record<string, unknown>;
    const auth = d.authentication as Record<string, unknown> | undefined;
    const provider = d.provider as Record<string, unknown> | undefined;

    return {
      name: String(d.name),
      description: String(d.description ?? ''),
      url: String(d.url),
      version: String(d.version ?? ''),
      documentationUrl: d.documentationUrl
        ? String(d.documentationUrl)
        : undefined,
      provider: provider
        ? {
            organization: String(provider.organization ?? ''),
            url: String(provider.url ?? ''),
          }
        : undefined,
      capabilities: {
        streaming: caps.streaming === true,
        pushNotifications: caps.pushNotifications === true,
        stateTransitionHistory: caps.stateTransitionHistory === true,
      },
      authentication: auth
        ? {
            schemes: Array.isArray(auth.schemes)
              ? auth.schemes.map(String)
              : [],
            credentials: auth.credentials
              ? String(auth.credentials)
              : undefined,
          }
        : undefined,
      defaultInputModes: Array.isArray(d.defaultInputModes)
        ? d.defaultInputModes.map(String)
        : ['text/plain'],
      defaultOutputModes: Array.isArray(d.defaultOutputModes)
        ? d.defaultOutputModes.map(String)
        : ['text/plain'],
      skills: parseSkills(d.skills),
    };
  }

  async listAgentsWithCards(namespace?: string): Promise<KagentiAgent[]> {
    const agents = await this.listAgentsParsed(namespace);
    if (agents.length === 0) return agents;

    const enriched = await Promise.all(
      agents.map(async (agent): Promise<KagentiAgent> => {
        try {
          const controller = new AbortController();
          const timer = setTimeout(
            () => controller.abort(),
            KagentiService.AGENT_CARD_TIMEOUT_MS,
          );
          try {
            const card = await this.getAgentCard(agent.namespace, agent.name);
            clearTimeout(timer);
            if (card.status === 200) {
              const parsed = this.parseAgentCard(card.data);
              if (parsed) {
                return { ...agent, agentCard: parsed };
              }
            }
          } finally {
            clearTimeout(timer);
          }
        } catch (err) {
          this.logger.debug(
            `AgentCard fetch failed for ${agent.namespace}/${agent.name}: ${(err as Error).message}`,
          );
        }
        return agent;
      }),
    );

    return enriched;
  }
}
