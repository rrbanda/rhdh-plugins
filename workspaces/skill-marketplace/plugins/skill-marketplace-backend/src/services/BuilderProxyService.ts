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

const DEFAULT_TIMEOUT_MS = 300_000;

interface A2APart {
  kind?: string;
  text?: string;
  data?: {
    id?: string;
    name?: string;
    args?: Record<string, unknown>;
    response?: { result?: string };
  };
  metadata?: { adk_type?: string };
}

interface A2AMessage {
  kind?: string;
  role?: string;
  parts?: A2APart[];
}

interface A2ATask {
  contextId?: string;
  artifacts?: Array<{ parts?: A2APart[] }>;
  history?: A2AMessage[];
  status?: { state?: string };
}

export interface BuilderSSEEvent {
  event: string;
  data: Record<string, unknown>;
}

/**
 * Talks to an A2A-protocol builder agent via JSON-RPC `message/send`.
 * Parses the full A2A response into a sequence of SSE-compatible events
 * that the frontend's useBuilderSSE hook can consume.
 */
export class BuilderProxyService {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly logger: LoggerService;
  private readonly timeoutMs: number;

  constructor(options: {
    baseUrl: string;
    apiKey: string;
    logger: LoggerService;
    timeoutMs?: number;
    streamTimeoutMs?: number;
  }) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.apiKey = options.apiKey;
    this.logger = options.logger;
    this.timeoutMs = options.streamTimeoutMs ?? options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  private createSignal(ms?: number): AbortSignal {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), ms ?? this.timeoutMs);
    return controller.signal;
  }

  private async sendA2A(userMessage: string, contextId?: string): Promise<A2ATask> {
    const rpcPayload = {
      jsonrpc: '2.0',
      method: 'message/send',
      id: `builder-${Date.now()}`,
      params: {
        message: {
          messageId: contextId || `msg-${Date.now()}`,
          role: 'user',
          parts: [{ text: userMessage }],
        },
      },
    };

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    this.logger.info(`A2A message/send to ${this.baseUrl}`);

    const res = await fetch(this.baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(rpcPayload),
      signal: this.createSignal(),
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`A2A request failed (${res.status}): ${text.slice(0, 500)}`);
    }

    const json = JSON.parse(text);
    if (json.error) {
      throw new Error(`A2A error: ${json.error.message || JSON.stringify(json.error)}`);
    }

    return (json.result as A2ATask) || {};
  }

  /**
   * Extracts ordered SSE events from the A2A history so the frontend
   * can render agent thinking, tool calls, tool results, and final output.
   */
  private parseTaskToSSEEvents(task: A2ATask): BuilderSSEEvent[] {
    const events: BuilderSSEEvent[] = [];
    const history = task.history || [];

    events.push({ event: 'agent_start', data: { agent: 'skill_builder_agent' } });

    for (const msg of history) {
      if (msg.role !== 'agent') continue;

      for (const part of msg.parts || []) {
        const adkType = part.metadata?.adk_type || part.kind;

        if (adkType === 'function_call' && part.data) {
          events.push({
            event: 'tool_call',
            data: {
              agent: 'skill_builder_agent',
              tool: part.data.name || 'unknown',
              args: part.data.args || {},
            },
          });
        } else if (adkType === 'function_response' && part.data) {
          const result = part.data.response?.result || '';
          events.push({
            event: 'tool_result',
            data: {
              agent: 'skill_builder_agent',
              tool: part.data.name || 'unknown',
              result: result.length > 1000 ? `${result.slice(0, 1000)}…` : result,
            },
          });
        } else if (part.kind === 'text' && part.text) {
          events.push({
            event: 'agent_output',
            data: { agent: 'skill_builder_agent', text: part.text },
          });
        }
      }
    }

    const artifactTexts = (task.artifacts || [])
      .flatMap(a => a.parts || [])
      .map(p => p.text)
      .filter(Boolean) as string[];

    const skillContent = artifactTexts.join('\n');

    events.push({
      event: 'complete',
      data: {
        skill_content: skillContent,
        validation: task.status?.state === 'completed' ? 'passed' : '',
      },
    });

    return events;
  }

  /**
   * Send a generate request to the A2A builder agent and return SSE events.
   */
  async generate(body: Record<string, unknown>): Promise<BuilderSSEEvent[]> {
    const description = (body.description as string) || (body.message as string) || '';
    const contextId = body.context_id as string | undefined;

    const prompt = `Create a skill: ${description}`;
    this.logger.info(`Builder generate: "${prompt.slice(0, 100)}"`);

    const task = await this.sendA2A(prompt, contextId);
    return this.parseTaskToSSEEvents(task);
  }

  /**
   * Send a refine request to the A2A builder agent and return SSE events.
   */
  async refine(body: Record<string, unknown>): Promise<BuilderSSEEvent[]> {
    const feedback = (body.feedback as string) || (body.message as string) || '';
    const contextId = body.context_id as string | undefined;

    const prompt = `Refine the skill based on this feedback: ${feedback}`;
    this.logger.info(`Builder refine: "${prompt.slice(0, 100)}"`);

    const task = await this.sendA2A(prompt, contextId);
    return this.parseTaskToSSEEvents(task);
  }

  async save(
    body: Record<string, unknown>,
  ): Promise<{ status: number; data: unknown }> {
    return { status: 200, data: { success: true, ...body } };
  }

  async graphBuild(): Promise<BuilderSSEEvent[]> {
    this.logger.debug('Graph build via A2A not implemented');
    return [
      { event: 'error', data: { error: 'Graph build is not available via A2A agent' } },
    ];
  }

  async graphUpdate(
    body: Record<string, unknown>,
  ): Promise<{ status: number; data: unknown }> {
    return {
      status: 501,
      data: { error: 'Graph update is not available via A2A agent', ...body },
    };
  }
}
