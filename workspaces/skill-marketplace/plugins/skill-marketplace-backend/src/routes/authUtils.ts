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
import type { Request, Response } from 'express';
import type { HttpAuthService, PermissionsService } from '@backstage/backend-plugin-api';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import type { BasicPermission } from '@backstage/plugin-permission-common';

/**
 * Enforce a permission check. When securityMode is not 'none' and auth
 * services are unavailable, the request is rejected with 403 rather than
 * silently allowed.
 *
 * @returns true if the request is authorized (caller should continue),
 *          false if a response has already been sent (caller should return).
 */
export async function requirePermission(
  req: Request,
  res: Response,
  permission: BasicPermission,
  options: {
    httpAuth?: HttpAuthService;
    permissions?: PermissionsService;
    securityMode?: string;
  },
): Promise<boolean> {
  const { httpAuth, permissions, securityMode } = options;

  if (securityMode === 'none') {
    return true;
  }

  if (!httpAuth || !permissions) {
    res.status(403).json({
      error: 'Authentication services unavailable — cannot verify permissions',
    });
    return false;
  }

  const credentials = await httpAuth.credentials(req, { allow: ['user'] });
  const decision = await permissions.authorize(
    [{ permission }],
    { credentials },
  );
  if (decision[0].result !== AuthorizeResult.ALLOW) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return false;
  }
  return true;
}

/**
 * Validates a numeric query/body parameter, returning the parsed integer
 * or a default value. Clamps to [1, max].
 */
export function parseIntParam(
  value: unknown,
  defaultVal: number,
  max: number = Number.MAX_SAFE_INTEGER,
): number {
  if (value === undefined || value === null) return defaultVal;
  const n = parseInt(String(value), 10);
  if (Number.isNaN(n) || n < 1) return defaultVal;
  return Math.min(n, max);
}
