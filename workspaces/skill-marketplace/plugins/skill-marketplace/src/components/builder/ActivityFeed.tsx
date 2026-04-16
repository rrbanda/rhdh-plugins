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
import { useRef, useEffect, useState } from 'react';
import type { BuilderEvent } from './types';
import { PIPELINE_STAGES } from './types';

function stageLabel(agentName: string): string {
  return (
    PIPELINE_STAGES.find(s => s.key === agentName)?.label || agentName
  );
}

function stageDescription(agentName: string): string {
  return (
    PIPELINE_STAGES.find(s => s.key === agentName)?.description || ''
  );
}

function relativeTs(ts: number, baseTs: number): string {
  const diff = Math.max(0, Math.round((ts - baseTs) / 1000));
  if (diff < 1) return '0s';
  if (diff < 60) return `${diff}s`;
  return `${Math.floor(diff / 60)}m ${diff % 60}s`;
}

export function ActivityFeed({ events }: { events: BuilderEvent[] }) {
  const endRef = useRef<HTMLDivElement>(null);
  const [expandedTools, setExpandedTools] = useState<Set<number>>(new Set());
  const [expandedOutputs, setExpandedOutputs] = useState<Set<number>>(
    new Set(),
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events.length]);

  const baseTs = events.length > 0 ? events[0].ts : 0;

  const toggleTool = (idx: number) =>
    setExpandedTools(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });

  const toggleOutput = (idx: number) =>
    setExpandedOutputs(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });

  if (events.length === 0) {
    return (
      <div className="bld-feed">
        <div className="bld-feed-empty">
          Click &ldquo;Generate Skill&rdquo; to start the AI pipeline
        </div>
      </div>
    );
  }

  return (
    <div className="bld-feed">
      {events.map((evt, i) => {
        switch (evt.type) {
          case 'agent_start':
            return (
              <div key={i} className="bld-evt">
                <div className="bld-evt-icon bld-evt-icon--agent">
                  &#9654;
                </div>
                <div className="bld-evt-body">
                  <div className="bld-evt-title">
                    {stageLabel(evt.agent)}
                  </div>
                  {stageDescription(evt.agent) && (
                    <div className="bld-evt-desc">
                      {stageDescription(evt.agent)}
                    </div>
                  )}
                </div>
                <span className="bld-evt-ts">
                  {relativeTs(evt.ts, baseTs)}
                </span>
              </div>
            );

          case 'tool_call':
            return (
              <div key={i} className="bld-evt">
                <div className="bld-evt-icon bld-evt-icon--tool">
                  &#9881;
                </div>
                <div className="bld-evt-body">
                  <button
                    className="bld-tool-chip"
                    onClick={() => toggleTool(i)}
                    type="button"
                  >
                    &#128295; {evt.tool}
                  </button>
                  {expandedTools.has(i) && (
                    <div className="bld-tool-args">
                      {JSON.stringify(evt.args, null, 2)}
                    </div>
                  )}
                </div>
                <span className="bld-evt-ts">
                  {relativeTs(evt.ts, baseTs)}
                </span>
              </div>
            );

          case 'agent_output': {
            const truncated = evt.text.length > 200;
            const expanded = expandedOutputs.has(i);
            const displayText =
              truncated && !expanded
                ? `${evt.text.slice(0, 200)}...`
                : evt.text;
            return (
              <div key={i} className="bld-evt">
                <div className="bld-evt-icon bld-evt-icon--output">
                  &#9998;
                </div>
                <div className="bld-evt-body">
                  <div className="bld-evt-title">{stageLabel(evt.agent)}</div>
                  <div
                    className={`bld-evt-output${truncated ? ' bld-evt-output--truncated' : ''}`}
                    onClick={
                      truncated ? () => toggleOutput(i) : undefined
                    }
                  >
                    {displayText}
                  </div>
                </div>
                <span className="bld-evt-ts">
                  {relativeTs(evt.ts, baseTs)}
                </span>
              </div>
            );
          }

          case 'complete':
            return (
              <div key={i} className="bld-evt">
                <div className="bld-evt-icon bld-evt-icon--complete">
                  &#10003;
                </div>
                <div className="bld-evt-body">
                  <div className="bld-evt-title">
                    Pipeline Complete
                  </div>
                  {evt.validation && (
                    <div className="bld-evt-desc">{evt.validation.slice(0, 150)}</div>
                  )}
                </div>
                <span className="bld-evt-ts">
                  {relativeTs(evt.ts, baseTs)}
                </span>
              </div>
            );

          case 'error':
            return (
              <div key={i} className="bld-evt">
                <div className="bld-evt-icon bld-evt-icon--error">
                  &#10007;
                </div>
                <div className="bld-evt-body">
                  <div className="bld-evt-title">Error</div>
                  <div className="bld-evt-desc">{evt.error}</div>
                </div>
                <span className="bld-evt-ts">
                  {relativeTs(evt.ts, baseTs)}
                </span>
              </div>
            );

          default:
            return null;
        }
      })}
      <div ref={endRef} />
    </div>
  );
}
