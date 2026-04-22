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
import { Router } from 'express';
import neo4jDriver from 'neo4j-driver';
import type { HttpAuthService, LoggerService, PermissionsService } from '@backstage/backend-plugin-api';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import {
  skillMarketplaceAccessPermission,
} from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import type {
  GraphRAGQuery,
  GraphRAGResult,
  GraphRAGSkill,
  RagSkillHit,
} from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import type { Neo4jService } from '../services/Neo4jService';
import type { SkillGraphSyncService } from '../services/SkillGraphSyncService';
import type { CypherQueryCatalog } from '../services/CypherQueryCatalog';
import { toNumber, resolveId, escapeLucene } from '../services/neo4jUtils';

export interface RagConfig {
  fulltextScoreFloor: number;
  fulltextLimit: number;
  scoreNormalizationDivisor: number;
  graphPropagationFactor: number;
  fallbackScore: number;
  vectorTopKMultiplier: number;
  expansionLimit: number;
  maxQueryLength: number;
}

const RAG_DEFAULTS: RagConfig = {
  fulltextScoreFloor: 0.3,
  fulltextLimit: 20,
  scoreNormalizationDivisor: 10,
  graphPropagationFactor: 0.7,
  fallbackScore: 0.5,
  vectorTopKMultiplier: 2,
  expansionLimit: 100,
  maxQueryLength: 2000,
};

function skillHitFromRecord(
  record: { properties: Record<string, unknown>; labels?: string[] },
  elementId: string,
): RagSkillHit & { _id: string } {
  const props = record.properties ?? {};
  return {
    _id: resolveId(props, elementId),
    name: (props.name as string) || '',
    description: (props.description as string) || '',
    category: (props.category as string) || '',
    version: (props.version as string) || '',
    author: (props.author as string) || '',
    ociReference: (props.ociReference as string) || '',
  };
}

function validateRagBody(body: unknown): { valid: true; parsed: GraphRAGQuery } | { valid: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body is required' };
  }
  const b = body as Record<string, unknown>;

  if (!b.query || typeof b.query !== 'string') {
    return { valid: false, error: 'query is required and must be a string' };
  }
  if (b.query.length > RAG_DEFAULTS.maxQueryLength) {
    return { valid: false, error: `query exceeds maximum length of ${RAG_DEFAULTS.maxQueryLength}` };
  }

  const parsed: GraphRAGQuery = { query: b.query };

  if (b.context !== undefined) {
    if (typeof b.context !== 'string') return { valid: false, error: 'context must be a string' };
    parsed.context = b.context;
  }
  if (b.maxResults !== undefined) {
    const n = Number(b.maxResults);
    if (!Number.isFinite(n) || n < 1) return { valid: false, error: 'maxResults must be a positive number' };
    parsed.maxResults = n;
  }
  if (b.includeRelated !== undefined) {
    if (typeof b.includeRelated !== 'boolean') return { valid: false, error: 'includeRelated must be a boolean' };
    parsed.includeRelated = b.includeRelated;
  }
  if (b.filters !== undefined) {
    if (typeof b.filters !== 'object' || b.filters === null) return { valid: false, error: 'filters must be an object' };
    const f = b.filters as Record<string, unknown>;
    parsed.filters = {};
    if (f.domain !== undefined) {
      if (typeof f.domain !== 'string') return { valid: false, error: 'filters.domain must be a string' };
      parsed.filters.domain = f.domain;
    }
    if (f.tools !== undefined) {
      if (!Array.isArray(f.tools) || !f.tools.every(t => typeof t === 'string')) {
        return { valid: false, error: 'filters.tools must be an array of strings' };
      }
      parsed.filters.tools = f.tools;
    }
    if (f.minSimilarity !== undefined) {
      const s = Number(f.minSimilarity);
      if (!Number.isFinite(s) || s < 0 || s > 1) return { valid: false, error: 'filters.minSimilarity must be between 0 and 1' };
      parsed.filters.minSimilarity = s;
    }
  }

  return { valid: true, parsed };
}

