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
import type {
  HttpAuthService,
  LoggerService,
  PermissionsService,
} from '@backstage/backend-plugin-api';
import { skillMarketplaceAccessPermission } from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import type { SmpAgentClient, SmpAgentName } from '../services/SmpAgentClient';
import { requirePermission } from './authUtils';
import { getRequestAbortSignal } from './requestSignal';

function validateMessageBody(
  body: unknown,
):
  | { valid: true; message: string; contextId?: string }
  | { valid: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body is required' };
  }
  const b = body as Record<string, unknown>;
  if (typeof b.message !== 'string' || !b.message.trim()) {
    return {
      valid: false,
      error: 'message is required and must be a non-empty string',
    };
  }
  if (b.message.length > 4000) {
    return {
      valid: false,
      error: 'message exceeds maximum length of 4000 characters',
    };
  }
  return {
    valid: true,
    message: b.message,
    contextId: typeof b.contextId === 'string' ? b.contextId : undefined,
  };
}

function agentEndpoint(
  router: Router,
  path: string,
  createAgentCall: (
    signal: AbortSignal,
  ) => (
    message: string,
    contextId?: string,
  ) => Promise<{ text: string; contextId?: string }>,
  agentLabel: string,
  logger: LoggerService,
  httpAuth?: HttpAuthService,
  permissions?: PermissionsService,
  securityMode?: string,
): void {
  router.post(path, async (req, res) => {
    const allowed = await requirePermission(
      req,
      res,
      skillMarketplaceAccessPermission,
      {
        httpAuth,
        permissions,
        securityMode,
      },
    );
    if (!allowed) return;

    const validation = validateMessageBody(req.body);
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const signal = getRequestAbortSignal(req);
    const agentCall = createAgentCall(signal);
    try {
      const result = await agentCall(validation.message, validation.contextId);
      res.json({
        answer: result.text,
        contextId: result.contextId || validation.contextId || null,
        agent: agentLabel,
      });
    } catch (err) {
      logger.error(`${agentLabel} call failed: ${(err as Error).message}`);
      res.status(502).json({ error: `${agentLabel} unavailable` });
    }
  });
}

export function registerSmpAgentRoutes(
  router: Router,
  smpAgentClient: SmpAgentClient | undefined,
  logger: LoggerService,
  httpAuth?: HttpAuthService,
  permissions?: PermissionsService,
  securityMode?: string,
) {
  if (!smpAgentClient) {
    logger.info('SMP agent routes skipped: smpAgents not configured');
    return;
  }

  const agents: { path: string; name: SmpAgentName; label: string }[] = [
    { path: '/agents/advisor', name: 'skillAdvisor', label: 'Skill Advisor' },
    {
      path: '/agents/validator',
      name: 'bundleValidator',
      label: 'Bundle Validator',
    },
    { path: '/agents/kgqa', name: 'kgQa', label: 'KG Q&A' },
    { path: '/agents/playground', name: 'playground', label: 'Playground' },
    { path: '/agents/builder', name: 'skillBuilder', label: 'Skill Builder' },
  ];

  for (const { path, name, label } of agents) {
    agentEndpoint(
      router,
      path,
      signal => (msg, ctx) => smpAgentClient.chat(name, msg, ctx, signal),
      label,
      logger,
      httpAuth,
      permissions,
      securityMode,
    );
  }

  router.get('/agents/health', async (req, res) => {
    const signal = getRequestAbortSignal(req);
    try {
      const health = await smpAgentClient.checkHealth(signal);
      const allHealthy = Object.values(health).every(
        h => !h.configured || h.healthy,
      );
      res.status(allHealthy ? 200 : 207).json(health);
    } catch (err) {
      logger.error(`Agent health check failed: ${(err as Error).message}`);
      res.status(502).json({ error: 'Health check failed' });
    }
  });

  router.get('/agents/:agent/card', async (req, res) => {
    const signal = getRequestAbortSignal(req);
    const agentName = req.params.agent as SmpAgentName;
    const validNames: SmpAgentName[] = [
      'skillAdvisor',
      'bundleValidator',
      'kgQa',
      'playground',
      'skillBuilder',
    ];
    if (!validNames.includes(agentName)) {
      res.status(400).json({ error: `Unknown agent: ${agentName}` });
      return;
    }
    try {
      const card = await smpAgentClient.getAgentCard(agentName, signal);
      res.json(card);
    } catch (err) {
      logger.error(
        `Agent card fetch failed (${agentName}): ${(err as Error).message}`,
      );
      res
        .status(502)
        .json({ error: `Agent card unavailable for ${agentName}` });
    }
  });
}
