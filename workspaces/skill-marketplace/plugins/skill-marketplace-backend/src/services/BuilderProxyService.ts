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

const DEFAULT_CONNECTION_TIMEOUT_MS = 30_000;
const DEFAULT_STREAM_TIMEOUT_MS = 300_000;

export class BuilderProxyService {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly logger: LoggerService;
  private readonly connectionTimeoutMs: number;
  private readonly streamTimeoutMs: number;

  constructor(options: {
    baseUrl: string;
    apiKey: string;
    logger: LoggerService;
    timeoutMs?: number;
    streamTimeoutMs?: number;
  }) {
    this.baseUrl = options.baseUrl;
    this.apiKey = options.apiKey;
    this.logger = options.logger;
    this.connectionTimeoutMs = options.timeoutMs ?? DEFAULT_CONNECTION_TIMEOUT_MS;
    this.streamTimeoutMs = options.streamTimeoutMs ?? DEFAULT_STREAM_TIMEOUT_MS;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) {
      h.Authorization = `Bearer ${this.apiKey}`;
    }
    return h;
  }

  private createSignal(ms?: number): AbortSignal {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), ms ?? this.connectionTimeoutMs);
    return controller.signal;
  }

  async generate(body: Record<string, unknown>): Promise<NodeFetchResponse> {
    this.logger.debug('Proxying generate request to builder agent');
    return fetch(`${this.baseUrl}/generate`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
      signal: this.createSignal(this.streamTimeoutMs),
    });
  }

  async refine(body: Record<string, unknown>): Promise<NodeFetchResponse> {
    this.logger.debug('Proxying refine request to builder agent');
    return fetch(`${this.baseUrl}/refine`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
      signal: this.createSignal(this.streamTimeoutMs),
    });
  }

  async save(
    body: Record<string, unknown>,
  ): Promise<{ status: number; data: unknown }> {
    const upstream = await fetch(`${this.baseUrl}/save`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
      signal: this.createSignal(),
    });
    const text = await upstream.text();
    try {
      return { status: upstream.status, data: JSON.parse(text) };
    } catch {
      return {
        status: upstream.status >= 400 ? upstream.status : 502,
        data: { error: text || `Builder agent returned ${upstream.status}` },
      };
    }
  }

  async graphBuild(): Promise<NodeFetchResponse> {
    this.logger.debug('Proxying graph build request to builder agent');
    return fetch(`${this.baseUrl}/graph/build`, {
      method: 'POST',
      headers: this.headers(),
      signal: this.createSignal(this.streamTimeoutMs),
    });
  }

  async graphUpdate(
    body: Record<string, unknown>,
  ): Promise<{ status: number; data: unknown }> {
    const upstream = await fetch(`${this.baseUrl}/graph/update`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
      signal: this.createSignal(),
    });
    const text = await upstream.text();
    try {
      return { status: upstream.status, data: JSON.parse(text) };
    } catch {
      return {
        status: upstream.status >= 400 ? upstream.status : 502,
        data: { error: text || `Builder agent returned ${upstream.status}` },
      };
    }
  }
}
