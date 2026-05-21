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
  type AgentLifecycleStage,
  LIFECYCLE_STAGE_ORDER,
  isValidTransition,
  normalizeLifecycleStage,
} from '@red-hat-developer-hub/backstage-plugin-augment-common';
import { InputError } from '@backstage/errors';
import { createWithRoute } from './routeWrapper';
import type { RouteContext } from './types';
import { AuditLogger, type AuditAction } from '../services/AuditLogger';

export function isValidLifecycleStage(
  stage: unknown,
): stage is AgentLifecycleStage {
  return (
    typeof stage === 'string' &&
    (LIFECYCLE_STAGE_ORDER as readonly string[]).includes(stage)
  );
}

export function isProductionStage(stage: AgentLifecycleStage): boolean {
  return stage === 'production';
}

/**
 * Common lifecycle fields present on both ChatAgentConfig and ChatToolConfig.
 */
interface LifecycleConfigBase {
  published: boolean;
  visible: boolean;
  lifecycleStage?: AgentLifecycleStage;
  version?: number;
  promotedAt?: string;
  promotedBy?: string;
}

/**
 * Describes entity-specific behaviour for lifecycle route registration.
 * Both agent and tool routes implement this interface to share the
 * promote / demote / publish / unpublish logic.
 */
export interface LifecycleRouteDescriptor<TConfig extends LifecycleConfigBase> {
  /** Audit action for lifecycle events, e.g. 'agent.lifecycle' or 'tool.lifecycle' */
  auditAction: AuditAction;
  /** Human-readable label for log messages, e.g. 'Agent' or 'Tool' */
  entityLabel: string;
  /** URL prefix including leading slash, e.g. '/agents' or '/tools' */
  routePrefix: string;
  /** Route parameter name, e.g. 'agentId' or 'toolId' */
  paramName: string;

  loadConfigs(): Promise<TConfig[]>;
  saveConfigs(configs: TConfig[], updatedBy: string): Promise<void>;
  findConfig(configs: TConfig[], entityId: string): TConfig | undefined;

  /**
   * Create a brand-new config entry.
   * The caller supplies lifecycle fields; the implementation adds entity-
   * specific fields such as the ID property and `featured` (agents only).
   */
  newConfig(entityId: string, base: LifecycleConfigBase): TConfig;

  /**
   * Optional extra mutations applied to an existing config on demote
   * when the target stage is not production (e.g. clearing `featured`).
   */
  onDemoteExisting?(existing: TConfig): void;
}

/**
 * Registers the four shared lifecycle routes (promote, demote, publish,
 * unpublish) on the Express router provided via `ctx`.
 */
