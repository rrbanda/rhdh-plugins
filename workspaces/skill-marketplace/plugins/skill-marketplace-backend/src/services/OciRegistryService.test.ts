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
import {
  OciRegistryConfig,
  SkillCard,
} from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import fetch from 'node-fetch';
import {
  OciRegistryService,
  type OciRegistryServiceConfig,
} from './OciRegistryService';

jest.mock('node-fetch', () => jest.fn());

const mockedFetch = fetch as jest.MockedFunction<typeof fetch>;

function createMockLogger() {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnThis(),
  };
}

const baseRegistry: OciRegistryConfig = {
  name: 'test',
  url: 'https://registry.example.com/team',
};

function jsonResponse(
  data: unknown,
  init?: { ok?: boolean; status?: number; headers?: Record<string, string> },
) {
  return Promise.resolve({
    ok: init?.ok !== false,
    status: init?.status ?? 200,
    headers: { get: (h: string) => init?.headers?.[h.toLowerCase()] ?? null },
    json: async () => data,
    text: async () => JSON.stringify(data),
    arrayBuffer: async () => new ArrayBuffer(0),
  } as any);
}

describe('OciRegistryService', () => {
  const logger = createMockLogger();

  function makeService(overrides?: Partial<OciRegistryServiceConfig>) {
    const config: OciRegistryServiceConfig = {
      registries: [baseRegistry],
      cacheTimeout: 0,
      requestTimeoutMs: 1_000,
      maxCacheEntries: 1000,
      ...overrides,
    };
    return new OciRegistryService(config, logger);
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getManifest', () => {
    it('returns null when the registry responds with a non-OK status', async () => {
      mockedFetch.mockResolvedValueOnce(
        jsonResponse(null, { ok: false, status: 404 }) as any,
      );
      const svc = makeService();
      const m = await svc.getManifest(baseRegistry, 'latest');
      expect(m).toBeNull();
    });

    it('returns the parsed manifest when the request succeeds', async () => {
      const manifest = {
        schemaVersion: 2,
        config: {
          mediaType: 'application/vnd.oci.image.config.v1+json',
          digest: 'sha256:abc',
          size: 1,
        },
        layers: [],
      };
      mockedFetch.mockResolvedValueOnce(jsonResponse(manifest) as any);
      const svc = makeService();
      const m = await svc.getManifest(baseRegistry, '1.0.0');
      expect(m).toEqual(manifest);
      expect(m!.schemaVersion).toBe(2);
    });
  });

  describe('listTags', () => {
    it('returns an empty list when the first request is not successful', async () => {
      mockedFetch.mockResolvedValueOnce(
        jsonResponse({ tags: [] }, { ok: false, status: 503 }) as any,
      );
      const svc = makeService();
      const tags = await svc.listTags(baseRegistry);
      expect(tags).toEqual([]);
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('getSkill', () => {
    it('returns null when the OCI ref does not match a configured registry', async () => {
      const svc = makeService();
      const skill = await svc.getSkill(
        'https://unknown.example.com/ns/skill-foo:1.0.0',
      );
      expect(skill).toBeNull();
    });
  });

  describe('getSkillContent', () => {
    it('returns null when the skill manifest cannot be loaded', async () => {
      mockedFetch.mockResolvedValue(
        jsonResponse(null, { ok: false, status: 500 }) as any,
      );
      const svc = makeService();
      const text = await svc.getSkillContent(
        `${baseRegistry.url}/repo/skill-s:1.0.0`,
      );
      expect(text).toBeNull();
    });
  });

  describe('searchSkills', () => {
    it('filters local skills from listSkills by query text', async () => {
      const svc = makeService();
      const skills: any[] = [
        {
          card: {
            metadata: {
              name: 'alpha',
              namespace: 'n',
              version: '1',
              description: 'uses kubernetes',
            },
          },
        },
        {
          card: {
            metadata: {
              name: 'beta',
              namespace: 'n',
              version: '1',
              description: 'unrelated',
            },
          },
        },
      ];
      jest.spyOn(svc, 'listSkills').mockResolvedValue(skills);
      const found = await svc.searchSkills('kubernetes');
      expect(found).toHaveLength(1);
      expect(found[0].card.metadata.name).toBe('alpha');
    });
  });

  describe('pushSkill', () => {
    it('rejects with a validation error when the skill card is invalid', async () => {
      const svc = makeService();
      const invalid: SkillCard = {
        apiVersion: 'skillimage.io/v1alpha1',
        kind: 'SkillCard',
        metadata: {
          name: '',
          namespace: 'ns',
          version: '1.0.0',
          description: 'd',
        },
      };
      await expect(
        svc.pushSkill(baseRegistry, invalid, '# content'),
      ).rejects.toThrow(/validation/i);
    });
  });

  describe('listSkills when the registry is unavailable', () => {
    it('completes with an empty list when catalog and tag fetches throw', async () => {
      mockedFetch.mockRejectedValue(new Error('ECONNREFUSED'));
      const svc = makeService();
      const skills = await svc.listSkills();
      expect(skills).toEqual([]);
    });
  });
});
