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
import { useMemo, useState, useCallback } from 'react';
import type { BuilderEvent } from '../types';
import styles from './AgentTrace.module.css';

const AGENT_COLORS = [
  'var(--sm-brand)',
  'var(--sm-success)',
  'var(--sm-text-link)',
  'var(--sm-warning)',
  'var(--sm-danger)',
];

interface ToolSpan {
  tool: string;
  agent: string;
  startTs: number;
  endTs: number;
  args: Record<string, unknown>;
  result?: string;
}

interface AgentSpan {
  agent: string;
  startTs: number;
  endTs: number;
  tools: ToolSpan[];
  colorIdx: number;
}

interface TraceRow {
  kind: 'agent' | 'tool';
  label: string;
  startTs: number;
  endTs: number;
  depth: number;
  colorIdx: number;
  detail?: { args?: Record<string, unknown>; result?: string };
}

function buildSpans(events: BuilderEvent[]): AgentSpan[] {
  if (events.length === 0) return [];

  const result: AgentSpan[] = [];
  let current: AgentSpan | null = null;
  let colorIdx = 0;
  const pendingTools = new Map<string, ToolSpan>();

  for (const evt of events) {
    if (evt.type === 'agent_start') {
      if (current) current.endTs = evt.ts;
      current = {
        agent: evt.agent,
        startTs: evt.ts,
        endTs: evt.ts,
        tools: [],
        colorIdx,
      };
      colorIdx++;
      result.push(current);
    } else if (current) {
      current.endTs = evt.ts;
      if (evt.type === 'tool_call') {
        const span: ToolSpan = {
          tool: evt.tool,
          agent: evt.agent,
          startTs: evt.ts,
          endTs: evt.ts,
          args: evt.args,
        };
        current.tools.push(span);
        pendingTools.set(`${evt.agent}:${evt.tool}`, span);
      } else if (evt.type === 'tool_result') {
        const key = `${evt.agent}:${evt.tool}`;
        const pending = pendingTools.get(key);
        if (pending) {
          pending.endTs = evt.ts;
          pending.result = evt.result;
          pendingTools.delete(key);
        }
      }
    }
  }

  return result;
}

function flattenToRows(spans: AgentSpan[]): TraceRow[] {
  const rows: TraceRow[] = [];
  for (const span of spans) {
    rows.push({
      kind: 'agent',
      label: span.agent,
      startTs: span.startTs,
      endTs: span.endTs,
      depth: 0,
      colorIdx: span.colorIdx,
    });
    for (const tool of span.tools) {
      rows.push({
        kind: 'tool',
        label: tool.tool,
        startTs: tool.startTs,
        endTs: tool.endTs,
        depth: 1,
        colorIdx: span.colorIdx,
        detail: { args: tool.args, result: tool.result },
      });
    }
  }
  return rows;
}

interface AgentTraceProps {
  events: BuilderEvent[];
}

export function AgentTrace({ events }: AgentTraceProps) {
  const spans = useMemo(() => buildSpans(events), [events]);
  const rows = useMemo(() => flattenToRows(spans), [spans]);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const toggleRow = useCallback((idx: number) => {
    setSelectedIdx(prev => (prev === idx ? null : idx));
  }, []);

  if (spans.length === 0) {
    return <div className={styles.bldTraceEmpty}>No agent trace data yet.</div>;
  }

  const globalStart = spans[0].startTs;
  const globalEnd = Math.max(...spans.map(s => s.endTs));
  const globalDuration = Math.max(globalEnd - globalStart, 1);
  const totalSec = (globalDuration / 1000).toFixed(1);
  const agentCount = spans.length;
  const toolCount = spans.reduce((sum, s) => sum + s.tools.length, 0);

  return (
    <div className={styles.bldTrace}>
      <div className={styles.bldTraceHeader}>
        <span className={styles.bldTraceHeaderName}>Span</span>
        <span className={styles.bldTraceHeaderBar}>
          Waterfall ({totalSec}s)
        </span>
      </div>

      {rows.map((row, idx) => {
        const offsetPct = ((row.startTs - globalStart) / globalDuration) * 100;
        const widthPct = Math.max(
          ((row.endTs - row.startTs) / globalDuration) * 100,
          1,
        );
        const durationMs = row.endTs - row.startTs;
        const durationLabel =
          durationMs >= 1000
            ? `${(durationMs / 1000).toFixed(1)}s`
            : `${durationMs}ms`;
        const color = AGENT_COLORS[row.colorIdx % AGENT_COLORS.length];
        const isSelected = selectedIdx === idx;
        const isExpandable = row.kind === 'tool' && row.detail;

        return (
          <div key={idx}>
            <div
              className={`${styles.bldTraceRow} ${isSelected ? styles.bldTraceRowSelected : ''}`}
              onClick={() => isExpandable && toggleRow(idx)}
              role={isExpandable ? 'button' : undefined}
              tabIndex={isExpandable ? 0 : undefined}
              onKeyDown={
                isExpandable
                  ? e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleRow(idx);
                      }
                    }
                  : undefined
              }
              aria-label={
                isExpandable
                  ? `${isSelected ? 'Collapse' : 'Expand'} tool span ${row.label}`
                  : undefined
              }
              aria-expanded={isExpandable ? isSelected : undefined}
            >
              <div
                className={styles.bldTraceLabel}
                style={{ paddingLeft: `${8 + row.depth * 20}px` }}
              >
                <span className={styles.bldTraceIcon}>
                  {row.kind === 'agent' ? '\u2BC8' : '\u2699'}
                </span>
                <span
                  className={`${styles.bldTraceName} ${
                    row.kind === 'tool' ? styles.bldTraceNameTool : ''
                  }`}
                >
                  {row.label}
                </span>
                <span className={styles.bldTraceDur}>{durationLabel}</span>
              </div>
              <div className={styles.bldTraceBarArea}>
                <div
                  className={`${styles.bldTraceBar} ${
                    row.kind === 'agent'
                      ? styles.bldTraceBarAgent
                      : styles.bldTraceBarTool
                  }`}
                  style={{
                    left: `${offsetPct}%`,
                    width: `${widthPct}%`,
                    background: color,
                  }}
                />
              </div>
            </div>

            {isSelected && row.detail && (
              <div className={styles.bldTraceDetail}>
                {row.detail.args && Object.keys(row.detail.args).length > 0 && (
                  <div className={styles.bldTraceDetailSection}>
                    <div className={styles.bldTraceDetailLabel}>Arguments</div>
                    <pre className={styles.bldTraceDetailPre}>
                      {JSON.stringify(row.detail.args, null, 2)}
                    </pre>
                  </div>
                )}
                {row.detail.result && (
                  <div className={styles.bldTraceDetailSection}>
                    <div className={styles.bldTraceDetailLabel}>Result</div>
                    <pre className={styles.bldTraceDetailPre}>
                      {row.detail.result}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      <div className={styles.bldTraceSummary}>
        <span className={styles.bldTraceSummaryItem}>
          {agentCount} agent{agentCount !== 1 ? 's' : ''}
        </span>
        <span className={styles.bldTraceSummaryItem}>
          {toolCount} tool call{toolCount !== 1 ? 's' : ''}
        </span>
        <span className={styles.bldTraceSummaryItem}>{totalSec}s total</span>
      </div>
    </div>
  );
}
