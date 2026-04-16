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
import type { LoggerService } from '@backstage/backend-plugin-api';
import type { KagentiService } from '../services';
import type { AgentDeployRequest } from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';

export function registerKagentiRoutes(
  router: Router,
  kagenti: KagentiService | undefined,
  logger: LoggerService,
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
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error(`Kagenti listAgents failed: ${message}`);
      res.status(502).json({ error: `Kagenti unavailable: ${message}` });
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
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error(`Kagenti getAgentDetail failed: ${message}`);
      res.status(502).json({ error: `Kagenti unavailable: ${message}` });
    }
  });

  router.post('/kagenti/agents', async (req, res) => {
    if (!kagenti) {
      res.status(503).json({ error: 'Kagenti not configured' });
      return;
    }
    try {
      const deployReq = req.body as AgentDeployRequest;
      if (!deployReq.name || !deployReq.image) {
        res.status(400).json({ error: 'name and image are required' });
        return;
      }
      if (!deployReq.llm?.provider || !deployReq.llm?.model || !deployReq.llm?.baseUrl) {
        res.status(400).json({ error: 'llm.provider, llm.model, and llm.baseUrl are required' });
        return;
      }
      const result = await kagenti.deployAgent(deployReq);
      res.status(result.status).json(result.data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error(`Kagenti deployAgent failed: ${message}`);
      res.status(502).json({ error: `Kagenti unavailable: ${message}` });
    }
  });

  router.delete('/kagenti/agents/:namespace/:name', async (req, res) => {
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
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error(`Kagenti deleteAgent failed: ${message}`);
      res.status(502).json({ error: `Kagenti unavailable: ${message}` });
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
        const message = err instanceof Error ? err.message : 'Unknown error';
        logger.error(`Kagenti getAgentSkills failed: ${message}`);
        res.status(502).json({ error: `Kagenti unavailable: ${message}` });
      }
    },
  );

  router.post(
    '/kagenti/agents/:namespace/:name/skills',
    async (req, res) => {
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
        const message = err instanceof Error ? err.message : 'Unknown error';
        logger.error(`Kagenti assignSkill failed: ${message}`);
        res.status(502).json({ error: `Kagenti unavailable: ${message}` });
      }
    },
  );

  router.delete(
    '/kagenti/agents/:namespace/:name/skills/:skillName',
    async (req, res) => {
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
        const message = err instanceof Error ? err.message : 'Unknown error';
        logger.error(`Kagenti removeSkill failed: ${message}`);
        res.status(502).json({ error: `Kagenti unavailable: ${message}` });
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
        const tail = parseInt(
          (req.query.tail as string) || '100',
          10,
        );
        const result = await kagenti.getAgentLogs(
          req.params.namespace,
          req.params.name,
          tail,
        );
        res.status(result.status).json(result.data);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        logger.error(`Kagenti getAgentLogs failed: ${message}`);
        res.status(502).json({ error: `Kagenti unavailable: ${message}` });
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
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error(`Agent card fetch failed: ${message}`);
      res.status(502).json({ error: `Agent unavailable: ${message}` });
    }
  });

  router.post('/kagenti/chat', async (req, res) => {
    if (!kagenti) {
      res.status(503).json({ error: 'Kagenti not configured' });
      return;
    }
    const { message, sessionId, namespace, agentName } = req.body;
    if (!message) {
      res.status(400).json({ error: 'message is required' });
      return;
    }
    const extractResponse = (data: Record<string, unknown>) => ({
      response:
        (typeof data.content === 'string' ? data.content : undefined) ??
        (typeof data.response === 'string' ? data.response : undefined) ??
        (typeof data.message === 'string' ? data.message : undefined) ??
        JSON.stringify(data),
      session_id: data.session_id ?? data.sessionId,
      is_complete: data.is_complete ?? true,
    });

    try {
      const result = await kagenti.sendA2AMessage(
        message,
        sessionId,
        namespace,
        agentName,
      );
      const data = result.data as Record<string, unknown>;
      res.json(extractResponse(data));
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
          res.status(result.status).json(result.data);
          return;
        }
        const data = result.data as Record<string, unknown>;
        res.json(extractResponse(data));
      } catch (proxyErr) {
        const msg =
          proxyErr instanceof Error ? proxyErr.message : 'Unknown error';
        logger.error(`Kagenti chat failed: ${msg}`);
        res.status(502).json({ error: `Agent unavailable: ${msg}` });
      }
    }
  });

  router.post('/kagenti/stream', async (req, res) => {
    if (!kagenti) {
      res.status(503).json({ error: 'Kagenti not configured' });
      return;
    }
    const { message, sessionId, namespace, agentName } = req.body;
    if (!message) {
      res.status(400).json({ error: 'message is required' });
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
        res.status(upstream.status).send(text);
        return;
      }
      if (!upstream.body) {
        res.status(502).send('No stream body');
        return;
      }
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();
      upstream.body.pipe(res);
      upstream.body.on('error', err => {
        logger.error(`Kagenti SSE stream error: ${err.message}`);
        res.end();
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      logger.error(`Kagenti streamMessage failed: ${msg}`);
      res.status(502).json({ error: `Kagenti unavailable: ${msg}` });
    }
  });
}
