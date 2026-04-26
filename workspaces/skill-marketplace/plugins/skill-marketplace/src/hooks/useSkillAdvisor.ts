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
import { useCallback, useRef, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { skillMarketplaceApiRef } from '../api';
import type { SkillData } from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';

export interface AdvisorSuggestion {
  name: string;
  slug: string;
  category: string;
  description: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface AdvisorState {
  status: 'idle' | 'thinking' | 'searching' | 'answering' | 'done' | 'error';
  statusText: string;
  answer: string;
  suggestions: AdvisorSuggestion[];
  error: string | null;
}

const INITIAL_STATE: AdvisorState = {
  status: 'idle',
  statusText: '',
  answer: '',
  suggestions: [],
  error: null,
};

function extractSkillNames(text: string): string[] {
  const names = new Set<string>();
  const patterns = [
    /\*\*([^*]+)\*\*/g,
    /`([^`]+)`/g,
    /[""]([^""]+)[""]/g,
    /- ([A-Z][\w-]+(?::\s*[\w-]+)?)/g,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null = pattern.exec(text);
    while (match !== null) {
      const candidate = match[1].trim();
      if (
        candidate.length >= 3 &&
        candidate.length <= 120 &&
        !candidate.includes('\n')
      ) {
        names.add(candidate);
      }
      match = pattern.exec(text);
    }
  }
  return Array.from(names);
}

function matchToCatalog(
  extracted: string[],
  catalog: SkillData[],
): AdvisorSuggestion[] {
  const suggestions: AdvisorSuggestion[] = [];
  const seen = new Set<string>();

  for (const name of extracted) {
    const lower = name.toLowerCase();
    const match = catalog.find(s => {
      const sName = s.skillName.toLowerCase();
      const sSlug = s.slug.toLowerCase();
      const sTitle = s.sections.title.toLowerCase();
      return (
        sName === lower ||
        sSlug === lower ||
        sTitle === lower ||
        sName.includes(lower) ||
        lower.includes(sName) ||
        sSlug.includes(lower)
      );
    });

    if (match && !seen.has(match.skillName)) {
      seen.add(match.skillName);
      suggestions.push({
        name: match.skillName,
        slug: match.slug,
        category: match.pluginName,
        description: match.description.slice(0, 200),
        confidence: 'high',
      });
    }
  }
  return suggestions;
}

export function useSkillAdvisor(catalogSkills: SkillData[]) {
  const api = useApi(skillMarketplaceApiRef);
  const [state, setState] = useState<AdvisorState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);

  const ask = useCallback(
    async (query: string, currentCartSkills?: string[]) => {
      if (!query.trim()) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState({
        status: 'thinking',
        statusText: 'Analyzing your request...',
        answer: '',
        suggestions: [],
        error: null,
      });

      const cartContext = currentCartSkills?.length
        ? `\n\nThe user already has these skills in their bundle cart: ${currentCartSkills.join(', ')}. Suggest additional skills that complement these, avoid duplicates.`
        : '';

      try {
        setState(prev => ({
          ...prev,
          status: 'searching',
          statusText: 'Querying Skill Advisor agent...',
        }));

        const { answer } = await api.askSmpAgent(
          'advisor',
          `Based on the skill graph, recommend specific skills for this need: ${query}. List the exact skill names that match.${cartContext}`,
        );

        if (controller.signal.aborted) return;

        setState(prev => ({
          ...prev,
          status: 'answering',
          statusText: 'Composing recommendations...',
          answer,
        }));

        const extracted = extractSkillNames(answer);
        const suggestions = matchToCatalog(extracted, catalogSkills);
        setState(prev => ({
          ...prev,
          status: 'done',
          statusText: '',
          suggestions,
        }));
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setState(prev => ({
          ...prev,
          status: 'error',
          statusText: '',
          error: (err as Error).message || 'Advisor request failed',
        }));
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }
    },
    [api, catalogSkills],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setState(prev => ({
      ...prev,
      status: prev.answer ? 'done' : 'idle',
      statusText: '',
    }));
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState(INITIAL_STATE);
  }, []);

  return { ...state, ask, cancel, reset };
}
