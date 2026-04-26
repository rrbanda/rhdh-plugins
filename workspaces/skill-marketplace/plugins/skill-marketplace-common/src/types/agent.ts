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

/** A skill entry within an A2A AgentCard. @public */
export interface AgentSkillRef {
  id: string;
  name: string;
  description: string;
  tags: string[];
  examples?: string[];
  inputModes?: string[];
  outputModes?: string[];
}

/** Full A2A AgentCard structure. @public */
export interface AgentCardData {
  name: string;
  description: string;
  url: string;
  provider?: {
    organization: string;
    url: string;
  };
  version: string;
  documentationUrl?: string;
  capabilities: {
    streaming?: boolean;
    pushNotifications?: boolean;
    stateTransitionHistory?: boolean;
  };
  authentication?: {
    schemes: string[];
    credentials?: string;
  };
  defaultInputModes: string[];
  defaultOutputModes: string[];
  skills: AgentSkillRef[];
}

/** @public */
export type AgentStatus = 'Ready' | 'Deploying' | 'Error' | 'Unknown';

/** @public */
export interface KagentiAgent {
  name: string;
  namespace: string;
  description: string;
  status: AgentStatus;
  labels: {
    protocol: string[];
    framework: string;
    type: string;
  };
  workloadType: string;
  createdAt: string;
  skills?: string[];
  image?: string;
  endpoints?: {
    agent?: string;
    health?: string;
  };
  agentCard?: AgentCardData;
}

/** @public */
export interface AgentDeployRequest {
  name: string;
  namespace: string;
  protocol?: string;
  framework?: string;
  workloadType?: string;
  deploymentMethod?: 'source' | 'image';
  containerImage?: string;
  envVars?: Array<{ name: string; value: string }>;
  servicePorts?: Array<{
    name: string;
    port: number;
    targetPort: number;
    protocol?: string;
  }>;
  gitUrl?: string;
  gitPath?: string;
  gitBranch?: string;
  imageTag?: string;
  createHttpRoute?: boolean;
  authBridgeEnabled?: boolean;
}

/** @public */
export interface AgentSkillAssignment {
  skillRef: string;
  skillName: string;
}
