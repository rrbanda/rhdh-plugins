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
import type { OciRegistryConfig } from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import {
  skillMarketplaceAdminPermission,
  skillMarketplaceAccessPermission,
} from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import type { OciRegistryService, SkillGraphSyncService } from '../services';
import type { SmpAgentClient } from '../services/SmpAgentClient';
import { validateTypedSkillCard } from '../services/SkillCardValidator';
import { requirePermission } from './authUtils';
import { getRequestAbortSignal } from './requestSignal';
import { invalidateCatalogCache } from './skillsRoutes';

export function registerBuilderRoutes(
  router: Router,
  smpAgentClient: SmpAgentClient | undefined,
  logger: LoggerService,
  ociRegistry?: OciRegistryService,
  publishRegistry?: OciRegistryConfig,
  httpAuth?: HttpAuthService,
  permissions?: PermissionsService,
  syncService?: SkillGraphSyncService,
  securityMode?: string,
) {
  router.post('/builder/publish', async (req, res) => {
    const allowed = await requirePermission(
      req,
      res,
      skillMarketplaceAdminPermission,
      {
        httpAuth,
        permissions,
        securityMode,
      },
    );
    if (!allowed) return;

    if (!ociRegistry) {
      res.status(503).json({ error: 'OCI registry not configured' });
      return;
    }
    if (!publishRegistry) {
      res
        .status(503)
        .json({
          error:
            'OCI publish registry not configured — add skillMarketplace.oci.publishRegistry to app-config.yaml',
        });
      return;
    }

    const { skillName, version, description, author, content } = req.body ?? {};

    if (typeof skillName !== 'string' || !skillName.trim()) {
      res
        .status(400)
        .json({ error: 'skillName is required and must be a string' });
      return;
    }
    if (typeof content !== 'string' || !content.trim()) {
      res
        .status(400)
        .json({ error: 'content is required and must be a string' });
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

      logger.info(`Published skill ${safeName} to ${ociReference}`);

      invalidateCatalogCache();

      if (syncService) {
        const syncSignal = getRequestAbortSignal(req);
        syncService
          .sync({ signal: syncSignal })
          .catch(syncErr =>
            logger.warn(
              `Post-publish sync failed: ${(syncErr as Error).message}`,
            ),
          );
      }

      res.json({
        success: true,
        ociReference,
        skillCard,
      });
    } catch (err) {
      logger.error(
        `Failed to publish skill to OCI: ${err instanceof Error ? err.message : err}`,
      );
      res
        .status(502)
        .json({ error: 'Failed to publish skill to OCI registry' });
    }
  });

  router.post('/builder', async (req, res) => {
    const accessAllowed = await requirePermission(
      req,
      res,
      skillMarketplaceAccessPermission,
      {
        httpAuth,
        permissions,
        securityMode,
      },
    );
    if (!accessAllowed) return;

    if (!smpAgentClient) {
      res
        .status(503)
        .json({
          error:
            'Skill Builder agent not configured. Set skillMarketplace.smpAgents.skillBuilderUrl.',
        });
      return;
    }

    const action = req.query.action as string;
    if (!action || !['generate', 'refine'].includes(action)) {
      res
        .status(400)
        .json({ error: 'action query param required: generate | refine' });
      return;
    }

    const {
      prompt,
      currentSkill,
      feedback,
      context_id: contextIdBody,
    } = req.body ?? {};
    if (typeof prompt !== 'string' || !prompt.trim()) {
      res.status(400).json({ error: 'prompt is required' });
      return;
    }

    const fullPrompt =
      action === 'refine' && currentSkill
        ? `Refine this skill based on the following feedback.\n\nCurrent skill:\n${currentSkill}\n\nFeedback: ${feedback || prompt}`
        : prompt;

    const contextId =
      typeof contextIdBody === 'string' && contextIdBody.trim()
        ? contextIdBody
        : undefined;

    const signal = getRequestAbortSignal(req);
    try {
      const answer = await smpAgentClient.buildSkill(
        fullPrompt,
        contextId,
        signal,
      );

      res.json({
        content: answer,
        action,
      });
    } catch (err) {
      logger.error(`Builder ${action} failed: ${(err as Error).message}`);
      res.status(502).json({ error: `Skill Builder ${action} failed` });
    }
  });
}
