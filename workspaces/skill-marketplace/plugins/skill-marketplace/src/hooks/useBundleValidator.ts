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

export type ValidationSeverity = 'success' | 'warning' | 'info' | 'error';

export interface ValidationFinding {
  severity: ValidationSeverity;
  title: string;
  detail: string;
}

export interface ValidationState {
  status: 'idle' | 'validating' | 'done' | 'error';
  statusText: string;
  findings: ValidationFinding[];
  summary: string;
  error: string | null;
}

const INITIAL_STATE: ValidationState = {
  status: 'idle',
  statusText: '',
  findings: [],
  summary: '',
  error: null,
};

function parseFindings(text: string): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const lines = text.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length < 5) continue;

    let severity: ValidationSeverity = 'info';
    let content = trimmed;

    if (/^[-*]\s/.test(content)) {
      content = content.replace(/^[-*]\s+/, '');
    }

    const lower = content.toLowerCase();
    if (
      lower.includes('missing') ||
      lower.includes('gap') ||
      lower.includes('need') ||
      lower.includes('require')
    ) {
      severity = 'warning';
    } else if (
      lower.includes('redundant') ||
      lower.includes('overlap') ||
      lower.includes('duplicate') ||
      lower.includes('conflict')
    ) {
      severity = 'error';
    } else if (
      lower.includes('good') ||
      lower.includes('complete') ||
      lower.includes('well') ||
      lower.includes('strong') ||
      lower.includes('covers')
    ) {
      severity = 'success';
    }

    const colonIdx = content.indexOf(':');
    if (colonIdx > 0 && colonIdx < 60) {
      findings.push({
        severity,
        title: content.slice(0, colonIdx).trim(),
        detail: content.slice(colonIdx + 1).trim(),
      });
    } else if (content.length > 10) {
      findings.push({
        severity,
        title: content.slice(0, 80),
        detail: '',
      });
    }
  }

  return findings;
}

export function useBundleValidator() {
  const api = useApi(skillMarketplaceApiRef);
  const [state, setState] = useState<ValidationState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);

  const validate = useCallback(
    async (skillNames: string[], resolvedDeps?: string[], tools?: string[]) => {
      if (skillNames.length === 0) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState({
        status: 'validating',
        statusText: 'Analyzing skill bundle composition...',
        findings: [],
        summary: '',
        error: null,
      });

      const depContext = resolvedDeps?.length
        ? `\nAuto-resolved dependencies: ${resolvedDeps.join(', ')}`
        : '';
      const toolContext = tools?.length
        ? `\nTool requirements: ${tools.join(', ')}`
        : '';

      try {
        const { answer } = await api.askSmpAgent(
          'validator',
          [
            'Validate this skill bundle for completeness, redundancy, and gaps.',
            `Skills in the skill bundle: ${skillNames.join(', ')}`,
            depContext,
            toolContext,
            '',
            'Analyze:',
            '1. Are there missing skills that would typically complement these?',
            '2. Are there redundant or overlapping skills?',
            '3. Is the skill bundle well-balanced for its apparent use case?',
            '4. What is the overall completeness score?',
            '',
            'Format each finding as a bullet point with a short title followed by a colon and detail.',
          ].join('\n'),
        );

        if (controller.signal.aborted) return;

        const findings = parseFindings(answer);
        setState({
          status: 'done',
          statusText: '',
          findings,
          summary: answer,
          error: null,
        });
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setState(prev => ({
          ...prev,
          status: 'error',
          statusText: '',
          error: (err as Error).message || 'Validation failed',
        }));
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }
    },
    [api],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState(INITIAL_STATE);
  }, []);

  return { ...state, validate, reset };
}
