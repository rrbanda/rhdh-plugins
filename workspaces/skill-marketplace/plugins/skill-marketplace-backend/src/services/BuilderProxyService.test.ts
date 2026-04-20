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
import type { BuilderSSEEvent } from './BuilderProxyService';

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
    streamMessage: jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: null,
      text: jest.fn().mockResolvedValue(''),
    }),
  }, overrides || {});
}

/**
 * Build a mock node-fetch Response whose body is an async iterable
 * yielding the given SSE lines (mimicking Kagenti /stream output).
 */
function mockStreamResponse(chunks) {
  const body = {
    [Symbol.asyncIterator]: function() {
      let idx = 0;
      return {
        next: function() {
          if (idx < chunks.length) {
            const value = Buffer.from(chunks[idx]);
            idx++;
            return Promise.resolve({ done: false, value: value });
          }
          return Promise.resolve({ done: true, value: undefined });
        },
      };
    },
  };
  return {
    ok: true,
    status: 200,
    body: body,
    text: jest.fn().mockResolvedValue(chunks.join('')),
  };
}

describe('BuilderProxyService (Kagenti ChatRequest)', () => {
  const logger = mockServices.logger.mock();

  // -------------------------------------------------------------------------
  // Synchronous /send fallback
  // -------------------------------------------------------------------------

  describe('generate (sync fallback)', () => {
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

  describe('refine (sync fallback)', () => {
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

  // -------------------------------------------------------------------------
  // Streaming /stream (primary)
  // -------------------------------------------------------------------------

  describe('generateStream', () => {
    it('emits agent_start, agent_output, and complete events from a stream', async () => {
      const streamRes = mockStreamResponse([
        'data: {"content": "# YAML Linter Skill\\n\\nLint YAML files.", "session_id": "s1"}\n\n',
        'data: {"done": true, "session_id": "s1"}\n\n',
      ]);
      const kagenti = createMockKagenti({
        streamMessage: jest.fn().mockResolvedValue(streamRes),
      });
      const svc = new BuilderProxyService({ kagenti, logger });

      const collected: BuilderSSEEvent[] = [];
      await svc.generateStream(
        { description: 'lint yaml' },
        function(evt) { collected.push(evt); },
      );

      expect(collected.length).toBeGreaterThanOrEqual(3);
      expect(collected[0].event).toBe('agent_start');
      expect(collected[1].event).toBe('agent_output');
      expect(collected[1].data.text).toContain('YAML Linter');
      expect(collected[2].event).toBe('complete');
      expect(collected[2].data.skill_content).toContain('YAML Linter');
      expect(collected[2].data.validation).toBe('passed');
    });

    it('accumulates multiple content chunks', async () => {
      const streamRes = mockStreamResponse([
        'data: {"content": "Part 1. ", "session_id": "s2"}\n\n',
        'data: {"content": "Part 2.", "session_id": "s2"}\n\n',
        'data: {"done": true, "session_id": "s2"}\n\n',
      ]);
      const kagenti = createMockKagenti({
        streamMessage: jest.fn().mockResolvedValue(streamRes),
      });
      const svc = new BuilderProxyService({ kagenti, logger });

      const collected: BuilderSSEEvent[] = [];
      await svc.generateStream(
        { description: 'test' },
        function(evt) { collected.push(evt); },
      );

      const outputs = collected.filter(function(e) { return e.event === 'agent_output'; });
      expect(outputs).toHaveLength(2);
      expect(outputs[0].data.text).toBe('Part 1. ');
      expect(outputs[1].data.text).toBe('Part 2.');

      const complete = collected.find(function(e) { return e.event === 'complete'; });
      expect(complete.data.skill_content).toBe('Part 1. Part 2.');
    });

    it('calls kagenti.streamMessage with correct args', async () => {
      const streamRes = mockStreamResponse([
        'data: {"content": "ok", "session_id": "s3"}\n\n',
        'data: {"done": true, "session_id": "s3"}\n\n',
      ]);
      const kagenti = createMockKagenti({
        streamMessage: jest.fn().mockResolvedValue(streamRes),
      });
      const svc = new BuilderProxyService({
        kagenti,
        logger,
        namespace: 'ns1',
        agentName: 'agent1',
      });

      await svc.generateStream(
        { description: 'test', context_id: 'ctx-99' },
        function() {},
      );

      expect(kagenti.streamMessage).toHaveBeenCalledWith(
        expect.stringContaining('test'),
        'ctx-99',
        'ns1',
        'agent1',
      );
    });

    it('throws when stream response is not ok', async () => {
      const kagenti = createMockKagenti({
        streamMessage: jest.fn().mockResolvedValue({
          ok: false,
          status: 502,
          body: null,
          text: jest.fn().mockResolvedValue('Bad Gateway'),
        }),
      });
      const svc = new BuilderProxyService({ kagenti, logger });

      await expect(
        svc.generateStream({ description: 'x' }, function() {}),
      ).rejects.toThrow(/Kagenti stream failed/);
    });
  });

  describe('refineStream', () => {
    it('sends refine prompt via stream', async () => {
      const streamRes = mockStreamResponse([
        'data: {"content": "Refined skill.", "session_id": "s4"}\n\n',
        'data: {"done": true, "session_id": "s4"}\n\n',
      ]);
      const kagenti = createMockKagenti({
        streamMessage: jest.fn().mockResolvedValue(streamRes),
      });
      const svc = new BuilderProxyService({ kagenti, logger });

      const collected: BuilderSSEEvent[] = [];
      await svc.refineStream(
        { feedback: 'make it better' },
        function(evt) { collected.push(evt); },
      );

      expect(kagenti.streamMessage).toHaveBeenCalledWith(
        expect.stringContaining('make it better'),
        undefined,
        expect.any(String),
        expect.any(String),
      );

      const complete = collected.find(function(e) { return e.event === 'complete'; });
      expect(complete.data.skill_content).toBe('Refined skill.');
    });
  });
});