export function registerLifecycleRoutes<TConfig extends LifecycleConfigBase>(
  ctx: RouteContext,
  descriptor: LifecycleRouteDescriptor<TConfig>,
): void {
  const { router, logger, sendRouteError } = ctx;
  const withRoute = createWithRoute(logger, sendRouteError);
  const audit = new AuditLogger(logger);
  const {
    auditAction,
    entityLabel,
    routePrefix,
    paramName,
    loadConfigs,
    saveConfigs,
    findConfig,
    newConfig,
    onDemoteExisting,
  } = descriptor;

  // ---------------------------------------------------------------------------
  // PUT /:paramName/promote
  // ---------------------------------------------------------------------------
  router.put(
    `${routePrefix}/:${paramName}/promote`,
    withRoute(
      `PUT ${routePrefix}/:${paramName}/promote`,
      `Failed to promote ${entityLabel}`,
      async (req, res) => {
        const entityId = decodeURIComponent(req.params[paramName]);
        const { targetStage } = req.body as { targetStage?: string };
        const resolved = targetStage
          ? normalizeLifecycleStage(targetStage)
          : undefined;
        if (resolved !== undefined && !isValidLifecycleStage(resolved)) {
          throw new InputError(
            `Invalid targetStage "${targetStage}". Must be one of: ${LIFECYCLE_STAGE_ORDER.join(', ')}`,
          );
        }
        const userRef = await ctx.getUserRef(req);
        const configs = await loadConfigs();
        const existing = findConfig(configs, entityId);

        const currentStage = normalizeLifecycleStage(existing?.lifecycleStage);
        const nextStage =
          resolved ??
          (() => {
            const idx = LIFECYCLE_STAGE_ORDER.indexOf(currentStage);
            const nextIdx = Math.min(idx + 1, LIFECYCLE_STAGE_ORDER.length - 2);
            return LIFECYCLE_STAGE_ORDER[nextIdx];
          })();

        if (!isValidTransition(currentStage, nextStage)) {
          throw new InputError(
            `Cannot transition from "${currentStage}" to "${nextStage}". ` +
              `Check available transitions for the current stage.`,
          );
        }

        const isSubmitForReview =
          currentStage === 'draft' && nextStage === 'review';
        if (!isSubmitForReview) {
          const isAdmin = await ctx.checkIsAdmin(req);
          if (!isAdmin) {
            res.status(403).json({
              error:
                'Only admins can perform this lifecycle transition. ' +
                `Non-admin users may only submit draft ${entityLabel.toLowerCase()}s for review.`,
            });
            return;
          }
        }

        const now = new Date().toISOString();
        const isProd = isProductionStage(nextStage);

        if (existing) {
          existing.lifecycleStage = nextStage;
          existing.published = isProd;
          existing.visible = isProd;
          existing.version = (existing.version ?? 0) + 1;
          existing.promotedAt = now;
          existing.promotedBy = userRef;
        } else {
          configs.push(
            newConfig(entityId, {
              lifecycleStage: nextStage,
              published: isProd,
              visible: isProd,
              version: 1,
              promotedAt: now,
              promotedBy: userRef,
            }),
          );
        }

        await saveConfigs(configs, userRef);
        audit.log({
          action: auditAction,
          actor: userRef,
          target: entityId,
          outcome: 'success',
          sourceIp: AuditLogger.extractIp(req),
          meta: {
            from: currentStage,
            to: nextStage,
            direction: 'promote',
            version: existing?.version ?? 1,
          },
        });
        logger.info(
          `${entityLabel} "${entityId}" promoted to ${nextStage} (v${existing?.version ?? 1}) by ${userRef}`,
        );
        res.json({
          success: true,
          [paramName]: entityId,
          lifecycleStage: nextStage,
          version: existing?.version ?? 1,
        });
      },
    ),
  );

  // ---------------------------------------------------------------------------
  // PUT /:paramName/demote
  // ---------------------------------------------------------------------------
  router.put(
    `${routePrefix}/:${paramName}/demote`,
    ctx.requireAdminAccess,
    withRoute(
      `PUT ${routePrefix}/:${paramName}/demote`,
      `Failed to demote ${entityLabel}`,
      async (req, res) => {
        const entityId = decodeURIComponent(req.params[paramName]);
        const { targetStage } = req.body as { targetStage?: string };
        const resolved = targetStage
          ? normalizeLifecycleStage(targetStage)
          : undefined;
        if (resolved !== undefined && !isValidLifecycleStage(resolved)) {
          throw new InputError(
            `Invalid targetStage "${targetStage}". Must be one of: ${LIFECYCLE_STAGE_ORDER.join(', ')}`,
          );
        }
        const userRef = await ctx.getUserRef(req);
        const configs = await loadConfigs();
        const existing = findConfig(configs, entityId);

        const currentStage = normalizeLifecycleStage(existing?.lifecycleStage);
        const nextStage =
          resolved ??
          (() => {
            const idx = LIFECYCLE_STAGE_ORDER.indexOf(currentStage);
            return LIFECYCLE_STAGE_ORDER[Math.max(idx - 1, 0)];
          })();

        if (!isValidTransition(currentStage, nextStage)) {
          throw new InputError(
            `Cannot transition from "${currentStage}" to "${nextStage}". ` +
              `Check available transitions for the current stage.`,
          );
        }

        const now = new Date().toISOString();
        const isProd = isProductionStage(nextStage);

        if (existing) {
          existing.lifecycleStage = nextStage;
          existing.published = isProd;
          if (!isProd) {
            existing.visible = false;
            onDemoteExisting?.(existing);
          }
          existing.promotedAt = now;
          existing.promotedBy = userRef;
        } else {
          configs.push(
            newConfig(entityId, {
              lifecycleStage: nextStage,
              published: false,
              visible: false,
              promotedAt: now,
              promotedBy: userRef,
            }),
          );
        }

        await saveConfigs(configs, userRef);
        audit.log({
          action: auditAction,
          actor: userRef,
          target: entityId,
          outcome: 'success',
          sourceIp: AuditLogger.extractIp(req),
          meta: { from: currentStage, to: nextStage, direction: 'demote' },
        });
        logger.info(
          `${entityLabel} "${entityId}" demoted to ${nextStage} by ${userRef}`,
        );
        res.json({
          success: true,
          [paramName]: entityId,
          lifecycleStage: nextStage,
        });
      },
    ),
  );

  // ---------------------------------------------------------------------------
  // PUT /:paramName/publish -- shortcut: promote to production
  // ---------------------------------------------------------------------------
  router.put(
    `${routePrefix}/:${paramName}/publish`,
    ctx.requireAdminAccess,
    withRoute(
      `PUT ${routePrefix}/:${paramName}/publish`,
      `Failed to publish ${entityLabel}`,
      async (req, res) => {
        const entityId = decodeURIComponent(req.params[paramName]);
        const userRef = await ctx.getUserRef(req);
        const configs = await loadConfigs();
        const existing = findConfig(configs, entityId);
        const now = new Date().toISOString();

        if (existing) {
          existing.lifecycleStage = 'production';
          existing.published = true;
          existing.visible = true;
          existing.version = (existing.version ?? 0) + 1;
          existing.promotedAt = now;
          existing.promotedBy = userRef;
        } else {
          configs.push(
            newConfig(entityId, {
              lifecycleStage: 'production',
              published: true,
              visible: true,
              version: 1,
              promotedAt: now,
              promotedBy: userRef,
            }),
          );
        }

        await saveConfigs(configs, userRef);
        audit.log({
          action: auditAction,
          actor: userRef,
          target: entityId,
          outcome: 'success',
          sourceIp: AuditLogger.extractIp(req),
          meta: { to: 'production', direction: 'publish' },
        });
        logger.info(`${entityLabel} "${entityId}" published by ${userRef}`);
        res.json({
          success: true,
          [paramName]: entityId,
          published: true,
        });
      },
    ),
  );

  // ---------------------------------------------------------------------------
  // PUT /:paramName/unpublish -- move from production to staging
  // ---------------------------------------------------------------------------
  router.put(
    `${routePrefix}/:${paramName}/unpublish`,
    ctx.requireAdminAccess,
    withRoute(
      `PUT ${routePrefix}/:${paramName}/unpublish`,
      `Failed to unpublish ${entityLabel}`,
      async (req, res) => {
        const entityId = decodeURIComponent(req.params[paramName]);
        const userRef = await ctx.getUserRef(req);
        const configs = await loadConfigs();
        const existing = findConfig(configs, entityId);
        const now = new Date().toISOString();

        if (existing) {
          existing.lifecycleStage = 'staging';
          existing.published = false;
          existing.visible = false;
          existing.promotedAt = now;
          existing.promotedBy = userRef;
        } else {
          configs.push(
            newConfig(entityId, {
              lifecycleStage: 'staging',
              published: false,
              visible: false,
              promotedAt: now,
              promotedBy: userRef,
            }),
          );
        }

        await saveConfigs(configs, userRef);
        audit.log({
          action: auditAction,
          actor: userRef,
          target: entityId,
          outcome: 'success',
          sourceIp: AuditLogger.extractIp(req),
          meta: { to: 'staging', direction: 'unpublish' },
        });
        logger.info(`${entityLabel} "${entityId}" unpublished by ${userRef}`);
        res.json({
          success: true,
          [paramName]: entityId,
          published: false,
        });
      },
    ),
  );
}
