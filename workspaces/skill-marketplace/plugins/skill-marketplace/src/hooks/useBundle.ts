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
import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { skillMarketplaceApiRef } from '../api';
import type {
  ResolvedDependencyTree,
  CreateBundleResponse,
} from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import { toYaml } from '../utils/toYaml';

export interface BundleSkill {
  name: string;
  slug: string;
  category: string;
  description: string;
}

export interface BundleState {
  skills: BundleSkill[];
  resolved: ResolvedDependencyTree | null;
  resolving: boolean;
  resolveError: string | null;
  drawerOpen: boolean;
  lastAdded: string | null;
  addSkill: (skill: {
    name: string;
    slug: string;
    category: string;
    description: string;
  }) => void;
  addSkills: (
    skills: Array<{
      name: string;
      slug: string;
      category: string;
      description: string;
    }>,
  ) => number;
  removeSkill: (name: string) => void;
  reorderSkill: (slug: string, direction: 'up' | 'down') => void;
  clearCart: () => void;
  toggleDrawer: () => void;
  setDrawerOpen: (open: boolean) => void;
  saveBundle: (
    name: string,
    description: string,
  ) => Promise<CreateBundleResponse>;
  exportBundle: (
    name: string,
    description: string,
    format?: 'json' | 'yaml',
  ) => void;
  hasSkill: (name: string) => boolean;
  updateBundleStatus: (
    id: string,
    status: string,
  ) => Promise<{ id: string; status: string }>;
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
  } catch {
    /* ignore quota errors */
  }
}

const BundleContext = createContext<BundleState>({
  skills: [],
  resolved: null,
  resolving: false,
  resolveError: null,
  drawerOpen: false,
  lastAdded: null,
  addSkill: () => {},
  addSkills: () => 0,
  removeSkill: () => {},
  reorderSkill: () => {},
  clearCart: () => {},
  toggleDrawer: () => {},
  setDrawerOpen: () => {},
  saveBundle: async () => ({}) as CreateBundleResponse,
  exportBundle: () => {
    /* no-op */
  },
  hasSkill: () => false,
  updateBundleStatus: async () => ({ id: '', status: '' }),
});

export function BundleProvider({ children }: { children: React.ReactNode }) {
  const api = useApi(skillMarketplaceApiRef);
  const [skills, setSkills] = useState<BundleSkill[]>(loadFromStorage);
  const [resolved, setResolved] = useState<ResolvedDependencyTree | null>(null);
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    saveToStorage(skills);
  }, [skills]);

  useEffect(() => {
    if (skills.length === 0) {
      setResolved(null);
      setResolveError(null);
      return undefined;
    }
    let cancelled = false;
    setResolving(true);
    setResolveError(null);
    const skillNames = skills.map(s => s.name);
    api
      .resolveDependencies(skillNames)
      .then(data => {
        if (!cancelled) setResolved(data);
      })
      .catch(err => {
        console.warn('useBundle: dependency resolution failed', err);
        if (!cancelled) {
          setResolved(null);
          // Graceful degradation: do not surface raw HTTP/backstage error text in the UI
          setResolveError(null);
        }
      })
      .finally(() => {
        if (!cancelled) setResolving(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, skills]);

  const showToast = useCallback((msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setLastAdded(msg);
    toastTimerRef.current = setTimeout(() => setLastAdded(null), 2500);
  }, []);

  const addSkill = useCallback(
    (skill: {
      name: string;
      slug: string;
      category: string;
      description: string;
    }) => {
      setSkills(prev => {
        if (prev.some(s => s.name === skill.name)) return prev;
        return [...prev, { ...skill }];
      });
      showToast(
        `Added "${skill.name.split(':').pop() || skill.name}" to bundle cart`,
      );
    },
    [showToast],
  );

  const addSkills = useCallback(
    (
      batch: Array<{
        name: string;
        slug: string;
        category: string;
        description: string;
      }>,
    ) => {
      let added = 0;
      setSkills(prev => {
        const existing = new Set(prev.map(s => s.name));
        const newOnes = batch.filter(s => !existing.has(s.name));
        added = newOnes.length;
        return newOnes.length > 0 ? [...prev, ...newOnes] : prev;
      });
      if (added > 0) {
        showToast(`Added ${added} skill${added > 1 ? 's' : ''} to bundle cart`);
      }
      return added;
    },
    [showToast],
  );

  const removeSkill = useCallback((name: string) => {
    setSkills(prev => prev.filter(s => s.name !== name));
  }, []);

  const reorderSkill = useCallback((slug: string, direction: 'up' | 'down') => {
    setSkills(prev => {
      const idx = prev.findIndex(s => s.slug === slug);
      if (idx < 0) return prev;
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
      return next;
    });
  }, []);

  const clearCart = useCallback(() => {
    setSkills([]);
    setResolved(null);
  }, []);

  const toggleDrawer = useCallback(() => {
    setDrawerOpen(prev => !prev);
  }, []);

  const hasSkill = useCallback(
    (name: string) => {
      return skills.some(s => s.name === name);
    },
    [skills],
  );

  const saveBundle = useCallback(
    async (name: string, description: string) => {
      const slugs = skills.map(s => s.slug);
      const result = await api.createBundle({
        name,
        description,
        skillSlugs: slugs,
      });
      setSkills([]);
      setResolved(null);
      return result;
    },
    [api, skills],
  );

  const updateBundleStatus = useCallback(
    async (id: string, status: string) => {
      return api.updateBundleStatus(id, status);
    },
    [api],
  );

  const exportBundle = useCallback(
    (name: string, description: string, format: 'json' | 'yaml' = 'json') => {
      const data = {
        name,
        description,
        author: 'local-export',
        createdAt: new Date().toISOString(),
        skills: skills.map(s => ({
          name: s.name,
          slug: s.slug,
          category: s.category,
          addedBy: 'user',
          description: s.description,
        })),
        dependencies: resolved?.dependencies ?? [],
        toolRequirements: resolved?.tools ?? [],
        similarSuggestions: resolved?.similar ?? [],
        totalSkills: skills.length + (resolved?.dependencies?.length ?? 0),
        manuallyAdded: skills.length,
        autoDependencies: resolved?.dependencies?.length ?? 0,
      };
      const baseFile = `${name.toLowerCase().replace(/\s+/g, '-')}-bundle`;
      const body =
        format === 'yaml' ? toYaml(data) : JSON.stringify(data, null, 2);
      const mime =
        format === 'yaml' ? 'text/yaml;charset=utf-8' : 'application/json';
      const blob = new Blob([body], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = format === 'yaml' ? `${baseFile}.yaml` : `${baseFile}.json`;
      a.click();
      URL.revokeObjectURL(url);
    },
    [skills, resolved],
  );

  const value = useMemo(
    () => ({
      skills,
      resolved,
      resolving,
      resolveError,
      drawerOpen,
      lastAdded,
      addSkill,
      addSkills,
      removeSkill,
      reorderSkill,
      clearCart,
      toggleDrawer,
      setDrawerOpen,
      saveBundle,
      exportBundle,
      hasSkill,
      updateBundleStatus,
    }),
    [
      skills,
      resolved,
      resolving,
      resolveError,
      drawerOpen,
      lastAdded,
      addSkill,
      addSkills,
      removeSkill,
      reorderSkill,
      clearCart,
      toggleDrawer,
      saveBundle,
      exportBundle,
      hasSkill,
      updateBundleStatus,
    ],
  );

  return React.createElement(BundleContext.Provider, { value }, children);
}

export function useBundle(): BundleState {
  return useContext(BundleContext);
}
