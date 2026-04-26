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
import { useState, useEffect, useCallback, useRef } from 'react';
import type { PluginEntry } from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import styles from './SkillIntro.module.css';

export const INTRO_KEY = 'sm-intro-v2';
const AUTO_MS = 7000;
const TOTAL_SLIDES = 5;

export function SkillIntro({
  plugins,
  skillCount,
  categoryCount,
  onDismiss,
  onNavigate,
}: {
  plugins: PluginEntry[];
  skillCount: number;
  categoryCount: number;
  onDismiss: () => void;
  onNavigate: (path: string) => void;
}) {
  const [slide, setSlide] = useState(0);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const startRef = useRef(Date.now());

  const dismiss = useCallback(() => {
    localStorage.setItem(INTRO_KEY, '1');
    onDismiss();
  }, [onDismiss]);

  const goTo = useCallback((i: number) => {
    setSlide(i);
    setProgress(0);
    startRef.current = Date.now();
  }, []);

  const next = useCallback(() => {
    setSlide(s => {
      if (s >= TOTAL_SLIDES - 1) {
        dismiss();
        return s;
      }
      setProgress(0);
      startRef.current = Date.now();
      return s + 1;
    });
  }, [dismiss]);

  const prev = useCallback(() => {
    setSlide(s => {
      const ns = Math.max(s - 1, 0);
      setProgress(0);
      startRef.current = Date.now();
      return ns;
    });
  }, []);

  const go = useCallback(
    (path: string) => {
      dismiss();
      onNavigate(path);
    },
    [dismiss, onNavigate],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
      else if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [dismiss, next, prev]);

  useEffect(() => {
    startRef.current = Date.now();
    const timer = setInterval(() => {
      if (paused) return;
      const elapsed = Date.now() - startRef.current;
      const pct = Math.min((elapsed / AUTO_MS) * 100, 100);
      setProgress(pct);
      if (pct >= 100) next();
    }, 50);
    return () => clearInterval(timer);
  }, [slide, paused, next]);

  const handleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, a')) return;
    const x = e.clientX / window.innerWidth;
    if (x > 0.6) next();
    else if (x < 0.4) prev();
  };

  return (
    <div
      className={styles.siDeck}
      onClick={handleClick}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          next();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label="Skill introduction slides. Use arrow keys or click left and right to navigate."
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => {
        setPaused(false);
        startRef.current = Date.now() - (progress / 100) * AUTO_MS;
      }}
    >
      <div className={styles.siProgress}>
        <div
          className={styles.siProgressFill}
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Slide 1: What Are Skills */}
      <div
        className={`${styles.siSlide} ${slide === 0 ? styles.siActive : ''}`}
        key={`s-${slide}-0`}
      >
        <div className={`${styles.siGlow} ${styles.siGlowTr}`} />
        <div className={styles.siContent}>
          <span className={`${styles.siLabel} ${styles.siAnim}`}>
            Skills Marketplace
          </span>
          <h1 className={`${styles.siH1} ${styles.siAnim}`}>
            AI Agent Skills for
            <br />
            <span className={styles.siAccent}>Developers</span>
          </h1>
          <p className={`${styles.siSubtitle} ${styles.siAnim}`}>
            Skills are portable, validated instructions that give AI agents
            domain expertise. Each skill is a self-contained definition with
            prerequisites, workflow steps, and metadata.
          </p>
          <div className={`${styles.siThreeCol} ${styles.siAnim}`}>
            <div className={styles.siCard}>
              <h3 className={styles.siCardTitle}>SKILL.md</h3>
              <p className={styles.siCardDesc}>
                Human-readable instructions in Agent Skills specification format
              </p>
            </div>
            <div className={styles.siCard}>
              <h3 className={styles.siCardTitle}>Workflow Steps</h3>
              <p className={styles.siCardDesc}>
                Step-by-step procedures the agent follows to complete tasks
              </p>
            </div>
            <div className={styles.siCard}>
              <h3 className={styles.siCardTitle}>Metadata</h3>
              <p className={styles.siCardDesc}>
                Version, model, prerequisites, and related skills for discovery
              </p>
            </div>
          </div>
          <div className={`${styles.siTags} ${styles.siAnim}`}>
            <span className={`${styles.siTag} ${styles.siTagAccent}`}>
              PORTABLE
            </span>
            <span className={styles.siTag}>VALIDATED</span>
            <span className={styles.siTag}>CROSS-PLATFORM</span>
          </div>
        </div>
      </div>

      {/* Slide 2: Why They Matter */}
      <div
        className={`${styles.siSlide} ${slide === 1 ? styles.siActive : ''}`}
        key={`s-${slide}-1`}
      >
        <div className={`${styles.siGlow} ${styles.siGlowBl}`} />
        <div className={styles.siContent}>
          <span className={`${styles.siLabel} ${styles.siAnim}`}>
            Why Skills
          </span>
          <h1 className={`${styles.siH1} ${styles.siAnim}`}>
            From Ad-Hoc Prompts to
            <br />
            <span className={styles.siAccent}>Structured Expertise</span>
          </h1>
          <p className={`${styles.siSubtitle} ${styles.siAnim}`}>
            Instead of re-writing prompts, capture domain knowledge once and
            reuse it across agents and IDEs.
          </p>
          <ul className={`${styles.siFeatureList} ${styles.siAnim}`}>
            {[
              {
                t: 'Consistency',
                d: 'Same quality output every time \u2014 no drift between runs',
              },
              {
                t: 'Reusability',
                d: 'Write once, use in any agent \u2014 Cursor, Claude Code, VS Code',
              },
              {
                t: 'Versioning',
                d: 'Track changes, roll back, audit every modification',
              },
              {
                t: 'Discovery',
                d: 'Search and browse a curated catalog of capabilities',
              },
            ].map(f => (
              <li key={f.t}>
                <span className={styles.siFeatDot} />
                <span>
                  <strong>{f.t}</strong> \u2014 {f.d}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Slide 3: Skill Graph */}
      <div
        className={`${styles.siSlide} ${slide === 2 ? styles.siActive : ''}`}
        key={`s-${slide}-2`}
      >
        <div className={`${styles.siGlow} ${styles.siGlowTr}`} />
        <div className={styles.siContent}>
          <span className={`${styles.siLabel} ${styles.siAnim}`}>
            Skill Graph
          </span>
          <h1 className={`${styles.siH1} ${styles.siAnim}`}>
            See How Skills
            <br />
            <span className={styles.siAccent}>Connect</span>
          </h1>
          <div className={`${styles.siTwoCol} ${styles.siAnim}`}>
            <div>
              <p className={styles.siBodyText}>
                Every skill is linked in a{' '}
                <strong style={{ color: '#fff' }}>
                  Neo4j-powered knowledge graph
                </strong>
                . Explore relationships between categories, discover
                complementary skills, and understand the full landscape.
              </p>
              <ul className={styles.siFeatureList} style={{ marginTop: 24 }}>
                <li>
                  <span className={styles.siFeatDot} />
                  <span>
                    <strong>Categories</strong> \u2014 Organized skill
                    collections
                  </span>
                </li>
                <li>
                  <span className={styles.siFeatDot} />
                  <span>
                    <strong>Relationships</strong> \u2014 Skills linked by
                    context
                  </span>
                </li>
                <li>
                  <span className={styles.siFeatDot} />
                  <span>
                    <strong>Search</strong> \u2014 Natural language discovery
                  </span>
                </li>
              </ul>
            </div>
            <div className={styles.siGraphVis}>
              <svg viewBox="0 0 320 240" className={styles.siGraphSvg}>
                <line
                  x1="80"
                  y1="120"
                  x2="160"
                  y2="60"
                  className={styles.siEdge}
                />
                <line
                  x1="80"
                  y1="120"
                  x2="160"
                  y2="180"
                  className={styles.siEdge}
                />
                <line
                  x1="160"
                  y1="60"
                  x2="250"
                  y2="80"
                  className={styles.siEdge}
                />
                <line
                  x1="160"
                  y1="180"
                  x2="250"
                  y2="160"
                  className={styles.siEdge}
                />
                <line
                  x1="250"
                  y1="80"
                  x2="250"
                  y2="160"
                  className={styles.siEdge}
                />
                <line
                  x1="160"
                  y1="60"
                  x2="160"
                  y2="180"
                  className={`${styles.siEdge} ${styles.siEdgeDim}`}
                />
                <circle
                  cx="80"
                  cy="120"
                  r="20"
                  className={`${styles.siNode} ${styles.siNode1}`}
                />
                <circle
                  cx="160"
                  cy="60"
                  r="16"
                  className={`${styles.siNode} ${styles.siNode2}`}
                />
                <circle
                  cx="160"
                  cy="180"
                  r="16"
                  className={`${styles.siNode} ${styles.siNode3}`}
                />
                <circle
                  cx="250"
                  cy="80"
                  r="13"
                  className={`${styles.siNode} ${styles.siNode4}`}
                />
                <circle
                  cx="250"
                  cy="160"
                  r="13"
                  className={`${styles.siNode} ${styles.siNode5}`}
                />
                <text x="80" y="155" className={styles.siNodeLabel}>
                  Category
                </text>
                <text x="160" y="40" className={styles.siNodeLabel}>
                  Skill A
                </text>
                <text x="160" y="210" className={styles.siNodeLabel}>
                  Skill B
                </text>
                <text x="250" y="60" className={styles.siNodeLabel}>
                  Related
                </text>
                <text x="250" y="190" className={styles.siNodeLabel}>
                  Related
                </text>
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Slide 4: Categories (live data) */}
      <div
        className={`${styles.siSlide} ${slide === 3 ? styles.siActive : ''}`}
        key={`s-${slide}-3`}
      >
        <div className={`${styles.siGlow} ${styles.siGlowBl}`} />
        <div className={styles.siContent}>
          <span className={`${styles.siLabel} ${styles.siAnim}`}>
            Categories
          </span>
          <h1 className={`${styles.siH1} ${styles.siAnim}`}>
            <span className={styles.siAccent}>{categoryCount}</span> Categories,{' '}
            <span className={styles.siAccent}>{skillCount}</span> Skills
          </h1>
          <p className={`${styles.siSubtitle} ${styles.siAnim}`}>
            Skills are organized into categories {'\u2014'} each representing a
            plugin with its own set of curated capabilities.
          </p>
          <div className={`${styles.siCatGrid} ${styles.siAnim}`}>
            {plugins.map(p => (
              <div key={p.name} className={styles.siCatItem}>
                <span
                  className={styles.siCatDot}
                  style={{ backgroundColor: p.color ?? '#6b7280' }}
                />
                <div>
                  <span className={styles.siCatName}>{p.name}</span>
                  <span className={styles.siCatDesc}>
                    {p.description || 'Skills collection'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Slide 5: Get Started */}
      <div
        className={`${styles.siSlide} ${slide === 4 ? styles.siActive : ''}`}
        key={`s-${slide}-4`}
      >
        <div className={`${styles.siGlow} ${styles.siGlowCenter}`} />
        <div className={`${styles.siContent} ${styles.siContentCenter}`}>
          <span className={`${styles.siLabel} ${styles.siAnim}`}>
            Get Started
          </span>
          <h1 className={`${styles.siH1} ${styles.siAnim}`}>
            Start <span className={styles.siAccent}>Exploring</span>
          </h1>
          <p
            className={`${styles.siSubtitle} ${styles.siAnim}`}
            style={{ textAlign: 'center' }}
          >
            Browse skills, visualize the knowledge graph, or build your own.
          </p>
          <div className={`${styles.siCtaRow} ${styles.siAnim}`}>
            <button
              className={`${styles.siCta} ${styles.siCtaPrimary}`}
              onClick={() => go('skills')}
            >
              Browse Skills
            </button>
            <button
              className={`${styles.siCta} ${styles.siCtaSecondary}`}
              onClick={() => go('graph')}
            >
              Skill Graph
            </button>
            <button
              className={`${styles.siCta} ${styles.siCtaSecondary}`}
              onClick={() => go('builder')}
            >
              Build a Skill
            </button>
          </div>
        </div>
      </div>

      <div
        className={styles.siControls}
        onClick={e => e.stopPropagation()}
        onKeyDown={e => e.stopPropagation()}
        role="presentation"
      >
        <div className={styles.siNavHint}>
          &larr; &rarr; or click to navigate
        </div>
        <div className={styles.siDots}>
          {Array.from({ length: TOTAL_SLIDES }).map((_, i) => (
            <button
              key={i}
              className={`${styles.siDot} ${i === slide ? styles.siDotActive : ''}`}
              onClick={() => goTo(i)}
              aria-label={`Slide ${i + 1}`}
            />
          ))}
        </div>
        <div className={styles.siControlsRight}>
          <span className={styles.siCounter}>
            <span className={styles.siCounterCurrent}>{slide + 1}</span> /{' '}
            {TOTAL_SLIDES}
          </span>
          <button className={styles.siSkip} onClick={dismiss}>
            Skip &rarr;
          </button>
        </div>
      </div>
    </div>
  );
}
