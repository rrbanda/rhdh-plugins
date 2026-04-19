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
import { useState, useMemo } from 'react';
import type { BuilderEvent } from '../types';
import { EventTimeline } from './EventTimeline';
import { AgentTrace } from './AgentTrace';

const inspectorStyles = `
.bld-inspector {
  width: 340px;
  min-width: 340px;
  height: 100%;
  border-left: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
  display: flex;
  flex-direction: column;
  background: var(--pf-t--global--background--color--primary--default, #fff);
  overflow: hidden;
  animation: bld-slide-in 0.2s ease;
}
@keyframes bld-slide-in {
  from { transform: translateX(20px); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}

.bld-inspector-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--pf-t--global--border--color--default, #e8e8e8);
  flex-shrink: 0;
}
.bld-inspector-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--pf-t--global--text--color--regular, #151515);
}
.bld-inspector-close {
  border: none;
  background: none;
  cursor: pointer;
  font-size: 16px;
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
  width: 28px;
  height: 28px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.bld-inspector-close:hover {
  background: var(--pf-t--global--background--color--secondary--default, #f0f0f0);
}
.bld-inspector-close:focus-visible {
  outline: 2px solid var(--pf-t--global--color--brand--default, #0066cc);
}

.bld-inspector-tabs {
  display: flex;
  border-bottom: 1px solid var(--pf-t--global--border--color--default, #e8e8e8);
  flex-shrink: 0;
}
.bld-inspector-tab {
  flex: 1;
  padding: 10px 12px;
  font-size: 12px;
  font-weight: 500;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
  border-bottom: 2px solid transparent;
  transition: all 0.15s;
}
.bld-inspector-tab:hover {
  color: var(--pf-t--global--text--color--regular, #151515);
}
.bld-inspector-tab--active {
  color: var(--pf-t--global--color--brand--default, #0066cc);
  border-bottom-color: var(--pf-t--global--color--brand--default, #0066cc);
}
.bld-inspector-tab:focus-visible {
  outline: 2px solid var(--pf-t--global--color--brand--default, #0066cc);
  outline-offset: -2px;
}
.bld-inspector-tab-badge {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 8px;
  background: var(--pf-t--global--background--color--secondary--default, #f0f0f0);
  margin-left: 4px;
}

.bld-inspector-body {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.bld-session-info {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.bld-session-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.bld-session-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
}
.bld-session-value {
  font-size: 13px;
  color: var(--pf-t--global--text--color--regular, #151515);
  word-break: break-all;
}
.bld-session-value--mono {
  font-family: var(--pf-t--global--font--family--mono, 'Red Hat Mono', monospace);
  font-size: 12px;
}
`;

type InspectorTab = 'events' | 'trace' | 'session';

interface InspectorDrawerProps {
  open: boolean;
  onClose: () => void;
  events: BuilderEvent[];
  contextId: string;
  messageCount: number;
}

export function InspectorDrawer({
  open,
  onClose,
  events,
  contextId,
  messageCount,
}: InspectorDrawerProps) {
  const [activeTab, setActiveTab] = useState<InspectorTab>('events');

  const totalTime = useMemo(() => {
    if (events.length < 2) return null;
    const first = events[0].ts;
    const last = events[events.length - 1].ts;
    return ((last - first) / 1000).toFixed(1);
  }, [events]);

  if (!open) return null;

  return (
    <>
      <style>{inspectorStyles}</style>
      <div className="bld-inspector" role="complementary" aria-label="Inspector panel">
        <div className="bld-inspector-header">
          <span className="bld-inspector-title">Inspector</span>
          <button
            className="bld-inspector-close"
            onClick={onClose}
            type="button"
            aria-label="Close inspector"
          >
            &#10005;
          </button>
        </div>

        <div className="bld-inspector-tabs" role="tablist">
          {([
            { id: 'events' as const, label: 'Events', badge: events.length || null },
            { id: 'trace' as const, label: 'Trace', badge: null },
            { id: 'session' as const, label: 'Session', badge: null },
          ]).map(tab => (
            <button
              key={tab.id}
              className={`bld-inspector-tab ${activeTab === tab.id ? 'bld-inspector-tab--active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
            >
              {tab.label}
              {tab.badge !== null && tab.badge > 0 && (
                <span className="bld-inspector-tab-badge">{tab.badge}</span>
              )}
            </button>
          ))}
        </div>

        <div className="bld-inspector-body" role="tabpanel">
          {activeTab === 'events' && <EventTimeline events={events} />}
          {activeTab === 'trace' && <AgentTrace events={events} />}
          {activeTab === 'session' && (
            <div className="bld-session-info">
              <div className="bld-session-row">
                <span className="bld-session-label">Context ID</span>
                <span className="bld-session-value bld-session-value--mono">
                  {contextId || 'Not started'}
                </span>
              </div>
              <div className="bld-session-row">
                <span className="bld-session-label">Messages</span>
                <span className="bld-session-value">{messageCount}</span>
              </div>
              <div className="bld-session-row">
                <span className="bld-session-label">Total Events</span>
                <span className="bld-session-value">{events.length}</span>
              </div>
              {totalTime && (
                <div className="bld-session-row">
                  <span className="bld-session-label">Total Time</span>
                  <span className="bld-session-value">{totalTime}s</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
