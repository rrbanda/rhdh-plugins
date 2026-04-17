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
import express from 'express';
import type { Server } from 'http';

function sseEvent(type: string, data: Record<string, unknown>): string {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

const SKILL_CONTENT = `# Mock Skill

## Description
A mock skill for E2E testing.

## Usage
Use this skill to test the pipeline.

version: 1.0.0
`;

export function createMockBuilderServer(port = 8001): { start: () => Promise<Server>; stop: (server: Server) => Promise<void> } {
  const app = express();
  app.use(express.json());

  app.post('/generate', (_req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const events = [
      sseEvent('agent_start', { agent: 'RequirementsAnalyzerAgent' }),
      sseEvent('tool_call', {
        agent: 'RequirementsAnalyzerAgent',
        tool: 'analyze_requirements',
        args: { input: 'test' },
      }),
      sseEvent('tool_result', {
        agent: 'RequirementsAnalyzerAgent',
        tool: 'analyze_requirements',
        result: 'Requirements analyzed',
      }),
      sseEvent('agent_start', { agent: 'SkillResearcherAgent' }),
      sseEvent('agent_start', { agent: 'SkillGeneratorAgent' }),
      sseEvent('agent_output', { agent: 'SkillGeneratorAgent', text: SKILL_CONTENT }),
      sseEvent('agent_start', { agent: 'SkillValidatorAgent' }),
      sseEvent('complete', {
        skill_content: SKILL_CONTENT,
        validation: 'All checks passed',
      }),
    ];

    let idx = 0;
    const interval = setInterval(() => {
      if (idx < events.length) {
        res.write(events[idx]);
        idx++;
      } else {
        clearInterval(interval);
        res.end();
      }
    }, 10);
  });

  app.post('/refine', (_req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const refined = SKILL_CONTENT.replace('A mock skill', 'An improved mock skill');
    const events = [
      sseEvent('agent_start', { agent: 'SkillGeneratorAgent' }),
      sseEvent('agent_output', { agent: 'SkillGeneratorAgent', text: refined }),
      sseEvent('complete', { skill_content: refined, validation: 'Refined OK' }),
    ];

    let idx = 0;
    const interval = setInterval(() => {
      if (idx < events.length) {
        res.write(events[idx]);
        idx++;
      } else {
        clearInterval(interval);
        res.end();
      }
    }, 10);
  });

  app.post('/save', (_req, res) => {
    res.json({ saved: true });
  });

  app.post('/graph/build', (_req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.flushHeaders();
    res.write(sseEvent('complete', { message: 'Graph built' }));
    res.end();
  });

  app.post('/graph/update', (_req, res) => {
    res.json({ updated: true });
  });

  return {
    start: () =>
      new Promise<Server>((resolve, reject) => {
        const server = app.listen(port, () => resolve(server));
        server.on('error', reject);
      }),
    stop: (server: Server) =>
      new Promise<void>((resolve, reject) => {
        server.close(err => (err ? reject(err) : resolve()));
      }),
  };
}
