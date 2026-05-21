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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import type { KagentiBuildStrategy } from '@red-hat-developer-hub/backstage-plugin-augment-common';
import type { SelectChangeEvent } from '@mui/material/Select';
import { augmentApiRef } from '../../../api';
import { getErrorMessage } from '../../../utils';
import type {
  BuildArgRow,
  BuildProgress,
  DeploymentMethod,
  EnvRow,
  EnvSource,
  PortProtocol,
  ServicePortRow,
} from './wizardSharedTypes';
import { isValidDns1123 } from './wizardSharedTypes';
import {
  getDuplicateEnvNames,
  nextRowId,
  parsePositivePort,
} from './wizardSharedUtils';

const BUILD_POLL_INTERVAL_MS = 4000;
const BUILD_TIMEOUT_WARN_MS = 10 * 60 * 1000;

const INTERNAL_REGISTRY_BASE =
  'image-registry.openshift-image-registry.svc:5000';

function defaultRegistryUrl(ns: string): string {
  return ns ? `${INTERNAL_REGISTRY_BASE}/${ns}` : INTERNAL_REGISTRY_BASE;
}

const INTERNAL_REGISTRY_RE = new RegExp(
  `^${INTERNAL_REGISTRY_BASE.replace(/\./g, '\\.')}(\\/[a-z0-9-]*)?$`,
);

// ---------------------------------------------------------------------------
// Config & callback types
// ---------------------------------------------------------------------------

export interface WizardFormBaseConfig {
  entityLabel: string;
  stepsLength: number;
  maxPollErrors: number;
  defaultProtocol: string;
  defaultFramework: string;
  defaultImageTag: string;
  defaultAuthBridgeEnabled: boolean;
}

interface BuildInfoResponse {
  buildRunPhase?: string | null;
  buildRunName?: string | null;
  buildRunFailureMessage?: string | null;
  buildRunStartTime?: string | null;
  outputImage?: string;
  strategy?: string;
  gitUrl?: string;
  contextDir?: string | null;
}

export interface WizardEntityApi {
  createEntity: (body: any) => Promise<{ message: string }>;
  getBuildInfo: (ns: string, name: string) => Promise<BuildInfoResponse>;
  finalizeBuild: (ns: string, name: string) => Promise<{ message: string }>;
  triggerBuild: (ns: string, name: string) => Promise<any>;
}

