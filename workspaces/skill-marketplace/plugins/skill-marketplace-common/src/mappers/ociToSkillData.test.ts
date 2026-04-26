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

import type { Skill, LifecycleState } from '../types';
import { ociToSkillData } from './ociToSkillData';

function makeSkill(
  overrides: Partial<{
    name: string;
    description: string;
    version: string;
    displayName: string;
    tags: string[];
    authors: { name: string; email?: string }[];
    allowedTools: string;
    compatibility: string;
    content: string;
    ociReference: string;
    lifecycleState: LifecycleState;
    wordCount: string;
  }> = {},
): Skill {
  return {
    card: {
      apiVersion: 'skillimage.io/v1alpha1',
      kind: 'SkillCard',
      metadata: {
        name: overrides.name ?? 'test-skill',
        namespace: 'default',
        version: overrides.version ?? '1.0.0',
        description: overrides.description ?? 'A test skill',
        'display-name': overrides.displayName,
        tags: overrides.tags ?? ['test'],
        authors: overrides.authors,
        'allowed-tools': overrides.allowedTools,
        compatibility: overrides.compatibility,
      },
      spec: {},
    },
    content: overrides.content,
    ociReference:
      overrides.ociReference ?? 'registry.example.com/skills/test:1.0.0',
    lifecycleState: overrides.lifecycleState ?? 'published',
    ociAnnotations: overrides.wordCount
      ? { wordCount: overrides.wordCount }
      : undefined,
  };
}

describe('ociToSkillData', () => {
  it('maps basic fields from skill card metadata', () => {
    const skill = makeSkill({
      name: 'my-skill',
      description: 'Does things',
      version: '2.0.0',
    });
    const result = ociToSkillData(skill);

    expect(result.skillName).toBe('my-skill');
    expect(result.name).toBe('my-skill');
    expect(result.description).toBe('Does things');
    expect(result.version).toBe('2.0.0');
    expect(result.gitPath).toBe('registry.example.com/skills/test:1.0.0');
    expect(result.lifecycleState).toBe('published');
  });

  it('generates slug from category and name', () => {
    const skill = makeSkill({ name: 'resume-parser', tags: ['hr', 'resume'] });
    const result = ociToSkillData(skill);
    expect(result.slug).toBe('human-resources-resume-parser');
    expect(result.pluginName).toBe('human-resources');
  });

  it('defaults to general category when no keywords match', () => {
    const skill = makeSkill({
      name: 'random-skill',
      tags: ['misc'],
      description: 'nothing special',
    });
    const result = ociToSkillData(skill);
    expect(result.pluginName).toBe('general');
    expect(result.slug).toBe('general-random-skill');
  });

  it('uses skill content as body when available', () => {
    const content = '# My Skill\n\nDetailed instructions here.';
    const skill = makeSkill({ content });
    const result = ociToSkillData(skill);
    expect(result.body).toBe(content);
    expect(result.rawContent).toBe(content);
  });

  it('synthesizes body from metadata when no content', () => {
    const skill = makeSkill({ name: 'test', description: 'A skill' });
    const result = ociToSkillData(skill);
    expect(result.body).toContain('# test');
    expect(result.body).toContain('A skill');
  });

  it('formats authors string from author array', () => {
    const skill = makeSkill({
      authors: [{ name: 'Alice', email: 'alice@co.com' }, { name: 'Bob' }],
    });
    const result = ociToSkillData(skill);
    expect(result.authors).toBe('Alice <alice@co.com>, Bob');
  });

  it('handles undefined authors', () => {
    const skill = makeSkill();
    const result = ociToSkillData(skill);
    expect(result.authors).toBeUndefined();
  });

  it('extracts word count from OCI annotations', () => {
    const skill = makeSkill({ wordCount: '1500' });
    const result = ociToSkillData(skill);
    expect(result.wordCount).toBe(1500);
  });

  it('returns undefined wordCount for invalid annotation', () => {
    const skill = makeSkill({ wordCount: 'not-a-number' });
    const result = ociToSkillData(skill);
    expect(result.wordCount).toBeUndefined();
  });

  it('picks compatibility from annotations then metadata', () => {
    const skill = makeSkill({ compatibility: 'cursor' });
    (skill as any).ociAnnotations = { compatibility: 'copilot' };
    expect(ociToSkillData(skill).compatibility).toBe('copilot');

    const skill2 = makeSkill({ compatibility: 'cursor' });
    expect(ociToSkillData(skill2).compatibility).toBe('cursor');
  });

  it('includes display name', () => {
    const skill = makeSkill({ displayName: 'My Display Name' });
    const result = ociToSkillData(skill);
    expect(result.displayName).toBe('My Display Name');
  });

  it('parses allowed-tools into plugin tags', () => {
    const skill = makeSkill({ allowedTools: 'tool-a tool-b' });
    const result = ociToSkillData(skill);
    expect(result.plugin.tags).toEqual(['tool-a', 'tool-b']);
  });

  it('creates proper plugin entry', () => {
    const skill = makeSkill({ tags: ['security', 'audit'] });
    const result = ociToSkillData(skill);
    expect(result.plugin.name).toBe('security');
    expect(result.plugin.source).toBe('registry.example.com/skills/test:1.0.0');
    expect(result.plugin.icon).toBe('cube');
    expect(result.plugin.color).toBeTruthy();
  });
});
