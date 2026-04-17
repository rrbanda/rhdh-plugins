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
import type { LoggerService } from '@backstage/backend-plugin-api';
import type { OciRegistryConfig } from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import type { OciRegistryService } from './OciRegistryService';
import { defaultSkills } from './default-skills';

export interface SeedResult {
  seeded: number;
  skipped: number;
  errors: number;
  durationMs: number;
}

/**
 * Seeds bundled default skills into the OCI publish registry on first startup.
 *
 * Uses the standard OciRegistryService.pushSkill() path -- no shortcuts.
 * Only pushes when the registry has no skills (or forceReseed is set).
 * Individual skill failures are logged but do not abort the batch.
 */
export class DefaultSkillSeeder {
  private readonly logger: LoggerService;
  private readonly ociRegistry: OciRegistryService;
  private readonly publishRegistry: OciRegistryConfig;
  private readonly forceReseed: boolean;

  constructor(options: {
    logger: LoggerService;
    ociRegistry: OciRegistryService;
    publishRegistry: OciRegistryConfig;
    forceReseed?: boolean;
  }) {
    this.logger = options.logger;
    this.ociRegistry = options.ociRegistry;
    this.publishRegistry = options.publishRegistry;
    this.forceReseed = options.forceReseed ?? false;
  }

  async seed(): Promise<SeedResult> {
    const start = Date.now();
    let seeded = 0;
    let skipped = 0;
    let errors = 0;

    this.logger.info(
      `Default skill seeding: ${defaultSkills.length} bundled skills available`,
    );

    const existing = await this.ociRegistry.listSkills(this.publishRegistry.url);

    if (existing.length > 0 && !this.forceReseed) {
      this.logger.info(
        `OCI registry already has ${existing.length} skills -- skipping default seeding`,
      );
      return {
        seeded: 0,
        skipped: defaultSkills.length,
        errors: 0,
        durationMs: Date.now() - start,
      };
    }

    const existingNames = new Set(
      existing.map(s => s.card.metadata.name),
    );

    for (const { card, content } of defaultSkills) {
      if (existingNames.has(card.metadata.name)) {
        skipped++;
        continue;
      }

      try {
        const ref = await this.ociRegistry.pushSkill(
          this.publishRegistry,
          card,
          content,
          card.metadata.version,
          'published',
        );
        this.logger.info(`Seeded: ${card.metadata.name} → ${ref}`);
        seeded++;
      } catch (err) {
        errors++;
        this.logger.warn(
          `Failed to seed ${card.metadata.name}: ${(err as Error).message}`,
        );
      }
    }

    const durationMs = Date.now() - start;
    this.logger.info(
      `Default skill seeding complete in ${durationMs}ms: ` +
      `${seeded} seeded, ${skipped} skipped, ${errors} errors`,
    );

    return { seeded, skipped, errors, durationMs };
  }

  get totalBundled(): number {
    return defaultSkills.length;
  }
}
