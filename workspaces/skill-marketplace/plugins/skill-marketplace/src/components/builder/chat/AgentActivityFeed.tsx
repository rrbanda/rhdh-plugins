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
import { useState, useEffect, useMemo } from 'react';
import type { BuilderEvent } from '../types';
import { ToolCallAccordion } from './ToolCallAccordion';

const feedStyles = `
.bld-feed {
  margin: 4px 16px 8px;
}

.bld-transfer {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 10px 2px 18px;
  font-size: 11px;
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
}
.bld-transfer-arrow {
  font-size: 10px;
}

.bld-agent-section {
  margin-bottom: 4px;
}

.bld-agent-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  border: none;
  background: none;
  width: 100%;
  text-align: left;
  font-size: 13px;
  color: var(--pf-t--global--text--color--regular, #151515);
}
.bld-agent-header:hover {
  background: var(--pf-t--global--background--color--secondary--default, #f8f8f8);
}
.bld-agent-header:focus-visible {
  outline: 2px solid var(--pf-t--global--color--brand--default, #0066cc);
  outline-offset: -2px;
}

.bld-agent-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.bld-agent-dot--active {
  background: var(--pf-t--global--color--brand--default, #0066cc);
  animation: bld-agent-pulse 1.5s ease-in-out infinite;
}
@keyframes bld-agent-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
.bld-agent-dot--done {
  background: var(--pf-t--global--color--status--success--default, #3e8635);
}
.bld-agent-dot--error {
  background: var(--pf-t--global--color--status--danger--default, #c9190b);
}

.bld-agent-name {
  font-weight: 500;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bld-agent-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.bld-agent-badge {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 8px;
  background: var(--pf-t--global--background--color--secondary--default, #f0f0f0);
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
}
.bld-agent-elapsed {
  font-size: 11px;
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
  font-variant-numeric: tabular-nums;
}

.bld-agent-chevron {
  font-size: 10px;
  transition: transform 0.15s;
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
}
.bld-agent-chevron--open {
  transform: rotate(90deg);
}

.bld-agent-events {
  padding: 4px 8px 4px 28px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.bld-tl-output {
  font-size: 13px;
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
  line-height: 1.4;
  word-break: break-word;
}
.bld-tl-error {
  font-size: 13px;
  color: var(--pf-t--global--color--status--danger--default, #c9190b);
}
`;

export function formatAgentName(agentName: string): string {
  return agentName
    .replace(/Agent$/, '')
    .replace(/([A-Z])/g, ' $1')
    .trim();
}

interface AgentGroup {
  agent: string;
  label: string;
  events: BuilderEvent[];
  isActive: boolean;
  isDone: boolean;
  hasError: boolean;
  toolCount: number;
  startTs: number;
  endTs: number;
}

export function groupEventsByAgent(events: BuilderEvent[], currentAgent: string): AgentGroup[] {
  const groups: AgentGroup[] = [];
  let current: AgentGroup | null = null;

  for (const evt of events) {
    if (evt.type === 'agent_start') {
      if (current) {
        current.isDone = true;
        current.endTs = evt.ts;
      }
      current = {
        agent: evt.agent,
        label: formatAgentName(evt.agent),
        events: [evt],
        isActive: evt.agent === currentAgent,
        isDone: false,
        hasError: false,
        toolCount: 0,
        startTs: evt.ts,
        endTs: evt.ts,
      };
      groups.push(current);
    } else if (current) {
      current.events.push(evt);
      current.endTs = evt.ts;
      if (evt.type === 'tool_call') current.toolCount++;
      if (evt.type === 'complete') current.isDone = true;
      if (evt.type === 'error') {
        current.isDone = true;
        current.hasError = true;
      }
    }
  }
  return groups;
}

