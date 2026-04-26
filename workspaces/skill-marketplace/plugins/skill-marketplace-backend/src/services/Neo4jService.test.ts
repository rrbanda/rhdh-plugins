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
import neo4j from 'neo4j-driver';
import { CypherQueryCatalog } from './CypherQueryCatalog';
import { Neo4jService } from './Neo4jService';

jest.mock('neo4j-driver', () => {
  const int = (n: number) => n;
  return {
    __esModule: true,
    default: {
      driver: jest.fn(),
      auth: { basic: jest.fn(() => ({})) },
      int,
    },
  };
});

const mockDriver = {
  verifyConnectivity: jest.fn().mockResolvedValue(undefined),
  close: jest.fn().mockResolvedValue(undefined),
  session: jest.fn(),
};

const mockSessionRun = jest.fn();
const mockTxRun = jest.fn();
const mockSession = {
  run: mockSessionRun,
  beginTransaction: jest.fn(() => ({
    run: mockTxRun,
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
  })),
  close: jest.fn().mockResolvedValue(undefined),
};

function createMockLogger() {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnThis(),
  };
}

function rec(props: Record<string, unknown>) {
  return { get: (k: string) => props[k] };
}

describe('Neo4jService', () => {
  const queryCatalog = new CypherQueryCatalog();
  let service: Neo4jService;
  const logger = createMockLogger();

  beforeEach(() => {
    jest.clearAllMocks();
    (neo4j.driver as jest.Mock).mockReturnValue(mockDriver);
    mockDriver.session.mockReturnValue(mockSession);

    service = new Neo4jService({
      uri: 'neo4j://localhost:7687',
      user: 'neo4j',
      password: 'secret',
      database: 'neo4j',
      logger,
      queryCatalog,
    });
  });

  it('builds a driver with basic auth on first use and verifies connectivity', async () => {
    mockSessionRun.mockImplementation((q: string) => {
      if (q === queryCatalog.get('read.countAllAgents')) {
        return { records: [rec({ c: 3 })] };
      }
      return { records: [] };
    });

    const count = await service.countAgents();

    expect(neo4j.auth.basic).toHaveBeenCalledWith('neo4j', 'secret');
    expect(neo4j.driver).toHaveBeenCalledWith(
      'neo4j://localhost:7687',
      expect.anything(),
    );
    expect(mockDriver.verifyConnectivity).toHaveBeenCalledWith({
      database: 'neo4j',
    });
    expect(count).toBe(3);
    expect(mockSessionRun).toHaveBeenCalledWith(
      queryCatalog.get('read.countAllAgents'),
    );
  });

  describe('discoverSchema', () => {
    it('issues the expected read queries for label, relationship, and count discovery', async () => {
      mockSessionRun
        .mockResolvedValueOnce({
          records: [rec({ name: 'Skill', count: 2 })],
        })
        .mockResolvedValueOnce({
          records: [rec({ type: 'RELATES', count: 1 })],
        })
        .mockResolvedValueOnce({ records: [rec({ c: 10 })] })
        .mockResolvedValueOnce({ records: [rec({ c: 5 })] })
        .mockResolvedValueOnce({
          records: [rec({ plugin: 'p', color: '#fff', count: 3 })],
        });

      const schema = await service.discoverSchema();

      const calls = mockSessionRun.mock.calls.map(c => c[0] as string);
      expect(calls[0]).toBe(queryCatalog.get('read.discoverSchemaLabels'));
      expect(calls[1]).toBe(queryCatalog.get('read.discoverSchemaRelTypes'));
      expect(calls[2]).toBe(queryCatalog.get('read.countAllNodes'));
      expect(calls[3]).toBe(queryCatalog.get('read.countAllRels'));
      expect(calls[4]).toBe(queryCatalog.get('read.discoverPluginGroups'));
      expect(schema.totalNodes).toBe(10);
      expect(schema.totalRelationships).toBe(5);
    });
  });

  describe('searchGraph', () => {
    it('runs fulltext search with a fuzzy query suffix and passes parameters', async () => {
      // discoverSchema
      mockSessionRun
        .mockResolvedValueOnce({ records: [rec({ name: 'L', count: 1 })] })
        .mockResolvedValueOnce({ records: [rec({ type: 'R', count: 1 })] })
        .mockResolvedValueOnce({ records: [rec({ c: 1 })] })
        .mockResolvedValueOnce({ records: [rec({ c: 1 })] })
        .mockResolvedValueOnce({
          records: [rec({ plugin: 'p', color: '#000', count: 1 })],
        })
        // search: fulltext (second session)
        .mockResolvedValueOnce({ records: [] });

      await service.searchGraph('hello');

      const fullTextCall = mockSessionRun.mock.calls.find(
        c => c[0] === queryCatalog.get('read.searchGraphFulltext'),
      );
      expect(fullTextCall).toBeDefined();
      expect(fullTextCall![1]).toEqual({ query: 'hello~' });
    });

    it('falls back to the keyword search query when fulltext query fails', async () => {
      mockSessionRun
        .mockResolvedValueOnce({ records: [rec({ name: 'L', count: 1 })] })
        .mockResolvedValueOnce({ records: [rec({ type: 'R', count: 1 })] })
        .mockResolvedValueOnce({ records: [rec({ c: 1 })] })
        .mockResolvedValueOnce({ records: [rec({ c: 1 })] })
        .mockResolvedValueOnce({
          records: [rec({ plugin: 'p', color: '#000', count: 1 })],
        })
        .mockRejectedValueOnce(new Error('no fulltext index'))
        .mockResolvedValueOnce({ records: [] });

      await service.searchGraph('fallback');

      const fallback = mockSessionRun.mock.calls.find(
        c => c[0] === queryCatalog.get('read.searchGraphFallback'),
      );
      expect(fallback).toBeDefined();
      expect(fallback![1]).toEqual({ query: 'fallback' });
    });
  });

  describe('listAllAgents', () => {
    it('uses the listAllAgents cypher and maps record fields', async () => {
      mockSessionRun.mockResolvedValue({
        records: [
          rec({
            name: 'a1',
            namespace: 'ns',
            status: 'ok',
            description: 'd',
            framework: 'f',
            version: '1',
            url: 'u',
            streaming: true,
            pushNotifications: false,
            provider: 'p',
            protocol: 'http',
            workloadType: 'k8s',
            skillCount: 4,
          }),
        ],
      });

      const rows = await service.listAllAgents();

      expect(mockSessionRun).toHaveBeenCalledWith(
        queryCatalog.get('read.listAllAgents'),
      );
      expect(rows[0]).toMatchObject({
        name: 'a1',
        namespace: 'ns',
        skillCount: 4,
      });
    });
  });

  describe('fetchFullGraph', () => {
    it('fetches nodes and relationship queries using the catalog templates', async () => {
      mockSessionRun
        // discoverSchema
        .mockResolvedValueOnce({ records: [rec({ name: 'L', count: 1 })] })
        .mockResolvedValueOnce({ records: [rec({ type: 'R', count: 1 })] })
        .mockResolvedValueOnce({ records: [rec({ c: 1 })] })
        .mockResolvedValueOnce({ records: [rec({ c: 1 })] })
        .mockResolvedValueOnce({
          records: [rec({ plugin: 'p', color: '#000', count: 1 })],
        });

      const nodeStub = { properties: { name: 'n1', id: 'id1' } };
      mockTxRun
        .mockResolvedValueOnce({
          records: [
            {
              get: (k: string) => {
                if (k === 'n') return nodeStub;
                if (k === 'lbls') return ['Skill'];
                if (k === 'eid') return 'e1';
                return undefined;
              },
            },
          ],
        })
        .mockResolvedValueOnce({ records: [] });

      const graph = await service.fetchFullGraph(10);

      expect(mockTxRun).toHaveBeenNthCalledWith(
        1,
        queryCatalog.get('read.fetchFullGraphNodes'),
        { limit: 10 },
      );
      expect(mockTxRun).toHaveBeenNthCalledWith(
        2,
        queryCatalog.get('read.fetchRelsByElementIds'),
        { eids: ['e1'] },
      );
      expect(graph.nodes).toHaveLength(1);
    });
  });
});
