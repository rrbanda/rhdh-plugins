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
import React, { useEffect, useState } from 'react';
import styles from './GraphPage.module.css';

export const AutoSyncIndicator = React.memo(function AutoSyncIndicator({
  intervalMs,
}: {
  intervalMs: number;
}) {
  const [display, setDisplay] = useState(() => new Date().toLocaleTimeString());
  useEffect(() => {
    const id = setInterval(
      () => setDisplay(new Date().toLocaleTimeString()),
      intervalMs,
    );
    return () => clearInterval(id);
  }, [intervalMs]);

  return (
    <span className={styles.autoSyncIndicator}>
      <span className={styles.autoSyncDot} />
      Auto-syncing &middot; last refresh {display}
    </span>
  );
});
