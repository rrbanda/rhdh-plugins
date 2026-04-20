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

const a2aSkillResponse = {
  id: 'test-001',
  jsonrpc: '2.0',
  result: {
    contextId: 'ctx-123',
    artifacts: [
      {
        artifactId: 'art-1',
        parts: [{ kind: 'text', text: '# My Skill\n\nThis is a test skill.' }],
      },
    ],
    history: [
      {
        role: 'user',
        parts: [{ kind: 'text', text: 'Create a test skill' }],
      },
      {
        role: 'agent',
        parts: [
          {
            kind: 'data',
            data: { id: 'fc-1', name: 'list_skills', args: {} },
            metadata: { adk_type: 'function_call' },
          },
        ],
      },
      {
        role: 'agent',
        parts: [
          {
            kind: 'data',
            data: {
              id: 'fc-1',
              name: 'list_skills',
              response: { result: 'skill-creator, skill-reviewer' },
            },
            metadata: { adk_type: 'function_response' },
          },
        ],
      },
      {
        role: 'agent',
        parts: [{ kind: 'text', text: 'Here is your skill.' }],
      },
    ],
    status: { state: 'completed' },
  },
};

jest.mock('node-fetch', () => {
  const fn = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify(a2aSkillResponse)),
  });
  return { __esModule: true, default: fn };
});

import fetchMock from 'node-fetch';
import { BuilderProxyService } from './BuilderProxyService';

const mockedFetch = fetchMock as unknown as jest.Mock;

describe('BuilderProxyService (A2A)', () => {
  const logger = mockServices.logger.mock();

  beforeEach(() => {
    mockedFetch.mockClear();
    mockedFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify(a2aSkillResponse)),
    });
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('initializes with required options', () => {
      const svc = new BuilderProxyService({
        baseUrl: 'http://skill-builder.team1:8080',
        apiKey: '',
        logger,
      });
      expect(svc).toBeDefined();
    });

    it('strips trailing slashes from baseUrl', async () => {
      const svc = new BuilderProxyService({
        baseUrl: 'http://skill-builder.team1:8080/',
        apiKey: '',
        logger,
      });
      await svc.generate({ description: 'test' });
      expect(mockedFetch).toHaveBeenCalledWith(
        'http://skill-builder.team1:8080',
        expect.anything(),
      );
    });
  });

  describe('generate', () => {
    it('sends A2A message/send to root path', async () => {
      const svc = new BuilderProxyService({
        baseUrl: 'http://skill-builder.team1:8080',
        apiKey: 'test-key',
        logger,
      });
      await svc.generate({ description: 'build a code review skill' });
      expect(mockedFetch).toHaveBeenCalledWith(
        'http://skill-builder.team1:8080',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-key',
          }),
        }),
      );
      const body = JSON.parse(mockedFetch.mock.calls[0][1].body);
      expect(body.jsonrpc).toBe('2.0');
      expect(body.method).toBe('message/send');
      expect(body.params.message.parts[0].text).toContain('build a code review skill');
    });

    it('returns SSE events from A2A response', async () => {
      const svc = new BuilderProxyService({
        baseUrl: 'http://skill-builder.team1:8080',
        apiKey: '',
        logger,
      });
      const events = await svc.generate({ description: 'test' });

      const types = events.map(e => e.event);
      expect(types).toContain('agent_start');
      expect(types).toContain('tool_call');
      expect(types).toContain('tool_result');
      expect(types).toContain('agent_output');
      expect(types).toContain('complete');

      const complete = events.find(e => e.event === 'complete');
      expect(complete?.data.skill_content).toContain('# My Skill');
    });
  });

  describe('refine', () => {
    it('sends A2A message with refine prompt', async () => {
      const svc = new BuilderProxyService({
        baseUrl: 'http://skill-builder.team1:8080',
        apiKey: '',
        logger,
      });
      await svc.refine({ feedback: 'add error handling' });
      const body = JSON.parse(mockedFetch.mock.calls[0][1].body);
      expect(body.params.message.parts[0].text).toContain('add error handling');
    });
  });

  describe('save', () => {
    it('returns success', async () => {
      const svc = new BuilderProxyService({
        baseUrl: 'http://skill-builder.team1:8080',
        apiKey: '',
        logger,
      });
      const result = await svc.save({ content: 'test' });
      expect(result.status).toBe(200);
      expect(result.data).toMatchObject({ success: true });
    });
  });

  describe('A2A error handling', () => {
    it('throws on non-OK HTTP response', async () => {
      mockedFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });
      const svc = new BuilderProxyService({
        baseUrl: 'http://skill-builder.team1:8080',
        apiKey: '',
        logger,
      });
      await expect(svc.generate({ description: 'test' })).rejects.toThrow(
        /A2A request failed/,
      );
    });

    it('throws on JSON-RPC error', async () => {
      mockedFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              jsonrpc: '2.0',
              error: { code: -32600, message: 'Invalid Request' },
            }),
          ),
      });
      const svc = new BuilderProxyService({
        baseUrl: 'http://skill-builder.team1:8080',
        apiKey: '',
        logger,
      });
      await expect(svc.generate({ description: 'test' })).rejects.toThrow(
        /A2A error/,
      );
    });
  });

  describe('headers', () => {
    it('omits Authorization when apiKey is empty', async () => {
      const svc = new BuilderProxyService({
        baseUrl: 'http://skill-builder.team1:8080',
        apiKey: '',
        logger,
      });
      await svc.generate({ description: 'test' });
      const headers = mockedFetch.mock.calls[0][1].headers;
      expect(headers.Authorization).toBeUndefined();
    });

    it('includes Authorization when apiKey is set', async () => {
      const svc = new BuilderProxyService({
        baseUrl: 'http://skill-builder.team1:8080',
        apiKey: 'my-secret',
        logger,
      });
      await svc.generate({ description: 'test' });
      const headers = mockedFetch.mock.calls[0][1].headers;
      expect(headers.Authorization).toBe('Bearer my-secret');
    });
  });
});
