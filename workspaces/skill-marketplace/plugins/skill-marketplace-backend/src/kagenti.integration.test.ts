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
 * Kagenti integration tests.
 *
 * These tests run against a real Kagenti cluster and are skipped when
 * the cluster is not reachable. Set environment variables to configure:
 *
 *   KAGENTI_API_URL      - Kagenti API base URL
 *   KAGENTI_KEYCLOAK_URL - Keycloak token endpoint
 *   KAGENTI_CLIENT_ID    - Keycloak client ID (default: 'kagenti')
 *   KAGENTI_USERNAME     - Keycloak username
 *   KAGENTI_PASSWORD     - Keycloak password
 *
 * Run with:
 *   KAGENTI_API_URL=https://... KAGENTI_USERNAME=... KAGENTI_PASSWORD=... \
 *     yarn backstage-cli package test --testPathPattern=kagenti.integration --forceExit
 */

import { mockServices } from '@backstage/backend-test-utils';
import { KagentiService, type KagentiConfig } from './services/KagentiService';
import type { KagentiAgent } from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';

const KAGENTI_API_URL = process.env.KAGENTI_API_URL || '';
const KAGENTI_KEYCLOAK_URL = process.env.KAGENTI_KEYCLOAK_URL || '';
const KAGENTI_CLIENT_ID = process.env.KAGENTI_CLIENT_ID || 'kagenti';
const KAGENTI_USERNAME = process.env.KAGENTI_USERNAME || '';
const KAGENTI_PASSWORD = process.env.KAGENTI_PASSWORD || '';
const KAGENTI_NAMESPACE = process.env.KAGENTI_NAMESPACE || '';

const isConfigured =
  KAGENTI_API_URL && KAGENTI_KEYCLOAK_URL && KAGENTI_USERNAME && KAGENTI_PASSWORD;

const describeIfKagenti = isConfigured ? describe : describe.skip;

