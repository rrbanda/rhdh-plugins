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

import Button from '@mui/material/Button';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useTheme } from '@mui/material/styles';

export interface BackButtonProps {
  onClick: () => void;
  label?: string;
}

export function BackButton({ onClick, label = 'Agents' }: BackButtonProps) {
  const theme = useTheme();

  return (
    <Button
      size="small"
      startIcon={<ArrowBackIcon sx={{ fontSize: 16 }} />}
      onClick={onClick}
      sx={{
        textTransform: 'none',
        mb: 1.5,
        color: theme.palette.primary.main,
        fontWeight: 500,
      }}
    >
      {label}
    </Button>
  );
}
