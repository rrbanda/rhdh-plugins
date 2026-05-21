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
  type ChatToolConfig,
  type AgentLifecycleStage,
  type KagentiToolSummary,
  normalizeLifecycleStage,
} from '@red-hat-developer-hub/backstage-plugin-augment-common';
import { createWithRoute } from './routeWrapper';
import type { RouteContext } from './types';
import type { AdminConfigService } from '../services/AdminConfigService';
import {
  isProductionStage,
  registerLifecycleRoutes,
} from './lifecycleRouteHelpers';

export interface ToolLifecycleOptions {
  listProviderTools(): Promise<KagentiToolSummary[]>;
}

/**
 * Registers tool lifecycle endpoints mirroring the agent lifecycle.
 * Merges tools from the provider (Kagenti) with lifecycle config from the DB,
 * enabling draft -> review -> staging -> production -> retired lifecycle for tools.
 */
export function registerToolLifecycleRoutes(
  ctx: RouteContext,
  adminConfig: AdminConfigService,
  options: ToolLifecycleOptions,
): void {
  const { router, logger, sendRouteError } = ctx;
  const withRoute = createWithRoute(logger, sendRouteError);

  async function loadChatToolConfigs(): Promise<ChatToolConfig[]> {
    const raw = await adminConfig.get('chatTools');
    if (Array.isArray(raw)) return raw as ChatToolConfig[];
    return [];
  }

  async function saveChatToolConfigs(
    configs: ChatToolConfig[],
    updatedBy: string,
  ): Promise<void> {
    await adminConfig.set('chatTools', configs, updatedBy);
  }

  /**
   * Build a unified tool list by merging provider tools with lifecycle config.
   */
  async function buildUnifiedToolList(): Promise<{
    tools: (KagentiToolSummary & {
      published?: boolean;
      lifecycleStage?: AgentLifecycleStage;
      version?: number;
      promotedAt?: string;
      promotedBy?: string;
    })[];
  }> {
    const [providerTools, chatConfigs] = await Promise.all([
      options.listProviderTools(),
      loadChatToolConfigs(),
    ]);

    const configMap = new Map(chatConfigs.map(c => [c.toolId, c]));

    const merged = providerTools.map((tool: KagentiToolSummary) => {
      const toolId = `${tool.namespace}/${tool.name}`;
      const cfg = configMap.get(toolId);
      const stage = normalizeLifecycleStage(cfg?.lifecycleStage);
      return {
        ...tool,
        published: isProductionStage(stage),
        lifecycleStage: stage,
        version: cfg?.version ?? 0,
        promotedAt: cfg?.promotedAt,
        promotedBy: cfg?.promotedBy,
      };
    });

    return { tools: merged };
  }

  // ---------------------------------------------------------------------------
  // GET /tools -- unified tool listing with lifecycle overlay
  // ---------------------------------------------------------------------------
  router.get(
    '/tools',
    withRoute('GET /tools', 'Failed to list tools', async (req, res) => {
      const { tools } = await buildUnifiedToolList();
      const publishedFilter = req.query.published;

      const filtered =
        publishedFilter === 'true'
          ? tools.filter(t => t.published === true)
          : tools;

      res.json({ tools: filtered });
    }),
  );

  // ---------------------------------------------------------------------------
  // Shared lifecycle routes: promote, demote, publish, unpublish
  // ---------------------------------------------------------------------------
  registerLifecycleRoutes(ctx, {
    auditAction: 'tool.lifecycle',
    entityLabel: 'Tool',
    routePrefix: '/tools',
    paramName: 'toolId',
    loadConfigs: loadChatToolConfigs,
    saveConfigs: saveChatToolConfigs,
    findConfig: (configs, id) => configs.find(c => c.toolId === id),
    newConfig: (entityId, base) => ({
      toolId: entityId,
      ...base,
    }),
  });
}
