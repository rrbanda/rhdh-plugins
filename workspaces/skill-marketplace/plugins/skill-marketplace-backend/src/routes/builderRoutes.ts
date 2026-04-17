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
import type { OciRegistryConfig } from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import {
  skillMarketplaceAdminPermission,
  skillMarketplaceAccessPermission,
} from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import type { BuilderProxyService, OciRegistryService, SkillGraphSyncService } from '../services';
import { validateTypedSkillCard } from '../services/SkillCardValidator';
import { requirePermission } from './authUtils';

export function registerBuilderRoutes(
  router: Router,
  builderProxy: BuilderProxyService | undefined,
  logger: LoggerService,
  ociRegistry?: OciRegistryService,
  publishRegistry?: OciRegistryConfig,
  httpAuth?: HttpAuthService,
  permissions?: PermissionsService,
  syncService?: SkillGraphSyncService,
  securityMode?: string,
) {
  router.post('/builder/publish', async (req, res) => {
    const allowed = await requirePermission(req, res, skillMarketplaceAdminPermission, {
      httpAuth, permissions, securityMode,
    });
    if (!allowed) return;

    if (!ociRegistry) {
      res.status(503).json({ error: 'OCI registry not configured' });
      return;
    }
    if (!publishRegistry) {
      res.status(503).json({ error: 'OCI publish registry not configured — add skillMarketplace.oci.publishRegistry to app-config.yaml' });
      return;
    }

    const { skillName, version, description, author, content } = req.body ?? {};

    if (typeof skillName !== 'string' || !skillName.trim()) {
      res.status(400).json({ error: 'skillName is required and must be a string' });
      return;
    }
    if (typeof content !== 'string' || !content.trim()) {
      res.status(400).json({ error: 'content is required and must be a string' });
      return;
    }

    const safeName = skillName
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    const skillCard = {
      apiVersion: 'skillimage.io/v1alpha1' as const,
      kind: 'SkillCard' as const,
      metadata: {
        name: safeName,
        namespace: 'default',
        version: version || '0.1.0',
        description: description || '',
        authors: [{ name: author || 'skill-marketplace' }],
        'allowed-tools': 'exec read_file write_file web_fetch',
      },
    };

    const validation = validateTypedSkillCard(skillCard);
    if (!validation.valid) {
      res.status(400).json({
        error: 'Constructed SkillCard fails upstream schema validation',
        details: validation.errors,
      });
      return;
    }

    try {
      const ociReference = await ociRegistry.pushSkill(
        publishRegistry,
        skillCard,
        content,
        version || undefined,
      );

      logger.info(
        `Published skill ${safeName} to ${ociReference}`,
      );

      if (syncService) {
        syncService.sync().catch(syncErr =>
          logger.warn(`Post-publish sync failed: ${(syncErr as Error).message}`),
        );
      }

      res.json({
        success: true,
        ociReference,
        skillCard,
      });
    } catch (err) {
      logger.error(`Failed to publish skill to OCI: ${err instanceof Error ? err.message : err}`);
      res.status(502).json({ error: 'Failed to publish skill to OCI registry' });
    }
  });
  router.post('/builder', async (req, res) => {
    const accessAllowed = await requirePermission(req, res, skillMarketplaceAccessPermission, {
      httpAuth, permissions, securityMode,
    });
    if (!accessAllowed) return;

    if (!builderProxy) {
      res.status(503).json({ error: 'Builder agent not configured' });
      return;
    }

    const action = req.query.action as string;
    if (!action || !['generate', 'refine', 'save'].includes(action)) {
      res
        .status(400)
        .json({ error: 'action query param required: generate | refine | save' });
      return;
    }

    if (action === 'save') {
      try {
        const result = await builderProxy.save(req.body);
        res.status(result.status).json(result.data);
      } catch (err) {
        logger.error(`Builder save failed: ${err instanceof Error ? err.message : err}`);
        res.status(502).json({ error: 'Failed to reach builder agent' });
      }
      return;
    }

    try {
      const upstream =
        action === 'generate'
          ? await builderProxy.generate(req.body)
          : await builderProxy.refine(req.body);

      if (!upstream.ok) {
        const text = await upstream.text();
        logger.error(`Builder ${action} upstream error (${upstream.status}): ${text}`);
        res.status(upstream.status).json({ error: `Builder ${action} request failed` });
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

      const keepaliveInterval = setInterval(() => {
        if (!res.writableEnded) {
          res.write(':\n\n');
        }
      }, 15_000);

      const cleanup = () => {
        clearInterval(keepaliveInterval);
      };

      upstream.body.on('end', () => {
        cleanup();
        if (!res.writableEnded) {
          res.write('event: stream_end\ndata: {}\n\n');
          res.end();
        }
      });
      upstream.body.pipe(res, { end: false });
      upstream.body.on('error', err => {
        cleanup();
        logger.error(`Builder SSE stream error: ${err.message}`);
        if (!res.writableEnded) {
          res.write(`event: error\ndata: ${JSON.stringify({ error: 'Stream interrupted' })}\n\n`);
          res.end();
        }
      });
      req.on('close', () => {
        cleanup();
        (upstream.body as unknown as { destroy?: () => void })?.destroy?.();
      });
    } catch (err) {
      logger.error(`Builder stream failed: ${err instanceof Error ? err.message : err}`);
      res.status(502).json({ error: 'Failed to reach builder agent' });
    }
  });
}
