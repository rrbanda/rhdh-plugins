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
import type { KagentiService } from './KagentiService';

export interface BuilderSSEEvent {
  event: string;
  data: Record<string, unknown>;
}

interface ChatResponse {
  content: string;
  session_id: string;
  is_complete: boolean;
}

/**
 * Talks to the skill-builder agent via Kagenti's ChatRequest API.
 * Converts the ChatResponse into a sequence of SSE events that the
 * frontend's useBuilderSSE hook can consume.
 */
export class BuilderProxyService {
  private readonly kagenti: KagentiService;
  private readonly logger: LoggerService;
  private readonly namespace: string;
  private readonly agentName: string;

  constructor(options: {
    kagenti: KagentiService;
    logger: LoggerService;
    namespace?: string;
    agentName?: string;
  }) {
    this.kagenti = options.kagenti;
    this.logger = options.logger;
    this.namespace = options.namespace || 'team1';
    this.agentName = options.agentName || 'skill-builder';
  }

  private async sendChat(
    message: string,
    sessionId?: string,
  ): Promise<ChatResponse> {
    this.logger.info(
      `Builder chat to ${this.namespace}/${this.agentName}: "${message.slice(0, 80)}..."`,
    );

    const result = await this.kagenti.sendMessage(
      message,
      sessionId,
      this.namespace,
      this.agentName,
    );

    if (result.status !== 200) {
      const errText = JSON.stringify(result.data).slice(0, 500);
      throw new Error(`Kagenti chat failed (${result.status}): ${errText}`);
    }

    const data = result.data as Record<string, unknown>;
    return {
      content: (data.content as string) || '',
      session_id: (data.session_id as string) || '',
      is_complete: data.is_complete !== false,
    };
  }

  private chatResponseToSSEEvents(response: ChatResponse): BuilderSSEEvent[] {
    const events: BuilderSSEEvent[] = [];

    events.push({
      event: 'agent_start',
      data: { agent: this.agentName },
    });

    if (response.content) {
      events.push({
        event: 'agent_output',
        data: { agent: this.agentName, text: response.content },
      });

      events.push({
        event: 'complete',
        data: {
          skill_content: response.content,
          validation: response.is_complete ? 'passed' : '',
        },
      });
    }

    return events;
  }

  async generate(body: Record<string, unknown>): Promise<BuilderSSEEvent[]> {
    const description =
      (body.description as string) || (body.message as string) || '';
    const sessionId = body.context_id as string | undefined;

    const prompt = `Create a skill: ${description}`;
    this.logger.info(`Builder generate: "${prompt.slice(0, 100)}"`);

    const response = await this.sendChat(prompt, sessionId);
    return this.chatResponseToSSEEvents(response);
  }

  async refine(body: Record<string, unknown>): Promise<BuilderSSEEvent[]> {
    const feedback =
      (body.feedback as string) || (body.message as string) || '';
    const sessionId = body.context_id as string | undefined;

    const prompt = `Refine the skill based on this feedback: ${feedback}`;
    this.logger.info(`Builder refine: "${prompt.slice(0, 100)}"`);

    const response = await this.sendChat(prompt, sessionId);
    return this.chatResponseToSSEEvents(response);
  }

  async save(
    body: Record<string, unknown>,
  ): Promise<{ status: number; data: unknown }> {
    return { status: 200, data: { success: true, ...body } };
  }

  async graphBuild(): Promise<BuilderSSEEvent[]> {
    this.logger.debug('Graph build not available via builder agent');
    return [
      {
        event: 'error',
        data: { error: 'Graph build is not available via builder agent' },
      },
    ];
  }

  async graphUpdate(
    body: Record<string, unknown>,
  ): Promise<{ status: number; data: unknown }> {
    return {
      status: 501,
      data: { error: 'Graph update is not available via builder agent', ...body },
    };
  }
}
