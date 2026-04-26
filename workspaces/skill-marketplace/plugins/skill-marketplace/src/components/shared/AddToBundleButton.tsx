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

import { useBundle } from '../../hooks';
import styles from './AddToBundleButton.module.css';

interface AddToBundleButtonProps {
  skill: { name: string; slug: string; category: string; description: string };
  variant?: 'icon' | 'full';
  className?: string;
}

export default function AddToBundleButton({
  skill,
  variant = 'icon',
  className = '',
}: AddToBundleButtonProps) {
  const { addSkill, hasSkill } = useBundle();
  const inBundle = hasSkill(skill.name);
  const label = inBundle
    ? variant === 'full'
      ? 'In Bundle'
      : '✓'
    : variant === 'full'
      ? '+ Add to Bundle'
      : '+';

  return (
    <button
      type="button"
      className={`${styles.atbBtn} ${variant === 'full' ? styles.atbFull : styles.atbIcon} ${inBundle ? styles.atbAdded : ''} ${className}`.trim()}
      title={inBundle ? 'Already in bundle' : 'Add to Bundle'}
      aria-label={
        inBundle
          ? `${skill.name} already in bundle`
          : `Add ${skill.name} to bundle`
      }
      disabled={inBundle}
      onClick={e => {
        e.stopPropagation();
        if (!inBundle) {
          addSkill({
            name: skill.name,
            slug: skill.slug,
            category: skill.category,
            description: skill.description,
          });
        }
      }}
    >
      {variant === 'full' ? (
        label
      ) : (
        <svg
          viewBox="0 0 16 16"
          width={14}
          height={14}
          fill="currentColor"
          aria-hidden
        >
          {inBundle ? (
            <path d="M13.485 1.929a1 1 0 010 1.414l-7.071 7.071a1 1 0 01-1.414 0L1.929 7.343a1 1 0 111.414-1.414L5.707 8.293l6.364-6.364a1 1 0 011.414 0z" />
          ) : (
            <path d="M8 2a.75.75 0 01.75.75v4.5h4.5a.75.75 0 010 1.5h-4.5v4.5a.75.75 0 01-1.5 0v-4.5h-4.5a.75.75 0 010-1.5h4.5v-4.5A.75.75 0 018 2z" />
          )}
        </svg>
      )}
    </button>
  );
}
