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
import { Component, type ErrorInfo, type ReactNode } from 'react';
import styles from './GraphInsightsBar.module.css';

type MetricErrorBoundaryProps = {
  children: ReactNode;
  onRetry: () => void;
};

type MetricErrorBoundaryState = { hasError: boolean };

/**
 * Catches render errors in a single graph insights metric so other sections keep working.
 */
export class MetricErrorBoundary extends Component<
  MetricErrorBoundaryProps,
  MetricErrorBoundaryState
> {
  static getDerivedStateFromError(): MetricErrorBoundaryState {
    return { hasError: true };
  }

  state: MetricErrorBoundaryState = { hasError: false };

  componentDidCatch(error: Error, _info: ErrorInfo) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.error('GraphInsightsBar metric error:', error);
    }
  }

  private handleRetry = () => {
    this.setState({ hasError: false });
    this.props.onRetry();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className={styles.giMetric} role="status">
          <span className={styles.giMetricErrorText}>Unavailable</span>
          <button
            type="button"
            className={styles.giMetricRetry}
            onClick={this.handleRetry}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
