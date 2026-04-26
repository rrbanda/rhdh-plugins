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

import type { CatalogSkill } from '../types';
import { catalogToSkillData } from './catalogToSkillData';

function makeCatalogSkill(overrides: Partial<CatalogSkill> = {}): CatalogSkill {
  return {
    repository: 'registry.example.com/skills',
    tag: 'v1.0.0',
    digest: 'sha256:abc123',
    name: 'test-skill',
    namespace: 'engineering',
    version: '1.0.0',
    status: 'published',
    display_name: 'Test Skill',
    description: 'A test skill for unit testing',
    authors: 'Jane Doe <jane@example.com>',
    license: 'Apache-2.0',
    tags_json: '["test","automation"]',
    compatibility: 'cursor,copilot',
    word_count: 500,
    created: '2025-01-15T00:00:00Z',
    bundle: false,
    bundle_skills: '',
    synced_at: '2025-06-01T12:00:00Z',
    ...overrides,
  };
}

describe('catalogToSkillData', () => {
  it('maps all basic fields correctly', () => {
    const cs = makeCatalogSkill();
    const result = catalogToSkillData(cs);

    expect(result.slug).toBe('engineering-test-skill');
    expect(result.pluginName).toBe('engineering');
    expect(result.skillName).toBe('test-skill');
    expect(result.name).toBe('test-skill');
    expect(result.description).toBe('A test skill for unit testing');
    expect(result.version).toBe('1.0.0');
    expect(result.authors).toBe('Jane Doe <jane@example.com>');
    expect(result.displayName).toBe('Test Skill');
    expect(result.wordCount).toBe(500);
    expect(result.compatibility).toBe('cursor,copilot');
    expect(result.license).toBe('Apache-2.0');
    expect(result.created).toBe('2025-01-15T00:00:00Z');
    expect(result.gitPath).toBe('registry.example.com/skills');
  });

  it('generates consistent slug from namespace-name', () => {
    const cs = makeCatalogSkill({ namespace: 'devops', name: 'deploy-helper' });
    expect(catalogToSkillData(cs).slug).toBe('devops-deploy-helper');
  });

  it('validates lifecycleState and defaults to draft for unknown values', () => {
    expect(
      catalogToSkillData(makeCatalogSkill({ status: 'published' }))
        .lifecycleState,
    ).toBe('published');
    expect(
      catalogToSkillData(makeCatalogSkill({ status: 'testing' }))
        .lifecycleState,
    ).toBe('testing');
    expect(
      catalogToSkillData(makeCatalogSkill({ status: 'PUBLISHED' }))
        .lifecycleState,
    ).toBe('published');
    expect(
      catalogToSkillData(makeCatalogSkill({ status: 'unknown-status' }))
        .lifecycleState,
    ).toBe('draft');
    expect(
      catalogToSkillData(makeCatalogSkill({ status: '' })).lifecycleState,
    ).toBe('draft');
  });

  it('parses tags_json correctly', () => {
    const cs = makeCatalogSkill({ tags_json: '["a","b","c"]' });
    expect(catalogToSkillData(cs).tags).toEqual(['a', 'b', 'c']);
  });

  it('handles invalid tags_json gracefully', () => {
    expect(
      catalogToSkillData(makeCatalogSkill({ tags_json: 'not-json' })).tags,
    ).toEqual([]);
    expect(
      catalogToSkillData(makeCatalogSkill({ tags_json: '' })).tags,
    ).toEqual([]);
  });

  it('filters non-string items from tags_json', () => {
    const cs = makeCatalogSkill({
      tags_json: '["valid", 42, null, "also-valid"]',
    });
    expect(catalogToSkillData(cs).tags).toEqual(['valid', 'also-valid']);
  });

  it('populates plugin entry with correct color', () => {
    const result = catalogToSkillData(
      makeCatalogSkill({ namespace: 'engineering' }),
    );
    expect(result.plugin.name).toBe('engineering');
    expect(result.plugin.color).toBeTruthy();
  });

  it('handles bundle skills', () => {
    const cs = makeCatalogSkill({
      bundle: true,
      bundle_skills: 'skill-a, skill-b, skill-c',
    });
    const result = catalogToSkillData(cs);
    expect(result.bundle).toBe(true);
    expect(result.bundleSkills).toEqual(['skill-a', 'skill-b', 'skill-c']);
  });

  it('returns undefined bundleSkills for empty string', () => {
    const cs = makeCatalogSkill({ bundle_skills: '' });
    expect(catalogToSkillData(cs).bundleSkills).toBeUndefined();
  });

  it('includes provenance fields (tag, digest, syncedAt)', () => {
    const cs = makeCatalogSkill();
    const result = catalogToSkillData(cs);
    expect(result.tag).toBe('v1.0.0');
    expect(result.digest).toBe('sha256:abc123');
    expect(result.syncedAt).toBe('2025-06-01T12:00:00Z');
  });

  it('uses humanized name when display_name is empty', () => {
    const cs = makeCatalogSkill({ display_name: '', name: 'my-cool-skill' });
    const result = catalogToSkillData(cs);
    expect(result.displayName).toBe('My Cool Skill');
    expect(result.sections.title).toBe('My Cool Skill');
  });

  it('provides summary placeholders for content fields', () => {
    const result = catalogToSkillData(makeCatalogSkill());
    expect(result.rawContent).toBe('');
    expect(result.body).toBe('A test skill for unit testing');
    expect(result.sections.workflow).toEqual([]);
    expect(result.assets).toEqual({
      references: [],
      templates: [],
      examples: [],
    });
  });

  it('treats empty optional strings as undefined', () => {
    const cs = makeCatalogSkill({
      compatibility: '',
      license: '',
      created: '',
      tag: '',
      digest: '',
      synced_at: '',
    });
    const result = catalogToSkillData(cs);
    expect(result.compatibility).toBeUndefined();
    expect(result.license).toBeUndefined();
    expect(result.created).toBeUndefined();
    expect(result.tag).toBeUndefined();
    expect(result.digest).toBeUndefined();
    expect(result.syncedAt).toBeUndefined();
  });
});
