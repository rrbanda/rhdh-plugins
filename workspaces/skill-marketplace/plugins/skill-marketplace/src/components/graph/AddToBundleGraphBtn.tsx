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
import AddToBundleButton from '../shared/AddToBundleButton';
import styles from './GraphPage.module.css';

export function AddToBundleGraphBtn({
  node,
  className,
}: {
  node: { id: string; properties: Record<string, unknown> };
  className?: string;
}) {
  const name = String(node.properties.name || node.id);
  const category =
    node.properties.category !== null && node.properties.category !== undefined
      ? String(node.properties.category)
      : '';
  const slug =
    String(node.properties.slug ?? '') ||
    (category ? `${category}-${name}` : name);
  return (
    <div className={className ?? styles.addToBundleWrapper}>
      <AddToBundleButton
        skill={{
          name,
          slug,
          category,
          description: String(node.properties.description || ''),
        }}
        variant="full"
      />
    </div>
  );
}
