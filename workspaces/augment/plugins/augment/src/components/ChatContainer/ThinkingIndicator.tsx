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

import { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme, alpha } from '@mui/material/styles';
import { useBranding } from '../../hooks';
import { BotAvatarIcon } from '../icons';

const SLOW_THRESHOLD_MS = 30_000;

/** Animated dot for loading indicator */
const AnimatedDot = ({ delay }: { delay: number }) => (
  <Box
    sx={{
      width: 8,
      height: 8,
      borderRadius: '50%',
      backgroundColor: 'currentColor',
      animation: 'bounce 1.4s ease-in-out infinite',
      animationDelay: `${delay}s`,
      '@keyframes bounce': {
        '0%, 80%, 100%': { transform: 'scale(0.6)', opacity: 0.4 },
        '40%': { transform: 'scale(1)', opacity: 1 },
      },
    }}
  />
);

/** Thinking indicator shown while AI is processing */
export const ThinkingIndicator = () => {
  const theme = useTheme();
  const { branding } = useBranding();
  const [isSlow, setIsSlow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsSlow(true), SLOW_THRESHOLD_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Box
      role="status"
      aria-busy="true"
      aria-label={
        isSlow
          ? 'Still connecting, this is taking longer than expected'
          : 'Connecting to AI'
      }
      sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: 2 }}
    >
      <Box
        sx={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.palette.primary.main,
          color: theme.palette.primary.contrastText,
          flexShrink: 0,
        }}
      >
        <BotAvatarIcon botAvatarUrl={branding.botAvatarUrl} />
      </Box>

      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 0.5,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            px: 2,
            py: 1.5,
            borderRadius: 2,
            backgroundColor: alpha(
              theme.palette.text.primary,
              theme.palette.mode === 'dark' ? 0.06 : 0.04,
            ),
            color: theme.palette.text.secondary,
          }}
        >
          <AnimatedDot delay={0} />
          <AnimatedDot delay={0.2} />
          <AnimatedDot delay={0.4} />
          <Typography
            variant="caption"
            sx={{
              ml: 0.5,
              color: theme.palette.text.secondary,
              fontSize: '0.75rem',
            }}
          >
            Connecting...
          </Typography>
        </Box>
        {isSlow && (
          <Typography
            variant="caption"
            sx={{
              px: 2,
              color: theme.palette.warning.main,
              fontSize: '0.7rem',
            }}
          >
            This is taking longer than expected...
          </Typography>
        )}
      </Box>
    </Box>
  );
};
