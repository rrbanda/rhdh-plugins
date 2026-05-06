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
import React from 'react';
import styles from './ResponsePanel.module.css';

interface ResponsePanelProps {
  latencyMs: number | null;
  sessionId: string | null;
  skillContextProvided: boolean;
  lastResponse: string | null;
}

function tryParseJson(text: string): object | null {
  try {
    const trimmed = text.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      return JSON.parse(trimmed);
    }
    const jsonMatch = trimmed.match(/```json\s*([\s\S]*?)```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1].trim());
    }
  } catch {
    /* not JSON */
  }
  return null;
}

export default function ResponsePanel({
  latencyMs,
  sessionId,
  skillContextProvided,
  lastResponse,
}: ResponsePanelProps) {
  if (!lastResponse) return null;

  const jsonOutput = tryParseJson(lastResponse);
  const wordCount = lastResponse.split(/\s+/).length;

  return (
    <div className={styles.panel}>
      <h4 className={styles.title}>Response Details</h4>

      <div className={styles.metrics}>
        {latencyMs !== null && (
          <div className={styles.metric}>
            <span className={styles.metricLabel}>Latency</span>
            <span className={styles.metricValue}>
              {(latencyMs / 1000).toFixed(2)}s
            </span>
          </div>
        )}
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Words</span>
          <span className={styles.metricValue}>{wordCount}</span>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Skill Context</span>
          <span
            className={`${styles.metricValue} ${skillContextProvided ? styles.metricGood : styles.metricWarn}`}
          >
            {skillContextProvided ? 'Provided' : 'Not found'}
          </span>
        </div>
      </div>

      {sessionId && (
        <div className={styles.session}>
          <span className={styles.sessionLabel}>Session</span>
          <code className={styles.sessionId}>{sessionId.slice(0, 12)}...</code>
        </div>
      )}

      {jsonOutput && (
        <div className={styles.jsonSection}>
          <span className={styles.jsonLabel}>Structured Output</span>
          <pre className={styles.jsonPre}>
            {JSON.stringify(jsonOutput, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
