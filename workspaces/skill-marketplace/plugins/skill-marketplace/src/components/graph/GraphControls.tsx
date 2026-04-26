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
import React from 'react';
import type { PluginGroup } from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import type { LayoutMode } from './graphConstants';
import styles from './GraphPage.module.css';

export function GraphControls({
  layout,
  onSetLayout,
  pluginGroups,
  filterOpen,
  onToggleFilterOpen,
  filterRef,
  enabledPlugins,
  onTogglePlugin,
  onClearPluginFilters,
  nodeCount,
  relCount,
  searchQuery,
  onSearchChange,
  onFitToScreen,
  onResetView,
}: {
  layout: LayoutMode;
  onSetLayout: (mode: LayoutMode) => void;
  pluginGroups: PluginGroup[];
  filterOpen: boolean;
  onToggleFilterOpen: () => void;
  filterRef: React.RefObject<HTMLDivElement>;
  enabledPlugins: Set<string>;
  onTogglePlugin: (plugin: string) => void;
  onClearPluginFilters: () => void;
  nodeCount: number;
  relCount: number;
  searchQuery: string;
  onSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onFitToScreen: () => void;
  onResetView: () => void;
}) {
  return (
    <div className={`${styles.graphToolbar} ${styles.graphControls}`}>
      <div className={styles.layoutSwitcher}>
        {(
          [
            { mode: 'forceDirected' as const, label: 'Force' },
            { mode: 'hierarchical' as const, label: 'Tree' },
          ] as const
        ).map(({ mode, label }) => (
          <button
            key={mode}
            type="button"
            onClick={() => onSetLayout(mode)}
            className={`${styles.layoutBtn} ${layout === mode ? styles.layoutBtnActive : ''}`}
          >
            {label}
          </button>
        ))}
      </div>

      {pluginGroups.length > 0 && (
        <div className={styles.pluginFilterWrap} ref={filterRef}>
          <button
            type="button"
            onClick={onToggleFilterOpen}
            aria-haspopup="listbox"
            aria-expanded={filterOpen}
            className={`${styles.pluginFilterBtn} ${
              enabledPlugins.size > 0 ? styles.pluginFilterBtnActive : ''
            }`}
          >
            <svg
              viewBox="0 0 16 16"
              width={12}
              height={12}
              fill="currentColor"
              aria-hidden
            >
              <path d="M1.5 1.5A.5.5 0 012 1h12a.5.5 0 01.37.835L9.5 7.586V13a.5.5 0 01-.252.434l-3 1.75A.5.5 0 015.5 14.75V7.586L.63 1.835A.5.5 0 011.5 1.5z" />
            </svg>
            Plugins
            {enabledPlugins.size > 0 && (
              <span className={styles.pluginBadge}>{enabledPlugins.size}</span>
            )}
          </button>
          {filterOpen && (
            <div className={styles.pluginPopover} role="listbox">
              {enabledPlugins.size > 0 && (
                <button
                  type="button"
                  className={styles.pluginClear}
                  onClick={onClearPluginFilters}
                >
                  Clear all filters
                </button>
              )}
              {pluginGroups.map(pg => {
                const isActive = enabledPlugins.has(pg.name);
                return (
                  <button
                    key={pg.name}
                    type="button"
                    onClick={() => onTogglePlugin(pg.name)}
                    role="option"
                    aria-selected={isActive}
                    className={`${styles.pluginItem} ${isActive ? styles.pluginItemActive : ''}`}
                    style={
                      isActive
                        ? ({ '--pg-color': pg.color } as React.CSSProperties)
                        : undefined
                    }
                  >
                    <span
                      className={styles.pluginDot}
                      style={{
                        background: isActive ? pg.color : 'transparent',
                        borderColor: isActive
                          ? pg.color
                          : 'var(--sm-text-secondary)',
                      }}
                    />
                    {pg.name.replace(/-/g, ' ')}
                    <span className={styles.pluginCount}>{pg.count}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className={styles.controlsSpacer} />

      <span className={styles.nodeEdgeCount}>
        {nodeCount}n &middot; {relCount}e
      </span>

      <div className={styles.searchWrap}>
        <svg
          className={styles.searchIcon}
          viewBox="0 0 16 16"
          width={12}
          height={12}
          fill="currentColor"
          aria-hidden
        >
          <path d="M11.742 10.344a6.5 6.5 0 10-1.397 1.398h-.001l3.85 3.85a1 1 0 001.415-1.414l-3.85-3.85zm-5.442.156a5 5 0 110-10 5 5 0 010 10z" />
        </svg>
        <input
          type="text"
          placeholder="Search graph..."
          aria-label="Search knowledge graph"
          value={searchQuery}
          onChange={onSearchChange}
          className={styles.searchInput}
        />
      </div>

      <button
        type="button"
        onClick={onFitToScreen}
        className={styles.actionBtn}
        title="Fit to screen"
        aria-label="Fit graph to screen"
      >
        ⛶
      </button>
      <button
        type="button"
        onClick={onResetView}
        className={styles.actionBtn}
        title="Reset view"
        aria-label="Reset graph view"
      >
        ↺
      </button>
    </div>
  );
}
