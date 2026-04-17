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
import { PassThrough } from 'stream';
import request from 'supertest';
import { mockServices } from '@backstage/backend-test-utils';

jest.mock('./services/SkillCardValidator', () => ({
  validateSkillCard: jest.fn().mockReturnValue({ valid: true }),
  validateTypedSkillCard: jest.fn().mockReturnValue({ valid: true }),
}));

import { createRouter } from './router';
import type { BuilderProxyService, OciRegistryService, SkillGraphSyncService } from './services';

function createMockBuilderProxy(overrides?: Partial<BuilderProxyService>): BuilderProxyService {
  return {
    generate: jest.fn(),
    refine: jest.fn(),
    save: jest.fn(),
    graphBuild: jest.fn(),
    graphUpdate: jest.fn(),
    ...overrides,
  } as unknown as BuilderProxyService;
}

function createMockOciRegistry(overrides?: Partial<OciRegistryService>): OciRegistryService {
  return {
    listCatalogs: jest.fn().mockResolvedValue([]),
    listTags: jest.fn().mockResolvedValue([]),
    getManifest: jest.fn(),
    getBlob: jest.fn(),
    pushSkill: jest.fn().mockResolvedValue('registry.example.com/test-skill:0.1.0'),
    ...overrides,
  } as unknown as OciRegistryService;
}

