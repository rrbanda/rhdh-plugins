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
 *   - Docker available for OCI registry container
 *   - SMP agents mocked (no real external agents needed)
 *
 * Start containers before running:
 *   docker run -d --name oci-test -p 5050:5000 registry:2
 *
 * Run with:
 *   yarn test --testPathPattern=e2e --watchAll=false
 *
 * These tests are skipped when containers are not available.
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

const OCI_REGISTRY_URL = 'http://localhost:5050';

async function isPortReachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

function createMockSmpAgent(): SmpAgentClient {
  return {
    isConfigured: true,
    askSkillAdvisor: jest.fn().mockResolvedValue('advisor response'),
    askBundleValidator: jest.fn().mockResolvedValue('validator response'),
    askKgQa: jest.fn().mockResolvedValue('kgqa response'),
    askPlayground: jest.fn().mockResolvedValue('playground response'),
    buildSkill: jest
      .fn()
      .mockResolvedValue(
        '---\nname: mock-skill\ndescription: A mock skill\n---\n\n# Mock Skill\n\nGenerated content.',
      ),
    chat: jest
      .fn()
      .mockResolvedValue({ text: 'chat response', contextId: undefined }),
    checkHealth: jest.fn().mockResolvedValue({
      skillAdvisor: { configured: true, healthy: true },
      bundleValidator: { configured: true, healthy: true },
      kgQa: { configured: true, healthy: true },
      playground: { configured: true, healthy: true },
      skillBuilder: { configured: true, healthy: true },
    }),
    getAgentCard: jest.fn().mockResolvedValue({ name: 'Test Agent' }),
  } as unknown as SmpAgentClient;
}

let ociAvailable = false;

beforeAll(async () => {
  ociAvailable = await isPortReachable(`${OCI_REGISTRY_URL}/v2/`);
}, 15000);

describe('E2E: SMP agent integration', () => {
  let app: express.Express;
  let mockSmp: SmpAgentClient;

  beforeAll(async () => {
    const logger = mockServices.logger.mock();
    mockSmp = createMockSmpAgent();

    const router = await createRouter({
      logger,
      smpAgentClient: mockSmp,
      securityMode: 'none',
    });
    app = express().use(router);
  });

  it('generates a skill via JSON', async () => {
    const res = await request(app)
      .post('/builder?action=generate')
      .send({ prompt: 'Create a mock skill for testing' });

    expect(res.status).toBe(200);
    expect(res.body.content).toContain('Mock Skill');
    expect(res.body.action).toBe('generate');
  });

  it('refines a skill via JSON', async () => {
    const res = await request(app)
      .post('/builder?action=refine')
      .send({
        prompt: 'Improve the skill',
        currentSkill: '# Existing',
        feedback: 'more detail',
      });

    expect(res.status).toBe(200);
    expect(res.body.content).toBeDefined();
    expect(res.body.action).toBe('refine');
  });

  it('chats with an agent via kagenti endpoint', async () => {
    const res = await request(app)
      .post('/kagenti/chat')
      .send({ message: 'hello', agentName: 'skill-advisor' });

    expect(res.status).toBe(200);
    expect(res.body.content).toBeDefined();
    expect(res.body.is_complete).toBe(true);
  });

  it('queries agentic-rag via KG Q&A agent', async () => {
    const res = await request(app)
      .post('/graph/agentic-rag')
      .send({ query: 'How many skills are in the graph?' });

    expect(res.status).toBe(200);
    expect(res.body.answer).toBeDefined();
  });

  it('health endpoint shows SMP agents configured', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.smpAgentsConfigured).toBe(true);
  });

  it('agents health endpoint returns status of all agents', async () => {
    const res = await request(app).get('/agents/health');
    expect(res.status).toBe(200);
    expect(res.body.skillAdvisor).toBeDefined();
    expect(res.body.skillBuilder).toBeDefined();
  });
});

describe('E2E: OCI registry integration', () => {
  let app: express.Express;

  beforeAll(async () => {
    if (!ociAvailable) return;

    const logger = mockServices.logger.mock();
    const pub = {
      url: `${OCI_REGISTRY_URL}/v2/test-skills`,
      name: 'test-registry',
    };
    const ociRegistry = new OciRegistryService(
      { registries: [pub], cacheTimeout: 300, publishRegistry: pub },
      logger,
    );

    const router = await createRouter({
      logger,
      ociRegistry,
      publishRegistry: pub,
      securityMode: 'none',
    });
    app = express().use(router);
  });

  const runIf = ociAvailable ? it : it.skip;

  /* eslint-disable jest/no-standalone-expect -- runIf is it/it.skip; Jest does not treat expects as in a test */
  runIf(
    'publishes a skill',
    async () => {
      const publishRes = await request(app).post('/builder/publish').send({
        skillName: 'e2e-test-skill',
        version: '1.0.0',
        content: '# E2E Test\n\nEnd-to-end test skill.',
        author: 'e2e-tester',
      });

      expect(publishRes.status).toBe(200);
      expect(publishRes.body.success).toBe(true);
      expect(publishRes.body.ociReference).toBeDefined();
    },
    30000,
  );

  runIf('health shows OCI configured', async () => {
    const res = await request(app).get('/health');
    expect(res.body.ociRegistryConfigured).toBe(true);
  });
  /* eslint-enable jest/no-standalone-expect */
});

describe('E2E: Full pipeline with SMP builder + publish', () => {
  let app: express.Express;
  let mockSmp: SmpAgentClient;

  beforeAll(async () => {
    const logger = mockServices.logger.mock();
    mockSmp = createMockSmpAgent();

    const routerOpts: Parameters<typeof createRouter>[0] = {
      logger,
      smpAgentClient: mockSmp,
      securityMode: 'none',
    };

    if (ociAvailable) {
      const pub = {
        url: `${OCI_REGISTRY_URL}/v2/test-skills`,
        name: 'test-registry',
      };
      const ociRegistry = new OciRegistryService(
        { registries: [pub], cacheTimeout: 300, publishRegistry: pub },
        logger,
      );
      routerOpts.ociRegistry = ociRegistry;
      routerOpts.publishRegistry = pub;
    }

    const router = await createRouter(routerOpts);
    app = express().use(router);
  });

  it('generates a skill and then publishes it (when OCI available)', async () => {
    const genRes = await request(app)
      .post('/builder?action=generate')
      .send({ prompt: 'Full pipeline test skill' });

    expect(genRes.status).toBe(200);
    expect(genRes.body.content).toContain('Mock Skill');

    if (ociAvailable) {
      const publishRes = await request(app).post('/builder/publish').send({
        skillName: 'pipeline-test',
        version: '0.1.0',
        content: genRes.body.content,
        author: 'pipeline-tester',
      });

      // eslint-disable-next-line jest/no-conditional-expect -- branch only when OCI is available for this e2e
      expect(publishRes.status).toBe(200);
      // eslint-disable-next-line jest/no-conditional-expect
      expect(publishRes.body.success).toBe(true);
    }
  }, 30000);
});
