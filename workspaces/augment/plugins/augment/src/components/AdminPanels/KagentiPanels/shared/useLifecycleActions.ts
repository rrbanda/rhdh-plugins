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

import { useState, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import PublishIcon from '@mui/icons-material/Publish';
import CloudOffIcon from '@mui/icons-material/CloudOff';
import React from 'react';
import {
  getLifecycleTransition,
  getLifecycleStep,
} from '../lifecycleTransitions';
import type { LifecycleTransition } from '../lifecycleTransitions';
import type { AugmentApi } from '../../../../api';

export interface UseLifecycleActionsOptions {
  api: AugmentApi;
  agentId: string;
  lifecycleStage: string;
  onLifecycleChange: (result: {
    lifecycleStage: string;
    version?: number;
  }) => void;
}

export interface UseLifecycleActionsResult {
  nextTransition: LifecycleTransition & { icon: ReactNode };
  currentStep: number;
  publishLoading: boolean;
  publishToast: string | null;
  setPublishToast: (toast: string | null) => void;
  handleLifecycleAction: () => Promise<void>;
}

export function useLifecycleActions({
  api,
  agentId,
  lifecycleStage,
  onLifecycleChange,
}: UseLifecycleActionsOptions): UseLifecycleActionsResult {
  const [publishLoading, setPublishLoading] = useState(false);
  const [publishToast, setPublishToast] = useState<string | null>(null);

  const nextTransition = useMemo(() => {
    const t = getLifecycleTransition(lifecycleStage);
    return {
      ...t,
      icon:
        t.iconType === 'promote'
          ? React.createElement(PublishIcon)
          : React.createElement(CloudOffIcon),
    };
  }, [lifecycleStage]);

  const handleLifecycleAction = useCallback(async () => {
    setPublishLoading(true);
    try {
      if (nextTransition.action === 'demote') {
        const result = await api.demoteAgent(agentId, nextTransition.target);
        onLifecycleChange(result);
        setPublishToast(`Agent moved to ${result.lifecycleStage}`);
      } else {
        const result = await api.promoteAgent(agentId, nextTransition.target);
        onLifecycleChange(result);
        setPublishToast(
          `Agent moved to ${result.lifecycleStage} (v${result.version})`,
        );
      }
    } catch (err) {
      setPublishToast(
        `Failed: ${err instanceof Error ? err.message : 'Unknown'}`,
      );
    } finally {
      setPublishLoading(false);
    }
  }, [api, agentId, nextTransition, onLifecycleChange]);

  const currentStep = getLifecycleStep(lifecycleStage);

  return {
    nextTransition,
    currentStep,
    publishLoading,
    publishToast,
    setPublishToast,
    handleLifecycleAction,
  };
}
