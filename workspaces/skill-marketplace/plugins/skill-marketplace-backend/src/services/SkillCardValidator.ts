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
import Ajv2020 from 'ajv/dist/2020';
import type { SkillCard } from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';

/**
 * Upstream skillimage.io/v1alpha1 SkillCard JSON Schema.
 * Source: https://skillimage.io/schemas/skillcard-v1.json
 */
const SKILLCARD_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://skillimage.io/schemas/skillcard-v1.json',
  title: 'SkillCard',
  description: 'Schema for AI agent skill metadata',
  type: 'object',
  required: ['apiVersion', 'kind', 'metadata'],
  additionalProperties: false,
  properties: {
    apiVersion: {
      type: 'string',
      const: 'skillimage.io/v1alpha1',
    },
    kind: {
      type: 'string',
      const: 'SkillCard',
    },
    metadata: {
      type: 'object',
      required: ['name', 'namespace', 'version', 'description'],
      additionalProperties: false,
      properties: {
        name: {
          type: 'string',
          minLength: 1,
          maxLength: 64,
          pattern: '^[a-z0-9]+(-[a-z0-9]+)*$',
        },
        namespace: {
          type: 'string',
          minLength: 1,
          maxLength: 128,
          pattern: '^[a-z0-9]+(-[a-z0-9]+)*(/[a-z0-9]+(-[a-z0-9]+)*)*$',
        },
        version: {
          type: 'string',
          minLength: 1,
        },
        description: {
          type: 'string',
          minLength: 1,
        },
        'display-name': {
          type: 'string',
          minLength: 1,
          maxLength: 128,
        },
        license: {
          type: 'string',
        },
        compatibility: {
          type: 'string',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
        },
        authors: {
          type: 'array',
          items: {
            type: 'object',
            required: ['name'],
            additionalProperties: false,
            properties: {
              name: { type: 'string', minLength: 1 },
              email: { type: 'string' },
            },
          },
        },
        'allowed-tools': {
          type: 'string',
        },
      },
    },
    provenance: {
      type: 'object',
      additionalProperties: false,
      properties: {
        source: { type: 'string' },
        commit: { type: 'string' },
        path: { type: 'string' },
      },
    },
    spec: {
      type: 'object',
      additionalProperties: false,
      properties: {
        prompt: { type: 'string' },
        examples: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              input: { type: 'string' },
              output: { type: 'string' },
            },
          },
        },
        dependencies: {
          type: 'array',
          items: {
            type: 'object',
            required: ['name', 'version'],
            additionalProperties: false,
            properties: {
              name: { type: 'string' },
              version: { type: 'string' },
            },
          },
        },
      },
    },
  },
} as const;

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

const ajv = new Ajv2020({ allErrors: true });
const validate = ajv.compile(SKILLCARD_SCHEMA);

/**
 * Validate a SkillCard against the upstream skillimage.io/v1alpha1 JSON Schema.
 */
export function validateSkillCard(data: unknown): ValidationResult {
  const valid = validate(data);
  if (valid) {
    return { valid: true };
  }

  const errors = (validate.errors ?? []).map(err => {
    const path = err.instancePath || '/';
    return `${path}: ${err.message ?? 'unknown error'}`;
  });

  return { valid: false, errors };
}

/**
 * Validate a typed SkillCard. Strips `undefined` properties before validation
 * since JSON Schema does not distinguish between missing and undefined.
 */
export function validateTypedSkillCard(card: SkillCard): ValidationResult {
  return validateSkillCard(JSON.parse(JSON.stringify(card)));
}
