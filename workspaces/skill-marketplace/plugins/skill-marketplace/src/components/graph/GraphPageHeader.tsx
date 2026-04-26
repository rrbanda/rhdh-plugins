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
import { AutoSyncIndicator } from './AutoSyncIndicator';
import styles from './GraphPage.module.css';
import { GRAPH_DEFAULTS } from './graphConstants';

export function GraphPageHeader({
  totalNodes,
  totalRelationships,
  pluginGroupCount,
}: {
  totalNodes: number;
  totalRelationships: number;
  pluginGroupCount: number;
}) {
  return (
    <div className={styles.graphHeader}>
      <div className={styles.graphHeaderTop}>
        <h1 className={styles.graphTitle}>Skill Knowledge Graph</h1>
        <span className={styles.graphStats}>
          {totalNodes} nodes &middot; {totalRelationships} relationships
          {pluginGroupCount > 0 && <> &middot; {pluginGroupCount} domains</>}
        </span>
        <AutoSyncIndicator intervalMs={GRAPH_DEFAULTS.AUTO_REFRESH_MS} />
      </div>
      <p className={styles.graphOnboarding}>
        Explore how skills, agents, tools, and domains are connected. Click a
        node for details. Use the AI assistant to ask natural-language questions
        about your graph.
      </p>
    </div>
  );
}
