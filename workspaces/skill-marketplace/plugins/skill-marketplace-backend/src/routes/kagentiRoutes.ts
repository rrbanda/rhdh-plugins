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
import type { KagentiService } from '../services';
import { skillMarketplaceAdminPermission } from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import type { AgentDeployRequest } from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import { requirePermission, parseIntParam } from './authUtils';

export function registerKagentiRoutes(
  router: Router,
  kagenti: KagentiService | undefined,
  logger: LoggerService,
  httpAuth?: HttpAuthService,
  permissions?: PermissionsService,
  securityMode?: string,
) {
  router.get('/kagenti/agents', async (req, res) => {
    if (!kagenti) {
      res.status(503).json({ error: 'Kagenti not configured' });
      return;
    }
    try {
      const ns = (req.query.namespace as string) || undefined;
      const result = await kagenti.listAgents(ns);
      res.status(result.status).json(result.data);
    } catch (err) {
      logger.error(`Kagenti listAgents failed: ${err instanceof Error ? err.message : err}`);
      res.status(502).json({ error: 'Kagenti unavailable' });
    }
  });

  router.get('/kagenti/agents/:namespace/:name', async (req, res) => {
    if (!kagenti) {
      res.status(503).json({ error: 'Kagenti not configured' });
      return;
    }
    try {
      const result = await kagenti.getAgentDetail(
        req.params.namespace,
        req.params.name,
      );
      res.status(result.status).json(result.data);
    } catch (err) {
      logger.error(`Kagenti getAgentDetail failed: ${err instanceof Error ? err.message : err}`);
      res.status(502).json({ error: 'Kagenti unavailable' });
    }
  });

  router.post('/kagenti/agents', async (req, res) => {
    if (!(await requirePermission(req, res, skillMarketplaceAdminPermission, { httpAuth, permissions, securityMode }))) return;
    if (!kagenti) {
      res.status(503).json({ error: 'Kagenti not configured' });
      return;
    }
    try {
      const deployReq = req.body as AgentDeployRequest;
      if (!deployReq.name || !deployReq.namespace) {
        res.status(400).json({ error: 'name and namespace are required' });
        return;
      }
      if (!deployReq.containerImage && !deployReq.gitUrl) {
        res.status(400).json({ error: 'either containerImage or gitUrl is required' });
        return;
      }
      const result = await kagenti.deployAgent(deployReq);
      res.status(result.status).json(result.data);
    } catch (err) {
      logger.error(`Kagenti deployAgent failed: ${err instanceof Error ? err.message : err}`);
      res.status(502).json({ error: 'Kagenti unavailable' });
    }
  });

  router.delete('/kagenti/agents/:namespace/:name', async (req, res) => {
    if (!(await requirePermission(req, res, skillMarketplaceAdminPermission, { httpAuth, permissions, securityMode }))) return;
    if (!kagenti) {
      res.status(503).json({ error: 'Kagenti not configured' });
      return;
    }
    try {
      const result = await kagenti.deleteAgent(
        req.params.namespace,
        req.params.name,
      );
      res.status(result.status).json(result.data);
    } catch (err) {
      logger.error(`Kagenti deleteAgent failed: ${err instanceof Error ? err.message : err}`);
      res.status(502).json({ error: 'Kagenti unavailable' });
    }
  });

  router.get(
    '/kagenti/agents/:namespace/:name/skills',
    async (req, res) => {
      if (!kagenti) {
        res.status(503).json({ error: 'Kagenti not configured' });
        return;
      }
      try {
        const result = await kagenti.getAgentSkills(
          req.params.namespace,
          req.params.name,
        );
        res.status(result.status).json(result.data);
      } catch (err) {
      logger.error(`Kagenti getAgentSkills failed: ${err instanceof Error ? err.message : err}`);
      res.status(502).json({ error: 'Kagenti unavailable' });
      }
    },
  );

  router.post(
    '/kagenti/agents/:namespace/:name/skills',
    async (req, res) => {
      if (!(await requirePermission(req, res, skillMarketplaceAdminPermission, { httpAuth, permissions, securityMode }))) return;
      if (!kagenti) {
        res.status(503).json({ error: 'Kagenti not configured' });
        return;
      }
      try {
        const { skillRef, skillName } = req.body;
        if (!skillRef || !skillName) {
          res
            .status(400)
            .json({ error: 'skillRef and skillName are required' });
          return;
        }
        const result = await kagenti.assignSkill(
          req.params.namespace,
          req.params.name,
          skillRef,
          skillName,
        );
        res.status(result.status).json(result.data);
      } catch (err) {
      logger.error(`Kagenti assignSkill failed: ${err instanceof Error ? err.message : err}`);
      res.status(502).json({ error: 'Kagenti unavailable' });
      }
    },
  );

  router.delete(
    '/kagenti/agents/:namespace/:name/skills/:skillName',
    async (req, res) => {
      if (!(await requirePermission(req, res, skillMarketplaceAdminPermission, { httpAuth, permissions, securityMode }))) return;
      if (!kagenti) {
        res.status(503).json({ error: 'Kagenti not configured' });
        return;
      }
      try {
        const result = await kagenti.removeSkill(
          req.params.namespace,
          req.params.name,
          req.params.skillName,
        );
        res.status(result.status).json(result.data);
      } catch (err) {
      logger.error(`Kagenti removeSkill failed: ${err instanceof Error ? err.message : err}`);
      res.status(502).json({ error: 'Kagenti unavailable' });
      }
    },
  );

  router.get(
    '/kagenti/agents/:namespace/:name/logs',
    async (req, res) => {
      if (!kagenti) {
        res.status(503).json({ error: 'Kagenti not configured' });
        return;
      }
      try {
        const tail = parseIntParam(req.query.tail, 100, 10000);
        const result = await kagenti.getAgentLogs(
          req.params.namespace,
          req.params.name,
          tail,
        );
        res.status(result.status).json(result.data);
      } catch (err) {
      logger.error(`Kagenti getAgentLogs failed: ${err instanceof Error ? err.message : err}`);
      res.status(502).json({ error: 'Kagenti unavailable' });
      }
    },
  );

  router.get('/kagenti/agent-card', async (req, res) => {
    if (!kagenti) {
      res.status(503).json({ error: 'Kagenti not configured' });
      return;
    }
    try {
      const ns = (req.query.namespace as string) || undefined;
      const agent = (req.query.agent as string) || undefined;
      const result = await kagenti.getAgentCard(ns, agent);
      res.status(result.status).json(result.data);
    } catch (err) {
      logger.error(`Agent card fetch failed: ${err instanceof Error ? err.message : err}`);
      res.status(502).json({ error: 'Agent unavailable' });
    }
  });

  router.post('/kagenti/chat', async (req, res) => {
    if (!kagenti) {
      res.status(503).json({ error: 'Kagenti not configured' });
      return;
    }
    const { message, sessionId, namespace, agentName } = req.body ?? {};
    if (typeof message !== 'string' || !message.trim()) {
      res.status(400).json({ error: 'message is required and must be a string' });
      return;
    }

    const normalizeResponse = (data: Record<string, unknown>) => ({
      content:
        (typeof data.content === 'string' ? data.content : undefined) ??
        (typeof data.response === 'string' ? data.response : undefined) ??
        (typeof data.message === 'string' ? data.message : undefined) ??
        JSON.stringify(data),
      session_id: (data.session_id ?? data.sessionId ?? null) as string | null,
      is_complete: (data.is_complete ?? true) as boolean,
    });

    try {
      const result = await kagenti.sendA2AMessage(
        message,
        sessionId,
        namespace,
        agentName,
      );
      const data = result.data as Record<string, unknown>;
      res.json(normalizeResponse(data));
    } catch (directErr) {
      logger.warn(
        `Direct A2A failed, falling back to Kagenti proxy: ${
          directErr instanceof Error ? directErr.message : directErr
        }`,
      );
      try {
        const result = await kagenti.sendMessage(
          message,
          sessionId,
          namespace,
          agentName,
        );
        if (result.status >= 400) {
          logger.error(`Kagenti chat proxy error (${result.status})`);
          res.status(result.status).json({ error: 'Agent chat request failed' });
          return;
        }
        const data = result.data as Record<string, unknown>;
        res.json(normalizeResponse(data));
      } catch (proxyErr) {
        logger.error(`Kagenti chat failed: ${proxyErr instanceof Error ? proxyErr.message : proxyErr}`);
        res.status(502).json({ error: 'Agent unavailable' });
      }
    }
  });

  router.post('/kagenti/stream', async (req, res) => {
    if (!kagenti) {
      res.status(503).json({ error: 'Kagenti not configured' });
      return;
    }
    const { message, sessionId, namespace, agentName } = req.body ?? {};
    if (typeof message !== 'string' || !message.trim()) {
      res.status(400).json({ error: 'message is required and must be a string' });
      return;
    }
    try {
      const upstream = await kagenti.streamMessage(
        message,
        sessionId,
        namespace,
        agentName,
      );
      if (!upstream.ok) {
        const text = await upstream.text();
        logger.error(`Kagenti stream upstream error (${upstream.status}): ${text}`);
        res.status(upstream.status).json({ error: 'Agent stream request failed' });
        return;
      }
      if (!upstream.body) {
        res.status(502).json({ error: 'No stream body' });
        return;
      }
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      const KEEPALIVE_MS = 15_000;
      const keepalive = setInterval(() => {
        if (!res.writableEnded) {
          res.write(': keepalive\n\n');
        }
      }, KEEPALIVE_MS);

      upstream.body.pipe(res, { end: false });
      upstream.body.on('end', () => {
        clearInterval(keepalive);
        if (!res.writableEnded) {
          res.write('event: stream_end\ndata: {}\n\n');
          res.end();
        }
      });
      upstream.body.on('error', err => {
        clearInterval(keepalive);
        logger.error(`Kagenti SSE stream error: ${err.message}`);
        if (!res.writableEnded) {
          res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
          res.end();
        }
      });
      req.on('close', () => {
        clearInterval(keepalive);
        (upstream.body as unknown as { destroy?: () => void })?.destroy?.();
      });
    } catch (err) {
      logger.error(`Kagenti streamMessage failed: ${err instanceof Error ? err.message : err}`);
      res.status(502).json({ error: 'Kagenti unavailable' });
    }
  });

  router.get('/kagenti/namespaces', async (_req, res) => {
    if (!kagenti) {
      res.status(503).json({ error: 'Kagenti not configured' });
      return;
    }
    try {
      const result = await kagenti.listNamespaces();
      res.status(result.status).json(result.data);
    } catch (err) {
      logger.error(`Kagenti listNamespaces failed: ${err instanceof Error ? err.message : err}`);
      res.status(502).json({ error: 'Kagenti unavailable' });
    }
  });
}
