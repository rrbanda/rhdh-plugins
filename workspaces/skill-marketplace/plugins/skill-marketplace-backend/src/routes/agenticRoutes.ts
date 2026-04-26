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
import type { AgenticQuery } from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import type { SmpAgentClient } from '../services/SmpAgentClient';
import { requirePermission } from './authUtils';
import { getRequestAbortSignal } from './requestSignal';

const MAX_QUERY_LENGTH = 2000;

function validateAgenticBody(
  body: unknown,
): { valid: true; parsed: AgenticQuery } | { valid: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body is required' };
  }
  const b = body as Record<string, unknown>;

  if (!b.query || typeof b.query !== 'string') {
    return { valid: false, error: 'query is required and must be a string' };
  }
  if (b.query.length > MAX_QUERY_LENGTH) {
    return {
      valid: false,
      error: `query exceeds maximum length of ${MAX_QUERY_LENGTH}`,
    };
  }

  const parsed: AgenticQuery = { query: b.query };

  if (b.context !== undefined) {
    if (typeof b.context !== 'string')
      return { valid: false, error: 'context must be a string' };
    parsed.context = b.context;
  }
  if (b.sessionId !== undefined) {
    if (typeof b.sessionId !== 'string')
      return { valid: false, error: 'sessionId must be a string' };
    parsed.sessionId = b.sessionId;
  }
  return { valid: true, parsed };
}

export function registerAgenticRoutes(
  router: Router,
  logger: LoggerService,
  smpAgentClient?: SmpAgentClient,
  httpAuth?: HttpAuthService,
  permissions?: PermissionsService,
  securityMode?: string,
) {
  // Deprecated: proxies to canonical /agents/kgqa. Kept for backward compat.
  router.post('/graph/agentic-rag', async (req, res) => {
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

    if (!smpAgentClient) {
      res
        .status(503)
        .json({
          error:
            'SMP KG Q&A agent not configured. Set skillMarketplace.smpAgents.kgQaUrl.',
        });
      return;
    }

    const validation = validateAgenticBody(req.body);
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    res.setHeader('X-Deprecated', 'Use POST /agents/kgqa instead');

    const signal = getRequestAbortSignal(req);
    try {
      const { query, context, sessionId } = validation.parsed;
      const prompt = context ? `${query}\n\nContext: ${context}` : query;
      const answer = await smpAgentClient.askKgQa(prompt, sessionId, signal);
      res.json({ answer, query: validation.parsed.query });
    } catch (err) {
      logger.error(`KG Q&A agent call failed: ${(err as Error).message}`);
      res.status(502).json({ error: 'KG Q&A query failed' });
    }
  });
}
