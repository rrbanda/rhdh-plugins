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
import { ToolCallChip } from '../../chat';
import type { ToolCall } from '../../chat';
import styles from './AgentActivityFeed.module.css';

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

export function groupEventsByAgent(
  events: BuilderEvent[],
  currentAgent: string,
): AgentGroup[] {
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

function eventsToToolCalls(events: BuilderEvent[]): ToolCall[] {
  const results = new Map<
    string,
    Extract<BuilderEvent, { type: 'tool_result' }>
  >();
  for (const e of events) {
    if (e.type === 'tool_result') results.set(`${e.agent}:${e.tool}`, e);
  }
  return events
    .filter(
      (e): e is Extract<BuilderEvent, { type: 'tool_call' }> =>
        e.type === 'tool_call',
    )
    .map(tc => {
      const result = results.get(`${tc.agent}:${tc.tool}`);
      return {
        name: tc.tool,
        agent: tc.agent,
        args: tc.args,
        result: result?.result,
        status: result ? ('complete' as const) : ('running' as const),
        elapsed: result ? result.ts - tc.ts : undefined,
      };
    });
}

function ElapsedTime({
  startTs,
  endTs,
  isActive,
}: {
  startTs: number;
  endTs: number;
  isActive: boolean;
}) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!isActive) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isActive]);

  const elapsed = isActive
    ? Math.round((now - startTs) / 1000)
    : Math.round((endTs - startTs) / 1000);

  if (elapsed < 1) return null;
  return <span className={styles.agentElapsed}>{elapsed}s</span>;
}

interface AgentActivityFeedProps {
  events: BuilderEvent[];
  currentAgent: string;
}

export function AgentActivityFeed({
  events,
  currentAgent,
}: AgentActivityFeedProps) {
  const groups = useMemo(
    () => groupEventsByAgent(events, currentAgent),
    [events, currentAgent],
  );
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

  if (groups.length === 0) return null;

  return (
    <div className={styles.feed}>
      {groups.map((group, groupIdx) => {
        const isOpen = !collapsed.has(group.agent);
        const innerEvents = group.events.filter(
          e =>
            e.type !== 'agent_start' &&
            e.type !== 'complete' &&
            e.type !== 'stream_end',
        );
        const toolCalls = eventsToToolCalls(group.events);
        const dotClass = group.hasError
          ? styles.dotError
          : group.isDone
            ? styles.dotDone
            : styles.dotActive;
        const prevAgent = groupIdx > 0 ? groups[groupIdx - 1] : null;

        return (
          <div key={group.agent}>
            {prevAgent && (
              <div className={styles.transfer}>
                <span className={styles.transferArrow}>{'\u21B3'}</span>
                {prevAgent.label} transferred to {group.label}
              </div>
            )}
            <div className={styles.agentSection}>
              <button
                className={styles.agentHeader}
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
                <span className={`${styles.agentDot} ${dotClass}`} />
                <span className={styles.agentName}>{group.label}</span>
                <span className={styles.agentMeta}>
                  {group.toolCount > 0 && (
                    <span className={styles.agentBadge}>
                      {group.toolCount} tool{group.toolCount !== 1 ? 's' : ''}
                    </span>
                  )}
                  <ElapsedTime
                    startTs={group.startTs}
                    endTs={group.endTs}
                    isActive={group.isActive && !group.isDone}
                  />
                </span>
                <span
                  className={`${styles.agentChevron} ${isOpen ? styles.chevronOpen : ''}`}
                >
                  {'\u25B6'}
                </span>
              </button>

              {isOpen && (
                <div className={styles.agentEvents}>
                  {toolCalls.length > 0 && (
                    <div className={styles.toolRow}>
                      {toolCalls.map((tc, idx) => (
                        <ToolCallChip key={`${tc.name}-${idx}`} tool={tc} />
                      ))}
                    </div>
                  )}
                  {innerEvents
                    .filter(
                      e => e.type === 'agent_output' || e.type === 'error',
                    )
                    .map((evt, idx) => {
                      if (evt.type === 'agent_output') {
                        return (
                          <div key={idx} className={styles.output}>
                            {evt.text}
                          </div>
                        );
                      }
                      if (evt.type === 'error') {
                        return (
                          <div key={idx} className={styles.error}>
                            {'\u2717'} {evt.error}
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
  );
}
