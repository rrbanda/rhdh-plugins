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

jest.mock('./authUtils', () => {
  const actual = jest.requireActual('./authUtils');
  return {
    ...actual,
    requirePermission: jest.fn((...args) => actual.requirePermission(...args)),
  };
});

import * as authUtils from './authUtils';
import { registerBundleRoutes } from './bundleRoutes';

function createMockLogger() {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnThis(),
  };
}

function createMockNeo4j(overrides = {}) {
  return {
    createBundle: jest.fn().mockResolvedValue({
      id: 'b-new',
      name: 'New Bundle',
      description: 'd',
      author: 'user:default/a',
      skills: [],
    }),
    listBundles: jest
      .fn()
      .mockResolvedValue([
        {
          id: 'b1',
          name: 'B1',
          description: '',
          author: 'a',
          createdAt: '',
          skillCount: 1,
        },
      ]),
    getBundle: jest.fn().mockResolvedValue(null),
    updateBundle: jest.fn().mockResolvedValue({ id: 'b1', name: 'Updated' }),
    deleteBundle: jest.fn().mockResolvedValue(true),
    updateBundleStatus: jest.fn().mockResolvedValue(true),
    createOrUpdateBundleFromOCI: jest.fn().mockResolvedValue(undefined),
    resolveDependencyTree: jest.fn().mockResolvedValue({
      dependencies: [
        { name: 'dep', category: 'c', description: 'd', dependencyOf: 'root' },
      ],
      tools: [{ name: 't', description: 'td' }],
      similar: [],
    }),
    ...overrides,
  };
}

function buildApp(
  neo4j?: any,
  securityMode = 'none',
  httpAuth?: any,
  permissions?: any,
  ociRegistry?: any,
) {
  const app = express();
  app.use(express.json());
  const router = express.Router();
  const logger = createMockLogger();
  registerBundleRoutes(
    router,
    neo4j,
    logger,
    httpAuth,
    permissions,
    securityMode,
    ociRegistry,
  );
  app.use(router);
  return app;
}

