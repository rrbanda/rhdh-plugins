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

import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Tooltip from '@mui/material/Tooltip';
import PublishIcon from '@mui/icons-material/Publish';
import type { LifecycleTransition } from '../lifecycleTransitions';
import { borderRadius } from '../../../../theme/tokens';

export interface LifecycleActionsProps {
  lifecycleStage: string;
  nextTransition: LifecycleTransition & { icon: ReactNode };
  publishLoading: boolean;
  onLifecycleAction: () => void;
  extraActions?: ReactNode;
}

export function LifecycleActions({
  lifecycleStage,
  nextTransition,
  publishLoading,
  onLifecycleAction,
  extraActions,
}: LifecycleActionsProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        gap: 1,
        alignItems: 'center',
        flexShrink: 0,
      }}
    >
      {lifecycleStage !== 'retired' && (
        <Tooltip title={nextTransition.label}>
          <Button
            size="small"
            variant={nextTransition.variant}
            color={nextTransition.color}
            startIcon={
              publishLoading ? (
                <CircularProgress size={14} />
              ) : (
                nextTransition.icon
              )
            }
            disabled={publishLoading}
            onClick={onLifecycleAction}
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.8rem',
              borderRadius: borderRadius.sm,
            }}
          >
            {nextTransition.label}
          </Button>
        </Tooltip>
      )}
      {lifecycleStage === 'retired' && (
        <Tooltip title="Reactivate this agent to draft status">
          <Button
            size="small"
            variant="outlined"
            color="inherit"
            startIcon={
              publishLoading ? <CircularProgress size={14} /> : <PublishIcon />
            }
            disabled={publishLoading}
            onClick={onLifecycleAction}
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.8rem',
              borderRadius: borderRadius.sm,
            }}
          >
            Reactivate
          </Button>
        </Tooltip>
      )}
      {extraActions}
    </Box>
  );
}
