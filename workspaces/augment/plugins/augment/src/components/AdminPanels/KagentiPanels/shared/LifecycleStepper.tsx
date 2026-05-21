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

import Box from '@mui/material/Box';
import Stepper from '@mui/material/Stepper';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';
import { useTheme, alpha } from '@mui/material/styles';
import { typeScale } from '../../../../theme/tokens';

const LIFECYCLE_STAGES = [
  'Draft',
  'In Review',
  'Staging',
  'Production',
  'Retired',
];

export interface LifecycleStepperProps {
  currentStep: number;
}

export function LifecycleStepper({ currentStep }: LifecycleStepperProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  return (
    <Box sx={{ mt: 1 }}>
      <Stepper
        activeStep={currentStep}
        alternativeLabel
        sx={{
          '& .MuiStepLabel-label': {
            fontSize: typeScale.caption.fontSize,
            fontWeight: 500,
          },
          '& .MuiStepConnector-line': {
            borderColor: alpha(theme.palette.divider, isDark ? 0.3 : 0.2),
          },
        }}
      >
        {LIFECYCLE_STAGES.map(label => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>
    </Box>
  );
}
