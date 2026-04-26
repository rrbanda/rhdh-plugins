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
import ErrorMessage from '../shared/ErrorMessage';
import styles from './GraphPage.module.css';

export function GraphLoadErrorView({
  message,
  isConnectionError,
  onRetry,
}: {
  message: string;
  isConnectionError: boolean;
  onRetry: () => void;
}) {
  return (
    <div className={styles.statusCentered}>
      <ErrorMessage
        message={
          isConnectionError
            ? 'Cannot reach the knowledge graph database. Please verify that the graph database service is running and accessible.'
            : message
        }
      />
      <button type="button" onClick={onRetry} className={styles.retryButton}>
        Retry
      </button>
    </div>
  );
}

export function GraphNoDataView({ onRetry }: { onRetry: () => void }) {
  return (
    <div className={styles.statusCenteredNarrow}>
      <h2 className={styles.statusTitle}>No Graph Data Available</h2>
      <p className={styles.statusText}>
        The knowledge graph database is not returning data. Make sure Neo4j is
        running and configured in your <code>app-config.yaml</code> under{' '}
        <code>skillMarketplace.neo4j</code>.
      </p>
      <button type="button" onClick={onRetry} className={styles.retryButton}>
        Retry
      </button>
    </div>
  );
}

export function GraphEmptyStateView({
  onTriggerSync,
}: {
  onTriggerSync: () => void;
}) {
  return (
    <div className={styles.graphPageRoot}>
      <div className={styles.emptyGraphWrap}>
        <h2 className={styles.emptyGraphTitle}>
          Your Knowledge Graph is Empty
        </h2>
        <p className={styles.emptyGraphText}>
          The graph syncs automatically when skills are loaded from OCI
          registries and agents are registered via Kagenti. To get started:
        </p>
        <div className={styles.emptyGraphSteps}>
          <div className={styles.emptyGraphRow}>
            <span className={styles.emptyGraphNumber}>1</span>
            <span className={styles.emptyGraphRowText}>
              <strong>Add skills</strong> &mdash; Use the Skill Builder to
              author skill definitions, or configure an OCI registry in your{' '}
              <code>app-config.yaml</code>.
            </span>
          </div>
          <div className={styles.emptyGraphRow}>
            <span className={styles.emptyGraphNumber}>2</span>
            <span className={styles.emptyGraphRowText}>
              <strong>Connect agents</strong> &mdash; Configure Kagenti so agent
              capabilities are synced into the graph.
            </span>
          </div>
          <div className={styles.emptyGraphRow}>
            <span className={styles.emptyGraphNumber}>3</span>
            <span className={styles.emptyGraphRowText}>
              <strong>Trigger sync</strong> &mdash; The graph syncs on startup
              and periodically. You can also trigger it manually.
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onTriggerSync}
          className={styles.emptyGraphSyncBtn}
        >
          Trigger Sync Now
        </button>
      </div>
    </div>
  );
}
