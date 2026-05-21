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
import type { KagentiBuildStrategy } from '@red-hat-developer-hub/backstage-plugin-augment-common';
import type { SelectChangeEvent } from '@mui/material/Select';
import { augmentApiRef } from '../../../api';
import type {
  BuildArgRow,
  BuildProgress,
  DeploymentMethod,
  EnvRow,
  PortProtocol,
  ServicePortRow,
  WorkloadType,
} from './agentWizardTypes';
import { FORM_STEPS } from './agentWizardTypes';
import type { FormState } from './agentWizardTypes';
import { buildRequest } from './agentWizardUtils';
import type {
  WizardEntityApi,
  WizardFormDynamicCallbacks,
} from './useWizardFormBase';
import { useWizardFormBase } from './useWizardFormBase';

const AGENT_BASE_CONFIG = {
  entityLabel: 'Agent',
  stepsLength: FORM_STEPS.length,
  maxPollErrors: 5,
  defaultProtocol: 'a2a',
  defaultFramework: 'ADK',
  defaultImageTag: '',
  defaultAuthBridgeEnabled: true,
} as const;

export interface UseAgentWizardFormReturn {
  // Wizard chrome
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

  // Build progress (source deployments)
  buildProgress: BuildProgress;
  handleRetryBuild: () => void;
  handleCloseBuild: () => void;

  // Step 0 — Basics
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

  // Step 1 — Deployment
  deploymentMethod: DeploymentMethod;
  setDeploymentMethod: (v: DeploymentMethod) => void;
  containerImage: string;
  setContainerImage: (v: string) => void;
  imagePullSecret: string;
  setImagePullSecret: (v: string) => void;
  gitUrl: string;
  setGitUrl: (v: string) => void;
  gitBranch: string;
  setGitBranch: (v: string) => void;
  gitPath: string;
  setGitPath: (v: string) => void;
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
  startCommand: string;
  setStartCommand: (v: string) => void;
  dockerfile: string;
  setDockerfile: (v: string) => void;
  buildArgRows: BuildArgRow[];
  addBuildArgRow: () => void;
  updateBuildArgRow: (id: number, value: string) => void;
  removeBuildArgRow: (id: number) => void;
  buildTimeout: string;
  setBuildTimeout: (v: string) => void;

  // Step 2 — Runtime
  workloadType: WorkloadType;
  setWorkloadType: (v: WorkloadType) => void;
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

export function useAgentWizardForm(
  open: boolean,
  namespaceProp: string | undefined,
  onClose: () => void,
  onCreated: () => void,
  initialDeploymentMethod?: DeploymentMethod,
): UseAgentWizardFormReturn {
  const api = useApi(augmentApiRef);

  // Agent-specific state
  const [startCommand, setStartCommand] = useState('');

  const entityApi = useMemo<WizardEntityApi>(
    () => ({
      createEntity: body => api.createKagentiAgent(body),
      getBuildInfo: (ns, n) => api.getKagentiBuildInfo(ns, n),
      finalizeBuild: (ns, n) => api.finalizeKagentiAgentBuild(ns, n),
      triggerBuild: (ns, n) => api.triggerKagentiBuild(ns, n),
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
    AGENT_BASE_CONFIG,
    callbacksRef,
    initialDeploymentMethod,
  );

  // Keep callbacks ref up-to-date (latest-ref pattern)
  callbacksRef.current = {
    entityApi,
    buildRequest: (): ReturnType<typeof buildRequest> => {
      const s: FormState = {
        name: base.name,
        namespace: base.namespace,
        protocol: base.protocol,
        framework: base.framework,
        deploymentMethod: base.deploymentMethod,
        containerImage: base.containerImage,
        imagePullSecret: base.imagePullSecret,
        gitUrl: base.gitUrl,
        gitBranch: base.gitRef,
        gitPath: base.gitContextDir,
        registryUrl: base.registryUrl,
        registrySecret: base.registrySecret,
        imageTag: base.imageTag,
        buildStrategy: base.buildStrategy,
        startCommand,
        dockerfile: base.dockerfile,
        buildArgRows: base.buildArgRows,
        buildTimeout: base.buildTimeout,
        workloadType: base.workloadType as WorkloadType,
        envRows: base.envRows,
        portRows: base.portRows,
        createHttpRoute: base.createHttpRoute,
        authBridgeEnabled: base.authBridgeEnabled,
        spireEnabled: base.spireEnabled,
      };
      return buildRequest(s);
    },
    extraReset: () => {
      setStartCommand('');
    },
  };

  // Map base return to agent-specific field names
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
    gitBranch: base.gitRef,
    setGitBranch: base.setGitRef,
    gitPath: base.gitContextDir,
    setGitPath: base.setGitContextDir,
    startCommand,
    setStartCommand,
  };
}
