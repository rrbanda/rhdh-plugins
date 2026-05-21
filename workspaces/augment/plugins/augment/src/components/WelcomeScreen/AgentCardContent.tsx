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

import type { FC, ReactNode } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import { alpha } from '@mui/material/styles';
import { sanitizeDescription } from './agentUtils';

export interface AgentCardContentProps {
  displayName: string;
  description: string | undefined;
  avatarColor: string;
  avatarUrl: string | undefined;
  ready: boolean;
  status: string;
  isDark: boolean;
  onClick: () => void;
  children?: ReactNode;
}

export const AgentCardContent: FC<AgentCardContentProps> = ({
  displayName,
  description,
  avatarColor,
  avatarUrl,
  ready,
  status,
  isDark,
  onClick,
  children,
}) => (
  <CardActionArea
    onClick={onClick}
    sx={{
      borderRadius: 3,
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'stretch',
    }}
  >
    <CardContent
      sx={{
        p: 2,
        '&:last-child': { pb: 2 },
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.25,
          mb: 1,
        }}
      >
        {avatarUrl ? (
          <Box
            component="img"
            src={avatarUrl}
            alt={displayName}
            sx={{
              width: 36,
              height: 36,
              borderRadius: 2,
              objectFit: 'cover',
            }}
          />
        ) : (
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '0.95rem',
              bgcolor: alpha(avatarColor, isDark ? 0.2 : 0.12),
              color: avatarColor,
            }}
          >
            {displayName.charAt(0).toUpperCase()}
          </Box>
        )}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="subtitle2"
            noWrap
            sx={{
              fontWeight: 700,
              fontSize: '0.85rem',
              lineHeight: 1.3,
            }}
          >
            {displayName}
          </Typography>
          {!ready && (
            <Chip
              label={status}
              size="small"
              color="warning"
              variant="outlined"
              sx={{ height: 16, fontSize: '0.65rem', mt: 0.25 }}
            />
          )}
        </Box>
      </Box>
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{
          fontSize: '0.72rem',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          lineHeight: 1.4,
          flex: 1,
        }}
      >
        {description ? sanitizeDescription(description, 80) : '\u00A0'}
      </Typography>
      {children}
    </CardContent>
  </CardActionArea>
);
