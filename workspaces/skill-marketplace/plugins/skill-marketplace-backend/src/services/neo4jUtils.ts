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

const SKIP_KEYS = new Set(['embedding']);

export function toNumber(val: unknown): number {
  if (typeof val === 'number') return val;
  if (val && typeof val === 'object' && 'toNumber' in val) {
    return (val as { toNumber: () => number }).toNumber();
  }
  return Number(val) || 0;
}

export function serializeProps(
  props: Record<string, unknown>,
  options?: { stripKeys?: Set<string> },
): Record<string, unknown> {
  const strip = options?.stripKeys ?? SKIP_KEYS;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (strip.has(key)) continue;
    if (value && typeof value === 'object' && 'toNumber' in value) {
      result[key] = (value as { toNumber: () => number }).toNumber();
    } else if (
      value &&
      typeof value === 'object' &&
      'toString' in value &&
      typeof value.toString === 'function'
    ) {
      result[key] = value.toString();
    } else {
      result[key] = value;
    }
  }
  return result;
}

const ID_KEYS = ['id', 'uid', 'uuid', 'name', 'slug'];
const CAPTION_KEYS = ['label', 'name', 'title', 'caption', 'displayName', 'description'];

export function resolveId(props: Record<string, unknown>, fallbackEid: string): string {
  for (const key of ID_KEYS) {
    if (typeof props[key] === 'string' && props[key]) return props[key] as string;
  }
  return fallbackEid;
}

export function resolveCaption(props: Record<string, unknown>, fallbackLabel: string): string {
  for (const key of CAPTION_KEYS) {
    if (typeof props[key] === 'string' && props[key]) return props[key] as string;
  }
  return fallbackLabel;
}

const LUCENE_SPECIAL = /[+\-&|!(){}[\]^"~*?:\\/]/g;

export function escapeLucene(query: string): string {
  return query.replace(LUCENE_SPECIAL, '\\$&');
}
