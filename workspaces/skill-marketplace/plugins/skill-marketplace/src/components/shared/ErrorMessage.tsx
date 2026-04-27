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
import { Alert, PageSection } from '@patternfly/react-core';
import { useTheme } from '@material-ui/core/styles';

export default function ErrorMessage({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  const muiTheme = useTheme();
  const isDark = muiTheme.palette.type === 'dark';
  return (
    <PageSection
      style={{
        backgroundColor: isDark ? '#1e1e1e' : undefined,
        minHeight: '60vh',
      }}
    >
      <Alert
        variant="danger"
        title="Error"
        isInline
        style={{
          backgroundColor: isDark ? '#2a1515' : undefined,
          color: isDark ? '#fca5a5' : undefined,
          borderColor: isDark ? '#7f1d1d' : undefined,
        }}
      >
        <span style={{ color: isDark ? '#e0e0e0' : undefined }}>{message}</span>
      </Alert>
      {onRetry && (
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <button
            type="button"
            onClick={onRetry}
            style={{
              padding: '8px 24px',
              borderRadius: 6,
              border: 'none',
              backgroundColor: isDark ? '#4d9de0' : '#0066cc',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
          >
            Retry
          </button>
        </div>
      )}
    </PageSection>
  );
}
