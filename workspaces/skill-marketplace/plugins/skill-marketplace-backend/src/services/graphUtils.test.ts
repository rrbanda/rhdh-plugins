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
import type { Skill } from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import {
  categoriesOf,
  normalizeName,
  computeSkillCompleteness,
  computeAgentCompleteness,
  computeCapabilityCompleteness,
  contentHash,
} from './graphUtils';

function makeSkill(overrides?: Record<string, unknown>): Skill {
  const m = (overrides || {}) as Record<string, any>;
  return {
    card: {
      apiVersion: 'skills.redhat.com/v1alpha1',
      kind: 'Skill',
      skill_version: '0.0.1',
      metadata: {
        name: m.name ?? 'test-skill',
        namespace: m.namespace ?? 'default',
        description: m.description ?? '',
        tags: m.tags ?? [],
        version: m.version ?? '0.0.0',
        authors: m.authors,
        license: m.license,
        'display-name': m['display-name'],
        'allowed-tools': m['allowed-tools'],
        compatibility: m.compatibility,
      },
      spec: {
        prompt: m.prompt,
        examples: m.examples,
        dependencies: m.dependencies,
      },
      provenance: m.provenance,
    },
    ociReference: 'oci://test/test-skill:latest',
  } as unknown as Skill;
}

// ---------------------------------------------------------------------------
// categoriesOf
// ---------------------------------------------------------------------------

const DEFAULT_KEYWORDS: [string, string[]][] = [
  ['security', ['security', 'vulnerability', 'cve']],
  ['devops', ['docker', 'kubernetes', 'helm']],
  ['testing', ['test', 'coverage', 'mock']],
  ['engineering', ['code', 'review', 'lint']],
];

describe('categoriesOf', () => {
  it('returns exact tag match as primary domain', () => {
    const skill = makeSkill({ tags: ['security', 'devops'] });
    const result = categoriesOf(skill, DEFAULT_KEYWORDS);
    expect(result).toEqual([
      { domain: 'security', primary: true },
      { domain: 'devops', primary: false },
    ]);
  });

  it('falls back to keyword scoring when no tags match domain names', () => {
    const skill = makeSkill({
      name: 'docker-deploy',
      description: 'Deploy containers with kubernetes',
      tags: ['containers'],
    });
    const result = categoriesOf(skill, DEFAULT_KEYWORDS);
    expect(result[0].domain).toBe('devops');
    expect(result[0].primary).toBe(true);
  });

  it('returns general when no keywords match', () => {
    const skill = makeSkill({ name: 'something-random', description: 'no keywords here' });
    const result = categoriesOf(skill, DEFAULT_KEYWORDS);
    expect(result).toEqual([{ domain: 'general', primary: true }]);
  });

  it('returns multiple domains when keyword scores are close', () => {
    const skill = makeSkill({
      name: 'security-test-scanner',
      description: 'test security vulnerability coverage',
    });
    const result = categoriesOf(skill, DEFAULT_KEYWORDS);
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result.filter(c => c.primary)).toHaveLength(1);
  });

  it('uses domain taxonomy names for exact tag matching', () => {
    const taxonomy = { 'cloud-security': { description: 'Cloud sec' } };
    const skill = makeSkill({ tags: ['cloud-security'] });
    const result = categoriesOf(skill, DEFAULT_KEYWORDS, taxonomy);
    expect(result).toEqual([{ domain: 'cloud-security', primary: true }]);
  });
});

// ---------------------------------------------------------------------------
// normalizeName
// ---------------------------------------------------------------------------

