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

import type { Config } from '@backstage/config';
import type { GraphSyncConfig } from '../services';

export interface EmbeddingConfig {
  apiUrl: string;
  apiKey: string;
  model?: string;
  dimensions?: number;
  timeoutMs?: number;
}

export interface GraphScheduleConfig {
  syncOnStartup: boolean;
  syncIntervalSeconds: number;
}

export interface RagConfig {
  [key: string]: number;
}

export interface GraphConfigResult {
  embeddingConfig?: EmbeddingConfig;
  graphSyncConfig?: GraphSyncConfig;
  scheduleConfig: GraphScheduleConfig;
  ragConfig?: RagConfig;
  queryOverrides?: Record<string, unknown>;
}

export function readGraphConfig(config: Config): GraphConfigResult {
  const result: GraphConfigResult = {
    scheduleConfig: {
      syncOnStartup:
        config.getOptionalBoolean('skillMarketplace.graph.syncOnStartup') ??
        true,
      syncIntervalSeconds:
        config.getOptionalNumber(
          'skillMarketplace.graph.syncIntervalSeconds',
        ) ?? 300,
    },
  };

  // Embedding config
  const embeddingApiUrl = config.getOptionalString(
    'skillMarketplace.graph.embeddingApiUrl',
  );
  const embeddingApiKey = config.getOptionalString(
    'skillMarketplace.graph.embeddingApiKey',
  );
  if (embeddingApiUrl && embeddingApiKey) {
    result.embeddingConfig = {
      apiUrl: embeddingApiUrl,
      apiKey: embeddingApiKey,
      model: config.getOptionalString('skillMarketplace.graph.embeddingModel'),
      dimensions: config.getOptionalNumber(
        'skillMarketplace.graph.embeddingDimensions',
      ),
      timeoutMs: config.getOptionalNumber(
        'skillMarketplace.graph.embeddingTimeoutMs',
      ),
    };
  }

  // Graph sync config
  const graphSyncConfig: GraphSyncConfig = {
    embeddingApiUrl,
    embeddingModel: config.getOptionalString(
      'skillMarketplace.graph.embeddingModel',
    ),
    embeddingApiKey,
    embeddingDimensions: config.getOptionalNumber(
      'skillMarketplace.graph.embeddingDimensions',
    ),
    embeddingTimeoutMs: config.getOptionalNumber(
      'skillMarketplace.graph.embeddingTimeoutMs',
    ),
    similarityThreshold: config.getOptionalNumber(
      'skillMarketplace.graph.similarityThreshold',
    ),
    similarityTopK: config.getOptionalNumber(
      'skillMarketplace.graph.similarityTopK',
    ),
    matchThreshold: config.getOptionalNumber(
      'skillMarketplace.graph.matchThreshold',
    ),
    semanticThreshold: config.getOptionalNumber(
      'skillMarketplace.graph.semanticThreshold',
    ),
    syncEventRetention: config.getOptionalNumber(
      'skillMarketplace.graph.syncEventRetention',
    ),
  };

  // Category keywords
  const rawCategoryMap = config.getOptionalConfig(
    'skillMarketplace.graph.categoryKeywords',
  );
  if (rawCategoryMap) {
    const categoryKeywords: Record<string, string[]> = {};
    for (const key of rawCategoryMap.keys()) {
      categoryKeywords[key] = rawCategoryMap.getStringArray(key);
    }
    graphSyncConfig.categoryKeywords = categoryKeywords;
  }

  // Tool metadata
  const rawToolMeta = config.getOptionalConfig(
    'skillMarketplace.graph.toolMetadata',
  );
  if (rawToolMeta) {
    const toolMetadata: Record<
      string,
      {
        description?: string;
        docsUrl?: string;
        version?: string;
        deprecated?: boolean;
      }
    > = {};
    for (const key of rawToolMeta.keys()) {
      const entry = rawToolMeta.getConfig(key);
      toolMetadata[key] = {
        description: entry.getOptionalString('description'),
        docsUrl: entry.getOptionalString('docsUrl'),
        version: entry.getOptionalString('version'),
        deprecated: entry.getOptionalBoolean('deprecated') ?? undefined,
      };
    }
    graphSyncConfig.toolMetadata = toolMetadata;
  }

  // Domain taxonomy
  const rawDomainTax = config.getOptionalConfig(
    'skillMarketplace.graph.domainTaxonomy',
  );
  if (rawDomainTax) {
    const domainTaxonomy: Record<
      string,
      { description?: string; owner?: string; parent?: string }
    > = {};
    for (const key of rawDomainTax.keys()) {
      const entry = rawDomainTax.getConfig(key);
      domainTaxonomy[key] = {
        description: entry.getOptionalString('description'),
        owner: entry.getOptionalString('owner'),
        parent: entry.getOptionalString('parent') ?? undefined,
      };
    }
    graphSyncConfig.domainTaxonomy = domainTaxonomy;
  }

  result.graphSyncConfig = graphSyncConfig;

  // Cypher query overrides
  const queriesConfig = config.getOptionalConfig(
    'skillMarketplace.graph.queries',
  );
  if (queriesConfig) {
    const overrides: Record<string, unknown> = {};
    for (const section of queriesConfig.keys()) {
      const sectionConfig = queriesConfig.getOptionalConfig(section);
      if (!sectionConfig) continue;
      const sectionObj: Record<string, unknown> = {};
      for (const key of sectionConfig.keys()) {
        const nested = sectionConfig.getOptionalConfig(key);
        if (nested) {
          const nestedObj: Record<string, string> = {};
          for (const nk of nested.keys()) {
            nestedObj[nk] = nested.getString(nk);
          }
          sectionObj[key] = nestedObj;
        } else {
          sectionObj[key] = sectionConfig.getString(key);
        }
      }
      overrides[section] = sectionObj;
    }
    result.queryOverrides = overrides;
  }

  // RAG config
  const ragEntries = {
    fulltextScoreFloor: config.getOptionalNumber(
      'skillMarketplace.graph.rag.fulltextScoreFloor',
    ),
    fulltextLimit: config.getOptionalNumber(
      'skillMarketplace.graph.rag.fulltextLimit',
    ),
    scoreNormalizationDivisor: config.getOptionalNumber(
      'skillMarketplace.graph.rag.scoreNormalizationDivisor',
    ),
    graphPropagationFactor: config.getOptionalNumber(
      'skillMarketplace.graph.rag.graphPropagationFactor',
    ),
    fallbackScore: config.getOptionalNumber(
      'skillMarketplace.graph.rag.fallbackScore',
    ),
    vectorTopKMultiplier: config.getOptionalNumber(
      'skillMarketplace.graph.rag.vectorTopKMultiplier',
    ),
    expansionLimit: config.getOptionalNumber(
      'skillMarketplace.graph.rag.expansionLimit',
    ),
  };

  const cleanRagConfig: Record<string, number> = {};
  for (const [k, v] of Object.entries(ragEntries)) {
    if (v !== undefined) cleanRagConfig[k] = v;
  }
  if (Object.keys(cleanRagConfig).length > 0) {
    result.ragConfig = cleanRagConfig;
  }

  return result;
}
