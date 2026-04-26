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
import { useState, useEffect, useCallback, useRef } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { skillMarketplaceApiRef } from '../api';

const DEFAULT_POLL_INTERVAL_MS = 30_000;

/** SMP agent keys returned by the backend /agents/health (when enabled). */
const SMP_AGENT_KEYS = [
  'skillAdvisor',
  'bundleValidator',
  'kgQa',
  'playground',
  'skillBuilder',
] as const;

const DEFAULT_KAGENTI_CAPABILITIES = [
  'skill_context',
  'exec',
  'web_fetch',
  'read_file',
  'write_file',
] as const;

function parseKagentiCapabilities(data: object): { capabilities: string[] } {
  const card = data as Record<string, unknown>;
  const caps = (card.capabilities ?? card.skills ?? card.tools) as
    | string[]
    | undefined;
  if (Array.isArray(caps) && caps.length > 0) {
    return {
      capabilities: caps.map(c =>
        typeof c === 'string'
          ? c
          : String((c as Record<string, unknown>).name ?? c),
      ),
    };
  }
  return { capabilities: [...DEFAULT_KAGENTI_CAPABILITIES] };
}

function mergeSmpFromHealth(
  lastChecked: Date,
  health: Record<string, unknown>,
): Record<string, AgentStatus> {
  const out: Record<string, AgentStatus> = {};
  const configured = health.smpAgentsConfigured === true;
  const err = configured
    ? 'SMP health details unavailable (endpoint missing or request failed)'
    : 'SMP agents not configured';
  for (const name of SMP_AGENT_KEYS) {
    out[name] = { available: false, lastChecked, error: err };
  }
  return out;
}

function applySmpHealth(
  lastChecked: Date,
  smp: Record<
    string,
    { configured: boolean; healthy: boolean; error?: string }
  >,
  fallbacks: Record<string, AgentStatus>,
): Record<string, AgentStatus> {
  const out: Record<string, AgentStatus> = { ...fallbacks };
  for (const name of SMP_AGENT_KEYS) {
    const h = smp[name];
    if (!h) {
      if (!out[name]) {
        out[name] = {
          available: false,
          lastChecked,
          error: 'Not reported by health endpoint',
        };
      }
      continue;
    }
    out[name] = {
      available: h.configured && h.healthy,
      lastChecked,
      error: h.error,
    };
  }
  for (const [k, h] of Object.entries(smp)) {
    if (SMP_AGENT_KEYS.includes(k as (typeof SMP_AGENT_KEYS)[number])) {
      continue;
    }
    out[k] = {
      available: h.configured && h.healthy,
      lastChecked,
      error: h.error,
    };
  }
  return out;
}

/**
 * Kagenti / plugin /health may omit optional blocks; this normalizes
 * a minimal status map for keys implied by the response.
 */
function statusFromTopLevelHealth(
  health: Record<string, unknown>,
  lastChecked: Date,
): Record<string, AgentStatus> {
  const agents: Record<string, AgentStatus> = {};

  if (Object.prototype.hasOwnProperty.call(health, 'kagentiConfigured')) {
    agents['kagenti:configured'] = {
      available: health.kagentiConfigured === true,
      lastChecked,
    };
  }
  if (Object.prototype.hasOwnProperty.call(health, 'smpAgentsConfigured')) {
    agents['smp:configured'] = {
      available: health.smpAgentsConfigured === true,
      lastChecked,
    };
  }
  if (Object.prototype.hasOwnProperty.call(health, 'neo4jConfigured')) {
    agents['neo4j:configured'] = {
      available: health.neo4jConfigured === true,
      lastChecked,
    };
  }
  if (Object.prototype.hasOwnProperty.call(health, 'ociRegistryConfigured')) {
    agents['oci:configured'] = {
      available: health.ociRegistryConfigured === true,
      lastChecked,
    };
  }

  return agents;
}

/** @public */
export interface AgentStatus {
  available: boolean;
  lastChecked: Date;
  error?: string;
}

/** @public */
export interface AgentAvailability {
  agents: Record<string, AgentStatus>;
  isLoading: boolean;
  error: Error | null;
  refresh: () => void;
  isAgentAvailable: (agentName: string) => boolean;
}

export interface UseAgentAvailabilityOptions {
  /**
   * Polling interval in ms. Default 30_000. Set to 0 to disable polling
   * (only initial load and `refresh` run the check).
   */
  pollIntervalMs?: number;
}

