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
  KagentiCreateAgentRequest,
  KagentiShipwrightConfig,
} from '@red-hat-developer-hub/backstage-plugin-augment-common';
import type { FormState } from './agentWizardTypes';
import { buildEnvVars, buildServicePorts } from './wizardSharedUtils';

export {
  nextRowId,
  buildEnvVars,
  parsePositivePort,
  buildServicePorts,
  getDuplicateEnvNames,
} from './wizardSharedUtils';

export function buildRequest(s: FormState): KagentiCreateAgentRequest {
  const body: KagentiCreateAgentRequest = {
    name: s.name.trim(),
    namespace: s.namespace.trim(),
    deploymentMethod: s.deploymentMethod,
    workloadType: s.workloadType,
    createHttpRoute: s.createHttpRoute,
    authBridgeEnabled: s.authBridgeEnabled,
    spireEnabled: s.spireEnabled,
  };

  if (s.protocol.trim()) body.protocol = s.protocol.trim();
  if (s.framework.trim()) body.framework = s.framework.trim();

  if (s.deploymentMethod === 'image') {
    body.containerImage = s.containerImage.trim();
    if (s.imagePullSecret.trim())
      body.imagePullSecret = s.imagePullSecret.trim();
  } else {
    body.gitUrl = s.gitUrl.trim();
    if (s.gitBranch.trim()) body.gitBranch = s.gitBranch.trim();
    const normalizedPath = s.gitPath
      .trim()
      .replace(/^\.\/+/, '')
      .replace(/^\.+$/, '');
    if (normalizedPath) body.gitPath = normalizedPath;
    if (s.registryUrl.trim()) body.registryUrl = s.registryUrl.trim();
    if (s.registrySecret.trim()) body.registrySecret = s.registrySecret.trim();
    if (s.imageTag.trim()) body.imageTag = s.imageTag.trim();
    if (s.startCommand.trim()) body.startCommand = s.startCommand.trim();

    const swConfig: KagentiShipwrightConfig = {};
    if (s.buildStrategy.trim()) swConfig.buildStrategy = s.buildStrategy.trim();
    if (s.dockerfile.trim() && s.dockerfile.trim() !== 'Dockerfile') {
      swConfig.dockerfile = s.dockerfile.trim();
    }
    const args = s.buildArgRows.map(r => r.value.trim()).filter(Boolean);
    if (args.length) swConfig.buildArgs = args;
    if (s.buildTimeout.trim() && s.buildTimeout.trim() !== '15m') {
      swConfig.buildTimeout = s.buildTimeout.trim();
    }
    if (Object.keys(swConfig).length) body.shipwrightConfig = swConfig;
  }

  const envVars = buildEnvVars(s.envRows);
  if (envVars) body.envVars = envVars;
  const servicePorts = buildServicePorts(s.portRows);
  if (servicePorts) body.servicePorts = servicePorts;

  return body;
}
