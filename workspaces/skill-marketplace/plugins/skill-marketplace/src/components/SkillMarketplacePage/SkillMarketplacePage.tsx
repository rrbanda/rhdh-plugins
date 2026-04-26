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
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { useRouteRef } from '@backstage/core-plugin-api';
import { useTheme } from '@material-ui/core/styles';
import { rootRouteRef } from '../../routes';

import '@patternfly/patternfly/patternfly.min.css';
import '@patternfly/patternfly/patternfly-addons.css';
import './SkillMarketplacePage.css';
import smLayoutStyles from './SkillMarketplacePage.module.css';

import OverviewPage from '../home/OverviewPage';
import { SkillIntro, INTRO_KEY } from '../home/SkillIntro';
import SkillsPage from '../skills/SkillsPage';
import SkillDetailPage from '../skills/SkillDetailPage';
import GraphPage from '../graph/GraphPage';
import BuilderStudio from '../builder/BuilderStudio';
import SkillsPlayground from '../agents/AgentsPage';
import AgentDetailPage from '../agents/AgentDetailPage';
import BundleBrowser from '../bundles/BundleBrowser';
import BundleCart from '../bundles/BundleCart';
import {
  useSkills,
  SkillsProvider,
  BundleProvider,
  useBundle,
} from '../../hooks';
import LoadingSpinner from '../shared/LoadingSpinner';

class PluginErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error(
      'SkillMarketplace uncaught error:',
      error,
      info.componentStack,
    );
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, textAlign: 'center' }}>
          <h3>Something went wrong</h3>
          <p style={{ color: 'var(--sm-text-secondary)' }}>
            {this.state.error.message}
          </p>
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

const smThemeVars = (isDark: boolean): Record<string, string> => ({
  '--sm-surface-primary': isDark ? '#1e1e1e' : '#ffffff',
  '--sm-surface-secondary': isDark ? '#2a2a2a' : '#f5f5f5',
  '--sm-surface-card': isDark ? '#252525' : '#ffffff',
  '--sm-surface-hover': isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
  '--sm-surface-input': isDark ? '#333333' : '#ffffff',
  '--sm-surface-raised': isDark ? '#2e2e2e' : '#fafafa',
  '--sm-surface-overlay': isDark
    ? 'rgba(30,30,30,0.95)'
    : 'rgba(255,255,255,0.95)',
  '--sm-text-primary': isDark ? '#e0e0e0' : '#151515',
  '--sm-text-secondary': isDark ? '#a3a3a3' : '#6a6e73',
  '--sm-text-on-brand': '#ffffff',
  '--sm-text-link': isDark ? '#5eaee8' : '#0066cc',
  '--sm-border-default': isDark ? '#3a3a3a' : '#d2d2d2',
  '--sm-border-subtle': isDark ? '#333333' : '#eeeef0',
  '--sm-brand': isDark ? '#4d9de0' : '#0066cc',
  '--sm-brand-tint': isDark ? 'rgba(77,157,224,0.12)' : 'rgba(0,102,204,0.06)',
  '--sm-brand-hover': isDark ? 'rgba(77,157,224,0.18)' : 'rgba(0,102,204,0.12)',
  '--sm-success': '#10b981',
  '--sm-success-tint': isDark
    ? 'rgba(16,185,129,0.15)'
    : 'rgba(16,185,129,0.08)',
  '--sm-warning': '#f59e0b',
  '--sm-warning-tint': isDark
    ? 'rgba(245,158,11,0.15)'
    : 'rgba(245,158,11,0.08)',
  '--sm-danger': '#ef4444',
  '--sm-danger-tint': isDark ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.08)',
  '--sm-shadow': isDark
    ? '0 1px 3px rgba(0,0,0,0.4)'
    : '0 1px 3px rgba(0,0,0,0.06)',
  '--sm-shadow-lg': isDark
    ? '0 4px 12px rgba(0,0,0,0.5)'
    : '0 4px 12px rgba(0,0,0,0.08)',
  '--sm-scrim': isDark ? 'rgba(0,0,0,0.75)' : 'rgba(0,0,0,0.5)',
  '--sm-gradient-hero': isDark
    ? 'linear-gradient(135deg, #1a2332 0%, #1e1e1e 50%, #222 100%)'
    : 'linear-gradient(135deg, #f0f7ff 0%, #fafbff 50%, #fff 100%)',
  '--sm-chat-bubble-radius': '20px',
  '--sm-chat-code-bg': isDark ? '#1a1a2e' : '#f8f9fa',
  '--sm-chat-thought-color': isDark ? '#9aa0a6' : '#80868b',
});

