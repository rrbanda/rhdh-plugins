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
import { LoggerService } from '@backstage/backend-plugin-api';
import {
  ClientFactory,
  JsonRpcTransportFactory,
  DefaultAgentCardResolver,
  createAuthenticatingFetchWithRetry,
  type AuthenticationHandler,
  type AgentCardResolver,
  type Client,
} from '@a2a-js/sdk/client';
import type {
  AgentCard,
  MessageSendParams,
  Task,
  Message,
  TextPart,
} from '@a2a-js/sdk';
import type { KagentiService } from './KagentiService';

/**
 * Resolves the agent card from the remote URL but rewrites the `url` field
 * so the A2A SDK sends JSON-RPC messages to the configured external route
 * instead of the pod-internal address baked into the card.
 */
class UrlRewritingCardResolver implements AgentCardResolver {
  private readonly inner = new DefaultAgentCardResolver();

  async resolve(baseUrl: string, path?: string): Promise<AgentCard> {
    const card = await this.inner.resolve(baseUrl, path);
    const normalized = baseUrl.replace(/\/$/, '');
    (card as AgentCard & { url?: string }).url = normalized;
    if (Array.isArray((card as any).supportedInterfaces)) {
      for (const iface of (card as any).supportedInterfaces) {
        if (iface.url) {
          iface.url = normalized;
        }
      }
    }
    return card;
  }
}

export interface SmpAgentsConfig {
  skillAdvisorUrl?: string;
  bundleValidatorUrl?: string;
  kgQaUrl?: string;
  playgroundUrl?: string;
  skillBuilderUrl?: string;
  requestTimeoutMs?: number;
}

export type SmpAgentName =
  | 'skillAdvisor'
  | 'bundleValidator'
  | 'kgQa'
  | 'playground'
  | 'skillBuilder';

const DEFAULT_TIMEOUT_MS = 120_000;

export class SmpAgentClient {
  private readonly config: SmpAgentsConfig;
  private readonly logger: LoggerService;
  private readonly kagentiService: KagentiService;
  private readonly timeoutMs: number;
  private readonly clientCache = new Map<string, Client>();
  private clientFactory: ClientFactory | undefined;

