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
import type { HttpAuthService, LoggerService, PermissionsService } from '@backstage/backend-plugin-api';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import {
  skillMarketplaceAccessPermission,
} from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import type { AgenticQuery } from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import type { AgenticRagService } from '../services/AgenticRagService';

const MAX_QUERY_LENGTH = 2000;

function validateAgenticBody(body: unknown): { valid: true; parsed: AgenticQuery } | { valid: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body is required' };
  }
  const b = body as Record<string, unknown>;

  if (!b.query || typeof b.query !== 'string') {
    return { valid: false, error: 'query is required and must be a string' };
  }
  if (b.query.length > MAX_QUERY_LENGTH) {
    return { valid: false, error: `query exceeds maximum length of ${MAX_QUERY_LENGTH}` };
  }

  const parsed: AgenticQuery = { query: b.query };

  if (b.context !== undefined) {
    if (typeof b.context !== 'string') return { valid: false, error: 'context must be a string' };
    parsed.context = b.context;
  }
  if (b.sessionId !== undefined) {
    if (typeof b.sessionId !== 'string') return { valid: false, error: 'sessionId must be a string' };
    parsed.sessionId = b.sessionId;
  }
  if (b.maxIterations !== undefined) {
    const n = Number(b.maxIterations);
    if (!Number.isFinite(n) || n < 1 || n > 10) {
      return { valid: false, error: 'maxIterations must be between 1 and 10' };
    }
    parsed.maxIterations = n;
  }

  return { valid: true, parsed };
}

export function registerAgenticRoutes(
  router: Router,
  logger: LoggerService,
  agenticService?: AgenticRagService,
  httpAuth?: HttpAuthService,
  permissions?: PermissionsService,
) {
  router.post('/graph/agentic-rag', async (req, res) => {
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

    if (!agenticService) {
      res.status(503).json({ error: 'Agentic GraphRAG not configured. Ensure graph.agent and graph.embeddingApiUrl are set.' });
      return;
    }

    const validation = validateAgenticBody(req.body);
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    try {
      const result = await agenticService.query(validation.parsed);
      res.json(result);
    } catch (err) {
      logger.error(`Agentic query failed: ${(err as Error).message}`);
      res.status(500).json({ error: 'Agentic query failed' });
    }
  });

  router.post('/graph/agentic-rag/stream', async (req, res) => {
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

    if (!agenticService) {
      res.status(503).json({ error: 'Agentic GraphRAG not configured' });
      return;
    }

    const validation = validateAgenticBody(req.body);
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    try {
      for await (const event of agenticService.queryStream(validation.parsed)) {
        res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);

        if ('flush' in res && typeof (res as any).flush === 'function') {
          (res as any).flush();
        }
      }
    } catch (err) {
      logger.error(`Agentic stream failed: ${(err as Error).message}`);
      res.write(`event: error\ndata: ${JSON.stringify({ error: 'Stream failed' })}\n\n`);
    } finally {
      res.end();
    }
  });
}
