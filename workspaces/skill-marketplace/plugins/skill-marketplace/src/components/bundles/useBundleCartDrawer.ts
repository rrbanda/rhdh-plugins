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
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRouteRef } from '@backstage/core-plugin-api';
import { rootRouteRef } from '../../routes';
import {
  useBundle,
  useSkills,
  useSkillAdvisor,
  useBundleValidator,
  useAgenticAvailable,
} from '../../hooks';

const AI_COOLDOWN_MS = 10_000;

export function useBundleCartDrawer() {
  const {
    skills,
    resolved,
    resolving,
    resolveError,
    drawerOpen,
    setDrawerOpen,
    removeSkill,
    reorderSkill,
    clearCart,
    saveBundle,
    exportBundle,
  } = useBundle();
  const { skills: catalogSkills } = useSkills();
  const advisor = useSkillAdvisor(catalogSkills);
  const validator = useBundleValidator();
  const navigate = useNavigate();
  const basePath = useRouteRef(rootRouteRef)();
  const agenticAvailable = useAgenticAvailable();

  const [saving, setSaving] = useState(false);
  const [bundleName, setBundleName] = useState('');
  const [bundleDesc, setBundleDesc] = useState('');
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState('');
  const [saveError, setSaveError] = useState('');
  const [advisorInput, setAdvisorInput] = useState('');
  const [activePanel, setActivePanel] = useState<
    'none' | 'advisor' | 'validator'
  >('none');

  const advisorCooldownRef = useRef<number>(0);
  const validatorCooldownRef = useRef<number>(0);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, forceUpdate] = useState(0);

  const isAdvisorCooling =
    Date.now() - advisorCooldownRef.current < AI_COOLDOWN_MS;
  const isValidatorCooling =
    Date.now() - validatorCooldownRef.current < AI_COOLDOWN_MS;
  const aiUnavailable = agenticAvailable === false;

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen, setDrawerOpen]);

  const handleSave = async () => {
    if (!bundleName.trim()) return;
    setSaving(true);
    try {
      const result = await saveBundle(bundleName, bundleDesc);
      const unmatched = result.unmatchedSlugs;
      setSaveError('');
      const base = `Skill bundle "${bundleName}" saved!`;
      setSaveSuccess(
        unmatched?.length
          ? `${base} (${unmatched.length} skill slug(s) not found)`
          : base,
      );
      setBundleName('');
      setBundleDesc('');
      setShowSaveForm(false);
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        setSaveSuccess('');
        setDrawerOpen(false);
      }, 2000);
    } catch (err: unknown) {
      setSaveSuccess('');
      const msg =
        err instanceof Error ? err.message : 'Failed to save skill bundle';
      setSaveError(msg);
      if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
      errorTimeoutRef.current = setTimeout(() => setSaveError(''), 4000);
    } finally {
      setSaving(false);
    }
  };

  const handleExport = (format: 'json' | 'yaml' = 'json') => {
    const name = bundleName.trim() || 'skill-bundle';
    exportBundle(name, bundleDesc, format);
  };

  const handleAdvisorAsk = () => {
    if (!advisorInput.trim() || isAdvisorCooling) return;
    advisorCooldownRef.current = Date.now();
    setTimeout(() => forceUpdate(n => n + 1), AI_COOLDOWN_MS);
    const cartNames = skills.map(s => s.name);
    advisor.ask(advisorInput.trim(), cartNames);
  };

  const handleValidate = () => {
    if (isValidatorCooling) return;
    validatorCooldownRef.current = Date.now();
    setTimeout(() => forceUpdate(n => n + 1), AI_COOLDOWN_MS);
    const names = skills.map(s => s.name);
    const deps =
      resolved?.dependencies?.map(d => (d as { name: string }).name) ?? [];
    const tools = resolved?.tools?.map(t => (t as { name: string }).name) ?? [];
    validator.validate(names, deps, tools);
  };

  const handleTestBundle = () => {
    const skillNames = skills.map(s => s.name).join(',');
    const params = new URLSearchParams();
    params.set('skills', skillNames);
    if (bundleName.trim()) {
      params.set('bundleName', bundleName.trim());
    }
    navigate(`${basePath}/playground?${params.toString()}`);
    setDrawerOpen(false);
  };

  return {
    skills,
    resolved,
    resolving,
    resolveError,
    drawerOpen,
    setDrawerOpen,
    removeSkill,
    reorderSkill,
    clearCart,
    advisor,
    validator,
    saving,
    bundleName,
    setBundleName,
    bundleDesc,
    setBundleDesc,
    showSaveForm,
    setShowSaveForm,
    saveSuccess,
    saveError,
    advisorInput,
    setAdvisorInput,
    activePanel,
    setActivePanel,
    isAdvisorCooling,
    isValidatorCooling,
    aiUnavailable,
    handleSave,
    handleExport,
    handleAdvisorAsk,
    handleValidate,
    handleTestBundle,
  };
}
