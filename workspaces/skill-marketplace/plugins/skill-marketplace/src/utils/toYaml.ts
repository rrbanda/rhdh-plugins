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
/** Serialize a value to YAML without external dependencies. */
export function toYaml(obj: unknown, indent = 0): string {
  const prefix = '  '.repeat(indent);
  if (obj === null || obj === undefined) return 'null';
  if (typeof obj === 'string') {
    return obj.includes('\n')
      ? `|\n${obj
          .split('\n')
          .map(l => `${prefix}  ${l}`)
          .join('\n')}`
      : JSON.stringify(obj);
  }
  if (typeof obj === 'number' || typeof obj === 'boolean') return String(obj);
  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';
    return obj
      .map(item => {
        if (typeof item === 'object' && item !== null) {
          const inner = toYaml(item, indent + 1);
          const lines = inner.split('\n');
          return `${prefix}- ${lines[0]!.trim()}\n${lines
            .slice(1)
            .map(l => `${prefix}  ${l.trimStart()}`)
            .join('\n')}`;
        }
        return `${prefix}- ${toYaml(item)}`;
      })
      .join('\n');
  }
  if (typeof obj === 'object') {
    const entries = Object.entries(obj as Record<string, unknown>);
    if (entries.length === 0) return '{}';
    return entries
      .map(([key, value]) => {
        if (
          typeof value === 'object' &&
          value !== null &&
          !Array.isArray(value)
        ) {
          return `${prefix}${key}:\n${toYaml(value, indent + 1)}`;
        }
        if (Array.isArray(value) && value.length > 0) {
          return `${prefix}${key}:\n${toYaml(value, indent + 1)}`;
        }
        return `${prefix}${key}: ${toYaml(value)}`;
      })
      .join('\n');
  }
  return String(obj);
}
