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

import type {
  BuildArgRow,
  DeploymentMethod,
  EnvRow,
  ServicePortRow,
} from './wizardSharedTypes';

export type {
  BuildArgRow,
  BuildPhase,
  BuildProgress,
  DeploymentMethod,
  EnvRow,
  EnvSource,
  PortProtocol,
  ServicePortRow,
} from './wizardSharedTypes';
export { isValidDns1123 } from './wizardSharedTypes';

export const FORM_STEPS = ['Basics', 'Deployment', 'Runtime'] as const;
export const BUILD_STEP = 'Build & Deploy' as const;

export type WorkloadType = 'deployment' | 'statefulset' | 'job';

export interface FormState {
  name: string;
  namespace: string;
  protocol: string;
  framework: string;
  deploymentMethod: DeploymentMethod;
  containerImage: string;
  imagePullSecret: string;
  gitUrl: string;
  gitBranch: string;
  gitPath: string;
  registryUrl: string;
  registrySecret: string;
  imageTag: string;
  buildStrategy: string;
  startCommand: string;
  dockerfile: string;
  buildArgRows: BuildArgRow[];
  buildTimeout: string;
  workloadType: WorkloadType;
  envRows: EnvRow[];
  portRows: ServicePortRow[];
  createHttpRoute: boolean;
  authBridgeEnabled: boolean;
  spireEnabled: boolean;
}

export interface CreateAgentWizardProps {
  open: boolean;
  namespace?: string;
  initialDeploymentMethod?: DeploymentMethod;
  onClose: () => void;
  onCreated: () => void;
  onStepControl?: (setter: (step: number) => void) => void;
  onDeployMethodControl?: (setter: (method: string) => void) => void;
}