describe('createRouter', () => {
  let app: express.Express;

  describe('basic routes (no services configured)', () => {
    beforeAll(async () => {
      const logger = mockServices.logger.mock();
      const router = await createRouter({ logger });
      app = express().use(router);
    });

    it('responds to GET /health', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual(
        expect.objectContaining({
          status: 'ok',
          neo4jConfigured: false,
          builderAgentConfigured: false,
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

    it('returns 403 or 503 for /builder when builder not configured (permission check runs first)', async () => {
      const res = await request(app)
        .post('/builder?action=generate')
        .send({ description: 'test' });
      expect([403, 503]).toContain(res.status);
    });

    it('validates POST /kagenti/chat requires message', async () => {
      const res = await request(app)
        .post('/kagenti/chat')
        .send({});
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('validates POST /graph/search requires query', async () => {
      const res = await request(app)
        .post('/graph/search')
        .send({});
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('health endpoint with builder config', () => {
    it('includes builder.streamTimeoutMs from config', async () => {
      const logger = mockServices.logger.mock();
      const router = await createRouter({
        logger,
        builderStreamTimeoutMs: 10_000,
      });
      app = express().use(router);

      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.builder).toEqual({ streamTimeoutMs: 10_000 });
    });

    it('defaults builder.streamTimeoutMs to 300000', async () => {
      const logger = mockServices.logger.mock();
      const router = await createRouter({ logger });
      app = express().use(router);

      const res = await request(app).get('/health');
      expect(res.body.builder).toEqual({ streamTimeoutMs: 300_000 });
    });
  });

  describe('builder SSE routes', () => {
    let mockBuilder: ReturnType<typeof createMockBuilderProxy>;

    beforeEach(async () => {
      mockBuilder = createMockBuilderProxy();
      const logger = mockServices.logger.mock();
      const router = await createRouter({
        logger,
        builderProxy: mockBuilder,
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

    it('proxies save action as JSON', async () => {
      (mockBuilder.save as jest.Mock).mockResolvedValue({
        status: 200,
        data: { saved: true },
      });

      const res = await request(app)
        .post('/builder?action=save')
        .send({ content: 'test' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ saved: true });
      expect(mockBuilder.save).toHaveBeenCalledWith({ content: 'test' });
    });

    it('returns SSE headers for generate action', async () => {
      const stream = new PassThrough();
      (mockBuilder.generate as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        body: stream,
      });

      const res = request(app)
        .post('/builder?action=generate')
        .send({ description: 'test' });

      setTimeout(() => stream.end(), 50);

      const response = await res;
      expect(response.headers['content-type']).toContain('text/event-stream');
      expect(response.headers['cache-control']).toBe('no-cache');
    });

    it('emits stream_end event when upstream ends', async () => {
      const stream = new PassThrough();
      (mockBuilder.generate as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        body: stream,
      });

      const res = request(app)
        .post('/builder?action=generate')
        .send({ description: 'test' });

      stream.write('event: agent_start\ndata: {"agent":"TestAgent"}\n\n');
      setTimeout(() => stream.end(), 50);

      const response = await res;
      expect(response.text).toContain('event: stream_end');
      expect(response.text).toContain('data: {}');
    });

    it('pipes SSE data from upstream to client', async () => {
      const stream = new PassThrough();
      (mockBuilder.generate as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        body: stream,
      });

      const res = request(app)
        .post('/builder?action=generate')
        .send({ description: 'test' });

      const sseData = 'event: agent_start\ndata: {"agent":"A"}\n\n';
      stream.write(sseData);
      setTimeout(() => stream.end(), 50);

      const response = await res;
      expect(response.text).toContain(sseData);
    });

    it('handles upstream error with error SSE event', async () => {
      const stream = new PassThrough();
      (mockBuilder.generate as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        body: stream,
      });

      const res = request(app)
        .post('/builder?action=generate')
        .send({ description: 'test' });

      setTimeout(() => {
        stream.destroy(new Error('Connection lost'));
      }, 50);

      const response = await res;
      expect(response.text).toContain('event: error');
      expect(response.text).toContain('Stream interrupted');
    });

    it('returns upstream error status for non-ok response', async () => {
      (mockBuilder.generate as jest.Mock).mockResolvedValue({
        ok: false,
        status: 422,
        text: () => Promise.resolve('Invalid input'),
      });

      const res = await request(app)
        .post('/builder?action=generate')
        .send({ description: 'test' });

      expect(res.status).toBe(422);
    });

    it('returns 502 when upstream body is null', async () => {
      (mockBuilder.generate as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        body: null,
      });

      const res = await request(app)
        .post('/builder?action=generate')
        .send({ description: 'test' });

      expect(res.status).toBe(502);
      expect(res.body.error).toContain('No stream body');
    });

    it('handles refine action the same as generate', async () => {
      const stream = new PassThrough();
      (mockBuilder.refine as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        body: stream,
      });

      const res = request(app)
        .post('/builder?action=refine')
        .send({ feedback: 'fix it' });

      setTimeout(() => stream.end(), 50);

      const response = await res;
      expect(response.headers['content-type']).toContain('text/event-stream');
      expect(mockBuilder.refine).toHaveBeenCalled();
    });

    it('returns 502 when builder proxy throws', async () => {
      (mockBuilder.generate as jest.Mock).mockRejectedValue(new Error('ECONNREFUSED'));

      const res = await request(app)
        .post('/builder?action=generate')
        .send({ description: 'test' });

      expect(res.status).toBe(502);
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

    it('rejects empty skillName', async () => {
      const res = await request(app)
        .post('/builder/publish')
        .send({ skillName: '   ', content: 'test' });

      expect(res.status).toBe(400);
    });

    it('successfully publishes a skill', async () => {
      const res = await request(app)
        .post('/builder/publish')
        .send({
          skillName: 'test-skill',
          version: '1.0.0',
          content: '# Test\nContent here',
          author: 'tester',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.ociReference).toBe('registry.example.com/test-skill:0.1.0');
      expect(mockOciRegistry.pushSkill).toHaveBeenCalled();
    });

    it('sanitizes skillName (lowercase, replace special chars)', async () => {
      const res = await request(app)
        .post('/builder/publish')
        .send({
          skillName: 'My Skill Name!',
          content: '# Test\nContent',
        });

      expect(res.status).toBe(200);
      const callArgs = (mockOciRegistry.pushSkill as jest.Mock).mock.calls[0];
      expect(callArgs[1].metadata.name).toBe('my-skill-name');
    });

    it('returns 503 when publish registry is not configured', async () => {
      const logger = mockServices.logger.mock();
      const router = await createRouter({
        logger,
        ociRegistry: mockOciRegistry,
        securityMode: 'none',
      });
      const appNoPublish = express().use(router);

      const res = await request(appNoPublish)
        .post('/builder/publish')
        .send({ skillName: 'test', content: 'test' });

      expect(res.status).toBe(503);
      expect(res.body.error).toContain('publish registry not configured');
    });

    it('returns 502 when pushSkill fails', async () => {
      (mockOciRegistry.pushSkill as jest.Mock).mockRejectedValue(new Error('push failed'));

      const res = await request(app)
        .post('/builder/publish')
        .send({ skillName: 'test', content: '# Test\nContent' });

      expect(res.status).toBe(502);
    });
  });

  describe('permission checks', () => {
    it('returns 403 when auth services unavailable and security mode is not none', async () => {
      const logger = mockServices.logger.mock();
      const mockBuilder = createMockBuilderProxy();
      const router = await createRouter({
        logger,
        builderProxy: mockBuilder,
      });
      const appWithAuth = express().use(router);

      const res = await request(appWithAuth)
        .post('/builder?action=generate')
        .send({ description: 'test' });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Authentication services unavailable');
    });

    it('allows access when securityMode is none', async () => {
      const logger = mockServices.logger.mock();
      const stream = new PassThrough();
      const mockBuilder = createMockBuilderProxy({
        generate: jest.fn().mockResolvedValue({
          ok: true,
          status: 200,
          body: stream,
        }),
      });
      const router = await createRouter({
        logger,
        builderProxy: mockBuilder,
        securityMode: 'none',
      });
      const appNone = express().use(router);

      const res = request(appNone)
        .post('/builder?action=generate')
        .send({ description: 'test' });

      setTimeout(() => stream.end(), 50);
      const response = await res;
      expect(response.headers['content-type']).toContain('text/event-stream');
    });
  });
});
