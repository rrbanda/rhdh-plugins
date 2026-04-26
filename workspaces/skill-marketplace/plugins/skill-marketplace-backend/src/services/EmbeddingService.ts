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

export interface EmbeddingConfig {
  apiUrl: string;
  apiKey: string;
  model: string;
  dimensions: number;
  timeoutMs: number;
  maxInputLength: number;
}

const EMBEDDING_DEFAULTS: Omit<EmbeddingConfig, 'apiUrl' | 'apiKey'> = {
  model: 'text-embedding-3-small',
  dimensions: 1536,
  timeoutMs: 30_000,
  maxInputLength: 8000,
};

export class EmbeddingService {
  private readonly config: EmbeddingConfig;
  private readonly logger: LoggerService;

  constructor(options: {
    logger: LoggerService;
    apiUrl: string;
    apiKey: string;
    model?: string;
    dimensions?: number;
    timeoutMs?: number;
    maxInputLength?: number;
  }) {
    this.logger = options.logger;
    this.config = {
      apiUrl: options.apiUrl,
      apiKey: options.apiKey,
      model: options.model ?? EMBEDDING_DEFAULTS.model,
      dimensions: options.dimensions ?? EMBEDDING_DEFAULTS.dimensions,
      timeoutMs: options.timeoutMs ?? EMBEDDING_DEFAULTS.timeoutMs,
      maxInputLength:
        options.maxInputLength ?? EMBEDDING_DEFAULTS.maxInputLength,
    };
  }

  get dimensions(): number {
    return this.config.dimensions;
  }

  async generate(
    text: string,
    options?: { signal?: AbortSignal },
  ): Promise<number[] | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    const external = options?.signal;
    if (external) {
      if (external.aborted) {
        return null;
      }
      external.addEventListener('abort', () => controller.abort(), {
        once: true,
      });
    }

    try {
      const res = await fetch(this.config.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          input: text.slice(0, this.config.maxInputLength),
        }),
        signal: controller.signal as never,
      });

      if (!res.ok) {
        this.logger.warn(
          `Embedding API error: ${res.status} ${res.statusText}`,
        );
        return null;
      }

      const data = (await res.json()) as {
        data?: Array<{ embedding: number[] }>;
      };
      return data.data?.[0]?.embedding ?? null;
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        this.logger.warn(
          `Embedding request timed out after ${this.config.timeoutMs}ms`,
        );
      } else {
        this.logger.warn(
          `Embedding generation failed: ${(err as Error).message}`,
        );
      }
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
