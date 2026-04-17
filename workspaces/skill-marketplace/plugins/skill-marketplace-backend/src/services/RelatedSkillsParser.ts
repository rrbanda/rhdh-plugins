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

export interface ParsedRelatedSkill {
  name: string;
  description?: string;
}

export function parseRelatedSkills(markdown: string): ParsedRelatedSkill[] {
  const results: ParsedRelatedSkill[] = [];
  const sectionMatch = markdown.match(
    /## Related Skills\s*\n([\s\S]*?)(?:\n## |\n$|$)/i,
  );
  if (!sectionMatch) return results;

  const lines = sectionMatch[1].split('\n');
  for (const line of lines) {
    const linkMatch = line.match(
      /[-*]\s*\[([^\]]+)\]\([^)]+\)(?:\s*[—–-]\s*(.+))?/,
    );
    if (linkMatch) {
      const rawName = linkMatch[1].trim();
      const name = rawName.includes(':')
        ? rawName
        : rawName.toLowerCase().replace(/\s+/g, '-');
      results.push({ name, description: linkMatch[2]?.trim() });
    }
  }
  return results;
}
