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
import Skeleton from '@mui/material/Skeleton';
import { useTheme } from '@mui/material/styles';
import ChatIcon from '@mui/icons-material/Chat';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { useApi } from '@backstage/core-plugin-api';
import type {
  ChatAgent,
  AgentLifecycleStage,
} from '@red-hat-developer-hub/backstage-plugin-augment-common';
import { normalizeLifecycleStage } from '@red-hat-developer-hub/backstage-plugin-augment-common';
import { augmentApiRef } from '../../../api';
import {
  glassSurface,
  borderRadius,
  typeScale,
  animations,
} from '../../../theme/tokens';
import { CONTENT_MAX_WIDTH } from '../shared/commandCenterStyles';
import {
  BackButton,
  DetailShell,
  LifecycleActions,
  LifecycleStepper,
  InlineAgentChat,
  useLifecycleActions,
} from './shared';

type DetailTab = 'overview' | 'test';

export interface WorkflowAgentDetailProps {
  agentId: string;
  onBack: () => void;
  onChatWithAgent?: (agentId: string) => void;
}

/**
 * Detail view for workflow-builder agents (created via the no-code UI
 * with the Responses API). Mirrors the structure and styling of
 * AgentLifecycleDetail but without Kagenti-specific tabs (Build,
 * Design, Agent Card) since those are for Kagenti-managed agents.
 */
export function WorkflowAgentDetail({
  agentId,
  onBack,
  onChatWithAgent,
}: WorkflowAgentDetailProps) {
  const theme = useTheme();
  const api = useApi(augmentApiRef);
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');

  const [agent, setAgent] = useState<ChatAgent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .listAgents()
      .then(agents => {
        if (cancelled) return;
        const match = agents.find(a => a.id === agentId);
        if (match) {
          setAgent(match);
        } else {
          setError(`Agent "${agentId}" not found`);
        }
      })
      .catch(err => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : 'Failed to load agent');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, agentId]);

  const lifecycleStage = normalizeLifecycleStage(agent?.lifecycleStage);

  const onLifecycleChange = useCallback(
    (result: { lifecycleStage: string }) => {
      setAgent(prev =>
        prev
          ? {
              ...prev,
              lifecycleStage: result.lifecycleStage as AgentLifecycleStage,
            }
          : prev,
      );
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

  if (loading) {
    return (
      <Box
        sx={{
          maxWidth: CONTENT_MAX_WIDTH,
          width: '100%',
          ...animations.fadeSlideIn,
        }}
      >
        <BackButton onClick={onBack} />
        <Box sx={{ ...glass, borderRadius: borderRadius.lg, p: 3, mb: 3 }}>
          <Skeleton variant="text" width={200} height={32} />
          <Skeleton variant="text" width={300} height={20} sx={{ mt: 1 }} />
          <Skeleton
            variant="rectangular"
            height={60}
            sx={{ mt: 2, borderRadius: 1 }}
          />
        </Box>
      </Box>
    );
  }

  if (error || !agent) {
    return (
      <Box
        sx={{
          maxWidth: CONTENT_MAX_WIDTH,
          width: '100%',
          ...animations.fadeSlideIn,
        }}
      >
        <BackButton onClick={onBack} />
        <Alert severity="error" sx={{ mb: 2 }}>
          {error || 'Agent not found'}
        </Alert>
      </Box>
    );
  }

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
                {agent.name}
              </Typography>
              {agent.status && (
                <Chip
                  label={agent.status}
                  size="small"
                  color={
                    agent.status.toLowerCase() === 'ready'
                      ? 'success'
                      : 'default'
                  }
                />
              )}
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
            </Box>
            <Box
              sx={{
                display: 'flex',
                gap: 0.75,
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              <Chip
                label={
                  agent.framework === 'workflow-builder'
                    ? 'Workflow Agent'
                    : 'Responses API'
                }
                size="small"
                variant="outlined"
                sx={{ height: 22, fontSize: '0.7rem' }}
              />
              {agent.framework && (
                <Chip
                  label={agent.framework}
                  size="small"
                  variant="outlined"
                  color="info"
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
              onChatWithAgent ? (
                <Button
                  size="small"
                  variant="contained"
                  startIcon={<ChatIcon />}
                  onClick={() => setActiveTab('test')}
                  sx={{ textTransform: 'none', borderRadius: borderRadius.sm }}
                >
                  Test
                </Button>
              ) : undefined
            }
          />
        </Box>

        <LifecycleStepper currentStep={currentStep} />
      </Box>

      {/* Tabs */}
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
          <Tab label="Test" value="test" />
        </Tabs>
      </Box>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <Box sx={{ ...glass, borderRadius: borderRadius.lg, p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <InfoOutlinedIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              Agent Information
            </Typography>
          </Box>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: '140px 1fr',
              gap: 1.5,
              rowGap: 1,
            }}
          >
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontWeight: 600 }}
            >
              ID
            </Typography>
            <Typography
              variant="body2"
              sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
            >
              {agent.id}
            </Typography>

            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontWeight: 600 }}
            >
              Name
            </Typography>
            <Typography variant="body2">{agent.name}</Typography>

            {agent.description && (
              <>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontWeight: 600 }}
                >
                  Description
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {agent.description}
                </Typography>
              </>
            )}

            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontWeight: 600 }}
            >
              Type
            </Typography>
            <Typography variant="body2">
              {agent.framework === 'workflow-builder'
                ? 'Workflow Agent (No-Code Builder)'
                : 'Responses API Agent'}
            </Typography>

            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontWeight: 600 }}
            >
              Lifecycle Stage
            </Typography>
            <Typography variant="body2" sx={{ textTransform: 'capitalize' }}>
              {lifecycleStage}
            </Typography>

            {agent.promotedAt && (
              <>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontWeight: 600 }}
                >
                  Last Promoted
                </Typography>
                <Typography variant="body2">
                  {new Date(agent.promotedAt).toLocaleString()}
                </Typography>
              </>
            )}

            {agent.promotedBy && (
              <>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontWeight: 600 }}
                >
                  Promoted By
                </Typography>
                <Typography variant="body2">{agent.promotedBy}</Typography>
              </>
            )}

            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontWeight: 600 }}
            >
              Default Agent
            </Typography>
            <Typography variant="body2">
              {agent.isDefault ? 'Yes' : 'No'}
            </Typography>

            {agent.agentRole && (
              <>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontWeight: 600 }}
                >
                  Role
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ textTransform: 'capitalize' }}
                >
                  {agent.agentRole}
                </Typography>
              </>
            )}
          </Box>
        </Box>
      )}

      {activeTab === 'test' && (
        <InlineAgentChat agentId={agentId} agentName={agent.name} />
      )}
    </DetailShell>
  );
}
