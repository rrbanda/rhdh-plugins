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
import { TextEncoder as NodeTextEncoder } from 'util';
import { ReadableStream as NodeReadableStream } from 'stream/web';

const Encoder = typeof TextEncoder !== 'undefined' ? TextEncoder : NodeTextEncoder;
const RStream = typeof ReadableStream !== 'undefined' ? ReadableStream : (NodeReadableStream as unknown as typeof ReadableStream);

const encoder = new Encoder();

export function createSSEStream(events: string[]): ReadableStream<Uint8Array> {
  let index = 0;
  return new RStream({
    pull(controller) {
      if (index < events.length) {
        controller.enqueue(encoder.encode(events[index]));
        index++;
      } else {
        controller.close();
      }
    },
  });
}

export function sseEvent(eventType: string, data: Record<string, unknown>): string {
  return `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
}

export const FULL_STREAM_EVENTS = [
  sseEvent('agent_start', { agent: 'RequirementsAnalyzerAgent' }),
  sseEvent('tool_call', { agent: 'RequirementsAnalyzerAgent', tool: 'analyze', args: { input: 'test' } }),
  sseEvent('tool_result', { agent: 'RequirementsAnalyzerAgent', tool: 'analyze', result: 'analyzed successfully' }),
  sseEvent('agent_start', { agent: 'SkillGeneratorAgent' }),
  sseEvent('agent_output', { agent: 'SkillGeneratorAgent', text: '# Test Skill\n' }),
  sseEvent('agent_output', { agent: 'SkillGeneratorAgent', text: '## Description\nA test skill.' }),
  sseEvent('complete', { skill_content: '# Test Skill\n## Description\nA test skill.', full_output: '# Test Skill\n## Description\nA test skill.', validation: 'All checks passed' }),
  sseEvent('stream_end', {}),
];

export const ERROR_STREAM_EVENTS = [
  sseEvent('agent_start', { agent: 'RequirementsAnalyzerAgent' }),
  sseEvent('error', { error: 'Pipeline failed: timeout exceeded' }),
];

export const MALFORMED_EVENTS = [
  'event: agent_start\ndata: {bad json\n\n',
  'event: agent_start\ndata: {still bad\n\n',
  'event: agent_start\ndata: {not valid\n\n',
  'event: agent_start\ndata: {broken\n\n',
  'event: agent_start\ndata: {nope\n\n',
];

export const KEEPALIVE_EVENT = ':\n\n';
