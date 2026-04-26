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
import { mockServices } from '@backstage/backend-test-utils';

jest.mock('./services/SkillCardValidator', () => ({
  validateSkillCard: jest.fn().mockReturnValue({ valid: true }),
  validateTypedSkillCard: jest.fn().mockReturnValue({ valid: true }),
}));

import { createRouter } from './router';
import { OciRegistryService } from './services';
import { SmpAgentClient } from './services/SmpAgentClient';

function createMockSmpAgentClient(
  overrides?: Partial<SmpAgentClient>,
): SmpAgentClient {
  return {
    isConfigured: true,
    askSkillAdvisor: jest.fn().mockResolvedValue('advisor response'),
    askBundleValidator: jest.fn().mockResolvedValue('validator response'),
    askKgQa: jest.fn().mockResolvedValue('kgqa response'),
    askPlayground: jest.fn().mockResolvedValue('playground response'),
    buildSkill: jest.fn().mockResolvedValue('# Generated Skill\nContent here'),
    chat: jest
      .fn()
      .mockResolvedValue({ text: 'chat response', contextId: undefined }),
    checkHealth: jest.fn().mockResolvedValue({
      skillAdvisor: { configured: true, healthy: true },
      bundleValidator: { configured: true, healthy: true },
      kgQa: { configured: true, healthy: true },
      playground: { configured: false, healthy: false },
      skillBuilder: { configured: true, healthy: true },
    }),
    getAgentCard: jest.fn().mockResolvedValue({ name: 'Test Agent' }),
    ...overrides,
  } as unknown as SmpAgentClient;
}

function createMockOciRegistry(
  overrides?: Partial<OciRegistryService>,
): OciRegistryService {
  return {
    listCatalogs: jest.fn().mockResolvedValue([]),
    listTags: jest.fn().mockResolvedValue([]),
    getManifest: jest.fn(),
    getBlob: jest.fn(),
    pushSkill: jest
      .fn()
      .mockResolvedValue('registry.example.com/test-skill:0.1.0'),
    pushBundle: jest
      .fn()
      .mockResolvedValue(
        'registry.example.com/skill-bundle-test:1.0.0-published',
      ),
    ...overrides,
  } as unknown as OciRegistryService;
}

