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

import type { ParsedSections, WorkflowStep, RelatedSkill } from './types';

interface MarkdownSection {
  heading: string;
  level: number;
  body: string;
}

const WHEN_TO_USE_PATTERNS = [
  /^when\s+to\s+use/i,
  /^activation$/i,
  /^use\s+cases?$/i,
  /^triggers?$/i,
];

const PREREQUISITES_PATTERNS = [
  /^prerequisites?/i,
  /^requirements?$/i,
  /^before\s+you\s+(begin|start)$/i,
  /^setup$/i,
];

const CRITICAL_RULES_PATTERNS = [
  /^rules?$/i,
  /^critical\s+rules?$/i,
  /^important\s+rules?$/i,
  /^constraints?$/i,
  /^rules?\s+and\s+constraints?$/i,
  /^guardrails?$/i,
  /^safety\s+requirements?$/i,
];

const WORKFLOW_PATTERNS = [
  /^(instructions?|workflows?|steps|process|procedure|implementation)$/i,
  /^(core\s+concepts?|how\s+it\s+works|approach|methodology)$/i,
  /^(evaluation\s+approaches|practical\s+guidance)$/i,
  /^.*steps$/i,
  /^.*instructions$/i,
  /^.*workflows?/i,
];

const RELATED_PATTERNS = [
  /^related\s+(skills?|sdks?|resources?|packages?|files?)$/i,
  /^see\s+also$/i,
  /^related$/i,
];

function matchesAny(heading: string, patterns: RegExp[]): boolean {
  const cleaned = heading.replace(/[#*_`]/g, '').trim();
  return patterns.some(p => p.test(cleaned));
}

/**
 * Split markdown into sections by headings, preserving hierarchy.
 * Only splits on ## (level 2) headings to keep sub-sections intact.
 */
function splitIntoSections(content: string): MarkdownSection[] {
  const lines = content.split('\n');
  const sections: MarkdownSection[] = [];
  let currentHeading = '';
  let currentLevel = 0;
  let currentBody: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch && headingMatch[1].length <= 2) {
      if (currentHeading || currentBody.length > 0) {
        sections.push({
          heading: currentHeading,
          level: currentLevel,
          body: currentBody.join('\n').trim(),
        });
      }
      currentHeading = headingMatch[2].trim();
      currentLevel = headingMatch[1].length;
      currentBody = [];
    } else {
      currentBody.push(line);
    }
  }

  if (currentHeading || currentBody.length > 0) {
    sections.push({
      heading: currentHeading,
      level: currentLevel,
      body: currentBody.join('\n').trim(),
    });
  }

  return sections;
}

/**
 * Extract a list of items from markdown body text.
 * Handles bullet lists (-, *), numbered lists (1.), and plain lines.
 */
function extractListItems(body: string): string[] {
  const items: string[] = [];
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const listMatch = trimmed.match(/^[-*]\s+(.+)$/) ??
      trimmed.match(/^\d+[.)]\s+(.+)$/) ??
      trimmed.match(/^>\s*[-*]\s+(.+)$/);

    if (listMatch) {
      items.push(listMatch[1].replace(/\*\*/g, '').trim());
    }
  }
  return items;
}

/**
 * Extract numbered workflow steps from a section body.
 * Recognizes patterns like:
 *   1. **Step Title** - description
 *   1. **Step Title**: description
 *   1. Step Title
 *   ### Step Title\n body
 */
function extractWorkflowSteps(body: string): WorkflowStep[] {
  const steps: WorkflowStep[] = [];

  const subHeadingPattern = /^###\s+(.+)$/;
  const numberedPattern = /^\d+[.)]\s+\*{0,2}(.+?)\*{0,2}\s*[-:–]?\s*(.*)/;
  const boldStepPattern = /^\*{2}(.+?)\*{2}\s*[-:–]?\s*(.*)/;

  const lines = body.split('\n');
  let stepNum = 0;
  let pendingTitle: string | null = null;
  let pendingContent: string[] = [];

  const flushPending = () => {
    if (pendingTitle) {
      stepNum++;
      steps.push({
        step: stepNum,
        title: pendingTitle,
        content: pendingContent.join(' ').trim(),
      });
      pendingTitle = null;
      pendingContent = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();

    const subMatch = trimmed.match(subHeadingPattern);
    if (subMatch) {
      flushPending();
      pendingTitle = subMatch[1].replace(/\*\*/g, '').trim();
      continue;
    }

    const numMatch = trimmed.match(numberedPattern);
    if (numMatch) {
      flushPending();
      pendingTitle = numMatch[1].replace(/\*\*/g, '').trim();
      if (numMatch[2]) pendingContent.push(numMatch[2].trim());
      continue;
    }

    if (!pendingTitle) {
      const boldMatch = trimmed.match(boldStepPattern);
      if (boldMatch) {
        flushPending();
        pendingTitle = boldMatch[1].trim();
        if (boldMatch[2]) pendingContent.push(boldMatch[2].trim());
        continue;
      }
    }

    if (pendingTitle && trimmed) {
      pendingContent.push(trimmed);
    }
  }

  flushPending();
  return steps;
}

