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

const eventTimelineStyles = `
.bld-evt-list {
  padding: 8px 0;
}
.bld-evt-item {
  display: flex;
  gap: 10px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--pf-t--global--border--color--default, #f0f0f0);
  font-size: 13px;
  cursor: pointer;
}
.bld-evt-item:hover {
  background: var(--pf-t--global--background--color--secondary--default, #f8f8f8);
}

.bld-evt-badge {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  padding: 2px 6px;
  border-radius: 4px;
  white-space: nowrap;
  flex-shrink: 0;
  margin-top: 1px;
}
.bld-evt-badge--agent_start { background: var(--pf-t--global--color--brand--default, #0066cc)18; color: var(--pf-t--global--color--brand--default, #0066cc); }
.bld-evt-badge--tool_call { background: #7c3aed18; color: #7c3aed; }
.bld-evt-badge--tool_result { background: #7c3aed18; color: #7c3aed; }
.bld-evt-badge--agent_output { background: var(--pf-t--global--color--status--info--default, #2b9af3)18; color: var(--pf-t--global--color--status--info--default, #2b9af3); }
.bld-evt-badge--complete { background: var(--pf-t--global--color--status--success--default, #3e8635)18; color: var(--pf-t--global--color--status--success--default, #3e8635); }
.bld-evt-badge--error { background: var(--pf-t--global--color--status--danger--default, #c9190b)18; color: var(--pf-t--global--color--status--danger--default, #c9190b); }
.bld-evt-badge--stream_end { background: var(--pf-t--global--background--color--secondary--default, #f0f0f0); color: var(--pf-t--global--text--color--subtle, #6a6e73); }

.bld-evt-body {
  flex: 1;
  min-width: 0;
}
.bld-evt-summary {
  color: var(--pf-t--global--text--color--regular, #151515);
  word-break: break-word;
}
.bld-evt-ts {
  font-size: 11px;
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
  margin-top: 2px;
}
.bld-evt-detail {
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--pf-t--global--background--color--secondary--default, #f5f5f5);
  font-family: var(--pf-t--global--font--family--mono, 'Red Hat Mono', monospace);
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 300px;
  overflow-y: auto;
  line-height: 1.5;
}
.bld-evt-copy {
  border: none;
  background: none;
  cursor: pointer;
  font-size: 11px;
  color: var(--pf-t--global--color--brand--default, #0066cc);
  padding: 2px 6px;
  border-radius: 4px;
  margin-top: 4px;
}
.bld-evt-copy:hover { background: var(--pf-t--global--background--color--secondary--default, #f0f0f0); }
.bld-evt-empty {
  padding: 32px 16px;
  text-align: center;
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
  font-size: 13px;
}
`;

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
    navigator.clipboard.writeText(text).catch(() => {});
  }, []);

  if (events.length === 0) {
    return (
      <>
        <style>{eventTimelineStyles}</style>
        <div className="bld-evt-empty">No events yet. Start a generation to see the agent activity.</div>
      </>
    );
  }

  const firstTs = events[0]?.ts ?? Date.now();

  return (
    <>
      <style>{eventTimelineStyles}</style>
      <div className="bld-evt-list">
        {events.map((evt, idx) => {
          const detail = eventDetail(evt);
          const isExpanded = expandedIdx === idx;

          return (
            <div
              key={idx}
              className="bld-evt-item"
              onClick={() => setExpandedIdx(isExpanded ? null : idx)}
              role="button"
              tabIndex={0}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setExpandedIdx(isExpanded ? null : idx);
                }
              }}
              aria-expanded={detail ? isExpanded : undefined}
            >
              <span className={`bld-evt-badge bld-evt-badge--${evt.type}`}>
                {evt.type.replace('_', ' ')}
              </span>
              <div className="bld-evt-body">
                <div className="bld-evt-summary">{eventSummary(evt)}</div>
                <div className="bld-evt-ts">+{((evt.ts - firstTs) / 1000).toFixed(1)}s</div>
                {isExpanded && detail && (
                  <>
                    <div className="bld-evt-detail">{detail}</div>
                    <button
                      className="bld-evt-copy"
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
    </>
  );
}
