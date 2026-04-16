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
     * Path to the skill registry directory containing SKILL.md files
     * @visibility backend
     */
    registryDir?: string;

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
    };

    /**
     * OCI registry configuration for skill distribution
     * @visibility backend
     */
    oci?: {
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
     * Security configuration
     * @visibility backend
     */
    security?: {
      /**
       * Security mode: 'none' for dev, 'plugin-only' for production
       * @visibility backend
       */
      mode?: 'none' | 'plugin-only';
    };
  };
}
