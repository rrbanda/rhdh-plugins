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

const mockSendMessage = jest.fn();
const mockCreateFromUrl = jest.fn();

jest.mock('@a2a-js/sdk/client', () => {
  return {
    ClientFactory: jest.fn().mockImplementation(() => ({
      createFromUrl: mockCreateFromUrl,
    })),
    JsonRpcTransportFactory: jest.fn(),
    DefaultAgentCardResolver: jest.fn(),
    createAuthenticatingFetchWithRetry: jest.fn().mockReturnValue(jest.fn()),
  };
});

import { SmpAgentClient } from './SmpAgentClient';

function createMockKagenti(): any {
  return {
    getToken: jest.fn().mockResolvedValue('mock-jwt-token'),
    invalidateToken: jest.fn(),
  };
}

function createMockLogger(): any {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnThis(),
  };
}

const ALL_URLS = {
  skillAdvisorUrl: 'http://localhost:8001',
  bundleValidatorUrl: 'http://localhost:8002',
  kgQaUrl: 'http://localhost:8003',
  playgroundUrl: 'http://localhost:8004',
  skillBuilderUrl: 'http://localhost:8005',
};

describe('SmpAgentClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateFromUrl.mockResolvedValue({ sendMessage: mockSendMessage });
  });

  describe('isConfigured', () => {
    it('returns false when no URLs configured', () => {
      const client = new SmpAgentClient(
        {},
        createMockKagenti(),
        createMockLogger(),
      );
      expect(client.isConfigured).toBe(false);
    });

    it.each([
      ['skillAdvisorUrl'],
      ['bundleValidatorUrl'],
      ['kgQaUrl'],
      ['playgroundUrl'],
      ['skillBuilderUrl'],
    ])('returns true when only %s is configured', key => {
      const client = new SmpAgentClient(
        { [key]: 'http://localhost' },
        createMockKagenti(),
        createMockLogger(),
      );
      expect(client.isConfigured).toBe(true);
    });
  });

  describe('getAgentUrl validation', () => {
    it('throws when agent URL is not configured', async () => {
      const client = new SmpAgentClient(
        {},
        createMockKagenti(),
        createMockLogger(),
      );
      await expect(client.askSkillAdvisor('test')).rejects.toThrow(
        "SMP agent 'skillAdvisor' is not configured",
      );
    });

    it('throws for each unconfigured agent', async () => {
      const client = new SmpAgentClient(
        { skillAdvisorUrl: 'http://localhost:8001' },
        createMockKagenti(),
        createMockLogger(),
      );
      await expect(client.askBundleValidator('test')).rejects.toThrow(
        "SMP agent 'bundleValidator' is not configured",
      );
    });
  });

  describe('sendMessage via typed methods', () => {
    it('askSkillAdvisor sends message and extracts response', async () => {
      mockSendMessage.mockResolvedValue({
        artifacts: [{ parts: [{ kind: 'text', text: 'Advisor response' }] }],
      });
      const client = new SmpAgentClient(
        ALL_URLS,
        createMockKagenti(),
        createMockLogger(),
      );

      const result = await client.askSkillAdvisor('recommend skills');
      expect(result).toBe('Advisor response');
      expect(mockCreateFromUrl).toHaveBeenCalledWith('http://localhost:8001');
      expect(mockSendMessage).toHaveBeenCalledTimes(1);

      const params = mockSendMessage.mock.calls[0][0];
      expect(params.message.role).toBe('user');
      expect(params.message.kind).toBe('message');
      expect(params.message.parts[0].text).toBe('recommend skills');
    });

    it('askBundleValidator routes to correct URL', async () => {
      mockSendMessage.mockResolvedValue({
        artifacts: [{ parts: [{ kind: 'text', text: 'Valid bundle' }] }],
      });
      const client = new SmpAgentClient(
        ALL_URLS,
        createMockKagenti(),
        createMockLogger(),
      );
      await client.askBundleValidator('validate this');
      expect(mockCreateFromUrl).toHaveBeenCalledWith('http://localhost:8002');
    });

    it('askKgQa routes to correct URL', async () => {
      mockSendMessage.mockResolvedValue({
        artifacts: [{ parts: [{ kind: 'text', text: 'Graph answer' }] }],
      });
      const client = new SmpAgentClient(
        ALL_URLS,
        createMockKagenti(),
        createMockLogger(),
      );
      await client.askKgQa('how many skills?');
      expect(mockCreateFromUrl).toHaveBeenCalledWith('http://localhost:8003');
    });

    it('askPlayground routes to correct URL', async () => {
      mockSendMessage.mockResolvedValue({
        artifacts: [{ parts: [{ kind: 'text', text: 'Playground result' }] }],
      });
      const client = new SmpAgentClient(
        ALL_URLS,
        createMockKagenti(),
        createMockLogger(),
      );
      await client.askPlayground('test skill');
      expect(mockCreateFromUrl).toHaveBeenCalledWith('http://localhost:8004');
    });

    it('buildSkill routes to correct URL', async () => {
      mockSendMessage.mockResolvedValue({
        artifacts: [
          { parts: [{ kind: 'text', text: '---\nname: my-skill\n---' }] },
        ],
      });
      const client = new SmpAgentClient(
        ALL_URLS,
        createMockKagenti(),
        createMockLogger(),
      );
      const result = await client.buildSkill('create a python review skill');
      expect(result).toBe('---\nname: my-skill\n---');
      expect(mockCreateFromUrl).toHaveBeenCalledWith('http://localhost:8005');
    });

    it('chat routes to the specified agent', async () => {
      mockSendMessage.mockResolvedValue({
        artifacts: [{ parts: [{ kind: 'text', text: 'Chat response' }] }],
      });
      const client = new SmpAgentClient(
        ALL_URLS,
        createMockKagenti(),
        createMockLogger(),
      );
      const result = await client.chat('kgQa', 'hello', 'session-1');
      expect(result).toEqual({
        text: 'Chat response',
        contextId: 'session-1',
      });
      expect(mockCreateFromUrl).toHaveBeenCalledWith('http://localhost:8003');
    });

    it('chat returns contextId from A2A Task when present', async () => {
      mockSendMessage.mockResolvedValue({
        contextId: 'a2a-ctx-99',
        artifacts: [{ parts: [{ kind: 'text', text: 'ok' }] }],
      });
      const client = new SmpAgentClient(
        ALL_URLS,
        createMockKagenti(),
        createMockLogger(),
      );
      const result = await client.chat('kgQa', 'hi', 'session-1');
      expect(result).toEqual({ text: 'ok', contextId: 'a2a-ctx-99' });
    });

    it('passes contextId when provided', async () => {
      mockSendMessage.mockResolvedValue({
        artifacts: [{ parts: [{ kind: 'text', text: 'ok' }] }],
      });
      const client = new SmpAgentClient(
        ALL_URLS,
        createMockKagenti(),
        createMockLogger(),
      );
      await client.askSkillAdvisor('test', 'ctx-123');

      const params = mockSendMessage.mock.calls[0][0];
      expect(params.message.contextId).toBe('ctx-123');
    });

    it('omits contextId when not provided', async () => {
      mockSendMessage.mockResolvedValue({
        artifacts: [{ parts: [{ kind: 'text', text: 'ok' }] }],
      });
      const client = new SmpAgentClient(
        ALL_URLS,
        createMockKagenti(),
        createMockLogger(),
      );
      await client.askSkillAdvisor('test');

      const params = mockSendMessage.mock.calls[0][0];
      expect(params.message.contextId).toBeUndefined();
    });

    it('passes abort signal with timeout', async () => {
      mockSendMessage.mockResolvedValue({
        artifacts: [{ parts: [{ kind: 'text', text: 'ok' }] }],
      });
      const client = new SmpAgentClient(
        { ...ALL_URLS, requestTimeoutMs: 5000 },
        createMockKagenti(),
        createMockLogger(),
      );
      await client.askSkillAdvisor('test');

      const options = mockSendMessage.mock.calls[0][1];
      expect(options.signal).toBeInstanceOf(AbortSignal);
    });

    it('propagates errors from sendMessage', async () => {
      mockSendMessage.mockRejectedValue(new Error('Agent unreachable'));
      const client = new SmpAgentClient(
        ALL_URLS,
        createMockKagenti(),
        createMockLogger(),
      );
      await expect(client.askSkillAdvisor('test')).rejects.toThrow(
        'Agent unreachable',
      );
    });
  });

  describe('client caching', () => {
    it('reuses clients for the same agent URL', async () => {
      mockSendMessage.mockResolvedValue({
        artifacts: [{ parts: [{ kind: 'text', text: 'ok' }] }],
      });
      const client = new SmpAgentClient(
        ALL_URLS,
        createMockKagenti(),
        createMockLogger(),
      );

      await client.askSkillAdvisor('first');
      await client.askSkillAdvisor('second');

      expect(mockCreateFromUrl).toHaveBeenCalledTimes(1);
      expect(mockSendMessage).toHaveBeenCalledTimes(2);
    });
  });

  describe('extractContextId', () => {
    it('returns contextId from Task when present', () => {
      const task = { contextId: 'task-ctx', artifacts: [] };
      expect(SmpAgentClient.extractContextId(task as any)).toBe('task-ctx');
    });

    it('returns contextId from Message when present', () => {
      const msg = { contextId: 'msg-ctx', parts: [] };
      expect(SmpAgentClient.extractContextId(msg as any)).toBe('msg-ctx');
    });

    it('returns undefined when contextId is absent', () => {
      expect(
        SmpAgentClient.extractContextId({ id: 't1' } as any),
      ).toBeUndefined();
    });
  });

  describe('extractText', () => {
    it('extracts text from Task with artifacts', () => {
      const result = {
        id: 'task-1',
        status: { state: 'completed' },
        artifacts: [{ parts: [{ kind: 'text', text: 'Hello world' }] }],
      };
      expect(SmpAgentClient.extractText(result as any)).toBe('Hello world');
    });

    it('extracts text from Task status message when no artifacts', () => {
      const result = {
        id: 'task-1',
        status: {
          state: 'completed',
          message: {
            role: 'agent',
            parts: [{ kind: 'text', text: 'Status update' }],
          },
        },
      };
      expect(SmpAgentClient.extractText(result as any)).toBe('Status update');
    });

    it('extracts text from Message parts directly', () => {
      const result = {
        messageId: 'msg-1',
        role: 'agent',
        parts: [{ kind: 'text', text: 'Direct message' }],
      };
      expect(SmpAgentClient.extractText(result as any)).toBe('Direct message');
    });

    it('joins multiple text parts with newlines', () => {
      const result = {
        artifacts: [
          {
            parts: [
              { kind: 'text', text: 'Part 1' },
              { kind: 'text', text: 'Part 2' },
            ],
          },
        ],
      };
      expect(SmpAgentClient.extractText(result as any)).toBe('Part 1\nPart 2');
    });

    it('filters out non-text parts', () => {
      const result = {
        artifacts: [
          {
            parts: [
              { kind: 'data', data: {} },
              { kind: 'text', text: 'Only text' },
            ],
          },
        ],
      };
      expect(SmpAgentClient.extractText(result as any)).toBe('Only text');
    });

    it('falls back to JSON.stringify for unrecognized formats', () => {
      const result = { unknown: 'format' };
      expect(SmpAgentClient.extractText(result as any)).toBe(
        '{"unknown":"format"}',
      );
    });

    it('prefers artifacts over status message', () => {
      const result = {
        artifacts: [{ parts: [{ kind: 'text', text: 'From artifact' }] }],
        status: {
          state: 'completed',
          message: {
            role: 'agent',
            parts: [{ kind: 'text', text: 'From status' }],
          },
        },
      };
      expect(SmpAgentClient.extractText(result as any)).toBe('From artifact');
    });
  });

  describe('checkHealth', () => {
    it('returns unconfigured for agents without URLs', async () => {
      const client = new SmpAgentClient(
        { skillAdvisorUrl: 'http://localhost:8001' },
        createMockKagenti(),
        createMockLogger(),
      );

      const origFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({ ok: true });

      try {
        const health = await client.checkHealth();
        expect(health.skillAdvisor).toEqual({
          configured: true,
          healthy: true,
        });
        expect(health.bundleValidator).toEqual({
          configured: false,
          healthy: false,
        });
        expect(health.kgQa).toEqual({ configured: false, healthy: false });
        expect(health.playground).toEqual({
          configured: false,
          healthy: false,
        });
        expect(health.skillBuilder).toEqual({
          configured: false,
          healthy: false,
        });
      } finally {
        global.fetch = origFetch;
      }
    });

    it('reports unhealthy when fetch fails', async () => {
      const client = new SmpAgentClient(
        { skillAdvisorUrl: 'http://localhost:8001' },
        createMockKagenti(),
        createMockLogger(),
      );

      const origFetch = global.fetch;
      global.fetch = jest
        .fn()
        .mockRejectedValue(new Error('Connection refused'));

      try {
        const health = await client.checkHealth();
        expect(health.skillAdvisor).toEqual({
          configured: true,
          healthy: false,
          error: 'Connection refused',
        });
      } finally {
        global.fetch = origFetch;
      }
    });

    it('reports unhealthy when server returns non-ok', async () => {
      const client = new SmpAgentClient(
        { skillAdvisorUrl: 'http://localhost:8001' },
        createMockKagenti(),
        createMockLogger(),
      );

      const origFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 });

      try {
        const health = await client.checkHealth();
        expect(health.skillAdvisor).toEqual({
          configured: true,
          healthy: false,
        });
      } finally {
        global.fetch = origFetch;
      }
    });
  });

  describe('getAgentCard', () => {
    it('fetches agent card from well-known URL', async () => {
      const cardData = { name: 'Skill Advisor', skills: [] };
      const origFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(cardData),
      });

      try {
        const client = new SmpAgentClient(
          ALL_URLS,
          createMockKagenti(),
          createMockLogger(),
        );
        const card = await client.getAgentCard('skillAdvisor');
        expect(card).toEqual(cardData);
        expect(global.fetch).toHaveBeenCalledWith(
          'http://localhost:8001/.well-known/agent-card.json',
          expect.objectContaining({ signal: expect.any(AbortSignal) }),
        );
      } finally {
        global.fetch = origFetch;
      }
    });

    it('throws when agent card fetch returns non-ok', async () => {
      const origFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 });

      try {
        const client = new SmpAgentClient(
          ALL_URLS,
          createMockKagenti(),
          createMockLogger(),
        );
        await expect(client.getAgentCard('skillAdvisor')).rejects.toThrow(
          'Agent card fetch failed for skillAdvisor (404)',
        );
      } finally {
        global.fetch = origFetch;
      }
    });

    it('throws when agent URL is not configured', async () => {
      const client = new SmpAgentClient(
        {},
        createMockKagenti(),
        createMockLogger(),
      );
      await expect(client.getAgentCard('skillAdvisor')).rejects.toThrow(
        "SMP agent 'skillAdvisor' is not configured",
      );
    });
  });
});