describe('createRouter', () => {
  let app: express.Express;

  describe('basic routes (no services configured)', () => {
    beforeAll(async () => {
      const logger = mockServices.logger.mock();
      const router = await createRouter({ logger, securityMode: 'none' });
      app = express().use(router);
    });

    it('responds to GET /health', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual(
        expect.objectContaining({
          status: 'ok',
          neo4jConfigured: false,
          kagentiConfigured: false,
          ociRegistryConfigured: false,
        }),
      );
    });

    it('returns 503 for /skills when OCI not configured', async () => {
      const res = await request(app).get('/skills');
      expect(res.status).toBe(503);
      expect(res.body.error).toContain('not configured');
    });

    it('returns 503 for /graph when Neo4j not configured', async () => {
      const res = await request(app).get('/graph');
      expect(res.status).toBe(503);
      expect(res.body.error).toContain('not configured');
    });

    it('returns 503 for /kagenti/agents when Kagenti not configured', async () => {
      const res = await request(app).get('/kagenti/agents');
      expect(res.status).toBe(503);
      expect(res.body.error).toContain('not configured');
    });

    it('returns 503 for /kagenti/chat when SMP agents not configured', async () => {
      const res = await request(app)
        .post('/kagenti/chat')
        .send({ message: 'hello' });
      expect(res.status).toBe(503);
    });

    it('validates POST /graph/search requires query', async () => {
      const res = await request(app).post('/graph/search').send({});
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('SMP agent routes', () => {
    let mockSmp: ReturnType<typeof createMockSmpAgentClient>;

    beforeEach(async () => {
      mockSmp = createMockSmpAgentClient();
      const logger = mockServices.logger.mock();
      const router = await createRouter({
        logger,
        smpAgentClient: mockSmp,
        securityMode: 'none',
      });
      app = express().use(router);
    });

    it('returns health status from agents', async () => {
      const res = await request(app).get('/agents/health');
      expect(res.status).toBe(200);
      expect(res.body.skillAdvisor).toEqual({
        configured: true,
        healthy: true,
      });
    });

    it('returns answer from advisor agent', async () => {
      const res = await request(app)
        .post('/agents/advisor')
        .send({ message: 'recommend kubernetes skills' });
      expect(res.status).toBe(200);
      expect(res.body.answer).toBeDefined();
      expect(res.body.agent).toBe('Skill Advisor');
    });

    it('validates message is required', async () => {
      const res = await request(app).post('/agents/advisor').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('message is required');
    });
  });

  describe('builder routes with SMP agent', () => {
    let mockSmp: ReturnType<typeof createMockSmpAgentClient>;

    beforeEach(async () => {
      mockSmp = createMockSmpAgentClient();
      const logger = mockServices.logger.mock();
      const router = await createRouter({
        logger,
        smpAgentClient: mockSmp,
        securityMode: 'none',
      });
      app = express().use(router);
    });

    it('returns 400 for missing action query param', async () => {
      const res = await request(app).post('/builder').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('action query param required');
    });

    it('returns 400 for invalid action', async () => {
      const res = await request(app).post('/builder?action=invalid').send({});
      expect(res.status).toBe(400);
    });

    it('returns JSON for generate action', async () => {
      const res = await request(app)
        .post('/builder?action=generate')
        .send({ prompt: 'create a kubernetes skill' });
      expect(res.status).toBe(200);
      expect(res.body.content).toBeDefined();
      expect(res.body.action).toBe('generate');
    });

    it('returns JSON for refine action', async () => {
      const res = await request(app)
        .post('/builder?action=refine')
        .send({
          prompt: 'add more detail',
          currentSkill: '# Existing',
          feedback: 'more detail',
        });
      expect(res.status).toBe(200);
      expect(res.body.content).toBeDefined();
      expect(res.body.action).toBe('refine');
    });

    it('requires prompt for builder', async () => {
      const res = await request(app).post('/builder?action=generate').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('prompt is required');
    });
  });

  describe('kagenti chat via SMP agents', () => {
    let mockSmp: ReturnType<typeof createMockSmpAgentClient>;

    beforeEach(async () => {
      mockSmp = createMockSmpAgentClient();
      const logger = mockServices.logger.mock();
      const router = await createRouter({
        logger,
        smpAgentClient: mockSmp,
        securityMode: 'none',
      });
      app = express().use(router);
    });

    it('routes chat to SMP agent', async () => {
      const res = await request(app)
        .post('/kagenti/chat')
        .send({ message: 'hello', agentName: 'skill-advisor' });
      expect(res.status).toBe(200);
      expect(res.body.content).toBeDefined();
      expect(res.body.is_complete).toBe(true);
    });

    it('validates message is required for chat', async () => {
      const res = await request(app).post('/kagenti/chat').send({});
      expect(res.status).toBe(400);
    });
  });

  describe('agentic-rag via SMP agents', () => {
    let mockSmp: ReturnType<typeof createMockSmpAgentClient>;

    beforeEach(async () => {
      mockSmp = createMockSmpAgentClient();
      const logger = mockServices.logger.mock();
      const router = await createRouter({
        logger,
        smpAgentClient: mockSmp,
        securityMode: 'none',
      });
      app = express().use(router);
    });

    it('returns JSON from agentic-rag', async () => {
      const res = await request(app)
        .post('/graph/agentic-rag')
        .send({ query: 'how many skills?' });
      expect(res.status).toBe(200);
      expect(res.body.answer).toBeDefined();
    });

    it('validates query is required', async () => {
      const res = await request(app).post('/graph/agentic-rag').send({});
      expect(res.status).toBe(400);
    });
  });

  describe('builder publish route', () => {
    let mockOciRegistry: ReturnType<typeof createMockOciRegistry>;

    beforeEach(async () => {
      mockOciRegistry = createMockOciRegistry();
      const logger = mockServices.logger.mock();
      const router = await createRouter({
        logger,
        ociRegistry: mockOciRegistry,
        publishRegistry: { url: 'http://localhost:5050/skills', name: 'test' },
        securityMode: 'none',
      });
      app = express().use(router);
    });

    it('validates skillName is required', async () => {
      const res = await request(app)
        .post('/builder/publish')
        .send({ content: 'test content' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('skillName');
    });

    it('validates content is required', async () => {
      const res = await request(app)
        .post('/builder/publish')
        .send({ skillName: 'test' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('content');
    });

    it('successfully publishes a skill', async () => {
      const res = await request(app).post('/builder/publish').send({
        skillName: 'test-skill',
        version: '1.0.0',
        content: '# Test\nContent here',
        author: 'tester',
      });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.ociReference).toBe(
        'registry.example.com/test-skill:0.1.0',
      );
    });

    it('sanitizes skillName', async () => {
      const res = await request(app).post('/builder/publish').send({
        skillName: 'My Skill Name!',
        content: '# Test\nContent',
      });
      expect(res.status).toBe(200);
      const callArgs = (mockOciRegistry.pushSkill as jest.Mock).mock.calls[0];
      expect(callArgs[1].metadata.name).toBe('my-skill-name');
    });
  });

  describe('permission checks', () => {
    it('returns 403 when auth services unavailable and security mode is not none', async () => {
      const logger = mockServices.logger.mock();
      const mockSmp = createMockSmpAgentClient();
      const router = await createRouter({
        logger,
        smpAgentClient: mockSmp,
      });
      const appWithAuth = express().use(router);

      const res = await request(appWithAuth)
        .post('/builder?action=generate')
        .send({ prompt: 'test' });
      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Authentication services unavailable');
    });
  });
});
