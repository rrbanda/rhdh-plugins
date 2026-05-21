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

import { useState, useCallback, useEffect } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Alert from '@mui/material/Alert';
import Tooltip from '@mui/material/Tooltip';
import { useTheme } from '@mui/material/styles';
import ChatIcon from '@mui/icons-material/Chat';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { useApi } from '@backstage/core-plugin-api';
import type { KagentiAgentSummary } from '@red-hat-developer-hub/backstage-plugin-augment-common';
import { normalizeLifecycleStage } from '@red-hat-developer-hub/backstage-plugin-augment-common';
import { augmentApiRef } from '../../../api';
import { statusChipColor as statusColor } from './kagentiDisplayUtils';
import { AgentDetailsTab } from './AgentDetailsTab';
import { AgentStatusTab } from './AgentStatusTab';
import { AgentResourceTab } from './AgentResourceTab';
import { AgentCardTab } from './AgentCardTab';
import { useKagentiAgentDetail } from './useKagentiAgentDetail';
import { glassSurface, borderRadius, typeScale } from '../../../theme/tokens';
import {
  BackButton,
  DetailShell,
  LifecycleActions,
  LifecycleStepper,
  InlineAgentChat,
  useLifecycleActions,
} from './shared';

type LifecycleTab = 'overview' | 'design' | 'test' | 'build' | 'card';

export interface AgentLifecycleDetailProps {
  agent: KagentiAgentSummary;
  onBack: () => void;
  onChatWithAgent?: (agentId: string) => void;
}

/**
 * Agent Detail view structured around the development lifecycle.
 * Tabs: Overview | Design | Test | Build | Agent Card
 */