const SkillMarketplacePageInner = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const basePath = useRouteRef(rootRouteRef)();
  const muiTheme = useTheme();
  const isDark = muiTheme.palette.type === 'dark';
  const themeStyle = useMemo(
    () => smThemeVars(isDark) as React.CSSProperties,
    [isDark],
  );
  const { skills, marketplace, loading } = useSkills();
  const {
    toggleDrawer,
    skills: cartSkills,
    lastAdded,
    drawerOpen,
  } = useBundle();
  const [showIntro, setShowIntro] = useState(
    () => !localStorage.getItem(INTRO_KEY),
  );

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
    { label: 'Skill Graph', path: 'graph' },
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
        <div className={smLayoutStyles.smRoot} style={themeStyle}>
          <div
            className={smLayoutStyles.smContent}
            style={{ background: '#000' }}
          >
            <LoadingSpinner message="" />
          </div>
        </div>
      );
    }
    return plugins.length > 0 ? (
      <div className={smLayoutStyles.smRoot} style={themeStyle}>
        <div className={smLayoutStyles.smContent}>
          <SkillIntro
            plugins={plugins}
            skillCount={skills.length}
            categoryCount={plugins.length}
            onDismiss={dismissIntro}
            onNavigate={path => navigate(path)}
          />
        </div>
      </div>
    ) : null;
  }

  return (
    <div className={smLayoutStyles.smRoot} style={themeStyle}>
      <nav
        className={smLayoutStyles.smTopnav}
        aria-label="Skill Marketplace navigation"
      >
        <div className={smLayoutStyles.smTabs} role="tablist">
          {navItems.map(item => (
            <button
              key={item.path}
              role="tab"
              aria-selected={isActive(item.path)}
              className={`${smLayoutStyles.smTab} ${
                isActive(item.path) ? smLayoutStyles.smTabActive : ''
              }`}
              onClick={() => navigate(item.path || '.')}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
        <button
          className={smLayoutStyles.smCartBtn}
          onClick={toggleDrawer}
          aria-label={`Skill Bundle Cart${cartSkills.length > 0 ? `, ${cartSkills.length} items` : ''}`}
          type="button"
        >
          <svg
            viewBox="0 0 24 24"
            width={15}
            height={15}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <circle cx="9" cy="21" r="1" />
            <circle cx="20" cy="21" r="1" />
            <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6" />
          </svg>
          {cartSkills.length > 0 && (
            <span className={smLayoutStyles.smCartBadge}>
              {cartSkills.length}
            </span>
          )}
        </button>
      </nav>
      {lastAdded && (
        <div
          className={smLayoutStyles.smToast}
          role="status"
          aria-live="polite"
        >
          <svg viewBox="0 0 16 16" width={14} height={14} fill="currentColor">
            <path d="M13.485 1.929a1 1 0 010 1.414l-7.071 7.071a1 1 0 01-1.414 0L1.929 7.343a1 1 0 111.414-1.414L5.707 8.293l6.364-6.364a1 1 0 011.414 0z" />
          </svg>
          {lastAdded}
        </div>
      )}
      <div className={smLayoutStyles.smContent}>
        <PluginErrorBoundary>
          <Routes>
            <Route index element={<OverviewPage />} />
            <Route path="skills" element={<SkillsPage />} />
            <Route path="skills/:slug" element={<SkillDetailPage />} />
            <Route path="bundles" element={<BundleBrowser />} />
            <Route path="graph" element={<GraphPage />} />
            <Route path="builder" element={<BuilderStudio />} />
            <Route path="playground" element={<SkillsPlayground />} />
            <Route path="agents/:agentName" element={<AgentDetailPage />} />
          </Routes>
        </PluginErrorBoundary>
      </div>
      {cartSkills.length > 0 && !drawerOpen && (
        <div className={smLayoutStyles.smFloatingCart}>
          <svg
            viewBox="0 0 24 24"
            width={15}
            height={15}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <circle cx="9" cy="21" r="1" />
            <circle cx="20" cy="21" r="1" />
            <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6" />
          </svg>
          <span className={smLayoutStyles.smFloatingCartLabel}>
            Bundle Cart:{' '}
            <strong>
              {cartSkills.length} skill{cartSkills.length !== 1 ? 's' : ''}
            </strong>
          </span>
          <button
            className={smLayoutStyles.smFloatingCartBtn}
            onClick={toggleDrawer}
            type="button"
          >
            View Cart
          </button>
        </div>
      )}
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
