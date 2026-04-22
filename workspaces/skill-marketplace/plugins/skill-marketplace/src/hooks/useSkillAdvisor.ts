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
import { useApi, fetchApiRef } from '@backstage/core-plugin-api';
import { skillMarketplaceApiRef } from '../api';
import type {
  AgenticStreamEvent,
} from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
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
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const candidate = match[1].trim();
      if (candidate.length >= 3 && candidate.length <= 120 && !candidate.includes('\n')) {
        names.add(candidate);
      }
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
  const { fetch: backstageFetch } = useApi(fetchApiRef);
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

      let answer = '';
      const cartContext = currentCartSkills?.length
        ? `\n\nThe user already has these skills in their bundle cart: ${currentCartSkills.join(', ')}. Suggest additional skills that complement these, avoid duplicates.`
        : '';

      try {
        const { url, body, headers } = await api.agenticQueryStreamUrl({
          query: `Based on the skill graph, recommend specific skills for this need: ${query}. List the exact skill names that match.${cartContext}`,
          context: 'skill-advisor-bundle-curation',
        });

        const res = await backstageFetch(url, {
          method: 'POST',
          headers,
          body,
          signal: controller.signal,
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(errText || `HTTP ${res.status}`);
        }

        if (!res.body) throw new Error('No response body');

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let eventType = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (controller.signal.aborted) return;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith('data: ') && eventType) {
              try {
                const event: AgenticStreamEvent = {
                  type: eventType as AgenticStreamEvent['type'],
                  data: JSON.parse(line.slice(6)),
                };
                handleEvent(event);
              } catch {
                /* skip malformed */
              }
              eventType = '';
            }
          }
        }

        if (!controller.signal.aborted) {
          const extracted = extractSkillNames(answer);
          const suggestions = matchToCatalog(extracted, catalogSkills);
          setState(prev => ({
            ...prev,
            status: 'done',
            statusText: '',
            suggestions,
          }));
        }
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

      function handleEvent(event: AgenticStreamEvent) {
        const d = event.data as Record<string, unknown>;
        switch (event.type) {
          case 'thinking':
            setState(prev => ({ ...prev, status: 'thinking', statusText: `Thinking (step ${d.iteration})...` }));
            break;
          case 'tool_call':
            setState(prev => ({ ...prev, status: 'searching', statusText: `Searching: ${friendlyTool(String(d.tool))}...` }));
            break;
          case 'tool_result':
            setState(prev => ({ ...prev, status: 'searching', statusText: `Found results from ${friendlyTool(String(d.tool))}` }));
            break;
          case 'answer':
            answer = String(d.answer);
            setState(prev => ({ ...prev, status: 'answering', statusText: 'Composing recommendations...', answer }));
            break;
          case 'error':
            setState(prev => ({ ...prev, status: 'error', error: String(d.error) }));
            break;
          default:
            break;
        }
      }
    },
    [api, backstageFetch, catalogSkills],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setState(prev => ({ ...prev, status: prev.answer ? 'done' : 'idle', statusText: '' }));
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState(INITIAL_STATE);
  }, []);

  return { ...state, ask, cancel, reset };
}

function friendlyTool(name: string): string {
  const map: Record<string, string> = {
    search_skills_semantic: 'semantic search',
    search_skills_keyword: 'keyword search',
    get_skill_details: 'skill details',
    explore_graph: 'graph exploration',
    query_relationships: 'relationship query',
    list_skills_by_domain: 'domain listing',
    find_gaps: 'gap analysis',
  };
  return map[name] ?? name;
}
