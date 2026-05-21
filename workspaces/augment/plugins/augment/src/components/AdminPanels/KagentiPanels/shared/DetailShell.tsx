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
import Snackbar from '@mui/material/Snackbar';
import { animations, reducedMotion } from '../../../../theme/tokens';
import { CONTENT_MAX_WIDTH } from '../../shared/commandCenterStyles';

export interface DetailShellProps {
  publishToast: string | null;
  onCloseToast: () => void;
  children: ReactNode;
}

export function DetailShell({
  publishToast,
  onCloseToast,
  children,
}: DetailShellProps) {
  return (
    <Box
      sx={{
        maxWidth: CONTENT_MAX_WIDTH,
        width: '100%',
        minWidth: 0,
        ...animations.fadeSlideIn,
        '@media (prefers-reduced-motion: reduce)': reducedMotion,
      }}
    >
      {children}
      <Snackbar
        open={!!publishToast}
        autoHideDuration={3000}
        onClose={onCloseToast}
        message={publishToast}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
}
