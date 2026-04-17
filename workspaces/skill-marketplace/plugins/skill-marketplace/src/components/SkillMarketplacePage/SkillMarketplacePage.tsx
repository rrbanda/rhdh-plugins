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
import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { useRouteRef } from '@backstage/core-plugin-api';
import { rootRouteRef } from '../../routes';

import '@patternfly/patternfly/patternfly.min.css';
import '@patternfly/patternfly/patternfly-addons.css';
import './SkillMarketplacePage.css';

import OverviewPage from '../home/OverviewPage';
import { SkillIntro, INTRO_KEY } from '../home/SkillIntro';
import SkillsPage from '../skills/SkillsPage';
import SkillDetailPage from '../skills/SkillDetailPage';
import GraphPage from '../graph/GraphPage';
import BuilderPage from '../builder/BuilderPage';
import AgentsPage from '../agents/AgentsPage';
import AgentDetailPage from '../agents/AgentDetailPage';
import { useSkills, SkillsProvider } from '../../hooks';
import LoadingSpinner from '../shared/LoadingSpinner';

const SkillMarketplacePageInner = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const basePath = useRouteRef(rootRouteRef)();
  const { skills, marketplace, loading } = useSkills();
  const [showIntro, setShowIntro] = useState(() => !localStorage.getItem(INTRO_KEY));

  const dismissIntro = useCallback(() => {
    localStorage.setItem(INTRO_KEY, '1');
    setShowIntro(false);
  }, []);

  useEffect(() => {
    const handler = () => setShowIntro(true);
    window.addEventListener('sm-replay-intro', handler);
    return () => window.removeEventListener('sm-replay-intro', handler);
  }, []);

  const currentPath = location.pathname.replace(basePath, '') || '/';

  const navItems = [
    { label: 'Overview', path: '' },
    { label: 'Skills', path: 'skills' },
    { label: 'Playground', path: 'agents' },
    { label: 'Skill Graph', path: 'graph' },
    { label: 'Skill Builder', path: 'builder' },
  ];

  const isActive = (path: string) => {
    if (path === '' && (currentPath === '/' || currentPath === '')) return true;
    return path !== '' && currentPath.startsWith(`/${path}`);
  };

  const plugins = marketplace?.plugins ?? [];

  useEffect(() => {
    if (showIntro && !loading && plugins.length === 0) {
      dismissIntro();
    }
  }, [showIntro, loading, plugins.length, dismissIntro]);

  if (showIntro) {
    if (loading) {
      return (
        <div className="sm-root">
          <style>{layoutStyles}</style>
          <div className="sm-content" style={{ background: '#000' }}>
            <LoadingSpinner message="" />
          </div>
        </div>
      );
    }
    return plugins.length > 0 ? (
      <div className="sm-root">
        <style>{layoutStyles}</style>
        <div className="sm-content">
          <SkillIntro
            plugins={plugins}
            skillCount={skills.length}
            categoryCount={plugins.length}
            onDismiss={dismissIntro}
            onNavigate={(path) => navigate(path)}
          />
        </div>
      </div>
    ) : null;
  }

  return (
    <div className="sm-root">
      <style>{layoutStyles}</style>
      <nav className="sm-topnav" aria-label="Skill Marketplace navigation">
        <div className="sm-tabs" role="tablist">
          {navItems.map(item => (
            <button
              key={item.path}
              role="tab"
              aria-selected={isActive(item.path)}
              className={`sm-tab ${isActive(item.path) ? 'sm-tab-active' : ''}`}
              onClick={() => navigate(item.path || '.')}
            >
              {item.label}
            </button>
          ))}
        </div>
      </nav>
      <div className="sm-content">
        <PluginErrorBoundary>
          <Routes>
            <Route index element={<OverviewPage />} />
            <Route path="skills" element={<SkillsPage />} />
            <Route path="skills/:slug" element={<SkillDetailPage />} />
            <Route path="agents" element={<AgentsPage />} />
            <Route path="agents/:namespace/:name" element={<AgentDetailPage />} />
            <Route path="graph" element={<GraphPage />} />
            <Route path="builder" element={<BuilderPage />} />
          </Routes>
        </PluginErrorBoundary>
      </div>
    </div>
  );
};

export const SkillMarketplacePage = () => (
  <SkillsProvider>
    <SkillMarketplacePageInner />
  </SkillsProvider>
);

class PluginErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('SkillMarketplace uncaught error:', error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, textAlign: 'center' }}>
          <h3>Something went wrong</h3>
          <p style={{ color: '#6a6e73' }}>{this.state.error.message}</p>
          <button
            onClick={() => this.setState({ error: null })}
            style={{ marginTop: 12, padding: '8px 16px', cursor: 'pointer' }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const layoutStyles = `
  .sm-root {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }
  .sm-topnav {
    display: flex;
    align-items: center;
    padding: 0 24px;
    height: 44px;
    border-bottom: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
    background: var(--pf-t--global--background--color--secondary--default, #f5f5f5);
    flex-shrink: 0;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
  }
  .sm-tabs {
    display: flex;
    gap: 4px;
    height: 100%;
    align-items: stretch;
  }
  .sm-tab {
    display: flex;
    align-items: center;
    padding: 0 16px;
    font-size: 13.5px;
    font-weight: 600;
    color: var(--pf-t--global--text--color--subtle, #6a6e73);
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    transition: all 0.15s;
    font-family: inherit;
    white-space: nowrap;
    letter-spacing: 0.01em;
  }
  .sm-tab:hover {
    color: var(--pf-t--global--text--color--regular, #151515);
    background: rgba(0,0,0,0.03);
  }
  .sm-tab-active {
    color: var(--pf-t--global--color--brand--default, #0066cc);
    border-bottom-color: var(--pf-t--global--color--brand--default, #0066cc);
    font-weight: 700;
    background: var(--pf-t--global--background--color--primary--default, #fff);
  }
  .sm-content {
    flex: 1;
    overflow: auto;
    min-height: 0;
  }
`;
