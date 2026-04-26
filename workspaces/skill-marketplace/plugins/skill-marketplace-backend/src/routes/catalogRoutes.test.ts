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
import { SkillCatalogService } from '../services/SkillCatalogService';
import { registerCatalogRoutes } from './catalogRoutes';

function createMockLogger() {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnThis(),
  };
}

function createMockCatalog(
  overrides?: Partial<SkillCatalogService>,
): jest.Mocked<SkillCatalogService> {
  return {
    searchSkills: jest.fn().mockResolvedValue({ data: [], total: 0 }),
    getSkill: jest
      .fn()
      .mockResolvedValue({ name: 'n', namespace: 'ns' } as any),
    getSkillVersions: jest.fn().mockResolvedValue([]),
    getSkillContent: jest.fn().mockResolvedValue('# md'),
    triggerSync: jest.fn().mockResolvedValue({ message: 'ok' }),
    isAvailable: jest.fn().mockResolvedValue(true),
    getBaseUrl: jest.fn().mockReturnValue('http://catalog'),
    ...overrides,
  } as unknown as jest.Mocked<SkillCatalogService>;
}

function buildApp(
  catalogService: SkillCatalogService | undefined,
  securityMode: string = 'none',
) {
  const app = express();
  const router = express.Router();
  const logger = createMockLogger();
  registerCatalogRoutes(
    router,
    catalogService,
    logger,
    undefined,
    undefined,
    securityMode,
  );
  app.use(router);
  return app;
}

describe('registerCatalogRoutes', () => {
  describe('GET /catalog/available', () => {
    it('returns not configured when catalog service is undefined', async () => {
      const app = buildApp(undefined);
      const res = await request(app).get('/catalog/available');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ available: false, reason: 'not configured' });
    });

    it('returns availability from the catalog service when configured', async () => {
      const catalog = createMockCatalog({
        isAvailable: jest.fn().mockResolvedValue(true),
      });
      const app = buildApp(catalog);
      const res = await request(app).get('/catalog/available');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ available: true });
      expect(catalog.isAvailable).toHaveBeenCalled();
    });

    it('returns 500 when isAvailable throws', async () => {
      const catalog = createMockCatalog({
        isAvailable: jest.fn().mockRejectedValue(new Error('network down')),
      });
      const app = buildApp(catalog);
      const res = await request(app).get('/catalog/available');
      expect(res.status).toBe(500);
      expect(res.body.error).toMatch(/check catalog availability/i);
    });
  });

  describe('GET /catalog/skills', () => {
    it('returns 503 when catalog service is not configured', async () => {
      const app = buildApp(undefined);
      const res = await request(app).get('/catalog/skills');
      expect(res.status).toBe(503);
      expect(res.body.error).toMatch(/not configured/);
    });

    it('forwards search query params to searchSkills and returns the result', async () => {
      const payload = { data: [], total: 0, page: 1 };
      const catalog = createMockCatalog({
        searchSkills: jest.fn().mockResolvedValue(payload),
      });
      const app = buildApp(catalog);
      const res = await request(app).get('/catalog/skills').query({
        q: 'k8s',
        status: 'active',
        namespace: 'acme',
        tags: 'foo',
        compatibility: 'backstage',
        page: '2',
        per_page: '20',
      });
      expect(res.status).toBe(200);
      expect(res.body).toEqual(payload);
      expect(catalog.searchSkills).toHaveBeenCalledWith({
        q: 'k8s',
        status: 'active',
        namespace: 'acme',
        tags: 'foo',
        compatibility: 'backstage',
        page: 2,
        per_page: 20,
      });
    });

    it('returns 502 when searchSkills throws', async () => {
      const catalog = createMockCatalog({
        searchSkills: jest.fn().mockRejectedValue(new Error('upstream error')),
      });
      const app = buildApp(catalog);
      const res = await request(app).get('/catalog/skills');
      expect(res.status).toBe(502);
      expect(res.body.error).toMatch(/Failed to fetch from Skill Catalog API/);
    });
  });

  describe('GET /catalog/skills/:namespace/:name', () => {
    it('returns 503 when catalog service is not configured', async () => {
      const app = buildApp(undefined);
      const res = await request(app).get('/catalog/skills/acme/my-skill');
      expect(res.status).toBe(503);
    });

    it('returns the skill in a data wrapper', async () => {
      const skill = { name: 'my-skill', namespace: 'acme' } as any;
      const catalog = createMockCatalog({
        getSkill: jest.fn().mockResolvedValue(skill),
      });
      const app = buildApp(catalog);
      const res = await request(app).get('/catalog/skills/acme/my-skill');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ data: skill });
      expect(catalog.getSkill).toHaveBeenCalledWith('acme', 'my-skill');
    });

    it('returns 404 when the catalog returns a 404 for the skill', async () => {
      const catalog = createMockCatalog({
        getSkill: jest
          .fn()
          .mockRejectedValue(new Error('Catalog API ... returned 404')),
      });
      const app = buildApp(catalog);
      const res = await request(app).get('/catalog/skills/acme/missing');
      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not found/);
    });

    it('returns 502 for other catalog errors', async () => {
      const catalog = createMockCatalog({
        getSkill: jest.fn().mockRejectedValue(new Error('timeout')),
      });
      const app = buildApp(catalog);
      const res = await request(app).get('/catalog/skills/acme/my-skill');
      expect(res.status).toBe(502);
    });
  });

  describe('GET /catalog/skills/:namespace/:name/versions', () => {
    it('returns 503 when catalog is not configured', async () => {
      const app = buildApp(undefined);
      const res = await request(app).get(
        '/catalog/skills/acme/my-skill/versions',
      );
      expect(res.status).toBe(503);
    });

    it('returns version history in a data wrapper', async () => {
      const versions = [{ name: 'my-skill', version: '1.0.0' } as any];
      const catalog = createMockCatalog({
        getSkillVersions: jest.fn().mockResolvedValue(versions),
      });
      const app = buildApp(catalog);
      const res = await request(app).get(
        '/catalog/skills/acme/my-skill/versions',
      );
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ data: versions });
      expect(catalog.getSkillVersions).toHaveBeenCalledWith('acme', 'my-skill');
    });

    it('returns 502 when getSkillVersions throws', async () => {
      const catalog = createMockCatalog({
        getSkillVersions: jest.fn().mockRejectedValue(new Error('bad gateway')),
      });
      const app = buildApp(catalog);
      const res = await request(app).get(
        '/catalog/skills/acme/my-skill/versions',
      );
      expect(res.status).toBe(502);
    });
  });
});
