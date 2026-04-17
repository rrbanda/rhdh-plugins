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

/**
 * E2E integration tests for the Skill Marketplace backend.
 *
 * Requirements:
 *   - Docker available for Neo4j and OCI registry containers
 *   - No external network required (mock builder agent runs in-process)
 *
 * Start containers before running:
 *   docker run -d --name neo4j-test -p 7687:7687 -e NEO4J_AUTH=neo4j/testpassword neo4j:5
 *   docker run -d --name oci-test -p 5050:5000 registry:2
 *
 * Run with:
 *   yarn test --testPathPattern=e2e --watchAll=false
 *
 * These tests are skipped when containers are not available.
 */

import express from 'express';
import request from 'supertest';
import type { Server } from 'http';
import { mockServices } from '@backstage/backend-test-utils';

jest.mock('./services/SkillCardValidator', () => ({
  validateSkillCard: jest.fn().mockReturnValue({ valid: true }),
  validateTypedSkillCard: jest.fn().mockReturnValue({ valid: true }),
}));

import { createRouter } from './router';
import { BuilderProxyService, OciRegistryService } from './services';
import { createMockBuilderServer } from './__fixtures__/mock-builder';

const MOCK_BUILDER_PORT = 18001;
const OCI_REGISTRY_URL = 'http://localhost:5050';
const NEO4J_URI = 'bolt://localhost:7687';

async function isPortReachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

let mockBuilderServer: Server | null = null;
let ociAvailable = false;
let neo4jAvailable = false;

beforeAll(async () => {
  const builder = createMockBuilderServer(MOCK_BUILDER_PORT);
  mockBuilderServer = await builder.start();

  ociAvailable = await isPortReachable(`${OCI_REGISTRY_URL}/v2/`);
  neo4jAvailable = await isPortReachable(
    `http://localhost:7474`,
  );
}, 15000);

afterAll(async () => {
  if (mockBuilderServer) {
    mockBuilderServer.closeAllConnections?.();
    await new Promise<void>((resolve, reject) => {
      mockBuilderServer!.close(err => (err ? reject(err) : resolve()));
    });
    mockBuilderServer = null;
  }
}, 10000);

describe('E2E: Mock builder agent integration', () => {
  let app: express.Express;

  beforeAll(async () => {
    const logger = mockServices.logger.mock();
    const builderProxy = new BuilderProxyService({
      baseUrl: `http://localhost:${MOCK_BUILDER_PORT}`,
      apiKey: 'test-key',
      logger,
      streamTimeoutMs: 10_000,
    });

    const router = await createRouter({
      logger,
      builderProxy,
      securityMode: 'none',
      builderStreamTimeoutMs: 10_000,
    });
    app = express().use(router);
  });

  it('full generation pipeline: generate -> stream SSE -> complete', async () => {
    const res = await request(app)
      .post('/builder?action=generate')
      .send({ description: 'Create a mock skill for testing' });

    expect(res.headers['content-type']).toContain('text/event-stream');

    const text = res.text;
    expect(text).toContain('event: agent_start');
    expect(text).toContain('RequirementsAnalyzerAgent');
    expect(text).toContain('SkillGeneratorAgent');
    expect(text).toContain('event: complete');
    expect(text).toContain('Mock Skill');
    expect(text).toContain('event: stream_end');
  }, 15000);

  it('refine pipeline: refine -> stream SSE -> complete', async () => {
    const res = await request(app)
      .post('/builder?action=refine')
      .send({ feedback: 'Improve the skill', context_id: 'test-123' });

    expect(res.headers['content-type']).toContain('text/event-stream');

    const text = res.text;
    expect(text).toContain('event: complete');
    expect(text).toContain('improved mock skill');
    expect(text).toContain('event: stream_end');
  }, 15000);

  it('save action returns JSON', async () => {
    const res = await request(app)
      .post('/builder?action=save')
      .send({ content: '# Saved Skill' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ saved: true });
  });

  it('health endpoint shows builder configured', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.builderAgentConfigured).toBe(true);
    expect(res.body.builder.streamTimeoutMs).toBe(10_000);
  });
});

describe('E2E: OCI registry integration', () => {
  let app: express.Express;
  let mockOciRegistry: OciRegistryService;

  beforeAll(async () => {
    if (!ociAvailable) return;

    const logger = mockServices.logger.mock();
    mockOciRegistry = new OciRegistryService(
      [{ url: `${OCI_REGISTRY_URL}/v2/test-skills`, name: 'test-registry' }],
      logger,
    );

    const router = await createRouter({
      logger,
      ociRegistry: mockOciRegistry,
      publishRegistry: { url: `${OCI_REGISTRY_URL}/v2/test-skills`, name: 'test-registry' },
      securityMode: 'none',
    });
    app = express().use(router);
  });

  const runIf = ociAvailable ? it : it.skip;

  runIf('publishes a skill and lists it', async () => {
    const publishRes = await request(app)
      .post('/builder/publish')
      .send({
        skillName: 'e2e-test-skill',
        version: '1.0.0',
        content: '# E2E Test\n\nEnd-to-end test skill.',
        author: 'e2e-tester',
      });

    expect(publishRes.status).toBe(200);
    expect(publishRes.body.success).toBe(true);
    expect(publishRes.body.ociReference).toBeDefined();
  }, 30000);

  runIf('health shows OCI configured', async () => {
    const res = await request(app).get('/health');
    expect(res.body.ociRegistryConfigured).toBe(true);
  });
});

describe('E2E: Full pipeline with builder + publish', () => {
  let app: express.Express;

  beforeAll(async () => {
    const logger = mockServices.logger.mock();
    const builderProxy = new BuilderProxyService({
      baseUrl: `http://localhost:${MOCK_BUILDER_PORT}`,
      apiKey: 'test-key',
      logger,
      streamTimeoutMs: 10_000,
    });

    const routerOpts: Parameters<typeof createRouter>[0] = {
      logger,
      builderProxy,
      securityMode: 'none',
      builderStreamTimeoutMs: 10_000,
    };

    if (ociAvailable) {
      const ociRegistry = new OciRegistryService(
        [{ url: `${OCI_REGISTRY_URL}/v2/test-skills`, name: 'test-registry' }],
        logger,
      );
      routerOpts.ociRegistry = ociRegistry;
      routerOpts.publishRegistry = { url: `${OCI_REGISTRY_URL}/v2/test-skills`, name: 'test-registry' };
    }

    const router = await createRouter(routerOpts);
    app = express().use(router);
  });

  it('generates a skill via SSE and then publishes it (when OCI available)', async () => {
    const genRes = await request(app)
      .post('/builder?action=generate')
      .send({ description: 'Full pipeline test skill' });

    expect(genRes.text).toContain('event: complete');

    const completeMatch = genRes.text.match(/event: complete\ndata: (.+)\n/);
    expect(completeMatch).toBeTruthy();
    const completeData = JSON.parse(completeMatch![1]);
    expect(completeData.skill_content).toContain('Mock Skill');

    if (ociAvailable) {
      const publishRes = await request(app)
        .post('/builder/publish')
        .send({
          skillName: 'pipeline-test',
          version: '0.1.0',
          content: completeData.skill_content,
          author: 'pipeline-tester',
        });

      expect(publishRes.status).toBe(200);
      expect(publishRes.body.success).toBe(true);
    }
  }, 30000);
});
