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
  categoryOf,
  buildCategoryKeywords,
  matchesKeyword,
  DEFAULT_CATEGORY_KEYWORDS,
} from './categories';
import type { Skill } from './types';

function makeSkill(
  name: string,
  opts?: { tags?: string[]; description?: string },
): Pick<Skill, 'card'> {
  return {
    card: {
      apiVersion: 'skillimage.io/v1alpha1',
      kind: 'Skill',
      metadata: {
        name,
        namespace: 'default',
        version: '1.0.0',
        description: opts?.description ?? '',
        tags: opts?.tags ?? [],
      },
      spec: {},
    },
  };
}

describe('matchesKeyword', () => {
  it('matches exact word at start', () => {
    expect(matchesKeyword('test runner tool', 'test')).toBe(true);
  });

  it('matches exact word in middle', () => {
    expect(matchesKeyword('my test tool', 'test')).toBe(true);
  });

  it('matches exact word at end', () => {
    expect(matchesKeyword('runs a test', 'test')).toBe(true);
  });

  it('matches when surrounded by hyphens', () => {
    expect(matchesKeyword('my-test-tool', 'test')).toBe(true);
  });

  it('does not match inside a larger word', () => {
    expect(matchesKeyword('attestation verifier', 'test')).toBe(false);
  });

  it('does not match partial substring', () => {
    expect(matchesKeyword('special operation', 'spec')).toBe(false);
  });

  it('matches hyphenated keywords', () => {
    expect(matchesKeyword('does code-review well', 'code-review')).toBe(true);
  });

  it('matches whole string', () => {
    expect(matchesKeyword('test', 'test')).toBe(true);
  });
});

describe('categoryOf', () => {
  it('classifies by tags first', () => {
    expect(categoryOf(makeSkill('my-skill', { tags: ['resume', 'parser'] }))).toBe('human-resources');
  });

  it('falls back to name + description when no tags match', () => {
    expect(
      categoryOf(makeSkill('docker-deploy', { description: 'Deploys containers using docker' })),
    ).toBe('devops');
  });

  it('returns general when nothing matches', () => {
    expect(categoryOf(makeSkill('generic-thing', { description: 'Does stuff' }))).toBe('general');
  });

  it('detects engineering skills via hyphenated keyword', () => {
    expect(categoryOf(makeSkill('my-tool', { tags: ['code-review'] }))).toBe('engineering');
  });

  it('detects security skills', () => {
    expect(
      categoryOf(makeSkill('vuln-scanner', { description: 'Scans for vulnerability issues' })),
    ).toBe('security');
  });

  it('detects testing skills', () => {
    expect(categoryOf(makeSkill('test-coverage', { tags: ['test', 'coverage'] }))).toBe('testing');
  });

  it('detects docs skills', () => {
    expect(categoryOf(makeSkill('readme-gen', { tags: ['markdown', 'readme'] }))).toBe('docs');
  });

  it('detects api skills', () => {
    expect(categoryOf(makeSkill('openapi-gen', { tags: ['openapi', 'rest-api'] }))).toBe('api');
  });

  it('detects operations skills', () => {
    expect(categoryOf(makeSkill('compliance-check', { tags: ['compliance', 'process'] }))).toBe('operations');
  });

  it('detects research skills', () => {
    expect(categoryOf(makeSkill('doc-analyzer', { tags: ['summary', 'document-analysis'] }))).toBe('research');
  });

  it('accepts custom keyword overrides', () => {
    const custom = buildCategoryKeywords({ 'my-custom': ['xyz'] });
    expect(categoryOf(makeSkill('xyz-tool', { description: 'Uses xyz' }), custom)).toBe('my-custom');
  });

  it('custom overrides replace same-key defaults', () => {
    const custom = buildCategoryKeywords({ docs: ['xyzonly'] });
    const result = categoryOf(makeSkill('markdown-gen'), custom);
    expect(result).not.toBe('docs');
  });

  it('matches are case-insensitive', () => {
    expect(categoryOf(makeSkill('Resume-Parser', { tags: ['RESUME'] }))).toBe('human-resources');
  });

  it('falls through to name+description when tags have no match', () => {
    expect(
      categoryOf(makeSkill('deploy-tool', { tags: ['custom-unrelated'], description: 'uses docker for deploy' })),
    ).toBe('devops');
  });
});

describe('word-boundary matching prevents false positives', () => {
  it('audit only matches security, not operations', () => {
    expect(categoryOf(makeSkill('audit-scanner', { tags: ['audit'] }))).toBe('security');
  });

  it('documentation matches docs, not research', () => {
    expect(categoryOf(makeSkill('doc-writer', { tags: ['documentation'] }))).toBe('docs');
  });

  it('spec does not match inside "special"', () => {
    expect(categoryOf(makeSkill('special-ops', { description: 'A special operations tool' }))).toBe('operations');
  });

  it('test does not match inside "attestation"', () => {
    expect(categoryOf(makeSkill('attestation-tool', { description: 'Generates attestations' }))).toBe('general');
  });

  it('deploy matches devops even in compound words', () => {
    expect(categoryOf(makeSkill('auto-deploy-tool', { description: 'Auto deploy services' }))).toBe('devops');
  });
});

describe('buildCategoryKeywords', () => {
  it('returns defaults when no custom provided', () => {
    expect(buildCategoryKeywords()).toEqual(DEFAULT_CATEGORY_KEYWORDS);
  });

  it('merges custom into defaults', () => {
    const result = buildCategoryKeywords({ 'new-cat': ['foo', 'bar'] });
    const names = result.map(([n]) => n);
    expect(names).toContain('new-cat');
    expect(names).toContain('engineering');
  });

  it('replaces existing category', () => {
    const result = buildCategoryKeywords({ docs: ['onlythis'] });
    const docsEntry = result.find(([n]) => n === 'docs');
    expect(docsEntry?.[1]).toEqual(['onlythis']);
  });
});

describe('category ordering', () => {
  it('first matching category in keyword order wins', () => {
    const skill = makeSkill('hiring-compliance', { tags: ['hiring', 'compliance'] });
    expect(categoryOf(skill)).toBe('human-resources');
  });
});

describe('catalog-graph alignment contract', () => {
  it('same skill gets same category regardless of entry point', () => {
    const skills: Pick<Skill, 'card'>[] = [
      makeSkill('resume-parser', { tags: ['resume', 'hr'] }),
      makeSkill('docker-deploy', { tags: ['docker', 'k8s'] }),
      makeSkill('my-reviewer', { description: 'reviews pull-request changes' }),
      makeSkill('openapi-gen', { tags: ['openapi'] }),
      makeSkill('vuln-scan', { description: 'scans for security vulnerabilities' }),
      makeSkill('test-helper', { tags: ['test', 'mock'] }),
    ];

    const expected = [
      'human-resources',
      'devops',
      'engineering',
      'api',
      'security',
      'testing',
    ];

    skills.forEach((skill, i) => {
      const cat = categoryOf(skill);
      expect(cat).toBe(expected[i]);
    });
  });

  it('custom keywords produce consistent results when passed to both paths', () => {
    const custom = buildCategoryKeywords({ 'ml-ops': ['model', 'training'] });
    const skill = makeSkill('model-trainer', { description: 'Trains ML model' });
    const cat1 = categoryOf(skill, custom);
    const cat2 = categoryOf(skill, custom);
    expect(cat1).toBe('ml-ops');
    expect(cat1).toBe(cat2);
  });
});