describe('normalizeName', () => {
  it('lowercases and strips separators', () => {
    expect(normalizeName('Code-Review')).toBe('codereview');
  });

  it('strips trailing "skill" suffix', () => {
    expect(normalizeName('code-review-skill')).toBe('codereview');
  });

  it('strips trailing "tool" suffix', () => {
    expect(normalizeName('api-tool')).toBe('api');
  });

  it('normalizes underscores and spaces', () => {
    expect(normalizeName('code_review_tool')).toBe('codereview');
  });

  it('produces same output for equivalent names', () => {
    expect(normalizeName('code-review')).toBe(normalizeName('code_review'));
    expect(normalizeName('CodeReview')).toBe(normalizeName('code-review'));
  });

  it('handles empty string', () => {
    expect(normalizeName('')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// computeSkillCompleteness
// ---------------------------------------------------------------------------

describe('computeSkillCompleteness', () => {
  it('returns 1.0 for a fully complete skill', () => {
    const skill = makeSkill({
      description: 'A detailed description that is longer than thirty characters for scoring',
      tags: ['tag1', 'tag2'],
      prompt: 'A prompt with enough content to pass the threshold',
      examples: [{ input: 'test', output: 'test' }],
      authors: [{ name: 'Author One' }],
      license: 'Apache-2.0',
      version: '1.0.0',
      'display-name': 'Test Skill',
      dependencies: [],
      'allowed-tools': 'kubectl',
      provenance: { source: 'github', commit: 'abc123' },
    });
    expect(computeSkillCompleteness(skill, true)).toBe(1.0);
  });

  it('returns ~0 for a minimal skill', () => {
    const skill = makeSkill({});
    const score = computeSkillCompleteness(skill, false);
    expect(score).toBeLessThan(0.1);
  });

  it('gives partial credit for partial fields', () => {
    const skill = makeSkill({
      description: 'A detailed description with enough content here for scoring',
      tags: ['tag1', 'tag2'],
      version: '1.0.0',
    });
    const score = computeSkillCompleteness(skill, false);
    expect(score).toBeGreaterThanOrEqual(0.35);
    expect(score).toBeLessThan(0.60);
  });
});

// ---------------------------------------------------------------------------
// computeAgentCompleteness
// ---------------------------------------------------------------------------

describe('computeAgentCompleteness', () => {
  it('returns 1.0 for a fully complete agent', () => {
    const agent = {
      name: 'test-agent',
      namespace: 'default',
      status: 'running',
      description: 'A test agent for unit testing',
      workloadType: 'Deployment',
      labels: { framework: 'langchain', protocol: ['a2a'] },
      agentCard: {
        name: 'test-agent',
        description: 'A test agent for unit testing purposes',
        url: 'https://agent.example.com',
        version: '1.0.0',
        provider: { organization: 'TestOrg', url: 'https://testorg.com' },
        documentationUrl: 'https://docs.example.com',
        skills: [{ id: 'skill-1', name: 'Test Skill' }],
        authentication: { schemes: ['bearer'] },
        capabilities: { streaming: true, pushNotifications: false, stateTransitionHistory: false },
        defaultInputModes: ['text/plain'],
        defaultOutputModes: ['text/plain'],
      },
    };
    expect(computeAgentCompleteness(agent)).toBe(1.0);
  });

  it('returns low score for agent with no card', () => {
    const agent = {
      name: 'bare-agent',
      namespace: 'default',
      status: 'running',
      description: '',
      workloadType: 'Deployment',
      labels: { framework: '', protocol: [] },
    };
    expect(computeAgentCompleteness(agent)).toBeLessThan(0.1);
  });
});

// ---------------------------------------------------------------------------
// computeCapabilityCompleteness
// ---------------------------------------------------------------------------

describe('computeCapabilityCompleteness', () => {
  it('returns 1.0 for a fully complete capability', () => {
    const cap = {
      description: 'A capability with a good description length',
      tags: ['tag1', 'tag2'],
      examples: ['example prompt'],
      inputModes: ['text/plain'],
      outputModes: ['text/plain'],
    };
    expect(computeCapabilityCompleteness(cap)).toBe(1.0);
  });

  it('returns 0 for an empty capability', () => {
    expect(computeCapabilityCompleteness({})).toBe(0);
  });

  it('gives partial credit', () => {
    const cap = {
      description: 'A capability with a good description',
      tags: ['one'],
    };
    const score = computeCapabilityCompleteness(cap);
    expect(score).toBeGreaterThanOrEqual(0.3);
    expect(score).toBeLessThan(0.6);
  });
});

// ---------------------------------------------------------------------------
// contentHash
// ---------------------------------------------------------------------------

describe('contentHash', () => {
  it('produces deterministic output', () => {
    const skill = makeSkill({ name: 'test-skill' });
    const h1 = contentHash(skill, 'some content');
    const h2 = contentHash(skill, 'some content');
    expect(h1).toBe(h2);
  });

  it('changes when content changes', () => {
    const skill = makeSkill({ name: 'test-skill' });
    const h1 = contentHash(skill, 'content-a');
    const h2 = contentHash(skill, 'content-b');
    expect(h1).not.toBe(h2);
  });

  it('changes when skill metadata changes', () => {
    const s1 = makeSkill({ name: 'skill-a' });
    const s2 = makeSkill({ name: 'skill-b' });
    expect(contentHash(s1)).not.toBe(contentHash(s2));
  });

  it('returns a 16-char hex string', () => {
    const skill = makeSkill({ name: 'test' });
    const h = contentHash(skill);
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });
});