describe('registerBundleRoutes', () => {
  beforeEach(() => {
    (authUtils.requirePermission as jest.Mock).mockImplementation(
      (...args: any[]) => {
        const actual = jest.requireActual('./authUtils');
        return actual.requirePermission(...args);
      },
    );
  });

  describe('POST /graph/bundles', () => {
    it('creates a bundle and calls Neo4j createBundle', async () => {
      const neo4j = createMockNeo4j();
      const app = buildApp(neo4j, 'none');
      const res = await request(app)
        .post('/graph/bundles')
        .send({ name: 'My Bundle', description: 'x', skillSlugs: ['a', 'b'] });
      expect(res.status).toBe(201);
      expect(neo4j.createBundle).toHaveBeenCalledWith({
        name: 'My Bundle',
        description: 'x',
        skillSlugs: ['a', 'b'],
        author: 'anonymous',
      });
      expect(res.body.name).toBe('New Bundle');
    });
  });

  describe('GET /graph/bundles', () => {
    it('lists bundles', async () => {
      const neo4j = createMockNeo4j();
      const app = buildApp(neo4j, 'none');
      const res = await request(app).get('/graph/bundles');
      expect(res.status).toBe(200);
      expect(res.body.bundles).toHaveLength(1);
      expect(neo4j.listBundles).toHaveBeenCalled();
    });
  });

  describe('GET /graph/bundles/:id', () => {
    it('returns a single bundle', async () => {
      const bundle = {
        id: 'b1',
        name: 'B',
        description: '',
        author: 'a',
        skills: [],
      };
      const neo4j = createMockNeo4j({
        getBundle: jest.fn().mockResolvedValue(bundle),
      });
      const app = buildApp(neo4j, 'none');
      const res = await request(app).get('/graph/bundles/b1');
      expect(res.status).toBe(200);
      expect(res.body).toEqual(bundle);
    });

    it('returns 404 for missing bundle', async () => {
      const neo4j = createMockNeo4j({
        getBundle: jest.fn().mockResolvedValue(null),
      });
      const app = buildApp(neo4j, 'none');
      const res = await request(app).get('/graph/bundles/missing');
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /graph/bundles/:id', () => {
    it('updates a bundle', async () => {
      const neo4j = createMockNeo4j();
      const app = buildApp(neo4j, 'none');
      const res = await request(app)
        .put('/graph/bundles/b1')
        .send({ name: 'Updated' });
      expect(res.status).toBe(200);
      expect(neo4j.updateBundle).toHaveBeenCalledWith('b1', {
        name: 'Updated',
      });
    });
  });

  describe('DELETE /graph/bundles/:id', () => {
    it('deletes a bundle', async () => {
      const neo4j = createMockNeo4j();
      const app = buildApp(neo4j, 'none');
      const res = await request(app).delete('/graph/bundles/b1');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
      expect(neo4j.deleteBundle).toHaveBeenCalledWith('b1');
    });
  });

  describe('POST /graph/bundles/resolve', () => {
    it('resolves dependencies', async () => {
      const neo4j = createMockNeo4j();
      const app = buildApp(neo4j, 'none');
      const res = await request(app)
        .post('/graph/bundles/resolve')
        .send({ skillNames: ['s1', 's2'] });
      expect(res.status).toBe(200);
      expect(neo4j.resolveDependencyTree).toHaveBeenCalledWith(['s1', 's2']);
      expect(res.body.dependencies).toHaveLength(1);
    });
  });

  describe('GET /graph/bundles/:id/export', () => {
    it('exports a bundle with resolved dependencies', async () => {
      const bundle = {
        id: 'b1',
        name: 'B',
        description: 'd',
        author: 'a',
        createdAt: 't',
        skills: [
          {
            name: 'Skill A',
            slug: 'a',
            category: 'c',
            description: 'sd',
            addedBy: 'user',
          },
        ],
      };
      const neo4j = createMockNeo4j({
        getBundle: jest.fn().mockResolvedValue(bundle),
      });
      const app = buildApp(neo4j, 'none');
      const res = await request(app).get('/graph/bundles/b1/export');
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('B');
      expect(res.body.manuallyAdded).toBe(1);
      expect(neo4j.resolveDependencyTree).toHaveBeenCalledWith(['Skill A']);
    });
  });

  describe('POST /graph/bundles/:id/fork', () => {
    it('forks a bundle', async () => {
      const original = {
        name: 'Orig',
        description: 'desc',
        skills: [{ slug: 's1' }, { slug: 's2' }],
      };
      const forked = {
        id: 'fork-id',
        name: 'Orig (fork x)',
        description: 'desc',
        author: 'anonymous',
      };
      const neo4j = createMockNeo4j({
        getBundle: jest.fn().mockResolvedValue(original),
        createBundle: jest.fn().mockResolvedValue(forked),
      });
      const app = buildApp(neo4j, 'none');
      const res = await request(app).post('/graph/bundles/b1/fork').send({});
      expect(res.status).toBe(201);
      expect(neo4j.createBundle).toHaveBeenCalledWith(
        expect.objectContaining({
          name: expect.stringMatching(/^Orig \(fork /),
          description: 'desc',
          skillSlugs: ['s1', 's2'],
          author: 'anonymous',
        }),
      );
      expect(res.body).toEqual(forked);
    });
  });

  describe('503 when Neo4j is not configured', () => {
    it('returns 503 for GET /graph/bundles', async () => {
      const app = buildApp(undefined, 'none');
      const res = await request(app).get('/graph/bundles');
      expect(res.status).toBe(503);
      expect(res.body.error).toMatch(/Neo4j not configured/);
    });
  });

  describe('403 when permissions cannot be satisfied', () => {
    it('returns 403 when security is enabled and auth services are missing', async () => {
      const neo4j = createMockNeo4j();
      const app = buildApp(neo4j, 'strict');
      const res = await request(app).get('/graph/bundles');
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Authentication services unavailable/);
    });

    it('returns 403 when requirePermission resolves false', async () => {
      (authUtils.requirePermission as jest.Mock).mockImplementationOnce(
        async (_req: any, res: any) => {
          res.status(403).json({ error: 'Insufficient permissions' });
          return false;
        },
      );
      const neo4j = createMockNeo4j();
      const app = buildApp(neo4j, 'none');
      const res = await request(app).get('/graph/bundles');
      expect(res.status).toBe(403);
    });
  });

  describe('400 for invalid input', () => {
    it('returns 400 when POST /graph/bundles/resolve has invalid body', async () => {
      const neo4j = createMockNeo4j();
      const app = buildApp(neo4j, 'none');
      const res = await request(app)
        .post('/graph/bundles/resolve')
        .send({ skillNames: [] });
      expect(res.status).toBe(400);
    });

    it('returns 400 when POST /graph/bundles is missing name', async () => {
      const neo4j = createMockNeo4j();
      const app = buildApp(neo4j, 'none');
      const res = await request(app)
        .post('/graph/bundles')
        .send({ skillSlugs: ['a'] });
      expect(res.status).toBe(400);
    });

    it('returns 400 when PUT has non-string name', async () => {
      const neo4j = createMockNeo4j();
      const app = buildApp(neo4j, 'none');
      const res = await request(app)
        .put('/graph/bundles/b1')
        .send({ name: 123 });
      expect(res.status).toBe(400);
    });
  });
});