export interface WizardFormDynamicCallbacks {
  entityApi: WizardEntityApi;
  buildRequest: () => any;
  extraReset?: () => void;
  beforeSourcePoll?: () => void;
}

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface WizardFormBaseReturn {
  activeStep: number;
  setActiveStep: (step: number) => void;
  submitting: boolean;
  submitError: string | null;
  setSubmitError: (v: string | null) => void;
  successOpen: boolean;
  setSuccessOpen: (v: boolean) => void;
  handleNext: () => void;
  handleBack: () => void;
  handleSubmit: () => Promise<void>;

  buildProgress: BuildProgress;
  handleRetryBuild: () => void;
  handleCloseBuild: () => void;

  name: string;
  setName: (v: string) => void;
  namespace: string;
  setNamespace: (v: string) => void;
  protocol: string;
  setProtocol: (v: string) => void;
  framework: string;
  setFramework: (v: string) => void;
  availableNamespaces: string[];
  nameError: string | undefined;

  deploymentMethod: DeploymentMethod;
  setDeploymentMethod: (v: DeploymentMethod) => void;
  containerImage: string;
  setContainerImage: (v: string) => void;
  imagePullSecret: string;
  setImagePullSecret: (v: string) => void;
  gitUrl: string;
  setGitUrl: (v: string) => void;
  gitRef: string;
  setGitRef: (v: string) => void;
  gitContextDir: string;
  setGitContextDir: (v: string) => void;
  registryUrl: string;
  setRegistryUrl: (v: string) => void;
  registrySecret: string;
  setRegistrySecret: (v: string) => void;
  imageTag: string;
  setImageTag: (v: string) => void;
  buildStrategy: string;
  setBuildStrategy: (v: string) => void;
  buildStrategies: KagentiBuildStrategy[];
  buildStrategyError: string | null;
  dockerfile: string;
  setDockerfile: (v: string) => void;
  buildArgRows: BuildArgRow[];
  addBuildArgRow: () => void;
  updateBuildArgRow: (id: number, value: string) => void;
  removeBuildArgRow: (id: number) => void;
  buildTimeout: string;
  setBuildTimeout: (v: string) => void;

  workloadType: string;
  setWorkloadType: (v: string) => void;
  envRows: EnvRow[];
  addEnvRow: () => void;
  updateEnvRow: (id: number, patch: Partial<EnvRow>) => void;
  removeEnvRow: (id: number) => void;
  portRows: ServicePortRow[];
  addPortRow: () => void;
  updatePortRow: (id: number, patch: Partial<ServicePortRow>) => void;
  removePortRow: (id: number) => void;
  handlePortProtocol: (id: number, e: SelectChangeEvent<PortProtocol>) => void;
  createHttpRoute: boolean;
  setCreateHttpRoute: (v: boolean) => void;
  authBridgeEnabled: boolean;
  setAuthBridgeEnabled: (v: boolean) => void;
  spireEnabled: boolean;
  setSpireEnabled: (v: boolean) => void;
  duplicateEnvNames: Set<string>;
  portErrors: Map<number, string>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useWizardFormBase(
  open: boolean,
  namespaceProp: string | undefined,
  onClose: () => void,
  onCreated: () => void,
  config: WizardFormBaseConfig,
  callbacksRef: React.MutableRefObject<WizardFormDynamicCallbacks>,
  initialDeploymentMethod?: DeploymentMethod,
): WizardFormBaseReturn {
  const api = useApi(augmentApiRef);
  const rowIdRef = useRef(0);
  const wasOpenRef = useRef(false);

  const {
    entityLabel,
    stepsLength,
    maxPollErrors,
    defaultProtocol,
    defaultFramework,
    defaultImageTag,
    defaultAuthBridgeEnabled,
  } = config;

  // Stable refs for callbacks that change identity but rarely change behavior
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onCreatedRef = useRef(onCreated);
  onCreatedRef.current = onCreated;

  // -------------------------------------------------------------------------
  // Wizard chrome state
  // -------------------------------------------------------------------------

  const [activeStep, setActiveStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successOpen, setSuccessOpen] = useState(false);

  // -------------------------------------------------------------------------
  // Build-progress state & refs
  // -------------------------------------------------------------------------

  const [buildProgress, setBuildProgress] = useState<BuildProgress>({
    phase: 'idle',
    elapsedMs: 0,
    pollErrorCount: 0,
  });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollErrorCountRef = useRef(0);
  const buildNameRef = useRef('');
  const buildNsRef = useRef('');

  // -------------------------------------------------------------------------
  // Step 0 — Basics
  // -------------------------------------------------------------------------

  const [name, setName] = useState('');
  const [namespace, setNamespace] = useState(namespaceProp ?? '');
  const [protocol, setProtocol] = useState(defaultProtocol);
  const [framework, setFramework] = useState(defaultFramework);
  const [availableNamespaces, setAvailableNamespaces] = useState<string[]>([]);

  // -------------------------------------------------------------------------
  // Step 1 — Deployment
  // -------------------------------------------------------------------------

  const [deploymentMethod, setDeploymentMethod] = useState<DeploymentMethod>(
    initialDeploymentMethod ?? 'image',
  );
  const [containerImage, setContainerImage] = useState('');
  const [imagePullSecret, setImagePullSecret] = useState('');
  const [gitUrl, setGitUrl] = useState('');
  const [gitRef, setGitRef] = useState('main');
  const [gitContextDir, setGitContextDir] = useState('');
  const [registryUrl, setRegistryUrl] = useState(
    defaultRegistryUrl(namespaceProp ?? ''),
  );
  const [registrySecret, setRegistrySecret] = useState('');
  const [imageTag, setImageTag] = useState(defaultImageTag);
  const [buildStrategy, setBuildStrategy] = useState('');
  const [buildStrategies, setBuildStrategies] = useState<
    KagentiBuildStrategy[]
  >([]);
  const [buildStrategyError, setBuildStrategyError] = useState<string | null>(
    null,
  );
  const [dockerfile, setDockerfile] = useState('Dockerfile');
  const [buildArgRows, setBuildArgRows] = useState<BuildArgRow[]>([]);
  const [buildTimeout, setBuildTimeout] = useState('15m');

  // -------------------------------------------------------------------------
  // Step 2 — Runtime
  // -------------------------------------------------------------------------

  const [workloadType, setWorkloadType] = useState<string>('deployment');
  const [envRows, setEnvRows] = useState<EnvRow[]>([]);
  const [portRows, setPortRows] = useState<ServicePortRow[]>([]);
  const [createHttpRoute, setCreateHttpRoute] = useState(false);
  const [authBridgeEnabled, setAuthBridgeEnabled] = useState(
    defaultAuthBridgeEnabled,
  );
  const [spireEnabled, setSpireEnabled] = useState(false);

  // -------------------------------------------------------------------------
  // Polling helpers
  // -------------------------------------------------------------------------

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (elapsedRef.current) {
      clearInterval(elapsedRef.current);
      elapsedRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  // -------------------------------------------------------------------------
  // Reset
  // -------------------------------------------------------------------------

  const resetForm = useCallback(() => {
    stopPolling();
    rowIdRef.current = 0;
    setActiveStep(0);
    setSubmitError(null);
    setName('');
    setNamespace(namespaceProp ?? '');
    setProtocol(defaultProtocol);
    setFramework(defaultFramework);
    setDeploymentMethod(initialDeploymentMethod ?? 'image');
    setContainerImage('');
    setImagePullSecret('');
    setGitUrl('');
    setGitRef('main');
    setGitContextDir('');
    setRegistryUrl(defaultRegistryUrl(namespaceProp ?? ''));
    setRegistrySecret('');
    setImageTag(defaultImageTag);
    setBuildStrategy('');
    setBuildStrategyError(null);
    setDockerfile('Dockerfile');
    setBuildArgRows([]);
    setBuildTimeout('15m');
    setWorkloadType('deployment');
    setEnvRows([]);
    setPortRows([]);
    setCreateHttpRoute(false);
    setAuthBridgeEnabled(defaultAuthBridgeEnabled);
    setSpireEnabled(false);
    setBuildProgress({ phase: 'idle', elapsedMs: 0, pollErrorCount: 0 });
    buildNameRef.current = '';
    buildNsRef.current = '';
    pollErrorCountRef.current = 0;
    callbacksRef.current.extraReset?.();
  }, [
    namespaceProp,
    initialDeploymentMethod,
    stopPolling,
    defaultProtocol,
    defaultFramework,
    defaultImageTag,
    defaultAuthBridgeEnabled,
    callbacksRef,
  ]);

  // -------------------------------------------------------------------------
  // Open / namespace / registry effects
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      resetForm();
      api
        .listKagentiBuildStrategies()
        .then(r => {
          setBuildStrategies(r.strategies ?? []);
          setBuildStrategyError(null);
        })
        .catch(() => {
          setBuildStrategies([]);
          setBuildStrategyError('Failed to load build strategies.');
        });
      api
        .listKagentiNamespaces()
        .then(r => setAvailableNamespaces(r.namespaces ?? []))
        .catch(() => setAvailableNamespaces([]));
    }
    wasOpenRef.current = open;
  }, [open, resetForm, api]);

  useEffect(() => {
    setNamespace(n => namespaceProp ?? n);
  }, [namespaceProp]);

  useEffect(() => {
    setRegistryUrl(prev =>
      INTERNAL_REGISTRY_RE.test(prev) ? defaultRegistryUrl(namespace) : prev,
    );
  }, [namespace]);

  // -------------------------------------------------------------------------
  // Derived / computed
  // -------------------------------------------------------------------------

  const nameError = useMemo((): string | undefined => {
    const trimmed = name.trim();
    if (!trimmed) return undefined;
    if (!isValidDns1123(trimmed)) {
      return 'Lowercase alphanumeric and hyphens only. Must start/end with alphanumeric (max 63 chars).';
    }
    return undefined;
  }, [name]);

  const duplicateEnvNames = useMemo(
    () => getDuplicateEnvNames(envRows),
    [envRows],
  );

  const portErrors = useMemo((): Map<number, string> => {
    const errors = new Map<number, string>();
    for (const row of portRows) {
      if (row.port.trim() && parsePositivePort(row.port) === undefined) {
        errors.set(row.id, 'Port must be 1\u201365535');
      }
    }
    return errors;
  }, [portRows]);

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------

  const validateStep0 = useCallback((): boolean => {
    const trimmedName = name.trim();
    if (!trimmedName || !namespace.trim()) return false;
    if (!isValidDns1123(trimmedName)) return false;
    return true;
  }, [name, namespace]);

  const validateStep1 = useCallback((): boolean => {
    if (deploymentMethod === 'image') return Boolean(containerImage.trim());
    return Boolean(gitUrl.trim());
  }, [deploymentMethod, containerImage, gitUrl]);

  // -------------------------------------------------------------------------
  // Navigation
  // -------------------------------------------------------------------------

  const handleNext = useCallback(() => {
    setSubmitError(null);
    if (activeStep === 0 && !validateStep0()) {
      const trimmedName = name.trim();
      if (!trimmedName || !namespace.trim()) {
        setSubmitError('Name and namespace are required.');
      } else {
        setSubmitError(`${entityLabel} name must be a valid DNS-1123 label.`);
      }
      return;
    }
    if (activeStep === 1 && !validateStep1()) {
      setSubmitError(
        deploymentMethod === 'image'
          ? 'Container image is required.'
          : 'Git URL is required for source deployment.',
      );
      return;
    }
    setActiveStep(s => Math.min(s + 1, stepsLength - 1));
  }, [
    activeStep,
    validateStep0,
    validateStep1,
    deploymentMethod,
    name,
    namespace,
    entityLabel,
    stepsLength,
  ]);

  const handleBack = useCallback(() => {
    setSubmitError(null);
    setActiveStep(s => Math.max(s - 1, 0));
  }, []);

  // -------------------------------------------------------------------------
  // Build polling
  // -------------------------------------------------------------------------

  const startBuildPolling = useCallback(
    (entityName: string, entityNamespace: string) => {
      buildNameRef.current = entityName;
      buildNsRef.current = entityNamespace;
      pollErrorCountRef.current = 0;
      const startedAt = Date.now();

      elapsedRef.current = setInterval(() => {
        const elapsed = Date.now() - startedAt;
        setBuildProgress(prev => {
          const next = { ...prev, elapsedMs: elapsed };
          if (
            elapsed >= BUILD_TIMEOUT_WARN_MS &&
            prev.phase === 'building' &&
            !prev.message?.includes('taking longer')
          ) {
            next.message =
              'Build is taking longer than expected. It will continue in the background if you close this dialog.';
          }
          return next;
        });
      }, 1000);

      const doPoll = async () => {
        try {
          const eApi = callbacksRef.current.entityApi;
          const info = await eApi.getBuildInfo(entityNamespace, entityName);
          const elapsed = Date.now() - startedAt;
          const phase = info.buildRunPhase?.toLowerCase() ?? '';
          pollErrorCountRef.current = 0;

          if (phase === 'succeeded') {
            stopPolling();
            setBuildProgress(prev => ({
              ...prev,
              phase: 'finalizing',
              buildRunPhase: info.buildRunPhase ?? undefined,
              outputImage: info.outputImage,
              elapsedMs: elapsed,
              message: `Build complete. Deploying ${entityLabel.toLowerCase()}…`,
              pollErrorCount: 0,
            }));

            try {
              const result = await eApi.finalizeBuild(
                entityNamespace,
                entityName,
              );
              setBuildProgress(prev => ({
                ...prev,
                phase: 'complete',
                elapsedMs: Date.now() - startedAt,
                message: result.message,
                deployFailedAfterBuild: false,
              }));
              setSuccessOpen(true);
              onCreatedRef.current();
            } catch (finErr) {
              setBuildProgress(prev => ({
                ...prev,
                phase: 'failed',
                elapsedMs: Date.now() - startedAt,
                failureMessage: `Build succeeded but deployment failed: ${getErrorMessage(finErr)}`,
                deployFailedAfterBuild: true,
              }));
            }
          } else if (phase === 'failed') {
            stopPolling();
            setBuildProgress(prev => ({
              ...prev,
              phase: 'failed',
              buildRunPhase: info.buildRunPhase ?? undefined,
              elapsedMs: elapsed,
              failureMessage: info.buildRunFailureMessage ?? 'Build failed.',
              deployFailedAfterBuild: false,
            }));
          } else {
            setBuildProgress(prev => ({
              ...prev,
              buildRunPhase: info.buildRunPhase ?? undefined,
              buildRunName: info.buildRunName ?? undefined,
              outputImage: info.outputImage,
              strategy: info.strategy,
              gitUrl: info.gitUrl,
              contextDir: info.contextDir ?? undefined,
              startTime: info.buildRunStartTime ?? undefined,
              elapsedMs: elapsed,
              pollErrorCount: 0,
            }));
          }
        } catch {
          pollErrorCountRef.current += 1;
          setBuildProgress(prev => ({
            ...prev,
            pollErrorCount: pollErrorCountRef.current,
          }));
          if (pollErrorCountRef.current >= maxPollErrors) {
            stopPolling();
            setBuildProgress(prev => ({
              ...prev,
              phase: 'failed',
              failureMessage:
                'Lost connection to the build service. The build may still be running — check Build Pipelines for status.',
            }));
          }
        }
      };

      setTimeout(doPoll, 1000);
      pollRef.current = setInterval(doPoll, BUILD_POLL_INTERVAL_MS);
    },
    [stopPolling, callbacksRef, entityLabel, maxPollErrors],
  );

  // -------------------------------------------------------------------------
  // Submit
  // -------------------------------------------------------------------------

  const handleSubmit = useCallback(async () => {
    setSubmitError(null);
    if (!validateStep0()) {
      setSubmitError(
        'Name and namespace are required, and name must be a valid DNS-1123 label.',
      );
      setActiveStep(0);
      return;
    }
    if (!validateStep1()) {
      setSubmitError(
        deploymentMethod === 'image'
          ? 'Container image is required.'
          : 'Git URL is required for source deployment.',
      );
      setActiveStep(1);
      return;
    }
    if (portErrors.size > 0) {
      setSubmitError('Fix invalid service port entries before submitting.');
      return;
    }
    if (duplicateEnvNames.size > 0) {
      setSubmitError(
        `Duplicate environment variable names: ${Array.from(duplicateEnvNames).join(', ')}`,
      );
      return;
    }

    const cb = callbacksRef.current;
    const body = cb.buildRequest();
    setSubmitting(true);

    try {
      const result = await cb.entityApi.createEntity(body);

      if (deploymentMethod === 'source') {
        setSubmitting(false);
        setActiveStep(stepsLength);
        setBuildProgress({
          phase: 'building',
          elapsedMs: 0,
          message: result.message,
          pollErrorCount: 0,
        });
        cb.beforeSourcePoll?.();
        startBuildPolling(body.name, body.namespace);
      } else {
        setSuccessOpen(true);
        onCreatedRef.current();
        onCloseRef.current();
      }
    } catch (err) {
      setSubmitError(getErrorMessage(err));
      setSubmitting(false);
    } finally {
      if (deploymentMethod !== 'source') {
        setSubmitting(false);
      }
    }
  }, [
    validateStep0,
    validateStep1,
    deploymentMethod,
    portErrors,
    duplicateEnvNames,
    startBuildPolling,
    stepsLength,
    callbacksRef,
  ]);

  // -------------------------------------------------------------------------
  // Retry / close build
  // -------------------------------------------------------------------------

  const handleRetryBuild = useCallback(() => {
    if (!buildNameRef.current || !buildNsRef.current) return;
    const ns = buildNsRef.current;
    const entityName = buildNameRef.current;
    const wasDeployFailure = buildProgress.deployFailedAfterBuild;
    const eApi = callbacksRef.current.entityApi;

    if (wasDeployFailure) {
      setBuildProgress(prev => ({
        ...prev,
        phase: 'finalizing',
        failureMessage: undefined,
        message: 'Retrying deployment…',
        pollErrorCount: 0,
      }));
      eApi
        .finalizeBuild(ns, entityName)
        .then(result => {
          setBuildProgress(prev => ({
            ...prev,
            phase: 'complete',
            message: result.message,
            deployFailedAfterBuild: false,
          }));
          setSuccessOpen(true);
          onCreatedRef.current();
        })
        .catch(err => {
          setBuildProgress(prev => ({
            ...prev,
            phase: 'failed',
            failureMessage: `Deployment failed: ${getErrorMessage(err)}`,
            deployFailedAfterBuild: true,
          }));
        });
    } else {
      setBuildProgress({
        phase: 'building',
        elapsedMs: 0,
        message: 'Retrying build…',
        pollErrorCount: 0,
      });
      eApi
        .triggerBuild(ns, entityName)
        .then(() => {
          startBuildPolling(entityName, ns);
        })
        .catch(err => {
          setBuildProgress(prev => ({
            ...prev,
            phase: 'failed',
            failureMessage: `Retry failed: ${getErrorMessage(err)}`,
          }));
        });
    }
  }, [buildProgress.deployFailedAfterBuild, startBuildPolling, callbacksRef]);

  const handleCloseBuild = useCallback(() => {
    stopPolling();
    setBuildProgress({ phase: 'idle', elapsedMs: 0, pollErrorCount: 0 });
    onCloseRef.current();
  }, [stopPolling]);

  // -------------------------------------------------------------------------
  // Row CRUD
  // -------------------------------------------------------------------------

  const addEnvRow = useCallback(() => {
    setEnvRows(rows => [
      ...rows,
      {
        id: nextRowId(rowIdRef),
        name: '',
        value: '',
        source: 'direct' as EnvSource,
        refName: '',
        refKey: '',
      },
    ]);
  }, []);
  const updateEnvRow = useCallback((id: number, patch: Partial<EnvRow>) => {
    setEnvRows(rows => rows.map(r => (r.id === id ? { ...r, ...patch } : r)));
  }, []);
  const removeEnvRow = useCallback((id: number) => {
    setEnvRows(rows => rows.filter(r => r.id !== id));
  }, []);

  const addBuildArgRow = useCallback(() => {
    setBuildArgRows(rows => [...rows, { id: nextRowId(rowIdRef), value: '' }]);
  }, []);
  const updateBuildArgRow = useCallback((id: number, value: string) => {
    setBuildArgRows(rows => rows.map(r => (r.id === id ? { ...r, value } : r)));
  }, []);
  const removeBuildArgRow = useCallback((id: number) => {
    setBuildArgRows(rows => rows.filter(r => r.id !== id));
  }, []);

  const addPortRow = useCallback(() => {
    setPortRows(rows => [
      ...rows,
      {
        id: nextRowId(rowIdRef),
        name: '',
        port: '',
        targetPort: '',
        protocol: 'TCP' as PortProtocol,
      },
    ]);
  }, []);
  const updatePortRow = useCallback(
    (id: number, patch: Partial<ServicePortRow>) => {
      setPortRows(rows =>
        rows.map(r => (r.id === id ? { ...r, ...patch } : r)),
      );
    },
    [],
  );
  const removePortRow = useCallback((id: number) => {
    setPortRows(rows => rows.filter(r => r.id !== id));
  }, []);
  const handlePortProtocol = useCallback(
    (id: number, e: SelectChangeEvent<PortProtocol>) => {
      updatePortRow(id, { protocol: e.target.value as PortProtocol });
    },
    [updatePortRow],
  );

  // -------------------------------------------------------------------------

  return {
    activeStep,
    setActiveStep,
    submitting,
    submitError,
    setSubmitError,
    successOpen,
    setSuccessOpen,
    handleNext,
    handleBack,
    handleSubmit,

    buildProgress,
    handleRetryBuild,
    handleCloseBuild,

    name,
    setName,
    namespace,
    setNamespace,
    protocol,
    setProtocol,
    framework,
    setFramework,
    availableNamespaces,
    nameError,

    deploymentMethod,
    setDeploymentMethod,
    containerImage,
    setContainerImage,
    imagePullSecret,
    setImagePullSecret,
    gitUrl,
    setGitUrl,
    gitRef,
    setGitRef,
    gitContextDir,
    setGitContextDir,
    registryUrl,
    setRegistryUrl,
    registrySecret,
    setRegistrySecret,
    imageTag,
    setImageTag,
    buildStrategy,
    setBuildStrategy,
    buildStrategies,
    buildStrategyError,
    dockerfile,
    setDockerfile,
    buildArgRows,
    addBuildArgRow,
    updateBuildArgRow,
    removeBuildArgRow,
    buildTimeout,
    setBuildTimeout,

    workloadType,
    setWorkloadType,
    envRows,
    addEnvRow,
    updateEnvRow,
    removeEnvRow,
    portRows,
    addPortRow,
    updatePortRow,
    removePortRow,
    handlePortProtocol,
    createHttpRoute,
    setCreateHttpRoute,
    authBridgeEnabled,
    setAuthBridgeEnabled,
    spireEnabled,
    setSpireEnabled,
    duplicateEnvNames,
    portErrors,
  };
}
