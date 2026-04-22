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
import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { skillMarketplaceApiRef } from '../api';

export interface BundleSkill {
  name: string;
  slug: string;
  category: string;
  description: string;
  addedBy: 'user' | 'dependency';
  dependencyOf?: string;
}

export interface ResolvedData {
  dependencies: Array<{ name: string; category: string; description: string; dependencyOf: string }>;
  tools: Array<{ name: string; description: string }>;
  similar: Array<{ name: string; category: string; description: string; similarTo: string }>;
}

interface BundleState {
  skills: BundleSkill[];
  resolved: ResolvedData | null;
  resolving: boolean;
  drawerOpen: boolean;
  addSkill: (skill: { name: string; slug: string; category: string; description: string }) => void;
  removeSkill: (name: string) => void;
  clearCart: () => void;
  toggleDrawer: () => void;
  setDrawerOpen: (open: boolean) => void;
  saveBundle: (name: string, description: string) => Promise<Record<string, unknown>>;
  exportBundle: (name: string, description: string) => void;
  hasSkill: (name: string) => boolean;
}

const STORAGE_KEY = 'skill-marketplace-bundle-cart';

function loadFromStorage(): BundleSkill[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveToStorage(skills: BundleSkill[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(skills));
  } catch { /* ignore quota errors */ }
}

const BundleContext = createContext<BundleState>({
  skills: [],
  resolved: null,
  resolving: false,
  drawerOpen: false,
  addSkill: () => {},
  removeSkill: () => {},
  clearCart: () => {},
  toggleDrawer: () => {},
  setDrawerOpen: () => {},
  saveBundle: async () => ({}),
  exportBundle: () => {},
  hasSkill: () => false,
});

export function BundleProvider({ children }: { children: React.ReactNode }) {
  const api = useApi(skillMarketplaceApiRef);
  const [skills, setSkills] = useState<BundleSkill[]>(loadFromStorage);
  const [resolved, setResolved] = useState<ResolvedData | null>(null);
  const [resolving, setResolving] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    saveToStorage(skills);
  }, [skills]);

  useEffect(() => {
    if (skills.length === 0) {
      setResolved(null);
      return;
    }
    let cancelled = false;
    setResolving(true);
    const userSkillNames = skills.filter(s => s.addedBy === 'user').map(s => s.name);
    if (userSkillNames.length === 0) {
      setResolving(false);
      return;
    }
    api.resolveDependencies(userSkillNames)
      .then(data => {
        if (!cancelled) setResolved(data as ResolvedData);
      })
      .catch(() => {
        if (!cancelled) setResolved(null);
      })
      .finally(() => {
        if (!cancelled) setResolving(false);
      });
    return () => { cancelled = true; };
  }, [api, skills]);

  const addSkill = useCallback((skill: { name: string; slug: string; category: string; description: string }) => {
    setSkills(prev => {
      if (prev.some(s => s.name === skill.name)) return prev;
      return [...prev, { ...skill, addedBy: 'user' as const }];
    });
    setDrawerOpen(true);
  }, []);

  const removeSkill = useCallback((name: string) => {
    setSkills(prev => prev.filter(s => s.name !== name));
  }, []);

  const clearCart = useCallback(() => {
    setSkills([]);
    setResolved(null);
  }, []);

  const toggleDrawer = useCallback(() => {
    setDrawerOpen(prev => !prev);
  }, []);

  const hasSkill = useCallback((name: string) => {
    return skills.some(s => s.name === name);
  }, [skills]);

  const saveBundle = useCallback(async (name: string, description: string) => {
    const slugs = skills.map(s => s.slug);
    const result = await api.createBundle({ name, description, skillSlugs: slugs });
    setSkills([]);
    setResolved(null);
    setDrawerOpen(false);
    return result;
  }, [api, skills]);

  const exportBundle = useCallback((name: string, description: string) => {
    const data = {
      name,
      description,
      skills: skills.map(s => ({
        name: s.name,
        slug: s.slug,
        category: s.category,
        addedBy: s.addedBy,
        description: s.description,
      })),
      dependencies: resolved?.dependencies ?? [],
      toolRequirements: resolved?.tools?.map(t => t.name) ?? [],
      similarSuggestions: resolved?.similar?.map(s => s.name) ?? [],
      totalSkills: skills.length + (resolved?.dependencies?.length ?? 0),
      manuallyAdded: skills.filter(s => s.addedBy === 'user').length,
      autoDependencies: resolved?.dependencies?.length ?? 0,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.toLowerCase().replace(/\s+/g, '-')}-bundle.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [skills, resolved]);

  const value = useMemo(() => ({
    skills, resolved, resolving, drawerOpen,
    addSkill, removeSkill, clearCart, toggleDrawer, setDrawerOpen, saveBundle, exportBundle, hasSkill,
  }), [skills, resolved, resolving, drawerOpen, addSkill, removeSkill, clearCart, toggleDrawer, saveBundle, exportBundle, hasSkill]);

  return React.createElement(BundleContext.Provider, { value }, children);
}

export function useBundle(): BundleState {
  return useContext(BundleContext);
}
