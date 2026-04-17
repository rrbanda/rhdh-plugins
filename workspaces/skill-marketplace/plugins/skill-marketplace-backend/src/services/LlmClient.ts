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
import type { LoggerService } from '@backstage/backend-plugin-api';

export interface LlmToolFunction {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface LlmTool {
  type: 'function';
  function: LlmToolFunction;
}

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: LlmToolCall[];
  tool_call_id?: string;
}

export interface LlmToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface LlmChoice {
  message: LlmMessage;
  finish_reason: 'stop' | 'tool_calls' | 'length' | null;
}

export interface LlmCompletionResponse {
  choices: LlmChoice[];
}

export interface LlmClientConfig {
  apiUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  temperature: number;
}

const LLM_DEFAULTS = {
  model: 'gpt-4o',
  timeoutMs: 60_000,
  temperature: 0.1,
} as const;

export class LlmClient {
  private readonly config: LlmClientConfig;

  constructor(options: {
    logger: LoggerService;
    apiUrl: string;
    apiKey: string;
    model?: string;
    timeoutMs?: number;
    temperature?: number;
  }) {

    let baseUrl = options.apiUrl;
    if (baseUrl.endsWith('/embeddings')) {
      baseUrl = baseUrl.replace(/\/embeddings$/, '/chat/completions');
    } else if (!baseUrl.endsWith('/chat/completions')) {
      baseUrl = baseUrl.replace(/\/$/, '') + '/chat/completions';
    }

    this.config = {
      apiUrl: baseUrl,
      apiKey: options.apiKey,
      model: options.model ?? LLM_DEFAULTS.model,
      timeoutMs: options.timeoutMs ?? LLM_DEFAULTS.timeoutMs,
      temperature: options.temperature ?? LLM_DEFAULTS.temperature,
    };
  }

  async chatCompletion(
    messages: LlmMessage[],
    tools?: LlmTool[],
  ): Promise<LlmChoice> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const body: Record<string, unknown> = {
        model: this.config.model,
        messages,
        temperature: this.config.temperature,
      };

      if (tools && tools.length > 0) {
        body.tools = tools;
        body.tool_choice = 'auto';
      }

      const res = await fetch(this.config.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal as never,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`LLM API error ${res.status}: ${text.slice(0, 500)}`);
      }

      const data = (await res.json()) as LlmCompletionResponse;

      if (!data.choices || data.choices.length === 0) {
        throw new Error('LLM returned empty choices');
      }

      return data.choices[0];
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        throw new Error(`LLM request timed out after ${this.config.timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async *streamChatCompletion(
    messages: LlmMessage[],
    tools?: LlmTool[],
  ): AsyncGenerator<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const body: Record<string, unknown> = {
        model: this.config.model,
        messages,
        temperature: this.config.temperature,
        stream: true,
      };

      if (tools && tools.length > 0) {
        body.tools = tools;
        body.tool_choice = 'auto';
      }

      const res = await fetch(this.config.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal as never,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`LLM stream error ${res.status}: ${text.slice(0, 500)}`);
      }

      if (!res.body) {
        throw new Error('LLM stream returned no body');
      }

      let buffer = '';
      for await (const chunk of res.body) {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const payload = trimmed.slice(6);
          if (payload === '[DONE]') return;
          yield payload;
        }
      }

      if (buffer.trim()) {
        const trimmed = buffer.trim();
        if (trimmed.startsWith('data: ') && trimmed.slice(6) !== '[DONE]') {
          yield trimmed.slice(6);
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        throw new Error(`LLM stream timed out after ${this.config.timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}
