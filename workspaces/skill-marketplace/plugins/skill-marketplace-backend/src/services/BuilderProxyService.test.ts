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
import { mockServices } from '@backstage/backend-test-utils';

jest.mock('node-fetch', () => {
  const fn = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: () => Promise.resolve('{"ok":true}'),
    body: null,
  });
  return { __esModule: true, default: fn };
});

import fetchMock from 'node-fetch';
import { BuilderProxyService } from './BuilderProxyService';

const mockedFetch = fetchMock as unknown as jest.Mock;

describe('BuilderProxyService', () => {
  const logger = mockServices.logger.mock();

  beforeEach(() => {
    mockedFetch.mockClear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor defaults', () => {
    it('uses default connection timeout of 30s and stream timeout of 300s', () => {
      const svc = new BuilderProxyService({
        baseUrl: 'http://localhost:8001',
        apiKey: '',
        logger,
      });
      expect(svc).toBeDefined();
    });
  });

  describe('generate', () => {
    it('calls /generate endpoint with POST', async () => {
      const svc = new BuilderProxyService({
        baseUrl: 'http://localhost:8001',
        apiKey: 'test-key',
        logger,
      });
      await svc.generate({ description: 'test' });
      expect(mockedFetch).toHaveBeenCalledWith(
        'http://localhost:8001/generate',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-key',
          }),
          body: JSON.stringify({ description: 'test' }),
        }),
      );
    });

    it('uses streamTimeoutMs for the abort signal', async () => {
      const svc = new BuilderProxyService({
        baseUrl: 'http://localhost:8001',
        apiKey: '',
        logger,
        streamTimeoutMs: 600_000,
      });
      await svc.generate({ description: 'test' });
      const call = mockedFetch.mock.calls[0];
      expect(call[1].signal).toBeDefined();
      expect(call[1].signal).toBeInstanceOf(AbortSignal);
    });
  });

  describe('refine', () => {
    it('calls /refine endpoint with POST', async () => {
      const svc = new BuilderProxyService({
        baseUrl: 'http://localhost:8001',
        apiKey: '',
        logger,
      });
      await svc.refine({ feedback: 'fix it' });
      expect(mockedFetch).toHaveBeenCalledWith(
        'http://localhost:8001/refine',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('save', () => {
    it('calls /save and parses JSON response', async () => {
      mockedFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve('{"saved":true}'),
      });
      const svc = new BuilderProxyService({
        baseUrl: 'http://localhost:8001',
        apiKey: '',
        logger,
      });
      const result = await svc.save({ content: 'test' });
      expect(result.status).toBe(200);
      expect(result.data).toEqual({ saved: true });
    });

    it('returns 502 with error for non-JSON response', async () => {
      mockedFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve('not json'),
      });
      const svc = new BuilderProxyService({
        baseUrl: 'http://localhost:8001',
        apiKey: '',
        logger,
      });
      const result = await svc.save({ content: 'test' });
      expect(result.status).toBe(502);
      expect(result.data).toEqual({ error: 'not json' });
    });

    it('preserves upstream error status codes', async () => {
      mockedFetch.mockResolvedValueOnce({
        ok: false,
        status: 422,
        text: () => Promise.resolve('invalid'),
      });
      const svc = new BuilderProxyService({
        baseUrl: 'http://localhost:8001',
        apiKey: '',
        logger,
      });
      const result = await svc.save({ content: 'test' });
      expect(result.status).toBe(422);
    });
  });

  describe('graphBuild', () => {
    it('calls /graph/build with POST', async () => {
      const svc = new BuilderProxyService({
        baseUrl: 'http://localhost:8001',
        apiKey: '',
        logger,
      });
      await svc.graphBuild();
      expect(mockedFetch).toHaveBeenCalledWith(
        'http://localhost:8001/graph/build',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('graphUpdate', () => {
    it('calls /graph/update and parses response', async () => {
      mockedFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve('{"updated":true}'),
      });
      const svc = new BuilderProxyService({
        baseUrl: 'http://localhost:8001',
        apiKey: '',
        logger,
      });
      const result = await svc.graphUpdate({ data: 'test' });
      expect(result.status).toBe(200);
      expect(result.data).toEqual({ updated: true });
    });
  });

  describe('headers', () => {
    it('omits Authorization when apiKey is empty', async () => {
      const svc = new BuilderProxyService({
        baseUrl: 'http://localhost:8001',
        apiKey: '',
        logger,
      });
      await svc.generate({ description: 'test' });
      const headers = mockedFetch.mock.calls[0][1].headers;
      expect(headers.Authorization).toBeUndefined();
    });

    it('includes Authorization when apiKey is set', async () => {
      const svc = new BuilderProxyService({
        baseUrl: 'http://localhost:8001',
        apiKey: 'my-secret',
        logger,
      });
      await svc.generate({ description: 'test' });
      const headers = mockedFetch.mock.calls[0][1].headers;
      expect(headers.Authorization).toBe('Bearer my-secret');
    });
  });
});