function ElapsedTime({ startTs, endTs, isActive }: { startTs: number; endTs: number; isActive: boolean }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!isActive) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isActive]);

  const elapsed = isActive
    ? Math.round((now - startTs) / 1000)
    : Math.round((endTs - startTs) / 1000);

  if (elapsed < 1) return null;
  return <span className="bld-agent-elapsed">{elapsed}s</span>;
}

interface AgentActivityFeedProps {
  events: BuilderEvent[];
  currentAgent: string;
}

export function AgentActivityFeed({ events, currentAgent }: AgentActivityFeedProps) {
  const groups = useMemo(() => groupEventsByAgent(events, currentAgent), [events, currentAgent]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (groups.length > 1) {
      setCollapsed(prev => {
        const next = new Set(prev);
        for (let i = 0; i < groups.length - 1; i++) {
          if (groups[i].isDone) next.add(groups[i].agent);
        }
        const last = groups[groups.length - 1];
        next.delete(last.agent);
        return next;
      });
    }
  }, [groups.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const toolResults = useMemo(() => {
    const results = new Map<string, Extract<BuilderEvent, { type: 'tool_result' }>>();
    for (const evt of events) {
      if (evt.type === 'tool_result') {
        results.set(`${evt.agent}:${evt.tool}`, evt);
      }
    }
    return results;
  }, [events]);

  if (groups.length === 0) return null;

  return (
    <>
      <style>{feedStyles}</style>
      <div className="bld-feed">
        {groups.map((group, groupIdx) => {
          const isOpen = !collapsed.has(group.agent);
          const innerEvents = group.events.filter(
            e => e.type !== 'agent_start' && e.type !== 'complete' && e.type !== 'stream_end',
          );
          const dotClass = group.hasError
            ? 'bld-agent-dot--error'
            : group.isDone
              ? 'bld-agent-dot--done'
              : 'bld-agent-dot--active';
          const prevAgent = groupIdx > 0 ? groups[groupIdx - 1] : null;

          return (
            <div key={group.agent}>
              {prevAgent && (
                <div className="bld-transfer">
                  <span className="bld-transfer-arrow">&#8627;</span>
                  {prevAgent.label} transferred to {group.label}
                </div>
              )}
              <div className="bld-agent-section">
                <button
                  className="bld-agent-header"
                  onClick={() =>
                    setCollapsed(prev => {
                      const next = new Set(prev);
                      if (next.has(group.agent)) next.delete(group.agent);
                      else next.add(group.agent);
                      return next;
                    })
                  }
                  type="button"
                  aria-expanded={isOpen}
                >
                  <span className={`bld-agent-dot ${dotClass}`} />
                  <span className="bld-agent-name">{group.label}</span>
                  <span className="bld-agent-meta">
                    {group.toolCount > 0 && (
                      <span className="bld-agent-badge">
                        {group.toolCount} tool{group.toolCount !== 1 ? 's' : ''}
                      </span>
                    )}
                    <ElapsedTime
                      startTs={group.startTs}
                      endTs={group.endTs}
                      isActive={group.isActive && !group.isDone}
                    />
                  </span>
                  <span className={`bld-agent-chevron ${isOpen ? 'bld-agent-chevron--open' : ''}`}>
                    &#9654;
                  </span>
                </button>

                {isOpen && innerEvents.length > 0 && (
                  <div className="bld-agent-events">
                    {innerEvents.map((evt, idx) => {
                      if (evt.type === 'tool_call') {
                        const result = toolResults.get(`${evt.agent}:${evt.tool}`);
                        return (
                          <ToolCallAccordion key={idx} toolCall={evt} toolResult={result} />
                        );
                      }

                      if (evt.type === 'tool_result') return null;

                      if (evt.type === 'agent_output') {
                        return (
                          <div key={idx} className="bld-tl-output">
                            {evt.text}
                          </div>
                        );
                      }

                      if (evt.type === 'error') {
                        return (
                          <div key={idx} className="bld-tl-error">
                            &#10007; {evt.error}
                          </div>
                        );
                      }

                      return null;
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
