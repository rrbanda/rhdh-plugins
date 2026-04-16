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
import type { OciRegistryConfig } from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import type { BuilderProxyService, OciRegistryService } from '../services';

export function registerBuilderRoutes(
  router: Router,
  builderProxy: BuilderProxyService | undefined,
  logger: LoggerService,
  ociRegistry?: OciRegistryService,
  publishRegistry?: OciRegistryConfig,
) {
  router.post('/builder/publish', async (req, res) => {
    if (!ociRegistry) {
      res.status(503).json({ error: 'OCI registry not configured' });
      return;
    }
    if (!publishRegistry) {
      res.status(503).json({ error: 'OCI publish registry not configured — add skillMarketplace.oci.publishRegistry to app-config.yaml' });
      return;
    }

    const { skillName, version, description, author, content } =
      req.body as {
        skillName: string;
        version: string;
        description: string;
        author: string;
        content: string;
      };

    if (!skillName || !content) {
      res
        .status(400)
        .json({ error: 'skillName and content are required' });
      return;
    }

    const safeName = skillName
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    const skillCard = {
      apiVersion: 'docsclaw.io/v1alpha1',
      kind: 'SkillCard',
      metadata: {
        name: safeName,
        namespace: 'default',
        ref: '',
        version: version || '0.1.0',
        description: description || '',
        author: author || 'skill-marketplace',
      },
      spec: {
        tools: { required: ['exec', 'read_file', 'write_file', 'web_fetch'] },
      },
    };

    try {
      const ociReference = await ociRegistry.pushSkill(
        publishRegistry,
        skillCard,
        content,
        version || undefined,
      );

      skillCard.metadata.ref = ociReference;

      logger.info(
        `Published skill ${safeName} to ${ociReference}`,
      );

      res.json({
        success: true,
        ociReference,
        skillCard,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error(`Failed to publish skill to OCI: ${message}`);
      res.status(502).json({
        error: `Failed to publish skill to OCI registry: ${message}`,
      });
    }
  });
  router.post('/builder', async (req, res) => {
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
        const message = err instanceof Error ? err.message : 'Unknown error';
        res
          .status(502)
          .json({ error: `Failed to reach builder agent: ${message}` });
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
        logger.error(`Builder SSE stream error: ${err.message}`);
        res.end();
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res
        .status(502)
        .json({ error: `Failed to reach builder agent: ${message}` });
    }
  });
}
