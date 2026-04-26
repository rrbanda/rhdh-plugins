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
import type { KagentiService } from '../services';
import type { SmpAgentClient, SmpAgentName } from '../services/SmpAgentClient';
import type { SkillCatalogService } from '../services/SkillCatalogService';
import type { OciRegistryService } from '../services/OciRegistryService';
import {
  skillMarketplaceAdminPermission,
  skillMarketplaceAccessPermission,
} from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import type { AgentDeployRequest } from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import { requirePermission, parseIntParam } from './authUtils';
import { getRequestAbortSignal } from './requestSignal';

const AGENT_NAME_MAP: Record<string, SmpAgentName> = {
  'skill-advisor': 'skillAdvisor',
  skill_advisor: 'skillAdvisor',
  skilladvisor: 'skillAdvisor',
  'bundle-validator': 'bundleValidator',
  bundle_validator: 'bundleValidator',
  bundlevalidator: 'bundleValidator',
  'kg-qa': 'kgQa',
  kg_qa: 'kgQa',
  kgqa: 'kgQa',
  playground: 'playground',
  'skill-builder': 'skillBuilder',
  skill_builder: 'skillBuilder',
  skillbuilder: 'skillBuilder',
};

function resolveAgentName(
  name: string | undefined,
  logger: LoggerService,
): SmpAgentName {
  if (!name) return 'kgQa';
  const normalized = name.toLowerCase().trim();
  const resolved = AGENT_NAME_MAP[normalized];
  if (!resolved) {
    logger.warn(`Unknown agent name '${name}', defaulting to kgQa`);
    return 'kgQa';
  }
  return resolved;
}

async function resolveSkillContent(
  activeSkill: string,
  catalogService: SkillCatalogService | undefined,
  ociRegistry: OciRegistryService | undefined,
  logger: LoggerService,
): Promise<string | undefined> {
  const parts = activeSkill.split('/');
  if (parts.length === 2 && catalogService) {
    try {
      const skill = await catalogService.getSkill(parts[0], parts[1]);
      const content = await catalogService.getSkillContent(
        parts[0],
        parts[1],
        skill.version,
      );
      if (content) return content;
    } catch {
      logger.debug(
        `Catalog API content fetch for ${activeSkill} failed, trying OCI`,
      );
    }
  }
  if (catalogService) {
    try {
      const result = await catalogService.searchSkills({
        q: activeSkill,
        per_page: 1,
      });
      if (result.data.length > 0) {
        const hit = result.data[0];
        const content = await catalogService.getSkillContent(
          hit.namespace,
          hit.name,
          hit.version,
        );
        if (content) return content;
      }
    } catch {
      logger.debug(`Catalog API search for ${activeSkill} failed`);
    }
  }
  if (ociRegistry) {
    try {
      const skills = await ociRegistry.listSkillsLightweight();
      const match = skills.find(s => s.card.metadata.name === activeSkill);
      if (match) {
        const content = await ociRegistry.getSkillContent(match.ociReference);
        if (content) return content;
      }
    } catch {
      logger.debug(`OCI content fetch for ${activeSkill} failed`);
    }
  }
  return undefined;
}