/**
 * Augments {@link AgentAvailability} with Kagenti defaults and capabilities
 * for the skills playground, derived from the same checks as the status map.
 */
export interface UseAgentAvailabilityResult extends AgentAvailability {
  kagentiDefaults?: { namespace: string; agentName: string };
  kagentiCapabilities: string[];
}

/**
 * Fetches /health, verifies Kagenti via `getAgentCard` when defaults exist,
 * and merges /agents/health (when the SMP client is enabled on the backend).
 * Partial responses are merged so missing keys still yield {@link AgentStatus} rows.
 */
export function useAgentAvailability(
  options: UseAgentAvailabilityOptions = {},
): UseAgentAvailabilityResult {
  const { pollIntervalMs = DEFAULT_POLL_INTERVAL_MS } = options;
  const api = useApi(skillMarketplaceApiRef);
  const [agents, setAgents] = useState<Record<string, AgentStatus>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [kagentiDefaults, setKagentiDefaults] = useState<
    { namespace: string; agentName: string } | undefined
  >();
  const [kagentiCapabilities, setKagentiCapabilities] = useState<string[]>([
    ...DEFAULT_KAGENTI_CAPABILITIES,
  ]);

  const [refreshToken, setRefreshToken] = useState(0);
  const refresh = useCallback(() => {
    setRefreshToken(n => n + 1);
  }, []);

  const agentsRef = useRef(agents);
  agentsRef.current = agents;
  const isAgentAvailable = useCallback((agentName: string) => {
    return agentsRef.current[agentName]?.available ?? false;
  }, []);

  const isFirstRunRef = useRef(true);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (isFirstRunRef.current) {
        setIsLoading(true);
      }
      setError(null);
      const lastChecked = new Date();
      const next: Record<string, AgentStatus> = {};
      let health: Record<string, unknown>;
      try {
        health = (await api.getHealth()) as Record<string, unknown>;
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e : new Error(String(e)));
          setIsLoading(false);
        }
        isFirstRunRef.current = false;
        return;
      }

      if (cancelled) return;
      Object.assign(next, statusFromTopLevelHealth(health, lastChecked));

      const kc = health.kagentiConfigured === true;
      const kagenti = health.kagenti as
        | { namespace?: string; agentName?: string }
        | undefined;
      const ns = kagenti?.namespace;
      const agentName = kagenti?.agentName;

      if (kc && ns && agentName) {
        if (!cancelled) {
          setKagentiDefaults({ namespace: ns, agentName });
        }
        try {
          const data = (await api.getAgentCard(ns, agentName)) as unknown;
          if (cancelled) return;
          if (data && typeof data === 'object') {
            const { capabilities } = parseKagentiCapabilities(data);
            if (!cancelled) setKagentiCapabilities(capabilities);
            next.kagenti = { available: true, lastChecked };
          } else {
            next.kagenti = {
              available: false,
              lastChecked,
              error: 'Agent card response empty',
            };
          }
        } catch (err) {
          if (!cancelled) {
            next.kagenti = {
              available: false,
              lastChecked,
              error: err instanceof Error ? err.message : String(err),
            };
          }
        }
      } else {
        if (!cancelled) {
          setKagentiDefaults(undefined);
        }
        next.kagenti = {
          available: false,
          lastChecked,
          error: kc
            ? 'Kagenti configured but default namespace or agent name missing in /health'
            : 'Kagenti not configured',
        };
      }

      if (cancelled) return;

      const smpFallbacks = mergeSmpFromHealth(lastChecked, health);
      try {
        const smpHealth = await api.getAgentsHealth();
        if (cancelled) return;
        const mergedSmp = applySmpHealth(lastChecked, smpHealth, smpFallbacks);
        Object.assign(next, mergedSmp);
      } catch {
        if (cancelled) return;
        Object.assign(next, smpFallbacks);
      }

      if (!cancelled) {
        setAgents(next);
        if (isFirstRunRef.current) {
          isFirstRunRef.current = false;
        }
        setIsLoading(false);
      }
    };

    void run();
    if (pollIntervalMs <= 0) {
      return () => {
        cancelled = true;
      };
    }
    const id = window.setInterval(() => {
      void run();
    }, pollIntervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [api, refreshToken, pollIntervalMs]);

  return {
    agents,
    isLoading,
    error,
    refresh,
    isAgentAvailable,
    kagentiDefaults,
    kagentiCapabilities,
  };
}