export function AgentLifecycleDetail({
  agent,
  onBack,
  onChatWithAgent,
}: AgentLifecycleDetailProps) {
  const theme = useTheme();
  const api = useApi(augmentApiRef);
  const [activeTab, setActiveTab] = useState<LifecycleTab>('overview');

  const {
    agentCard,
    agentDetail,
    buildInfo,
    routeStatus,
    loading,
    error,
    setError,
    buildTriggering,
    copied,
    hasBuild,
    loadBuildInfo,
    handleTriggerBuild,
    handleCopy,
  } = useKagentiAgentDetail(api, agent);

  const agentId = `${agent.namespace}/${agent.name}`;
  const displayName = agentCard?.name || agent.name;

  const [lifecycleStage, setLifecycleStage] = useState<string>('draft');

  useEffect(() => {
    let cancelled = false;
    api
      .listAgents()
      .then(agents => {
        if (cancelled) return;
        const match = agents.find(a => a.id === agentId);
        setLifecycleStage(normalizeLifecycleStage(match?.lifecycleStage));
      })
      .catch(() => setLifecycleStage('draft'));
    return () => {
      cancelled = true;
    };
  }, [api, agentId]);

  const onLifecycleChange = useCallback(
    (result: { lifecycleStage: string }) => {
      setLifecycleStage(result.lifecycleStage);
    },
    [],
  );

  const {
    nextTransition,
    currentStep,
    publishLoading,
    publishToast,
    setPublishToast,
    handleLifecycleAction,
  } = useLifecycleActions({
    api,
    agentId,
    lifecycleStage,
    onLifecycleChange,
  });

  const glass = glassSurface(theme, 6);

  return (
    <DetailShell
      publishToast={publishToast}
      onCloseToast={() => setPublishToast(null)}
    >
      <BackButton onClick={onBack} />

      {/* Agent Header Card */}
      <Box
        sx={{
          ...glass,
          borderRadius: borderRadius.lg,
          p: 3,
          mb: 3,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        {/* Top: Name + Status + Actions */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 2,
            flexWrap: 'wrap',
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box
              sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}
            >
              <Typography
                variant="h5"
                sx={{
                  fontWeight: 700,
                  fontSize: typeScale.pageTitle.fontSize,
                  color: 'text.primary',
                }}
              >
                {displayName}
              </Typography>
              <Chip
                label={agent.status}
                size="small"
                color={statusColor(agent.status)}
              />
              {lifecycleStage && (
                <Chip
                  label={lifecycleStage}
                  size="small"
                  variant="outlined"
                  sx={{
                    height: 22,
                    fontSize: '0.7rem',
                    textTransform: 'capitalize',
                  }}
                />
              )}
            </Box>
            <Box
              sx={{
                display: 'flex',
                gap: 0.75,
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              <Typography variant="caption" color="text.secondary">
                {agent.namespace}
              </Typography>
              {agent.labels?.framework && (
                <Chip
                  label={agent.labels.framework}
                  size="small"
                  variant="outlined"
                  color="info"
                  sx={{ height: 22, fontSize: '0.7rem' }}
                />
              )}
              {agent.labels?.protocol && (
                <Chip
                  label={[agent.labels.protocol]
                    .flat()
                    .join(', ')
                    .toUpperCase()}
                  size="small"
                  variant="outlined"
                  sx={{ height: 22, fontSize: '0.7rem' }}
                />
              )}
            </Box>
          </Box>

          <LifecycleActions
            lifecycleStage={lifecycleStage}
            nextTransition={nextTransition}
            publishLoading={publishLoading}
            onLifecycleAction={handleLifecycleAction}
            extraActions={
              <>
                {hasBuild && (
                  <Tooltip title="Trigger a new container image build">
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<PlayArrowIcon />}
                      disabled={buildTriggering}
                      onClick={() => void handleTriggerBuild()}
                      sx={{
                        textTransform: 'none',
                        borderRadius: borderRadius.sm,
                      }}
                    >
                      {buildTriggering ? 'Building...' : 'Rebuild'}
                    </Button>
                  </Tooltip>
                )}
                {onChatWithAgent && (
                  <Button
                    size="small"
                    variant="contained"
                    startIcon={<ChatIcon />}
                    onClick={() => setActiveTab('test')}
                    sx={{
                      textTransform: 'none',
                      borderRadius: borderRadius.sm,
                    }}
                  >
                    Test
                  </Button>
                )}
              </>
            }
          />
        </Box>

        <LifecycleStepper currentStep={currentStep} />
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Lifecycle Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs
          value={activeTab}
          onChange={(_, v) => setActiveTab(v)}
          sx={{
            minHeight: 40,
            '& .MuiTab-root': {
              minHeight: 40,
              minWidth: 'auto',
              px: 2.5,
              textTransform: 'none',
              fontSize: typeScale.body.fontSize,
              fontWeight: 500,
            },
          }}
        >
          <Tab label="Overview" value="overview" />
          <Tab label="Design" value="design" />
          <Tab label="Test" value="test" />
          <Tab label="Build" value="build" />
          <Tab label="Agent Card" value="card" />
        </Tabs>
      </Box>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <AgentDetailsTab
          agent={agent}
          agentDetail={agentDetail}
          loading={loading}
          routeStatus={routeStatus}
          copied={copied}
          onCopy={handleCopy}
        />
      )}

      {activeTab === 'design' && (
        <AgentResourceTab
          agentDetail={agentDetail}
          loading={loading}
          copied={copied}
          onCopy={handleCopy}
        />
      )}

      {activeTab === 'test' && (
        <InlineAgentChat agentId={agentId} agentName={displayName} />
      )}

      {activeTab === 'build' && (
        <AgentStatusTab
          agent={agent}
          agentDetail={agentDetail}
          buildInfo={buildInfo}
          loading={loading}
          buildTriggering={buildTriggering}
          hasBuild={hasBuild}
          onRefreshBuild={() => void loadBuildInfo()}
          onTriggerBuild={() => void handleTriggerBuild()}
        />
      )}

      {activeTab === 'card' && (
        <AgentCardTab agentCard={agentCard} loading={loading} />
      )}
    </DetailShell>
  );
}
