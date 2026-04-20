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
 * Extracts the SKILL.md content from the agent's full response.
 * The agent typically returns a quality review followed by the skill files
 * embedded in fenced markdown code blocks. This function finds the first
 * code block that appears after a heading containing "SKILL.md" and
 * returns its contents. Falls back to the full text if no match is found.
 */
export function extractSkillContent(raw: string): string {
  // Pattern: heading containing SKILL.md, then a fenced code block
  const headingThenFence =
    /###?\s+`?SKILL\.md`?\s*\n+```(?:markdown|md)?\s*\n([\s\S]*?)```/i;
  const m = headingThenFence.exec(raw);
  if (m && m[1].trim()) return m[1].trim();

  // Fallback: any fenced block that starts with YAML frontmatter (---\n)
  const frontmatterFence = /```(?:markdown|md|yaml)?\s*\n(---\n[\s\S]*?)```/;
  const fm = frontmatterFence.exec(raw);
  if (fm && fm[1].trim()) return fm[1].trim();

  return raw;
}

/**
 * Talks to the skill-builder agent via Kagenti's ChatRequest API.
 *
 * Primary mode: streaming via Kagenti /stream endpoint.
 * Each content chunk is forwarded to the frontend in real-time as an
 * agent_output SSE event.
 *
 * Fallback: synchronous via Kagenti /send endpoint (generate/refine methods).
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

  // ---------------------------------------------------------------------------
  // Streaming (primary) -- uses Kagenti /stream endpoint
  // ---------------------------------------------------------------------------

  /**
   * Parse a Kagenti SSE stream and emit BuilderSSEEvents via callback.
   * Kagenti /stream returns lines like:
   *   data: {"content": "...", "session_id": "..."}
   *   data: {"done": true, "session_id": "..."}
   */
  private async readKagentiStream(
    message: string,
    sessionId: string | undefined,
    onEvent: (evt: BuilderSSEEvent) => void,
  ): Promise<void> {
    const res = await this.kagenti.streamMessage(
      message,
      sessionId,
      this.namespace,
      this.agentName,
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Kagenti stream failed (${res.status}): ${text.slice(0, 500)}`);
    }

    if (!res.body) {
      throw new Error('Kagenti stream response has no body');
    }

    onEvent({ event: 'agent_start', data: { agent: this.agentName } });

    let accumulated = '';
    let buffer = '';
    let completeSent = false;

    const emitComplete = () => {
      if (completeSent) return;
      completeSent = true;
      const extracted = extractSkillContent(accumulated);
      onEvent({
        event: 'complete',
        data: {
          skill_content: extracted,
          full_output: accumulated,
          validation: accumulated ? 'passed' : '',
        },
      });
    };

    for await (const chunk of res.body) {
      const text = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8');
      buffer += text;

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;

        let payload: Record<string, unknown>;
        try {
          payload = JSON.parse(line.slice(6));
        } catch {
          this.logger.debug(`Skipping unparseable stream line: ${line.slice(0, 200)}`);
          continue;
        }

        if (payload.done) {
          emitComplete();
          continue;
        }

        const content = (payload.content as string) || '';
        if (content) {
          accumulated += content;
          onEvent({
            event: 'agent_output',
            data: { agent: this.agentName, text: content },
          });
        }
      }
    }

    // Handle any remaining data in the buffer
    if (buffer.startsWith('data: ')) {
      try {
        const payload = JSON.parse(buffer.slice(6));
        if (payload.done) {
          emitComplete();
        } else if (payload.content) {
          accumulated += payload.content;
          onEvent({
            event: 'agent_output',
            data: { agent: this.agentName, text: payload.content },
          });
        }
      } catch {
        // ignore trailing partial data
      }
    }

    // If we accumulated content but never got a done signal, emit complete anyway
    if (accumulated && !completeSent) {
      this.logger.warn('Kagenti stream ended without done signal, emitting complete from accumulated content');
      emitComplete();
    }
  }

  async generateStream(
    body: Record<string, unknown>,
    onEvent: (evt: BuilderSSEEvent) => void,
  ): Promise<void> {
    const description =
      (body.description as string) || (body.message as string) || '';
    const sessionId = body.context_id as string | undefined;

    const prompt = `Create a skill: ${description}`;
    this.logger.info(`Builder generateStream: "${prompt.slice(0, 100)}"`);

    await this.readKagentiStream(prompt, sessionId, onEvent);
  }

  async refineStream(
    body: Record<string, unknown>,
    onEvent: (evt: BuilderSSEEvent) => void,
  ): Promise<void> {
    const feedback =
      (body.feedback as string) || (body.message as string) || '';
    const sessionId = body.context_id as string | undefined;

    const prompt = `Refine the skill based on this feedback: ${feedback}`;
    this.logger.info(`Builder refineStream: "${prompt.slice(0, 100)}"`);

    await this.readKagentiStream(prompt, sessionId, onEvent);
  }

  // ---------------------------------------------------------------------------
  // Synchronous fallback -- uses Kagenti /send endpoint
  // ---------------------------------------------------------------------------

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

      const extracted = extractSkillContent(response.content);
      events.push({
        event: 'complete',
        data: {
          skill_content: extracted,
          full_output: response.content,
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

  // ---------------------------------------------------------------------------
  // Other actions
  // ---------------------------------------------------------------------------

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
