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

const traceStyles = `
.bld-trace {
  padding: 8px 0;
}
.bld-trace-empty {
  padding: 32px 16px;
  text-align: center;
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
  font-size: 13px;
}

.bld-trace-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 16px;
  font-size: 11px;
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
  border-bottom: 1px solid var(--pf-t--global--border--color--default, #e8e8e8);
  margin-bottom: 4px;
}
.bld-trace-header-name { flex: 0 0 40%; }
.bld-trace-header-bar { flex: 1; text-align: right; }

.bld-trace-row {
  display: flex;
  align-items: center;
  gap: 0;
  padding: 4px 0;
  cursor: pointer;
  transition: background 0.1s;
}
.bld-trace-row:hover {
  background: var(--pf-t--global--background--color--secondary--default, #f8f8f8);
}
.bld-trace-row--selected {
  background: var(--pf-t--global--color--brand--default, #0066cc)0d;
}

.bld-trace-indent {
  display: flex;
  flex-shrink: 0;
}
.bld-trace-indent-line {
  width: 16px;
  height: 100%;
  border-left: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
  margin-left: 8px;
}

.bld-trace-icon {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  flex-shrink: 0;
  margin: 0 4px;
}

.bld-trace-label {
  flex: 0 0 calc(40% - var(--indent-width, 0px));
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  padding-right: 8px;
}
.bld-trace-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--pf-t--global--text--color--regular, #151515);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bld-trace-name--tool {
  font-weight: 400;
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
}
.bld-trace-dur {
  font-size: 10px;
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
  flex-shrink: 0;
  margin-left: auto;
  font-variant-numeric: tabular-nums;
}

.bld-trace-bar-area {
  flex: 1;
  height: 16px;
  position: relative;
  margin-right: 16px;
}
.bld-trace-bar {
  position: absolute;
  height: 100%;
  border-radius: 3px;
  min-width: 3px;
}
.bld-trace-bar--agent { opacity: 0.85; }
.bld-trace-bar--tool { opacity: 0.6; }

.bld-trace-detail {
  padding: 8px 16px 8px 48px;
  border-bottom: 1px solid var(--pf-t--global--border--color--default, #e8e8e8);
  animation: bld-detail-in 0.15s ease;
}
@keyframes bld-detail-in { from { opacity: 0; } }

.bld-trace-detail-section {
  margin-bottom: 8px;
}
.bld-trace-detail-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
  margin-bottom: 4px;
}
.bld-trace-detail-pre {
  font-size: 11px;
  font-family: var(--pf-t--global--font--family--mono, 'Red Hat Mono', monospace);
  background: var(--pf-t--global--background--color--secondary--default, #f5f5f5);
  padding: 8px;
  border-radius: 4px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
  overflow-y: auto;
  color: var(--pf-t--global--text--color--regular, #151515);
}

.bld-trace-summary {
  display: flex;
  gap: 12px;
  padding: 8px 16px;
  font-size: 11px;
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
  border-top: 1px solid var(--pf-t--global--border--color--default, #e8e8e8);
  margin-top: 4px;
}
.bld-trace-summary-item {
  display: flex;
  align-items: center;
  gap: 4px;
}
`;

const AGENT_COLORS = [
  'var(--pf-t--global--color--brand--default, #0066cc)',
  'var(--pf-t--global--color--status--success--default, #3e8635)',
  '#7c3aed',
  'var(--pf-t--global--color--status--warning--default, #f0ab00)',
  'var(--pf-t--global--color--status--danger--default, #c9190b)',
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
      current = { agent: evt.agent, startTs: evt.ts, endTs: evt.ts, tools: [], colorIdx };
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
    return (
      <>
        <style>{traceStyles}</style>
        <div className="bld-trace-empty">No agent trace data yet.</div>
      </>
    );
  }

  const globalStart = spans[0].startTs;
  const globalEnd = Math.max(...spans.map(s => s.endTs));
  const globalDuration = Math.max(globalEnd - globalStart, 1);
  const totalSec = (globalDuration / 1000).toFixed(1);
  const agentCount = spans.length;
  const toolCount = spans.reduce((sum, s) => sum + s.tools.length, 0);

  return (
    <>
      <style>{traceStyles}</style>
      <div className="bld-trace">
        <div className="bld-trace-header">
          <span className="bld-trace-header-name">Span</span>
          <span className="bld-trace-header-bar">Waterfall ({totalSec}s)</span>
        </div>

        {rows.map((row, idx) => {
          const offsetPct = ((row.startTs - globalStart) / globalDuration) * 100;
          const widthPct = Math.max(((row.endTs - row.startTs) / globalDuration) * 100, 1);
          const durationMs = row.endTs - row.startTs;
          const durationLabel = durationMs >= 1000
            ? `${(durationMs / 1000).toFixed(1)}s`
            : `${durationMs}ms`;
          const color = AGENT_COLORS[row.colorIdx % AGENT_COLORS.length];
          const isSelected = selectedIdx === idx;
          const isExpandable = row.kind === 'tool' && row.detail;

          return (
            <div key={idx}>
              <div
                className={`bld-trace-row${isSelected ? ' bld-trace-row--selected' : ''}`}
                onClick={() => isExpandable && toggleRow(idx)}
                role={isExpandable ? 'button' : undefined}
                tabIndex={isExpandable ? 0 : undefined}
                onKeyDown={isExpandable ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleRow(idx);
                  }
                } : undefined}
                aria-expanded={isExpandable ? isSelected : undefined}
              >
                <div className="bld-trace-label" style={{ paddingLeft: `${8 + row.depth * 20}px` }}>
                  <span className="bld-trace-icon">
                    {row.kind === 'agent' ? '\u2BC8' : '\u2699'}
                  </span>
                  <span className={`bld-trace-name${row.kind === 'tool' ? ' bld-trace-name--tool' : ''}`}>
                    {row.label}
                  </span>
                  <span className="bld-trace-dur">{durationLabel}</span>
                </div>
                <div className="bld-trace-bar-area">
                  <div
                    className={`bld-trace-bar bld-trace-bar--${row.kind}`}
                    style={{
                      left: `${offsetPct}%`,
                      width: `${widthPct}%`,
                      background: color,
                    }}
                  />
                </div>
              </div>

              {isSelected && row.detail && (
                <div className="bld-trace-detail">
                  {row.detail.args && Object.keys(row.detail.args).length > 0 && (
                    <div className="bld-trace-detail-section">
                      <div className="bld-trace-detail-label">Arguments</div>
                      <pre className="bld-trace-detail-pre">
                        {JSON.stringify(row.detail.args, null, 2)}
                      </pre>
                    </div>
                  )}
                  {row.detail.result && (
                    <div className="bld-trace-detail-section">
                      <div className="bld-trace-detail-label">Result</div>
                      <pre className="bld-trace-detail-pre">{row.detail.result}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        <div className="bld-trace-summary">
          <span className="bld-trace-summary-item">
            {agentCount} agent{agentCount !== 1 ? 's' : ''}
          </span>
          <span className="bld-trace-summary-item">
            {toolCount} tool call{toolCount !== 1 ? 's' : ''}
          </span>
          <span className="bld-trace-summary-item">
            {totalSec}s total
          </span>
        </div>
      </div>
    </>
  );
}