describeIfKagenti('Kagenti integration (real cluster)', () => {
  const logger = mockServices.logger.mock();
  let service: KagentiService;

  beforeAll(() => {
    const config: KagentiConfig = {
      apiUrl: KAGENTI_API_URL,
      agentName: 'builder-agent',
      namespace: KAGENTI_NAMESPACE || 'skills-marketplace',
      keycloak: {
        tokenUrl: KAGENTI_KEYCLOAK_URL,
        clientId: KAGENTI_CLIENT_ID,
        username: KAGENTI_USERNAME,
        password: KAGENTI_PASSWORD,
      },
    };
    service = new KagentiService(config, logger);
  });

  describe('authentication', () => {
    it('validates Keycloak config at construction time', () => {
      expect(() => {
        new KagentiService(
          { apiUrl: '', agentName: '', namespace: '', keycloak: { tokenUrl: '', clientId: '', username: '', password: '' } },
          logger,
        );
      }).toThrow(/apiUrl is required/);
    });

    it('validates Keycloak credentials at construction time', () => {
      expect(() => {
        new KagentiService(
          { apiUrl: 'http://example.com', agentName: '', namespace: '', keycloak: { tokenUrl: '', clientId: '', username: '', password: '' } },
          logger,
        );
      }).toThrow(/keycloak.*required/i);
    });
  });

  describe('listNamespaces', () => {
    it('returns a list of enabled namespaces', async () => {
      const result = await service.listNamespaces();
      expect(result.status).toBe(200);
      const data = result.data as { namespaces: string[] };
      expect(data.namespaces).toBeDefined();
      expect(Array.isArray(data.namespaces)).toBe(true);
      expect(data.namespaces.length).toBeGreaterThan(0);
    });
  });

  describe('listAgents', () => {
    it('returns items array', async () => {
      const result = await service.listAgents();
      expect(result.status).toBe(200);
      const data = result.data as { items: unknown[] };
      expect(data.items).toBeDefined();
      expect(Array.isArray(data.items)).toBe(true);
    });

    it('returns items with expected flat shape', async () => {
      const namespaces = await service.listNamespaces();
      const nsList = (namespaces.data as { namespaces: string[] }).namespaces;

      let allAgents: KagentiAgent[] = [];
      for (const ns of nsList) {
        const parsed = await service.listAgentsParsed(ns);
        allAgents = allAgents.concat(parsed);
      }

      if (allAgents.length === 0) {
        console.warn('No agents found in any namespace, skipping shape validation');
        return;
      }

      const agent = allAgents[0];
      expect(agent.name).toBeDefined();
      expect(typeof agent.name).toBe('string');
      expect(agent.namespace).toBeDefined();
      expect(typeof agent.namespace).toBe('string');
      expect(agent.status).toBeDefined();
      expect(agent.labels).toBeDefined();
      expect(Array.isArray(agent.labels.protocol)).toBe(true);
      expect(typeof agent.labels.framework).toBe('string');
      expect(typeof agent.workloadType).toBe('string');
      expect(typeof agent.createdAt).toBe('string');
    });
  });

  describe('getAgentDetail', () => {
    let testNs: string;
    let testName: string;

    beforeAll(async () => {
      const namespaces = await service.listNamespaces();
      const nsList = (namespaces.data as { namespaces: string[] }).namespaces;

      for (const ns of nsList) {
        const parsed = await service.listAgentsParsed(ns);
        if (parsed.length > 0) {
          testNs = ns;
          testName = parsed[0].name;
          break;
        }
      }
    });

    it('returns full K8s detail with metadata wrapper', async () => {
      if (!testNs || !testName) {
        console.warn('No agents found, skipping detail test');
        return;
      }

      const result = await service.getAgentDetail(testNs, testName);
      expect(result.status).toBe(200);

      const data = result.data as Record<string, unknown>;
      expect(data.metadata).toBeDefined();

      const metadata = data.metadata as Record<string, unknown>;
      expect(metadata.name).toBe(testName);
      expect(metadata.namespace).toBe(testNs);

      expect(data.spec).toBeDefined();
      expect(data.workloadType).toBeDefined();
      expect(data.readyStatus).toBeDefined();
    });

    it('detail response uses snake_case for K8s fields', async () => {
      if (!testNs || !testName) return;

      const result = await service.getAgentDetail(testNs, testName);
      const data = result.data as Record<string, unknown>;
      const spec = data.spec as Record<string, unknown>;
      const template = spec?.template as Record<string, unknown>;
      const podSpec = template?.spec as Record<string, unknown>;

      const containers = podSpec?.containers as Array<Record<string, unknown>>;
      expect(containers).toBeDefined();
      expect(containers.length).toBeGreaterThan(0);

      const container = containers[0];
      expect(container.image).toBeDefined();
      // Verify snake_case is used (not camelCase)
      if (container.env_from) {
        expect(container.envFrom).toBeUndefined();
      }
      if (container.image_pull_policy) {
        expect(container.imagePullPolicy).toBeUndefined();
      }
    });
  });

  describe('getAgentSkills', () => {
    it('returns skills array from volumes', async () => {
      const namespaces = await service.listNamespaces();
      const nsList = (namespaces.data as { namespaces: string[] }).namespaces;

      let testNs = '';
      let testName = '';
      for (const ns of nsList) {
        const parsed = await service.listAgentsParsed(ns);
        if (parsed.length > 0) {
          testNs = ns;
          testName = parsed[0].name;
          break;
        }
      }

      if (!testNs || !testName) {
        console.warn('No agents found, skipping skills test');
        return;
      }

      const result = await service.getAgentSkills(testNs, testName);
      expect(result.status).toBe(200);
      const data = result.data as { skills: Array<{ name: string; source: string }> };
      expect(data.skills).toBeDefined();
      expect(Array.isArray(data.skills)).toBe(true);
    });
  });

  describe('getAgentCard', () => {
    it('calls agent card endpoint (may fail server-side)', async () => {
      const result = await service.getAgentCard();
      // Agent card may return 500 due to Kagenti server-side bug
      expect([200, 500]).toContain(result.status);
      if (result.status === 200) {
        const data = result.data as Record<string, unknown>;
        expect(data.name).toBeDefined();
      }
    });
  });

  describe('sendMessage (chat proxy)', () => {
    it('sends a message through Kagenti proxy', async () => {
      const result = await service.sendMessage('Hello, this is a test');
      expect(result.status).toBe(200);

      const data = result.data as { content: string; session_id: string; is_complete: boolean };
      expect(data.content).toBeDefined();
      expect(typeof data.content).toBe('string');
      expect(data.session_id).toBeDefined();
      expect(typeof data.is_complete).toBe('boolean');
    });
  });

  describe('streamMessage', () => {
    it('returns SSE content type', async () => {
      const response = await service.streamMessage('Hello stream test');
      expect(response.ok).toBe(true);
      const contentType = response.headers.get('content-type') || '';
      expect(contentType).toContain('text/event-stream');
      // Consume the body to prevent resource leak
      await response.text();
    });
  });

  describe('constructor validation', () => {
    it('rejects empty apiUrl', () => {
      expect(() => {
        new KagentiService(
          {
            apiUrl: '',
            agentName: 'test',
            namespace: 'test',
            keycloak: { tokenUrl: 'http://kc', clientId: 'c', username: 'u', password: 'p' },
          },
          logger,
        );
      }).toThrow(/apiUrl is required/);
    });

    it('rejects missing keycloak fields', () => {
      expect(() => {
        new KagentiService(
          {
            apiUrl: 'http://api',
            agentName: 'test',
            namespace: 'test',
            keycloak: { tokenUrl: '', clientId: 'c', username: 'u', password: 'p' },
          },
          logger,
        );
      }).toThrow(/keycloak/i);
    });
  });
});
