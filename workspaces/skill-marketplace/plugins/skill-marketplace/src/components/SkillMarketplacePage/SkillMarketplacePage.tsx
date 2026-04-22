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
import BuilderStudio from '../builder/BuilderStudio';
import GapsExplorer from '../graph/GapsExplorer';
import AnalyticsPage from '../graph/AnalyticsPage';
import SkillsPlayground from '../agents/AgentsPage';
import BundleBrowser from '../bundles/BundleBrowser';
import BundleCart from '../bundles/BundleCart';
import { useSkills, SkillsProvider, BundleProvider, useBundle } from '../../hooks';
import LoadingSpinner from '../shared/LoadingSpinner';

const SkillMarketplacePageInner = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const basePath = useRouteRef(rootRouteRef)();
  const { skills, marketplace, loading } = useSkills();
  const { toggleDrawer, skills: cartSkills } = useBundle();
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
    { label: 'Bundles', path: 'bundles' },
    { label: 'Gaps', path: 'gaps' },
    { label: 'Skill Graph', path: 'graph' },
    { label: 'Analytics', path: 'analytics' },
    { label: 'Skill Builder', path: 'builder' },
    { label: 'Skills Playground', path: 'playground' },
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
        <button className="sm-cart-btn" onClick={toggleDrawer} aria-label={`Skill Bundle Cart${cartSkills.length > 0 ? `, ${cartSkills.length} items` : ''}`}>
          <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
            <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6" />
          </svg>
          {cartSkills.length > 0 && <span className="sm-cart-badge">{cartSkills.length}</span>}
        </button>
      </nav>
      <div className="sm-content">
        <PluginErrorBoundary>
          <Routes>
            <Route index element={<OverviewPage />} />
            <Route path="skills" element={<SkillsPage />} />
            <Route path="skills/:slug" element={<SkillDetailPage />} />
            <Route path="bundles" element={<BundleBrowser />} />
            <Route path="gaps" element={<GapsExplorer />} />
            <Route path="graph" element={<GraphPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="builder" element={<BuilderStudio />} />
            <Route path="playground" element={<SkillsPlayground />} />
          </Routes>
        </PluginErrorBoundary>
      </div>
    </div>
  );
};

export const SkillMarketplacePage = () => (
  <SkillsProvider>
    <BundleProvider>
      <SkillMarketplacePageInner />
      <BundleCart />
    </BundleProvider>
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
    gap: 12px;
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
    overflow-x: auto;
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
  .sm-tabs::-webkit-scrollbar { display: none; }
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
  .sm-cart-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-left: auto;
    padding: 4px 10px;
    border-radius: 6px;
    border: 1px solid var(--pf-t--global--border--color--default, #d2d2d2);
    background: var(--pf-t--global--background--color--primary--default, #fff);
    color: var(--pf-t--global--text--color--subtle, #6a6e73);
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    transition: all 0.15s;
    position: relative;
  }
  .sm-cart-btn:hover {
    border-color: var(--pf-t--global--color--brand--default, #0066cc);
    color: var(--pf-t--global--color--brand--default, #0066cc);
  }
  .sm-cart-badge {
    font-size: 10px;
    padding: 0 5px;
    border-radius: 999px;
    background: var(--pf-t--global--color--brand--default, #0066cc);
    color: #fff;
    font-weight: 700;
    line-height: 16px;
    min-width: 16px;
    text-align: center;
  }
`;
