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
import { useState, useCallback } from 'react';
import type { BuilderEvent } from '../types';
import styles from './EventTimeline.module.css';

const eventBadgeByType: Record<BuilderEvent['type'], string> = {
  agent_start: styles.bldEvtBadgeAgentStart,
  tool_call: styles.bldEvtBadgeToolCall,
  tool_result: styles.bldEvtBadgeToolResult,
  agent_output: styles.bldEvtBadgeAgentOutput,
  complete: styles.bldEvtBadgeComplete,
  error: styles.bldEvtBadgeError,
  stream_end: styles.bldEvtBadgeStreamEnd,
};

function eventSummary(evt: BuilderEvent): string {
  switch (evt.type) {
    case 'agent_start':
      return `Agent started: ${evt.agent}`;
    case 'tool_call':
      return `${evt.agent} called ${evt.tool}`;
    case 'tool_result':
      return `${evt.tool} returned result`;
    case 'agent_output':
      return evt.text.slice(0, 120) + (evt.text.length > 120 ? '...' : '');
    case 'complete':
      return 'Generation completed';
    case 'error':
      return evt.error;
    case 'stream_end':
      return 'Stream ended';
    default:
      return 'Unknown event';
  }
}

function eventDetail(evt: BuilderEvent): string | null {
  switch (evt.type) {
    case 'tool_call':
      return JSON.stringify(evt.args, null, 2);
    case 'tool_result':
      return evt.result;
    case 'complete':
      return evt.validation || null;
    case 'agent_output':
      return evt.text;
    default:
      return null;
  }
}

interface EventTimelineProps {
  events: BuilderEvent[];
}

export function EventTimeline({ events }: EventTimelineProps) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const handleCopy = useCallback((text: string) => {
    window.navigator.clipboard.writeText(text).catch(() => {});
  }, []);

  if (events.length === 0) {
    return (
      <div className={styles.bldEvtEmpty}>
        No events yet. Start a generation to see the agent activity.
      </div>
    );
  }

  const firstTs = events[0]?.ts ?? Date.now();

  return (
    <div className={styles.bldEvtList}>
      {events.map((evt, idx) => {
        const detail = eventDetail(evt);
        const isExpanded = expandedIdx === idx;

        return (
          <div
            key={idx}
            className={styles.bldEvtItem}
            onClick={() => setExpandedIdx(isExpanded ? null : idx)}
            role="button"
            tabIndex={0}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setExpandedIdx(isExpanded ? null : idx);
              }
            }}
            aria-label={eventSummary(evt)}
            aria-expanded={detail ? isExpanded : undefined}
          >
            <span
              className={`${styles.bldEvtBadge} ${eventBadgeByType[evt.type]}`}
            >
              {evt.type.replace('_', ' ')}
            </span>
            <div className={styles.bldEvtBody}>
              <div className={styles.bldEvtSummary}>{eventSummary(evt)}</div>
              <div className={styles.bldEvtTs}>
                +{((evt.ts - firstTs) / 1000).toFixed(1)}s
              </div>
              {isExpanded && detail && (
                <>
                  <div className={styles.bldEvtDetail}>{detail}</div>
                  <button
                    className={styles.bldEvtCopy}
                    onClick={e => {
                      e.stopPropagation();
                      handleCopy(detail);
                    }}
                    type="button"
                  >
                    Copy
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