  constructor(
    config: SmpAgentsConfig,
    kagentiService: KagentiService,
    logger: LoggerService,
  ) {
    this.config = config;
    this.kagentiService = kagentiService;
    this.logger = logger;
    this.timeoutMs = config.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  get isConfigured(): boolean {
    return !!(
      this.config.skillAdvisorUrl ||
      this.config.bundleValidatorUrl ||
      this.config.kgQaUrl ||
      this.config.playgroundUrl ||
      this.config.skillBuilderUrl
    );
  }

  private getAgentUrl(agent: SmpAgentName): string {
    const urlMap: Record<SmpAgentName, string | undefined> = {
      skillAdvisor: this.config.skillAdvisorUrl,
      bundleValidator: this.config.bundleValidatorUrl,
      kgQa: this.config.kgQaUrl,
      playground: this.config.playgroundUrl,
      skillBuilder: this.config.skillBuilderUrl,
    };
    const url = urlMap[agent];
    if (!url) {
      throw new Error(
        `SMP agent '${agent}' is not configured. Set skillMarketplace.smpAgents.${agent}Url in app-config.`,
      );
    }
    return url;
  }

  private getFactory(): ClientFactory {
    if (this.clientFactory) {
      return this.clientFactory;
    }

    const authHandler: AuthenticationHandler = {
      headers: async () => {
        const token = await this.kagentiService.getToken();
        return { Authorization: `Bearer ${token}` };
      },
      shouldRetryWithHeaders: async (_req: RequestInit, res: Response) => {
        if (res.status === 401 || res.status === 403) {
          this.logger.warn(
            `A2A auth failed (${res.status}), refreshing Keycloak token`,
          );
          this.kagentiService.invalidateToken();
          const freshToken = await this.kagentiService.getToken();
          return { Authorization: `Bearer ${freshToken}` };
        }
        return undefined;
      },
    };

    const authFetch = createAuthenticatingFetchWithRetry(
      globalThis.fetch,
      authHandler,
    );

    this.clientFactory = new ClientFactory({
      transports: [new JsonRpcTransportFactory({ fetchImpl: authFetch })],
      cardResolver: new UrlRewritingCardResolver(),
    });

    return this.clientFactory;
  }

  private async getClient(agent: SmpAgentName): Promise<Client> {
    const url = this.getAgentUrl(agent);

    const cached = this.clientCache.get(url);
    if (cached) {
      return cached;
    }

    this.logger.info(`Creating A2A client for ${agent} at ${url}`);
    const factory = this.getFactory();
    const client = await factory.createFromUrl(url);
    this.clientCache.set(url, client);
    return client;
  }

  /**
   * Merges an optional request abort with a per-call timeout. Either aborts the combined signal.
   */
  private static mergeTimeoutWithRequest(
    requestSignal: AbortSignal | undefined,
    timeoutMs: number,
  ): { signal: AbortSignal; cleanup: () => void } {
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), timeoutMs);
    if (!requestSignal) {
      return { signal: timeout.signal, cleanup: () => clearTimeout(timer) };
    }
    if (requestSignal.aborted) {
      clearTimeout(timer);
      return { signal: requestSignal, cleanup: () => {} };
    }
    const combined = new AbortController();
    const onAnyAbort = () => {
      clearTimeout(timer);
      combined.abort();
    };
    requestSignal.addEventListener('abort', onAnyAbort, { once: true });
    timeout.signal.addEventListener('abort', onAnyAbort, { once: true });
    return {
      signal: combined.signal,
      cleanup: () => {
        clearTimeout(timer);
        requestSignal.removeEventListener('abort', onAnyAbort);
        timeout.signal.removeEventListener('abort', onAnyAbort);
      },
    };
  }

  /**
   * Reads context/session id from an A2A Task or Message when the server returns one.
   */
  static extractContextId(result: Task | Message): string | undefined {
    const r = result as { contextId?: string };
    if (typeof r.contextId === 'string' && r.contextId.trim()) {
      return r.contextId;
    }
    return undefined;
  }

  private async sendMessage(
    agent: SmpAgentName,
    text: string,
    contextId: string | undefined,
    requestSignal: AbortSignal | undefined,
  ): Promise<{ text: string; contextId?: string }> {
    const client = await this.getClient(agent);

    const params: MessageSendParams = {
      message: {
        kind: 'message',
        messageId: `smp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        role: 'user',
        parts: [{ kind: 'text', text }],
        ...(contextId ? { contextId } : {}),
      },
    };

    const { signal, cleanup } = SmpAgentClient.mergeTimeoutWithRequest(
      requestSignal,
      this.timeoutMs,
    );
    try {
      this.logger.info(`Sending A2A message to ${agent}`);
      const result = await client.sendMessage(params, { signal });
      const extracted = SmpAgentClient.extractText(result);
      const fromResponse = SmpAgentClient.extractContextId(result);
      return {
        text: extracted,
        contextId: fromResponse ?? contextId,
      };
    } finally {
      cleanup();
    }
  }

  /**
   * Extract the text response from an A2A SendMessageResult (Message | Task).
   * smp-agents return Tasks with artifacts containing text parts.
   */
  /**
   * Filter out ADK/A2A metadata JSON that agents sometimes append to text parts.
   */
  private static isMetadataJson(text: string): boolean {
    const trimmed = text.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return false;
    return (
      trimmed.includes('"adk_type"') ||
      trimmed.includes('"kind":"task"') ||
      trimmed.includes('"adk_app_name"') ||
      trimmed.includes('"adk_invocation_id"') ||
      trimmed.includes('"requestedAuthConfigs"')
    );
  }

  static extractText(result: Task | Message): string {
    // Task: look in artifacts
    if ('artifacts' in result && Array.isArray(result.artifacts)) {
      const texts = result.artifacts
        .flatMap(a => a.parts ?? [])
        .filter((p): p is TextPart => p.kind === 'text')
        .map(p => p.text)
        .filter(t => !SmpAgentClient.isMetadataJson(t));
      if (texts.length > 0) {
        return texts.join('\n');
      }
    }

    // Task: fallback to status message
    if ('status' in result && result.status?.message?.parts) {
      const texts = result.status.message.parts
        .filter((p): p is TextPart => p.kind === 'text')
        .map(p => p.text)
        .filter(t => !SmpAgentClient.isMetadataJson(t));
      if (texts.length > 0) {
        return texts.join('\n');
      }
    }

    // Message: look in parts
    if ('parts' in result && Array.isArray(result.parts)) {
      const texts = result.parts
        .filter((p): p is TextPart => p.kind === 'text')
        .map(p => p.text)
        .filter(t => !SmpAgentClient.isMetadataJson(t));
      if (texts.length > 0) {
        return texts.join('\n');
      }
    }

    return JSON.stringify(result);
  }

  // -----------------------------------------------------------------------
  // Typed agent methods
  // -----------------------------------------------------------------------

  async askSkillAdvisor(
    question: string,
    contextId?: string,
    requestSignal?: AbortSignal,
  ): Promise<string> {
    const { text } = await this.sendMessage(
      'skillAdvisor',
      question,
      contextId,
      requestSignal,
    );
    return text;
  }

  async askBundleValidator(
    question: string,
    contextId?: string,
    requestSignal?: AbortSignal,
  ): Promise<string> {
    const { text } = await this.sendMessage(
      'bundleValidator',
      question,
      contextId,
      requestSignal,
    );
    return text;
  }

  async askKgQa(
    question: string,
    contextId?: string,
    requestSignal?: AbortSignal,
  ): Promise<string> {
    const { text } = await this.sendMessage(
      'kgQa',
      question,
      contextId,
      requestSignal,
    );
    return text;
  }

  async askPlayground(
    question: string,
    contextId?: string,
    requestSignal?: AbortSignal,
  ): Promise<string> {
    const { text } = await this.sendMessage(
      'playground',
      question,
      contextId,
      requestSignal,
    );
    return text;
  }

  async buildSkill(
    prompt: string,
    contextId?: string,
    requestSignal?: AbortSignal,
  ): Promise<string> {
    const { text } = await this.sendMessage(
      'skillBuilder',
      prompt,
      contextId,
      requestSignal,
    );
    return text;
  }

  /**
   * Sends a message via the OpenAI-compatible /v1/chat/completions endpoint.
   * Used as fallback for agents that don't implement A2A JSON-RPC message/send.
   */
  private async sendOpenAICompatible(
    agent: SmpAgentName,
    text: string,
    contextId: string | undefined,
    requestSignal: AbortSignal | undefined,
  ): Promise<{ text: string; contextId?: string }> {
    const baseUrl = this.getAgentUrl(agent).replace(/\/$/, '');
    const { signal, cleanup } = SmpAgentClient.mergeTimeoutWithRequest(
      requestSignal,
      this.timeoutMs,
    );
    try {
      this.logger.info(
        `Sending OpenAI-compatible message to ${agent} at ${baseUrl}/v1/chat/completions`,
      );
      const messages: Array<{ role: string; content: string }> = [];
      if (contextId) {
        messages.push({
          role: 'system',
          content: `Session context ID: ${contextId}`,
        });
      }
      messages.push({ role: 'user', content: text });

      const res = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'default', messages }),
        signal,
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        throw new Error(
          `OpenAI-compatible API returned ${res.status}: ${errBody}`,
        );
      }

      const data = (await res.json()) as {
        id?: string;
        choices?: Array<{
          message?: { content?: string };
        }>;
      };

      const content =
        data.choices?.[0]?.message?.content ?? JSON.stringify(data);
      return { text: content, contextId: data.id ?? contextId };
    } finally {
      cleanup();
    }
  }

  /**
   * Generic chat method: routes to the specified agent.
   * Tries A2A JSON-RPC first; falls back to OpenAI-compatible /v1/chat/completions
   * for agents that only expose that interface (e.g. docsclaw).
   */
  /** Agents that only support OpenAI-compatible chat completions (no A2A). */
  private static readonly OPENAI_ONLY_AGENTS: Set<SmpAgentName> = new Set([
    'playground',
  ]);

  async chat(
    agent: SmpAgentName,
    message: string,
    contextId?: string,
    requestSignal?: AbortSignal,
  ): Promise<{ text: string; contextId?: string }> {
    // Skip A2A entirely for agents that only support OpenAI chat completions
    if (SmpAgentClient.OPENAI_ONLY_AGENTS.has(agent)) {
      return this.sendOpenAICompatible(
        agent,
        message,
        contextId,
        requestSignal,
      );
    }

    try {
      return await this.sendMessage(agent, message, contextId, requestSignal);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.info(
        `A2A sendMessage failed for ${agent} (${msg.slice(0, 80)}), falling back to OpenAI-compatible API`,
      );
      try {
        return await this.sendOpenAICompatible(
          agent,
          message,
          contextId,
          requestSignal,
        );
      } catch (fallbackErr) {
        this.logger.error(
          `OpenAI fallback also failed for ${agent}: ${(fallbackErr as Error).message}`,
        );
        throw fallbackErr;
      }
    }
  }

  // -----------------------------------------------------------------------
  // Health / discovery
  // -----------------------------------------------------------------------

  async checkHealth(
    requestSignal?: AbortSignal,
  ): Promise<
    Record<
      SmpAgentName,
      { configured: boolean; healthy: boolean; error?: string }
    >
  > {
    const agents: SmpAgentName[] = [
      'skillAdvisor',
      'bundleValidator',
      'kgQa',
      'playground',
      'skillBuilder',
    ];

    const results = await Promise.all(
      agents.map(async agent => {
        const url = this.config[`${agent}Url` as keyof SmpAgentsConfig] as
          | string
          | undefined;
        if (!url) {
          return [agent, { configured: false, healthy: false }] as const;
        }
        const { signal, cleanup } = SmpAgentClient.mergeTimeoutWithRequest(
          requestSignal,
          5_000,
        );
        try {
          const normalized = url.replace(/\/$/, '');
          const res = await fetch(`${normalized}/healthz`, { signal });
          if (res.ok) {
            return [agent, { configured: true, healthy: true }] as const;
          }
          const cardRes = await fetch(
            `${normalized}/.well-known/agent-card.json`,
            { signal },
          );
          return [agent, { configured: true, healthy: cardRes.ok }] as const;
        } catch (err) {
          return [
            agent,
            {
              configured: true,
              healthy: false,
              error: (err as Error).message,
            },
          ] as const;
        } finally {
          cleanup();
        }
      }),
    );

    return Object.fromEntries(results) as Record<
      SmpAgentName,
      { configured: boolean; healthy: boolean; error?: string }
    >;
  }

  async getAgentCard(
    agent: SmpAgentName,
    requestSignal?: AbortSignal,
  ): Promise<unknown> {
    const url = this.getAgentUrl(agent);
    const { signal, cleanup } = SmpAgentClient.mergeTimeoutWithRequest(
      requestSignal,
      5_000,
    );
    try {
      const res = await fetch(
        `${url.replace(/\/$/, '')}/.well-known/agent-card.json`,
        { signal },
      );
      if (!res.ok) {
        throw new Error(`Agent card fetch failed for ${agent} (${res.status})`);
      }
      return res.json();
    } finally {
      cleanup();
    }
  }
}
