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
import {
  skillMarketplaceAdminPermission,
  isValidLifecycleTransition,
} from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import type {
  LifecycleState,
} from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import type { OciRegistryService } from '../services';
import { requirePermission } from './authUtils';

const VALID_STATES: LifecycleState[] = [
  'draft',
  'testing',
  'published',
  'deprecated',
  'archived',
];

export function registerLifecycleRoutes(
  router: Router,
  logger: LoggerService,
  ociRegistry?: OciRegistryService,
  httpAuth?: HttpAuthService,
  permissions?: PermissionsService,
  securityMode?: string,
) {
  router.get('/oci/lifecycle/:ref', async (req, res) => {
    if (!ociRegistry) {
      res.status(503).json({ error: 'OCI registry not configured' });
      return;
    }

    const ref = req.params.ref;
    if (!ref) {
      res.status(400).json({ error: 'ref parameter is required' });
      return;
    }

    try {
      const skill = await ociRegistry.getSkill(ref);
      if (!skill) {
        res.status(404).json({ error: 'Skill not found' });
        return;
      }

      res.json({
        ref,
        lifecycleState: skill.lifecycleState || 'draft',
        version: skill.card.metadata.version,
        name: skill.card.metadata.name,
      });
    } catch (err) {
      logger.error(
        `GET /oci/lifecycle failed: ${err instanceof Error ? err.message : err}`,
      );
      res
        .status(502)
        .json({ error: 'Failed to fetch lifecycle state from OCI registry' });
    }
  });

  router.post('/oci/promote', async (req, res) => {
    const allowed = await requirePermission(req, res, skillMarketplaceAdminPermission, {
      httpAuth, permissions, securityMode,
    });
    if (!allowed) return;

    if (!ociRegistry) {
      res.status(503).json({ error: 'OCI registry not configured' });
      return;
    }

    const { ociRef, targetState } = req.body ?? {};

    if (typeof ociRef !== 'string' || !ociRef.trim()) {
      res
        .status(400)
        .json({ error: 'ociRef is required and must be a non-empty string' });
      return;
    }
    if (!VALID_STATES.includes(targetState)) {
      res.status(400).json({
        error: `targetState must be one of: ${VALID_STATES.join(', ')}`,
      });
      return;
    }

    try {
      const skill = await ociRegistry.getSkill(ociRef);
      if (!skill) {
        res.status(404).json({ error: 'Skill not found' });
        return;
      }

      const currentState: LifecycleState = skill.lifecycleState || 'draft';

      if (!isValidLifecycleTransition(currentState, targetState)) {
        res.status(409).json({
          error: `Invalid lifecycle transition: ${currentState} → ${targetState}`,
          currentState,
          targetState,
        });
        return;
      }

      const content = await ociRegistry.getSkillContent(ociRef);

      const version = skill.card.metadata.version || '0.1.0';
      const newTag =
        targetState === 'published'
          ? version
          : `${version}-${targetState}`;

      const registries = ociRegistry.getRegistries();
      const baseRegistry = registries.find(r => ociRef.startsWith(r.url));
      if (!baseRegistry) {
        res.status(400).json({
          error: 'Cannot determine base registry for this skill reference',
        });
        return;
      }

      const newRef = await ociRegistry.pushSkill(
        baseRegistry,
        skill.card,
        content || '',
        newTag,
        targetState,
      );

      logger.info(
        `Promoted skill ${skill.card.metadata.name}: ${currentState} → ${targetState} (${newRef})`,
      );

      res.json({
        success: true,
        previousState: currentState,
        newState: targetState,
        newOciRef: newRef,
        tag: newTag,
      });
    } catch (err) {
      logger.error(
        `POST /oci/promote failed: ${err instanceof Error ? err.message : err}`,
      );
      res
        .status(502)
        .json({ error: 'Failed to promote skill lifecycle state' });
    }
  });
}
