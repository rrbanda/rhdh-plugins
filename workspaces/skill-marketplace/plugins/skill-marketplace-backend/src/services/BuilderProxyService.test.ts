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
import { mockServices } from '@backstage/backend-test-utils';
import { BuilderProxyService } from './BuilderProxyService';

function createMockKagenti(overrides) {
  return Object.assign({
    sendMessage: jest.fn().mockResolvedValue({
      status: 200,
      data: {
        content: '# Code Review Skill\n\nReview code for quality.',
        session_id: 'sess-123',
        is_complete: true,
      },
    }),
  }, overrides || {});
}

describe('BuilderProxyService (Kagenti ChatRequest)', () => {
  const logger = mockServices.logger.mock();

  describe('generate', () => {
    it('calls kagenti.sendMessage with generate prompt', async () => {
      const kagenti = createMockKagenti();
      const svc = new BuilderProxyService({
        kagenti,
        logger,
        namespace: 'team1',
        agentName: 'skill-builder',
      });

      await svc.generate({ description: 'build a code review skill' });

      expect(kagenti.sendMessage).toHaveBeenCalledWith(
        expect.stringContaining('build a code review skill'),
        undefined,
        'team1',
        'skill-builder',
      );
    });

    it('returns SSE events with skill content', async () => {
      const svc = new BuilderProxyService({
        kagenti: createMockKagenti(),
        logger,
      });

      const events = await svc.generate({ description: 'test' });
      const types = events.map(function(e) { return e.event; });

      expect(types).toContain('agent_start');
      expect(types).toContain('agent_output');
      expect(types).toContain('complete');

      const complete = events.find(function(e) { return e.event === 'complete'; });
      expect(complete.data.skill_content).toContain('# Code Review Skill');
      expect(complete.data.validation).toBe('passed');
    });

    it('passes context_id as session_id', async () => {
      const kagenti = createMockKagenti();
      const svc = new BuilderProxyService({ kagenti, logger });

      await svc.generate({
        description: 'test',
        context_id: 'ctx-456',
      });

      expect(kagenti.sendMessage).toHaveBeenCalledWith(
        expect.any(String),
        'ctx-456',
        expect.any(String),
        expect.any(String),
      );
    });
  });

  describe('refine', () => {
    it('sends refine prompt with feedback', async () => {
      const kagenti = createMockKagenti();
      const svc = new BuilderProxyService({ kagenti, logger });

      await svc.refine({ feedback: 'add error handling' });

      expect(kagenti.sendMessage).toHaveBeenCalledWith(
        expect.stringContaining('add error handling'),
        undefined,
        expect.any(String),
        expect.any(String),
      );
    });
  });

  describe('error handling', () => {
    it('throws when Kagenti returns non-200', async () => {
      const kagenti = createMockKagenti({
        sendMessage: jest.fn().mockResolvedValue({
          status: 500,
          data: { error: 'Internal Server Error' },
        }),
      });

      const svc = new BuilderProxyService({ kagenti, logger });

      await expect(svc.generate({ description: 'test' })).rejects.toThrow(
        /Kagenti chat failed/,
      );
    });

    it('returns only agent_start when content is empty', async () => {
      const kagenti = createMockKagenti({
        sendMessage: jest.fn().mockResolvedValue({
          status: 200,
          data: { content: '', session_id: 'sess-1', is_complete: true },
        }),
      });

      const svc = new BuilderProxyService({ kagenti, logger });
      const events = await svc.generate({ description: 'test' });

      expect(events).toHaveLength(1);
      expect(events[0].event).toBe('agent_start');
    });
  });

  describe('save', () => {
    it('returns success', async () => {
      const svc = new BuilderProxyService({
        kagenti: createMockKagenti(),
        logger,
      });
      const result = await svc.save({ content: 'test' });
      expect(result.status).toBe(200);
      expect(result.data).toMatchObject({ success: true });
    });
  });
});
