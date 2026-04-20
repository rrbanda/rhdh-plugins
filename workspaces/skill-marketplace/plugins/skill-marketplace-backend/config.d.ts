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

export interface Config {
  /**
   * Configuration for the Skills Marketplace plugin
   */
  skillMarketplace?: {
    /**
     * Directories to search for local SKILL.md files
     * @visibility backend
     */
    skillSearchDirs?: string[];

    /**
     * Neo4j graph database configuration
     * @visibility backend
     */
    neo4j?: {
      /** @visibility backend */
      uri?: string;
      /** @visibility backend */
      user?: string;
      /** @visibility secret */
      password?: string;
      /** @visibility backend */
      database?: string;
    };

    /**
     * Builder agent (Python ADK service) configuration
     * @visibility backend
     */
    builderAgent?: {
      /** @visibility backend */
      url?: string;
      /** @visibility secret */
      apiKey?: string;
      /** Connection timeout in milliseconds for builder agent HTTP calls (default: 30000)
       * @visibility backend
       */
      timeoutMs?: number;
      /** Maximum duration in milliseconds for SSE streaming pipelines (default: 300000). Set to 0 to disable.
       * @visibility backend
       */
      streamTimeoutMs?: number;
    };

    /**
     * OCI registry configuration for skill distribution
     * @visibility backend
     */
    oci?: {
      /**
       * OCI registry used for publishing new skills
       * @visibility backend
       */
      publishRegistry?: {
        /** @visibility backend */
        url?: string;
        /** @visibility secret */
        username?: string;
        /** @visibility secret */
        password?: string;
        /** @visibility secret */
        token?: string;
      };
      /**
       * List of OCI registries to scan for skills
       */
      registries?: Array<{
        /** @visibility backend */
        url?: string;
        /** @visibility backend */
        name?: string;
        /** @visibility secret */
        username?: string;
        /** @visibility secret */
        password?: string;
        /** @visibility secret */
        token?: string;
      }>;
      /**
       * Cache timeout in seconds for OCI registry responses
       * @visibility backend
       */
      cacheTimeout?: number;
      /** HTTP request timeout in milliseconds for OCI registry calls (default: 30000)
       * @visibility backend
       */
      requestTimeoutMs?: number;
      /** Maximum number of OCI cache entries before LRU eviction (default: 1000)
       * @visibility backend
       */
      maxCacheEntries?: number;
    };

    /**
     * Kagenti platform configuration for agent orchestration
     * @visibility backend
     */
    kagenti?: {
      /** @visibility backend */
      apiUrl?: string;
      /** @visibility backend */
      agentName?: string;
      /** @visibility backend */
      namespace?: string;
      /** HTTP request timeout in milliseconds for Kagenti API calls (default: 30000)
       * @visibility backend
       */
      requestTimeoutMs?: number;
      /** Timeout in milliseconds for Keycloak token requests (default: 10000)
       * @visibility backend
       */
      tokenTimeoutMs?: number;
      /** Direct A2A URL to bypass Kagenti chat proxy.
       * When set, the plugin calls the agent directly using the A2A protocol
       * instead of routing through Kagenti's chat proxy.
       * Example: http://builder-agent.skills-marketplace.svc.cluster.local:8000
       * @visibility backend
       */
      directA2AUrl?: string;
      /**
       * Keycloak authentication for Kagenti API
       * @visibility backend
       */
      keycloak?: {
        /** @visibility backend */
        tokenUrl?: string;
        /** @visibility backend */
        clientId?: string;
        /** @visibility secret */
        username?: string;
        /** @visibility secret */
        password?: string;
      };
    };

    /**
     * Skill Knowledge Graph configuration
     * @visibility backend
     */
    graph?: {
      /** Sync OCI skills to Neo4j on plugin startup (default: true)
       * @visibility backend
       */
      syncOnStartup?: boolean;
      /** Periodic sync interval in seconds (default: 30, 0 = disabled)
       * @visibility backend
       */
      syncIntervalSeconds?: number;
      /** OpenAI-compatible embedding API URL
       * @visibility backend
       */
      embeddingApiUrl?: string;
      /** Embedding model name (default: text-embedding-3-small)
       * @visibility backend
       */
      embeddingModel?: string;
      /** @visibility secret */
      embeddingApiKey?: string;
      /** Embedding vector dimensions (default: 1536, must match embedding model output)
       * @visibility backend
       */
      embeddingDimensions?: number;
      /** Timeout in milliseconds for embedding API calls (default: 30000)
       * @visibility backend
       */
      embeddingTimeoutMs?: number;
      /** Minimum cosine similarity for SIMILAR_TO relationships (default: 0.75)
       * @visibility backend
       */
      similarityThreshold?: number;
      /** Maximum number of similar skills per node for kNN similarity computation (default: 10)
       * @visibility backend
       */
      similarityTopK?: number;
      /**
       * Custom category keyword mappings for skill classification.
       * Keys are category names, values are arrays of keywords.
       * @visibility backend
       */
      categoryKeywords?: { [key: string]: string[] };
      /**
       * Agentic GraphRAG configuration
       * @visibility backend
       */
      agent?: {
        /** LLM model for agentic reasoning (default: gpt-4o). Must support function calling.
         * @visibility backend
         */
        model?: string;
        /** Override LLM API URL (default: derived from embeddingApiUrl by replacing /embeddings with /chat/completions)
         * @visibility backend
         */
        llmApiUrl?: string;
        /** Override API key for LLM calls (default: reuses embeddingApiKey)
         * @visibility secret
         */
        llmApiKey?: string;
        /** Maximum agent loop iterations per query (default: 5, max: 10)
         * @visibility backend
         */
        maxIterations?: number;
        /** Timeout per LLM call in milliseconds (default: 60000)
         * @visibility backend
         */
        timeoutMs?: number;
        /** Cache TTL for graph schema used in system prompt, in seconds (default: 300)
         * @visibility backend
         */
        schemaCacheTtlSeconds?: number;
      };
      /**
       * RAG (Retrieval-Augmented Generation) tuning parameters
       * @visibility backend
       */
      rag?: {
        /** Minimum fulltext search score to include (default: 0.3)
         * @visibility backend
         */
        fulltextScoreFloor?: number;
        /** Maximum fulltext results to return (default: 20)
         * @visibility backend
         */
        fulltextLimit?: number;
        /** Divisor for normalizing fulltext scores (default: 10)
         * @visibility backend
         */
        scoreNormalizationDivisor?: number;
        /** Score propagation factor for graph-expanded results (default: 0.7)
         * @visibility backend
         */
        graphPropagationFactor?: number;
        /** Fallback score for substring matches (default: 0.5)
         * @visibility backend
         */
        fallbackScore?: number;
        /** Multiplier for vector search topK relative to maxResults (default: 2)
         * @visibility backend
         */
        vectorTopKMultiplier?: number;
        /** Maximum number of graph expansion results (default: 100)
         * @visibility backend
         */
        expansionLimit?: number;
      };
    };

    /**
     * Security configuration
     * @visibility backend
     */
    security?: {
      /**
       * Security mode: 'plugin-only' (default, requires user-cookie auth)
       * or 'none' (DEVELOPMENT ONLY - disables all authentication).
       * WARNING: Never use 'none' in production.
       * @visibility backend
       */
      mode?: 'none' | 'plugin-only';
    };
  };
}