export function registerKagentiRoutes(
  router: Router,
  kagenti: KagentiService | undefined,
  logger: LoggerService,
  httpAuth?: HttpAuthService,
  permissions?: PermissionsService,
  securityMode?: string,
  smpAgentClient?: SmpAgentClient,
  catalogService?: SkillCatalogService,
  ociRegistry?: OciRegistryService,
) {
  // -----------------------------------------------------------------------
  // Agent CRUD (still via KagentiService — lifecycle management)
  // -----------------------------------------------------------------------

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
      logger.error(
        `Kagenti listAgents failed: ${err instanceof Error ? err.message : err}`,
      );
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
      logger.error(
        `Kagenti getAgentDetail failed: ${err instanceof Error ? err.message : err}`,
      );
      res.status(502).json({ error: 'Kagenti unavailable' });
    }
  });

  router.post('/kagenti/agents', async (req, res) => {
    if (
      !(await requirePermission(req, res, skillMarketplaceAdminPermission, {
        httpAuth,
        permissions,
        securityMode,
      }))
    )
      return;
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
        res
          .status(400)
          .json({ error: 'either containerImage or gitUrl is required' });
        return;
      }
      const result = await kagenti.deployAgent(deployReq);
      res.status(result.status).json(result.data);
    } catch (err) {
      logger.error(
        `Kagenti deployAgent failed: ${err instanceof Error ? err.message : err}`,
      );
      res.status(502).json({ error: 'Kagenti unavailable' });
    }
  });

  router.delete('/kagenti/agents/:namespace/:name', async (req, res) => {
    if (
      !(await requirePermission(req, res, skillMarketplaceAdminPermission, {
        httpAuth,
        permissions,
        securityMode,
      }))
    )
      return;
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
      logger.error(
        `Kagenti deleteAgent failed: ${err instanceof Error ? err.message : err}`,
      );
      res.status(502).json({ error: 'Kagenti unavailable' });
    }
  });

  router.get('/kagenti/agents/:namespace/:name/skills', async (req, res) => {
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
      logger.error(
        `Kagenti getAgentSkills failed: ${err instanceof Error ? err.message : err}`,
      );
      res.status(502).json({ error: 'Kagenti unavailable' });
    }
  });

  router.post('/kagenti/agents/:namespace/:name/skills', async (req, res) => {
    if (
      !(await requirePermission(req, res, skillMarketplaceAdminPermission, {
        httpAuth,
        permissions,
        securityMode,
      }))
    )
      return;
    if (!kagenti) {
      res.status(503).json({ error: 'Kagenti not configured' });
      return;
    }
    try {
      const { skillRef, skillName } = req.body;
      if (!skillRef || !skillName) {
        res.status(400).json({ error: 'skillRef and skillName are required' });
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
      logger.error(
        `Kagenti assignSkill failed: ${err instanceof Error ? err.message : err}`,
      );
      res.status(502).json({ error: 'Kagenti unavailable' });
    }
  });

  router.delete(
    '/kagenti/agents/:namespace/:name/skills/:skillName',
    async (req, res) => {
      if (
        !(await requirePermission(req, res, skillMarketplaceAdminPermission, {
          httpAuth,
          permissions,
          securityMode,
        }))
      )
        return;
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
        logger.error(
          `Kagenti removeSkill failed: ${err instanceof Error ? err.message : err}`,
        );
        res.status(502).json({ error: 'Kagenti unavailable' });
      }
    },
  );

  router.get('/kagenti/agents/:namespace/:name/logs', async (req, res) => {
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
      logger.error(
        `Kagenti getAgentLogs failed: ${err instanceof Error ? err.message : err}`,
      );
      res.status(502).json({ error: 'Kagenti unavailable' });
    }
  });

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
      logger.error(
        `Agent card fetch failed: ${err instanceof Error ? err.message : err}`,
      );
      res.status(502).json({ error: 'Agent unavailable' });
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
      logger.error(
        `Kagenti listNamespaces failed: ${err instanceof Error ? err.message : err}`,
      );
      res.status(502).json({ error: 'Kagenti unavailable' });
    }
  });

  // -----------------------------------------------------------------------
  // Chat (now via SmpAgentClient — A2A calls to external agents)
  // -----------------------------------------------------------------------

  router.post('/kagenti/chat', async (req, res) => {
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
            'SMP agents not configured. Set skillMarketplace.smpAgents URLs.',
        });
      return;
    }
    const { message, sessionId, agentName, activeSkill } = req.body ?? {};
    if (typeof message !== 'string' || !message.trim()) {
      res
        .status(400)
        .json({ error: 'message is required and must be a string' });
      return;
    }

    const agent = resolveAgentName(agentName, logger);

    let enrichedMessage = message;
    let skillContextWarning = '';
    if (typeof activeSkill === 'string' && activeSkill.trim()) {
      const skillContent = await resolveSkillContent(
        activeSkill,
        catalogService,
        ociRegistry,
        logger,
      );
      if (skillContent) {
        enrichedMessage = `[SKILL CONTEXT: ${activeSkill}]\n${skillContent}\n\n[USER MESSAGE]\n${message}`;
      } else {
        skillContextWarning = 'not-found';
        logger.warn(`Skill context not found for: ${activeSkill}`);
      }
    }

    const signal = getRequestAbortSignal(req);
    try {
      const result = await smpAgentClient.chat(
        agent,
        enrichedMessage,
        sessionId,
        signal,
      );
      if (skillContextWarning) {
        res.setHeader('X-Skill-Context-Warning', skillContextWarning);
      }
      res.json({
        content: result.text,
        session_id: result.contextId || sessionId || null,
        is_complete: true,
      });
    } catch (err) {
      logger.error(
        `SMP agent chat failed (${agent}): ${(err as Error).message}`,
      );
      res.status(502).json({ error: 'Agent unavailable' });
    }
  });

  /**
   * EXPERIMENTAL: SSE-based chat endpoint.
   * Currently wraps a single synchronous agent response in SSE format -- not true token streaming.
   * No frontend code calls this endpoint yet.
   * TODO: Implement real token streaming when A2A protocol supports it.
   */
  router.post('/kagenti/stream', async (req, res) => {
    logger.debug(
      'POST /kagenti/stream called (experimental, single-event SSE)',
    );

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
      res.status(503).json({ error: 'SMP agents not configured' });
      return;
    }
    const { message, sessionId, agentName, activeSkill } = req.body ?? {};
    if (typeof message !== 'string' || !message.trim()) {
      res
        .status(400)
        .json({ error: 'message is required and must be a string' });
      return;
    }

    const agent = resolveAgentName(agentName, logger);

    let enrichedMessage = message;
    let skillContextWarning = '';
    if (typeof activeSkill === 'string' && activeSkill.trim()) {
      const skillContent = await resolveSkillContent(
        activeSkill,
        catalogService,
        ociRegistry,
        logger,
      );
      if (skillContent) {
        enrichedMessage = `[SKILL CONTEXT: ${activeSkill}]\n${skillContent}\n\n[USER MESSAGE]\n${message}`;
      } else {
        skillContextWarning = 'not-found';
        logger.warn(`Skill context not found for: ${activeSkill}`);
      }
    }

    if (skillContextWarning) {
      res.setHeader('X-Skill-Context-Warning', skillContextWarning);
    }
    res.setHeader('X-Experimental', 'true');
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const signal = getRequestAbortSignal(req);
    try {
      const result = await smpAgentClient.chat(
        agent,
        enrichedMessage,
        sessionId,
        signal,
      );

      res.write(
        `event: message\ndata: ${JSON.stringify({
          content: result.text,
          session_id: result.contextId || sessionId || null,
          is_complete: true,
        })}\n\n`,
      );
    } catch (err) {
      logger.error(
        `SMP agent stream failed (${agent}): ${(err as Error).message}`,
      );
      res.write(
        `event: error\ndata: ${JSON.stringify({ error: 'Agent unavailable' })}\n\n`,
      );
    } finally {
      res.write('event: stream_end\ndata: {}\n\n');
      res.end();
    }
  });
}
