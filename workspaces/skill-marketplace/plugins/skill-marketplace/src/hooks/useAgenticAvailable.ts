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
import { useApi } from '@backstage/core-plugin-api';
import { skillMarketplaceApiRef } from '../api';

let cachedResult: boolean | null = null;

export function useAgenticAvailable(): boolean | null {
  const api = useApi(skillMarketplaceApiRef);
  const [available, setAvailable] = useState<boolean | null>(cachedResult);

  useEffect(() => {
    if (cachedResult !== null) return;
    let cancelled = false;
    api.getHealth()
      .then((health: Record<string, unknown>) => {
        if (cancelled) return;
        const val = health.agenticConfigured === true;
        cachedResult = val;
        setAvailable(val);
      })
      .catch(() => {
        if (!cancelled) {
          cachedResult = false;
          setAvailable(false);
        }
      });
    return () => { cancelled = true; };
  }, [api]);

  return available;
}
