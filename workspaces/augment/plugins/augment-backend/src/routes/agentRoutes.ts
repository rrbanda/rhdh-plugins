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
  type ChatAgent,
  type ChatAgentConfig,
  type AgentLifecycleStage,
  deriveRoleFromTopology,
  normalizeLifecycleStage,
} from '@red-hat-developer-hub/backstage-plugin-augment-common';
import { createWithRoute } from './routeWrapper';
import type { RouteContext } from './types';
import type { AdminConfigService } from '../services/AdminConfigService';
import {
  isProductionStage,
  registerLifecycleRoutes,
} from './lifecycleRouteHelpers';

/**
 * Registers provider-agnostic agent listing and publish/unpublish endpoints.
 * Merges agents from all sources (Kagenti deployed, orchestration config)
 * into a unified catalog with publish-state gating.
 */
export function registerAgentRoutes(
  ctx: RouteContext,
  adminConfig: AdminConfigService,
): void {
  const { router, logger, sendRouteError } = ctx;
  const withRoute = createWithRoute(logger, sendRouteError);

  /**
   * Load the ChatAgentConfig[] array from the chatAgents DB key.
   */
  async function loadChatAgentConfigs(): Promise<ChatAgentConfig[]> {
    const raw = await adminConfig.get('chatAgents');
    if (Array.isArray(raw)) return raw as ChatAgentConfig[];
    return [];
  }

  /**
   * Persist the full ChatAgentConfig[] array back to the chatAgents DB key.
   */
  async function saveChatAgentConfigs(
    configs: ChatAgentConfig[],
    updatedBy: string,
  ): Promise<void> {
    await adminConfig.set('chatAgents', configs, updatedBy);
  }

  /**
   * Read orchestration agents from the 'agents' DB key and map to ChatAgent[].
   * Roles are always derived from topology via deriveRoleFromTopology.
   * Specialists are hidden from the gallery.
   */
  async function loadOrchestrationAgents(): Promise<ChatAgent[]> {
    const raw = await adminConfig.get('agents');
    if (!raw || typeof raw !== 'object') return [];

    const agents: ChatAgent[] = [];
    const agentMap = raw as Record<
      string,
      {
        name?: string;
        instructions?: string;
        model?: string;
        handoffs?: string[];
        asTools?: string[];
      }
    >;
    const defaultAgent = await adminConfig.get('defaultAgent');

    for (const [key, agentCfg] of Object.entries(agentMap)) {
      if (!agentCfg || typeof agentCfg !== 'object') continue;

      const role = deriveRoleFromTopology(key, agentMap);
      if (role === 'specialist') continue;

      agents.push({
        id: key,
        name: agentCfg.name ?? key,
        description: agentCfg.instructions
          ? String(agentCfg.instructions).slice(0, 200)
          : undefined,
        status: 'config',
        isDefault: key === defaultAgent,
        providerType: 'orchestration',
        framework: 'responses-api',
        source: 'orchestration',
        agentRole: role,
      });
    }
    return agents;
  }

  /**
   * Load published workflows as agents (workflow-builder-sourced agents).
   */
  async function loadWorkflowAgents(): Promise<ChatAgent[]> {
    const raw = await adminConfig.get('workflows');
    if (!raw || typeof raw !== 'object') return [];
    const workflows = Array.isArray(raw) ? raw : Object.values(raw);
    return workflows
      .filter((w: Record<string, unknown>) => w && w.id && w.name)
      .map((w: Record<string, unknown>) => ({
        id: w.id as string,
        name: w.name as string,
        description: (w.description as string) || undefined,
        status: (w.status as string) === 'published' ? 'ready' : 'config',
        isDefault: false,
        providerType: 'orchestration',
        framework: 'workflow-builder',
        source: 'orchestration',
      }));
  }

  /**
   * Merge agents from all sources and overlay publish state.
   */
  async function buildUnifiedAgentList(): Promise<{
    agents: ChatAgent[];
    sources: { kagenti: number; orchestration: number };
  }> {
    const provider = ctx.provider;

    const orchProvider = ctx.orchestrationProvider;
    const [
      providerAgents,
      orchAgents,
      orchProviderAgents,
      workflowAgents,
      chatConfigs,
    ] = await Promise.all([
      provider.listAgents ? provider.listAgents() : Promise.resolve([]),
      loadOrchestrationAgents(),
      orchProvider?.listAgents
        ? orchProvider.listAgents()
        : Promise.resolve([]),
      loadWorkflowAgents(),
      loadChatAgentConfigs(),
    ]);

    const configMap = new Map(chatConfigs.map(c => [c.agentId, c]));
    const seen = new Set<string>();
    const merged: ChatAgent[] = [];

    function overlayConfig(agent: ChatAgent, cfg?: ChatAgentConfig): ChatAgent {
      const stage = normalizeLifecycleStage(cfg?.lifecycleStage);
      return {
        ...agent,
        published: isProductionStage(stage),
        lifecycleStage: stage,
        version: cfg?.version ?? 0,
        promotedAt: cfg?.promotedAt,
        promotedBy: cfg?.promotedBy,
      };
    }

    for (const agent of providerAgents) {
      seen.add(agent.id);
      const cfg = configMap.get(agent.id);
      merged.push(
        overlayConfig(
          {
            ...agent,
            source: agent.source ?? 'kagenti',
            namespace: agent.id.includes('/')
              ? agent.id.split('/')[0]
              : undefined,
          },
          cfg,
        ),
      );
    }

    for (const agent of orchAgents) {
      if (seen.has(agent.id)) continue;
      seen.add(agent.id);
      const cfg = configMap.get(agent.id);
      merged.push(overlayConfig(agent, cfg));
    }

    for (const agent of orchProviderAgents) {
      if (seen.has(agent.id)) continue;
      seen.add(agent.id);
      const cfg = configMap.get(agent.id);
      merged.push(overlayConfig(agent, cfg));
    }

    for (const agent of workflowAgents) {
      if (seen.has(agent.id)) continue;
      seen.add(agent.id);
      const cfg = configMap.get(agent.id);
      merged.push(overlayConfig(agent, cfg));
    }

    return {
      agents: merged,
      sources: {
        kagenti: merged.filter(a => a.source !== 'orchestration').length,
        orchestration: merged.filter(a => a.source === 'orchestration').length,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // GET /agents -- unified agent listing
  // ---------------------------------------------------------------------------
  router.get(
    '/agents',
    withRoute('GET /agents', 'Failed to list agents', async (req, res) => {
      const { agents, sources } = await buildUnifiedAgentList();
      const publishedFilter = req.query.published;

      const filtered =
        publishedFilter === 'true'
          ? agents.filter(a => a.published === true)
          : agents;

      res.json({ agents: filtered, sources });
    }),
  );

  // ---------------------------------------------------------------------------
  // Shared lifecycle routes: promote, demote, publish, unpublish
  // ---------------------------------------------------------------------------
  registerLifecycleRoutes(ctx, {
    auditAction: 'agent.lifecycle',
    entityLabel: 'Agent',
    routePrefix: '/agents',
    paramName: 'agentId',
    loadConfigs: loadChatAgentConfigs,
    saveConfigs: saveChatAgentConfigs,
    findConfig: (configs, id) => configs.find(c => c.agentId === id),
    newConfig: (entityId, base) => ({
      agentId: entityId,
      featured: false,
      ...base,
    }),
    onDemoteExisting: existing => {
      existing.featured = false;
    },
  });

  // ---------------------------------------------------------------------------
  // PUT /agents/bulk-publish -- bulk publish/unpublish
  // ---------------------------------------------------------------------------
  router.put(
    '/agents/bulk-publish',
    ctx.requireAdminAccess,
    withRoute(
      'PUT /agents/bulk-publish',
      'Failed to bulk update publish state',
      async (req, res) => {
        const { agentIds, published } = req.body as {
          agentIds: string[];
          published: boolean;
        };
        if (!Array.isArray(agentIds) || typeof published !== 'boolean') {
          res.status(400).json({
            error: 'agentIds (string[]) and published (boolean) required',
          });
          return;
        }

        const userRef = await ctx.getUserRef(req);
        const configs = await loadChatAgentConfigs();
        const configMap = new Map(configs.map(c => [c.agentId, c]));
        const now = new Date().toISOString();
        const targetStage: AgentLifecycleStage = published
          ? 'production'
          : 'staging';

        for (const agentId of agentIds) {
          const existing = configMap.get(agentId);
          if (existing) {
            existing.lifecycleStage = targetStage;
            existing.published = published;
            if (published) {
              existing.visible = true;
              existing.version = (existing.version ?? 0) + 1;
            } else {
              existing.visible = false;
              existing.featured = false;
            }
            existing.promotedAt = now;
            existing.promotedBy = userRef;
          } else {
            const newCfg: ChatAgentConfig = {
              agentId,
              lifecycleStage: targetStage,
              published,
              visible: published,
              featured: false,
              version: published ? 1 : 0,
              promotedAt: now,
              promotedBy: userRef,
            };
            configs.push(newCfg);
            configMap.set(agentId, newCfg);
          }
        }

        await saveChatAgentConfigs(configs, userRef);
        logger.info(
          `Bulk ${published ? 'publish' : 'unpublish'} of ${agentIds.length} agents by ${userRef}`,
        );
        res.json({ success: true, count: agentIds.length, published });
      },
    ),
  );

  // ---------------------------------------------------------------------------
  // PUT /agents/:agentId/config -- update agent display config
  // ---------------------------------------------------------------------------
  router.put(
    '/agents/:agentId/config',
    ctx.requireAdminAccess,
    withRoute(
      'PUT /agents/:agentId/config',
      'Failed to update agent config',
      async (req, res) => {
        const agentId = decodeURIComponent(req.params.agentId);
        const userRef = await ctx.getUserRef(req);
        const patch = req.body as Partial<ChatAgentConfig>;
        const configs = await loadChatAgentConfigs();
        const existing = configs.find(c => c.agentId === agentId);

        if (existing) {
          Object.assign(existing, patch, { agentId });
        } else {
          configs.push({
            agentId,
            published: false,
            visible: false,
            featured: false,
            ...patch,
          });
        }

        await saveChatAgentConfigs(configs, userRef);
        res.json({ success: true, agentId });
      },
    ),
  );
}