export function registerRagRoutes(
  router: Router,
  logger: LoggerService,
  neo4jService?: Neo4jService,
  syncService?: SkillGraphSyncService,
  httpAuth?: HttpAuthService,
  permissions?: PermissionsService,
  ragConfig?: Partial<RagConfig>,
  queryCatalog?: CypherQueryCatalog,
) {
  const cfg = { ...RAG_DEFAULTS, ...ragConfig };
  const rq = (key: string) => {
    if (!queryCatalog) throw new Error(`ragRoutes: queryCatalog not available for key "${key}"`);
    return queryCatalog.get(key);
  };

  router.post('/graph/rag', async (req, res) => {
    if (httpAuth && permissions) {
      const credentials = await httpAuth.credentials(req, { allow: ['user'] });
      const decision = await permissions.authorize(
        [{ permission: skillMarketplaceAccessPermission }],
        { credentials },
      );
      if (decision[0].result !== AuthorizeResult.ALLOW) {
        res.status(403).json({ error: 'Insufficient permissions' });
        return;
      }
    }

    if (!neo4jService) {
      res.status(503).json({ error: 'Neo4j not configured' });
      return;
    }

    const validation = validateRagBody(req.body);
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const { query, context, maxResults: rawMax, includeRelated: rawInclude, filters } = validation.parsed;
    const maxResults = Math.min(rawMax ?? 10, 50);
    const includeRelated = rawInclude ?? true;
    const minSimilarity = filters?.minSimilarity ?? 0.7;
    const domainFilter = filters?.domain;
    const toolsFilter = filters?.tools;

    const skillMap = new Map<string, GraphRAGSkill>();
    const session = await neo4jService.getHealthySession();

    try {
      let queryEmbeddingUsed = false;
      if (syncService) {
        const queryEmbedding = await syncService.generateEmbedding(
          `${query}${context ? ` — ${context}` : ''}`,
        );
        if (queryEmbedding) {
          queryEmbeddingUsed = true;
          try {
            const vectorResult = await session.run(
              rq('rag.vectorSearch'),
              {
                topK: neo4jDriver.int(maxResults * cfg.vectorTopKMultiplier),
                queryEmbedding,
                minSimilarity,
              },
            );
            for (const record of vectorResult.records) {
              const node = record.get('node');
              const eid = record.get('eid') as string;
              const score = toNumber(record.get('score'));
              const hit = skillHitFromRecord(node, eid);
              if (!skillMap.has(hit._id)) {
                skillMap.set(hit._id, {
                  skill: hit,
                  score,
                  matchType: 'semantic',
                  reason: `Semantic similarity: ${(score * 100).toFixed(0)}%`,
                  related: [],
                  tools: ((node.properties.tools as string[]) || []),
                  domain: hit.category,
                });
              }
            }
          } catch (err) {
            logger.warn(`Vector search failed: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }

      try {
        const escaped = escapeLucene(query);
        const fulltextResult = await session.run(
          rq('rag.fulltextSearch'),
          { query: `${escaped}~`, floor: cfg.fulltextScoreFloor, limit: neo4jDriver.int(cfg.fulltextLimit) },
        );
        for (const record of fulltextResult.records) {
          const node = record.get('node');
          const eid = record.get('eid') as string;
          const score = toNumber(record.get('score'));
          const hit = skillHitFromRecord(node, eid);
          const normalizedScore = Math.min(score / cfg.scoreNormalizationDivisor, 0.95);
          if (!skillMap.has(hit._id)) {
            skillMap.set(hit._id, {
              skill: hit,
              score: normalizedScore,
              matchType: 'fulltext',
              reason: `Text match (score: ${score.toFixed(2)})`,
              related: [],
              tools: ((node.properties.tools as string[]) || []),
              domain: hit.category,
            });
          }
        }
      } catch (err) {
        logger.warn(`Fulltext search failed, using fallback: ${err instanceof Error ? err.message : String(err)}`);
        try {
          const fallbackResult = await session.run(
            rq('rag.fulltextFallback'),
            { query, limit: neo4jDriver.int(cfg.fulltextLimit) },
          );
          for (const record of fallbackResult.records) {
            const node = record.get('node');
            const eid = record.get('eid') as string;
            const hit = skillHitFromRecord(node, eid);
            if (!skillMap.has(hit._id)) {
              skillMap.set(hit._id, {
                skill: hit,
                score: cfg.fallbackScore,
                matchType: 'fulltext',
                reason: 'Name/description contains query',
                related: [],
                tools: [],
                domain: hit.category,
              });
            }
          }
        } catch (fallbackErr) {
          logger.warn(`Fallback search also failed: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`);
        }
      }

      if (includeRelated && skillMap.size > 0) {
        const seedNames = Array.from(skillMap.keys()).slice(0, maxResults);
        const expandResult = await session.run(
          rq('rag.expandRelatedSkills'),
          { names: seedNames, limit: neo4jDriver.int(cfg.expansionLimit) },
        );
        for (const record of expandResult.records) {
          const seedName = record.get('seedName') as string;
          const neighbor = record.get('neighbor');
          const eid = record.get('eid') as string;
          const relScore = toNumber(record.get('relScore'));
          const neighborHit = skillHitFromRecord(neighbor, eid);

          const seed = skillMap.get(seedName);
          if (seed) {
            seed.related.push(neighborHit);
          }

          if (!skillMap.has(neighborHit._id)) {
            const propagatedScore = (seed?.score ?? cfg.fallbackScore) * relScore * cfg.graphPropagationFactor;
            skillMap.set(neighborHit._id, {
              skill: neighborHit,
              score: propagatedScore,
              matchType: 'graph',
              reason: `Connected via ${record.get('relType')} to ${seedName}`,
              related: [],
              tools: [],
              domain: neighborHit.category,
            });
          }
        }

        const allNames = Array.from(skillMap.keys());
        const toolResult = await session.run(
          rq('rag.collectToolsBySkill'),
          { names: allNames },
        );
        for (const record of toolResult.records) {
          const skillName = record.get('skillName') as string;
          const tools = record.get('tools') as string[];
          const entry = skillMap.get(skillName);
          if (entry) entry.tools = tools;
        }
      }

      let results = Array.from(skillMap.values());

      if (domainFilter) {
        results = results.filter(r => r.domain === domainFilter);
      }
      if (toolsFilter && toolsFilter.length > 0) {
        results = results.filter(r =>
          toolsFilter.every(t => r.tools.includes(t)),
        );
      }

      results.sort((a, b) => b.score - a.score);
      results = results.slice(0, maxResults);

      const domainsSearched = [...new Set(results.map(r => r.domain).filter(Boolean))];

      const totalCountResult = await session.run(rq('rag.countAllSkills'));
      const totalSkills = toNumber(totalCountResult.records[0]?.get('c'));

      const response: GraphRAGResult = {
        skills: results,
        graphContext: {
          totalSkills,
          domainsSearched,
          queryEmbeddingUsed,
        },
      };

      res.json(response);
    } catch (err) {
      logger.error(`GraphRAG query failed: ${err instanceof Error ? err.message : String(err)}`);
      res.status(500).json({ error: 'GraphRAG query failed' });
    } finally {
      await session.close();
    }
  });
}