/**
 * Extract related skill references from markdown links or list items.
 * Handles `[skill-name](path)` and plain `- skill-name` patterns.
 */
function extractRelatedSkills(body: string): RelatedSkill[] {
  const skills: RelatedSkill[] = [];
  const seen = new Set<string>();

  const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  let linkMatch;
  while ((linkMatch = linkPattern.exec(body)) !== null) {
    const name = linkMatch[1].trim();
    const path = linkMatch[2].trim();
    if (!seen.has(name)) {
      seen.add(name);
      skills.push({ name, path, slug: name.replace(/[:/]/g, '-'), description: '' });
    }
  }

  if (skills.length === 0) {
    for (const item of extractListItems(body)) {
      const name = item.replace(/\*\*/g, '').trim();
      if (name && !seen.has(name)) {
        seen.add(name);
        skills.push({ name, path: name, slug: name.replace(/[:/]/g, '-'), description: '' });
      }
    }
  }

  return skills;
}

/**
 * Strip optional YAML frontmatter (delimited by ---) from the beginning of content.
 */
function stripFrontmatter(content: string): string {
  if (!content.startsWith('---')) return content;
  const endIdx = content.indexOf('---', 3);
  if (endIdx === -1) return content;
  return content.slice(endIdx + 3).trim();
}

/**
 * Parse skill markdown content into structured sections.
 *
 * Handles the diverse SKILL.md formats found in OCI registries:
 * - Standard markdown with ## headings
 * - YAML frontmatter
 * - Numbered/bulleted workflow steps
 * - Sub-headings within sections
 *
 * @public
 */
export function parseSkillContent(content: string): ParsedSections {
  if (!content || !content.trim()) {
    return { title: '', workflow: [], relatedSkills: [] };
  }

  const cleaned = stripFrontmatter(content);
  const mdSections = splitIntoSections(cleaned);

  let title = '';
  let whenToUse: string | undefined;
  const prerequisites: string[] = [];
  const criticalRules: string[] = [];
  let workflow: WorkflowStep[] = [];
  const relatedSkills: RelatedSkill[] = [];

  for (const section of mdSections) {
    if (section.level === 1 && !title) {
      title = section.heading;
      continue;
    }

    if (section.level === 0 && !title && section.body) {
      const firstLine = section.body.split('\n')[0]?.trim();
      if (firstLine?.startsWith('# ')) {
        title = firstLine.replace(/^#\s+/, '');
      }
      continue;
    }

    if (matchesAny(section.heading, WHEN_TO_USE_PATTERNS)) {
      whenToUse = section.body.replace(/^(Activate this skill when[^:\n]*:|Use this skill when[^:\n]*:)/im, '').trim();
      continue;
    }

    if (matchesAny(section.heading, PREREQUISITES_PATTERNS)) {
      prerequisites.push(...extractListItems(section.body));
      if (prerequisites.length === 0 && section.body.trim()) {
        prerequisites.push(section.body.trim());
      }
      continue;
    }

    if (matchesAny(section.heading, CRITICAL_RULES_PATTERNS)) {
      criticalRules.push(...extractListItems(section.body));
      if (criticalRules.length === 0 && section.body.trim()) {
        criticalRules.push(section.body.trim());
      }
      continue;
    }

    if (matchesAny(section.heading, RELATED_PATTERNS)) {
      relatedSkills.push(...extractRelatedSkills(section.body));
      continue;
    }

    if (workflow.length === 0 && matchesAny(section.heading, WORKFLOW_PATTERNS)) {
      workflow = extractWorkflowSteps(section.body);
      continue;
    }
  }

  if (workflow.length === 0) {
    for (const section of mdSections) {
      if (section.level === 2 && section.body) {
        const steps = extractWorkflowSteps(section.body);
        if (steps.length >= 2) {
          workflow = steps;
          break;
        }
      }
    }
  }

  return {
    title,
    whenToUse,
    prerequisites: prerequisites.length > 0 ? prerequisites : undefined,
    criticalRules: criticalRules.length > 0 ? criticalRules : undefined,
    workflow,
    relatedSkills,
  };
}
