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

export class BuilderProxyService {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly logger: LoggerService;

  constructor(options: {
    baseUrl: string;
    apiKey: string;
    logger: LoggerService;
  }) {
    this.baseUrl = options.baseUrl;
    this.apiKey = options.apiKey;
    this.logger = options.logger;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) {
      h.Authorization = `Bearer ${this.apiKey}`;
    }
    return h;
  }

  async generate(body: Record<string, unknown>): Promise<NodeFetchResponse> {
    this.logger.debug('Proxying generate request to builder agent');
    return fetch(`${this.baseUrl}/generate`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
  }

  async refine(body: Record<string, unknown>): Promise<NodeFetchResponse> {
    this.logger.debug('Proxying refine request to builder agent');
    return fetch(`${this.baseUrl}/refine`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
  }

  async save(
    body: Record<string, unknown>,
  ): Promise<{ status: number; data: unknown }> {
    const upstream = await fetch(`${this.baseUrl}/save`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
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
    });
  }

  async graphUpdate(
    body: Record<string, unknown>,
  ): Promise<{ status: number; data: unknown }> {
    const upstream = await fetch(`${this.baseUrl}/graph/update`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
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
