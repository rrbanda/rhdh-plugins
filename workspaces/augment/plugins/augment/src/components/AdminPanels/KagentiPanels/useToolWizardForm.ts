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

import { useMemo, useRef, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import type {
  KagentiBuildStrategy,
  KagentiFinalizeToolBuildRequest,
} from '@red-hat-developer-hub/backstage-plugin-augment-common';
import type { SelectChangeEvent } from '@mui/material/Select';
import { augmentApiRef } from '../../../api';
import type { BuildProgress } from './wizardSharedTypes';
import type {
  BuildArgRow,
  DeploymentMethod,
  EnvRow,
  PortProtocol,
  ServicePortRow,
  ToolFormState,
  WorkloadType,
} from './toolWizardTypes';
import { TOOL_STEPS } from './toolWizardTypes';
import { buildFinalizeBody, buildToolRequest } from './toolWizardUtils';
import type {
  WizardEntityApi,
  WizardFormDynamicCallbacks,
} from './useWizardFormBase';
import { useWizardFormBase } from './useWizardFormBase';

const TOOL_BASE_CONFIG = {
  entityLabel: 'Tool',
  stepsLength: TOOL_STEPS.length,
  maxPollErrors: 8,
  defaultProtocol: 'streamable_http',
  defaultFramework: 'Python',
  defaultImageTag: 'v0.0.1',
  defaultAuthBridgeEnabled: false,
} as const;

export interface UseToolWizardFormReturn {
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
  description: string;
  setDescription: (v: string) => void;
  protocol: string;
  setProtocol: (v: string) => void;
  framework: string;
  setFramework: (v: string) => void;
  availableNamespaces: string[];
  nameError: string | undefined;
  nameWarning: string | undefined;

  deploymentMethod: DeploymentMethod;
  setDeploymentMethod: (v: DeploymentMethod) => void;
  containerImage: string;
  setContainerImage: (v: string) => void;
  imagePullSecret: string;
  setImagePullSecret: (v: string) => void;
  gitUrl: string;
  setGitUrl: (v: string) => void;
  gitRevision: string;
  setGitRevision: (v: string) => void;
  contextDir: string;
  setContextDir: (v: string) => void;
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

  workloadType: WorkloadType;
  setWorkloadType: (v: WorkloadType) => void;
  persistentStorageEnabled: boolean;
  setPersistentStorageEnabled: (v: boolean) => void;
  persistentStorageSize: string;
  setPersistentStorageSize: (v: string) => void;
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

export function useToolWizardForm(
  open: boolean,
  namespaceProp: string | undefined,
  onClose: () => void,
  onCreated: () => void,
): UseToolWizardFormReturn {
  const api = useApi(augmentApiRef);

  // Tool-specific state
  const [description, setDescription] = useState('');
  const [persistentStorageEnabled, setPersistentStorageEnabled] =
    useState(false);
  const [persistentStorageSize, setPersistentStorageSize] = useState('1Gi');
  const finalizeBodyRef = useRef<KagentiFinalizeToolBuildRequest>({});

  const entityApi = useMemo<WizardEntityApi>(
    () => ({
      createEntity: body => api.createKagentiTool(body),
      getBuildInfo: (ns, n) => api.getToolBuildInfo(ns, n),
      finalizeBuild: (ns, n) =>
        api.finalizeToolBuild(ns, n, finalizeBodyRef.current),
      triggerBuild: (ns, n) => api.triggerToolBuild(ns, n),
    }),
    [api],
  );

  const callbacksRef = useRef<WizardFormDynamicCallbacks>({
    entityApi,
    buildRequest: () => ({}),
  });

  const base = useWizardFormBase(
    open,
    namespaceProp,
    onClose,
    onCreated,
    TOOL_BASE_CONFIG,
    callbacksRef,
  );

  // Keep callbacks ref up-to-date (latest-ref pattern)
  const buildToolFormState = (): ToolFormState => ({
    name: base.name,
    namespace: base.namespace,
    description,
    protocol: base.protocol,
    framework: base.framework,
    deploymentMethod: base.deploymentMethod,
    containerImage: base.containerImage,
    imagePullSecret: base.imagePullSecret,
    gitUrl: base.gitUrl,
    gitRevision: base.gitRef,
    contextDir: base.gitContextDir,
    registryUrl: base.registryUrl,
    registrySecret: base.registrySecret,
    imageTag: base.imageTag,
    buildStrategy: base.buildStrategy,
    dockerfile: base.dockerfile,
    buildArgRows: base.buildArgRows,
    buildTimeout: base.buildTimeout,
    workloadType: base.workloadType as WorkloadType,
    persistentStorageEnabled,
    persistentStorageSize,
    envRows: base.envRows,
    portRows: base.portRows,
    createHttpRoute: base.createHttpRoute,
    authBridgeEnabled: base.authBridgeEnabled,
    spireEnabled: base.spireEnabled,
  });

  callbacksRef.current = {
    entityApi,
    buildRequest: () => buildToolRequest(buildToolFormState()),
    extraReset: () => {
      setDescription('');
      setPersistentStorageEnabled(false);
      setPersistentStorageSize('1Gi');
    },
    beforeSourcePoll: () => {
      finalizeBodyRef.current = buildFinalizeBody(buildToolFormState());
    },
  };

  // Tool-specific computed values
  const nameWarning = useMemo((): string | undefined => {
    if (base.name.trim().endsWith('-mcp')) {
      return 'Names ending in "-mcp" may cause connection issues. The platform appends "-mcp" to the internal service name automatically.';
    }
    return undefined;
  }, [base.name]);

  // Map base return to tool-specific field names
  const {
    gitRef: _gitRef,
    setGitRef: _setGitRef,
    gitContextDir: _gitContextDir,
    setGitContextDir: _setGitContextDir,
    ...rest
  } = base;

  return {
    ...rest,
    workloadType: base.workloadType as WorkloadType,
    setWorkloadType: base.setWorkloadType as (v: WorkloadType) => void,
    gitRevision: base.gitRef,
    setGitRevision: base.setGitRef,
    contextDir: base.gitContextDir,
    setContextDir: base.setGitContextDir,
    description,
    setDescription,
    persistentStorageEnabled,
    setPersistentStorageEnabled,
    persistentStorageSize,
    setPersistentStorageSize,
    nameWarning,
  };
}
