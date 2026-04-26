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
import styles from './InspectorDrawer.module.css';

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
    <div
      className={styles.bldInspector}
      role="complementary"
      aria-label="Inspector panel"
    >
      <div className={styles.bldInspectorHeader}>
        <span className={styles.bldInspectorTitle}>Inspector</span>
        <button
          className={styles.bldInspectorClose}
          onClick={onClose}
          type="button"
          aria-label="Close inspector"
        >
          &#10005;
        </button>
      </div>

      <div className={styles.bldInspectorTabs} role="tablist">
        {[
          {
            id: 'events' as const,
            label: 'Events',
            badge: events.length || null,
          },
          { id: 'trace' as const, label: 'Trace', badge: null },
          { id: 'session' as const, label: 'Session', badge: null },
        ].map(tab => (
          <button
            key={tab.id}
            className={`${styles.bldInspectorTab} ${
              activeTab === tab.id ? styles.bldInspectorTabActive : ''
            }`}
            onClick={() => setActiveTab(tab.id)}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
          >
            {tab.label}
            {tab.badge !== null && tab.badge > 0 && (
              <span className={styles.bldInspectorTabBadge}>{tab.badge}</span>
            )}
          </button>
        ))}
      </div>

      <div className={styles.bldInspectorBody} role="tabpanel">
        {activeTab === 'events' && <EventTimeline events={events} />}
        {activeTab === 'trace' && <AgentTrace events={events} />}
        {activeTab === 'session' && (
          <div className={styles.bldSessionInfo}>
            <div className={styles.bldSessionRow}>
              <span className={styles.bldSessionLabel}>Context ID</span>
              <span
                className={`${styles.bldSessionValue} ${styles.bldSessionValueMono}`}
              >
                {contextId || 'Not started'}
              </span>
            </div>
            <div className={styles.bldSessionRow}>
              <span className={styles.bldSessionLabel}>Messages</span>
              <span className={styles.bldSessionValue}>{messageCount}</span>
            </div>
            <div className={styles.bldSessionRow}>
              <span className={styles.bldSessionLabel}>Total Events</span>
              <span className={styles.bldSessionValue}>{events.length}</span>
            </div>
            {totalTime && (
              <div className={styles.bldSessionRow}>
                <span className={styles.bldSessionLabel}>Total Time</span>
                <span className={styles.bldSessionValue}>{totalTime}s</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
