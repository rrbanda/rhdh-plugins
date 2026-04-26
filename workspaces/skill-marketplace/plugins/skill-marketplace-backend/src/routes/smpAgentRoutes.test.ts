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
import express from 'express';
import request from 'supertest';
import { registerSmpAgentRoutes } from './smpAgentRoutes';

function createMockLogger(): any {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnThis(),
  };
}

function createMockSmpAgentClient(overrides?: Record<string, any>) {
  return {
    isConfigured: true,
    chat: jest
      .fn()
      .mockResolvedValue({ text: 'Agent reply', contextId: undefined }),
    checkHealth: jest.fn().mockResolvedValue({
      skillAdvisor: { configured: true, healthy: true },
      bundleValidator: { configured: true, healthy: true },
      kgQa: { configured: true, healthy: true },
      playground: { configured: true, healthy: true },
      skillBuilder: { configured: true, healthy: true },
    }),
    getAgentCard: jest.fn().mockResolvedValue({
      name: 'Test Agent',
      description: 'A test agent',
      skills: [],
    }),
    ...overrides,
  };
}

function buildApp(smpClient?: any) {
  const app = express();
  app.use(express.json());
  const router = express.Router();
  const logger = createMockLogger();
  registerSmpAgentRoutes(
    router,
    smpClient,
    logger,
    undefined,
    undefined,
    'none',
  );
  app.use(router);
  return app;
}

describe('smpAgentRoutes', () => {
  describe('when smpAgentClient is undefined', () => {
    it('registers no routes', async () => {
      const app = buildApp(undefined);
      const res = await request(app).get('/agents/health');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /agents/:agent', () => {
    const agentPaths = [
      '/agents/advisor',
      '/agents/validator',
      '/agents/kgqa',
      '/agents/playground',
      '/agents/builder',
    ];

    it.each(agentPaths)('%s returns agent reply', async path => {
      const client = createMockSmpAgentClient();
      const app = buildApp(client);

      const res = await request(app).post(path).send({ message: 'hello' });

      expect(res.status).toBe(200);
      expect(res.body.answer).toBe('Agent reply');
      expect(res.body.agent).toBeDefined();
    });

    it('returns 400 when message is missing', async () => {
      const app = buildApp(createMockSmpAgentClient());

      const res = await request(app).post('/agents/advisor').send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/message/i);
    });

    it('returns 400 when message is empty', async () => {
      const app = buildApp(createMockSmpAgentClient());

      const res = await request(app)
        .post('/agents/advisor')
        .send({ message: '   ' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/message/i);
    });

    it('returns 400 when message exceeds max length', async () => {
      const app = buildApp(createMockSmpAgentClient());

      const res = await request(app)
        .post('/agents/advisor')
        .send({ message: 'x'.repeat(4001) });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/maximum length/i);
    });

    it('returns 400 when body is empty', async () => {
      const app = buildApp(createMockSmpAgentClient());

      const res = await request(app).post('/agents/advisor').send();

      expect(res.status).toBe(400);
    });

    it('passes contextId to chat method', async () => {
      const mockChat = jest
        .fn()
        .mockResolvedValue({ text: 'ok', contextId: 'a2a-ctx' });
      const app = buildApp(createMockSmpAgentClient({ chat: mockChat }));

      const res = await request(app)
        .post('/agents/advisor')
        .send({ message: 'hello', contextId: 'ctx-1' });

      expect(mockChat).toHaveBeenCalledWith(
        'skillAdvisor',
        'hello',
        'ctx-1',
        expect.any(AbortSignal),
      );
      expect(res.body.contextId).toBe('a2a-ctx');
    });

    it('returns 502 when chat throws', async () => {
      const mockChat = jest.fn().mockRejectedValue(new Error('Agent down'));
      const app = buildApp(createMockSmpAgentClient({ chat: mockChat }));

      const res = await request(app)
        .post('/agents/advisor')
        .send({ message: 'hello' });

      expect(res.status).toBe(502);
      expect(res.body.error).toMatch(/unavailable/i);
    });
  });

  describe('GET /agents/health', () => {
    it('returns 200 when all healthy', async () => {
      const app = buildApp(createMockSmpAgentClient());

      const res = await request(app).get('/agents/health');

      expect(res.status).toBe(200);
      expect(res.body.skillAdvisor.healthy).toBe(true);
      expect(res.body.skillBuilder.healthy).toBe(true);
    });

    it('returns 207 when some agents unhealthy', async () => {
      const app = buildApp(
        createMockSmpAgentClient({
          checkHealth: jest.fn().mockResolvedValue({
            skillAdvisor: { configured: true, healthy: true },
            bundleValidator: {
              configured: true,
              healthy: false,
              error: 'timeout',
            },
            kgQa: { configured: true, healthy: true },
            playground: { configured: false, healthy: false },
            skillBuilder: { configured: true, healthy: true },
          }),
        }),
      );

      const res = await request(app).get('/agents/health');

      expect(res.status).toBe(207);
      expect(res.body.bundleValidator.healthy).toBe(false);
    });

    it('returns 502 when checkHealth throws', async () => {
      const app = buildApp(
        createMockSmpAgentClient({
          checkHealth: jest.fn().mockRejectedValue(new Error('Internal')),
        }),
      );

      const res = await request(app).get('/agents/health');

      expect(res.status).toBe(502);
      expect(res.body.error).toBe('Health check failed');
    });
  });

  describe('GET /agents/:agent/card', () => {
    it('returns agent card for valid agent', async () => {
      const app = buildApp(createMockSmpAgentClient());

      const res = await request(app).get('/agents/skillAdvisor/card');

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Test Agent');
    });

    it('returns 400 for unknown agent name', async () => {
      const app = buildApp(createMockSmpAgentClient());

      const res = await request(app).get('/agents/unknownAgent/card');

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Unknown agent/);
    });

    it('returns 502 when getAgentCard throws', async () => {
      const app = buildApp(
        createMockSmpAgentClient({
          getAgentCard: jest.fn().mockRejectedValue(new Error('fetch failed')),
        }),
      );

      const res = await request(app).get('/agents/skillAdvisor/card');

      expect(res.status).toBe(502);
      expect(res.body.error).toMatch(/unavailable/i);
    });
  });
});
