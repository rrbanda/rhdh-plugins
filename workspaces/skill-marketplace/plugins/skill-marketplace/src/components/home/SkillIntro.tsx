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
      if (s >= TOTAL_SLIDES - 1) { dismiss(); return s; }
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

  const go = useCallback((path: string) => {
    dismiss();
    onNavigate(path);
  }, [dismiss, onNavigate]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
      else if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') prev();
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
      className="si-deck"
      onClick={handleClick}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => { setPaused(false); startRef.current = Date.now() - (progress / 100) * AUTO_MS; }}
    >
      <style>{introStyles}</style>

      <div className="si-progress">
        <div className="si-progress-fill" style={{ width: `${progress}%` }} />
      </div>

      {/* Slide 1: What Are Skills */}
      <div className={`si-slide ${slide === 0 ? 'si-active' : ''}`} key={`s-${slide}-0`}>
        <div className="si-glow si-glow-tr" />
        <div className="si-content">
          <span className="si-label si-anim">Skills Marketplace</span>
          <h1 className="si-h1 si-anim">
            AI Agent Skills for<br /><span className="si-accent">Developers</span>
          </h1>
          <p className="si-subtitle si-anim">
            Skills are portable, validated instructions that give AI agents domain expertise.
            Each skill is a self-contained definition with prerequisites, workflow steps, and metadata.
          </p>
          <div className="si-three-col si-anim">
            <div className="si-card">
              <h3 className="si-card-title">SKILL.md</h3>
              <p className="si-card-desc">Human-readable instructions in Agent Skills specification format</p>
            </div>
            <div className="si-card">
              <h3 className="si-card-title">Workflow Steps</h3>
              <p className="si-card-desc">Step-by-step procedures the agent follows to complete tasks</p>
            </div>
            <div className="si-card">
              <h3 className="si-card-title">Metadata</h3>
              <p className="si-card-desc">Version, model, prerequisites, and related skills for discovery</p>
            </div>
          </div>
          <div className="si-tags si-anim">
            <span className="si-tag si-tag-accent">PORTABLE</span>
            <span className="si-tag">VALIDATED</span>
            <span className="si-tag">CROSS-PLATFORM</span>
          </div>
        </div>
      </div>

      {/* Slide 2: Why They Matter */}
      <div className={`si-slide ${slide === 1 ? 'si-active' : ''}`} key={`s-${slide}-1`}>
        <div className="si-glow si-glow-bl" />
        <div className="si-content">
          <span className="si-label si-anim">Why Skills</span>
          <h1 className="si-h1 si-anim">
            From Ad-Hoc Prompts to<br /><span className="si-accent">Structured Expertise</span>
          </h1>
          <p className="si-subtitle si-anim">
            Instead of re-writing prompts, capture domain knowledge once and reuse it across agents and IDEs.
          </p>
          <ul className="si-feature-list si-anim">
            {[
              { t: 'Consistency', d: 'Same quality output every time \u2014 no drift between runs' },
              { t: 'Reusability', d: 'Write once, use in any agent \u2014 Cursor, Claude Code, VS Code' },
              { t: 'Versioning', d: 'Track changes, roll back, audit every modification' },
              { t: 'Discovery', d: 'Search and browse a curated catalog of capabilities' },
            ].map(f => (
              <li key={f.t}>
                <span className="si-feat-dot" />
                <span><strong>{f.t}</strong> \u2014 {f.d}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Slide 3: Skill Graph */}
      <div className={`si-slide ${slide === 2 ? 'si-active' : ''}`} key={`s-${slide}-2`}>
        <div className="si-glow si-glow-tr" />
        <div className="si-content">
          <span className="si-label si-anim">Skill Graph</span>
          <h1 className="si-h1 si-anim">
            See How Skills<br /><span className="si-accent">Connect</span>
          </h1>
          <div className="si-two-col si-anim">
            <div>
              <p className="si-body-text">
                Every skill is linked in a <strong style={{ color: '#fff' }}>Neo4j-powered knowledge graph</strong>.
                Explore relationships between categories, discover complementary skills, and understand the full landscape.
              </p>
              <ul className="si-feature-list" style={{ marginTop: 24 }}>
                <li><span className="si-feat-dot" /><span><strong>Categories</strong> \u2014 Organized skill collections</span></li>
                <li><span className="si-feat-dot" /><span><strong>Relationships</strong> \u2014 Skills linked by context</span></li>
                <li><span className="si-feat-dot" /><span><strong>Search</strong> \u2014 Natural language discovery</span></li>
              </ul>
            </div>
            <div className="si-graph-vis">
              <svg viewBox="0 0 320 240" className="si-graph-svg">
                <line x1="80" y1="120" x2="160" y2="60" className="si-edge" />
                <line x1="80" y1="120" x2="160" y2="180" className="si-edge" />
                <line x1="160" y1="60" x2="250" y2="80" className="si-edge" />
                <line x1="160" y1="180" x2="250" y2="160" className="si-edge" />
                <line x1="250" y1="80" x2="250" y2="160" className="si-edge" />
                <line x1="160" y1="60" x2="160" y2="180" className="si-edge si-edge-dim" />
                <circle cx="80" cy="120" r="20" className="si-node si-node-1" />
                <circle cx="160" cy="60" r="16" className="si-node si-node-2" />
                <circle cx="160" cy="180" r="16" className="si-node si-node-3" />
                <circle cx="250" cy="80" r="13" className="si-node si-node-4" />
                <circle cx="250" cy="160" r="13" className="si-node si-node-5" />
                <text x="80" y="155" className="si-node-label">Category</text>
                <text x="160" y="40" className="si-node-label">Skill A</text>
                <text x="160" y="210" className="si-node-label">Skill B</text>
                <text x="250" y="60" className="si-node-label">Related</text>
                <text x="250" y="190" className="si-node-label">Related</text>
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Slide 4: Categories (live data) */}
      <div className={`si-slide ${slide === 3 ? 'si-active' : ''}`} key={`s-${slide}-3`}>
        <div className="si-glow si-glow-bl" />
        <div className="si-content">
          <span className="si-label si-anim">Categories</span>
          <h1 className="si-h1 si-anim">
            <span className="si-accent">{categoryCount}</span> Categories,{' '}
            <span className="si-accent">{skillCount}</span> Skills
          </h1>
          <p className="si-subtitle si-anim">
            Skills are organized into categories {'\u2014'} each representing a plugin with its own set of curated capabilities.
          </p>
          <div className="si-cat-grid si-anim">
            {plugins.map(p => (
              <div key={p.name} className="si-cat-item">
                <span className="si-cat-dot" style={{ backgroundColor: p.color ?? '#6b7280' }} />
                <div>
                  <span className="si-cat-name">{p.name}</span>
                  <span className="si-cat-desc">{p.description || 'Skills collection'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Slide 5: Get Started */}
      <div className={`si-slide ${slide === 4 ? 'si-active' : ''}`} key={`s-${slide}-4`}>
        <div className="si-glow si-glow-center" />
        <div className="si-content si-content-center">
          <span className="si-label si-anim">Get Started</span>
          <h1 className="si-h1 si-anim">
            Start <span className="si-accent">Exploring</span>
          </h1>
          <p className="si-subtitle si-anim" style={{ textAlign: 'center' }}>
            Browse skills, visualize the knowledge graph, or build your own.
          </p>
          <div className="si-cta-row si-anim">
            <button className="si-cta si-cta-primary" onClick={() => go('skills')}>Browse Skills</button>
            <button className="si-cta si-cta-secondary" onClick={() => go('graph')}>Skill Graph</button>
            <button className="si-cta si-cta-secondary" onClick={() => go('builder')}>Build a Skill</button>
          </div>
        </div>
      </div>

      <div className="si-controls" onClick={e => e.stopPropagation()}>
        <div className="si-nav-hint">&larr; &rarr; or click to navigate</div>
        <div className="si-dots">
          {Array.from({ length: TOTAL_SLIDES }).map((_, i) => (
            <button
              key={i}
              className={`si-dot ${i === slide ? 'si-dot-active' : ''}`}
              onClick={() => goTo(i)}
              aria-label={`Slide ${i + 1}`}
            />
          ))}
        </div>
        <div className="si-controls-right">
          <span className="si-counter"><span className="si-counter-current">{slide + 1}</span> / {TOTAL_SLIDES}</span>
          <button className="si-skip" onClick={dismiss}>Skip &rarr;</button>
        </div>
      </div>
    </div>
  );
}

const introStyles = `
  .si-deck { background: #000; position: relative; width: 100%; min-height: calc(100vh - 120px); overflow: hidden; }
  .si-progress { position: absolute; top: 0; left: 0; right: 0; height: 3px; background: #1a1a1a; z-index: 20; }
  .si-progress-fill { height: 100%; background: linear-gradient(90deg, #4d9de0, #8b5cf6); transition: width 0.05s linear; }
  .si-slide { display: none; flex-direction: column; justify-content: center; width: 100%; min-height: calc(100vh - 120px); padding: 64px 56px 80px; position: relative; overflow: hidden; }
  .si-slide.si-active { display: flex; }
  .si-glow { position: absolute; width: 60%; height: 60%; pointer-events: none; z-index: 0; }
  .si-glow-tr { top: -20%; right: -10%; background: radial-gradient(ellipse, rgba(77,157,224,0.10) 0%, transparent 70%); }
  .si-glow-bl { bottom: -15%; left: -10%; background: radial-gradient(ellipse, rgba(139,92,246,0.08) 0%, transparent 70%); }
  .si-glow-center { top: -30%; left: 20%; width: 80%; height: 80%; background: radial-gradient(ellipse, rgba(77,157,224,0.12) 0%, transparent 70%); }
  .si-content { position: relative; z-index: 1; max-width: 1000px; }
  .si-content-center { display: flex; flex-direction: column; align-items: center; text-align: center; margin: 0 auto; }
  .si-anim { opacity: 0; transform: translateY(20px); }
  .si-active .si-anim { animation: siFadeUp 0.6s ease-out forwards; }
  .si-active .si-anim:nth-child(2) { animation-delay: 0.1s; }
  .si-active .si-anim:nth-child(3) { animation-delay: 0.2s; }
  .si-active .si-anim:nth-child(4) { animation-delay: 0.3s; }
  .si-active .si-anim:nth-child(5) { animation-delay: 0.4s; }
  .si-active .si-anim:nth-child(6) { animation-delay: 0.5s; }
  @keyframes siFadeUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
  .si-label { font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 0.82rem; letter-spacing: 0.12em; text-transform: uppercase; color: #4d9de0; margin-bottom: 16px; display: block; }
  .si-h1 { font-size: 2.8rem; font-weight: 900; line-height: 1.1; color: #fff; margin: 0 0 20px; }
  .si-accent { color: #4d9de0; }
  .si-subtitle { font-size: 1.15rem; color: #a3a3a3; line-height: 1.65; max-width: 680px; margin: 0 0 28px; }
  .si-body-text { font-size: 1.05rem; color: #c7c7c7; line-height: 1.7; max-width: 800px; }
  .si-three-col { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 24px; max-width: 900px; }
  .si-card { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 6px; padding: 24px; box-shadow: 0 2px 4px rgba(0,0,0,0.3); }
  .si-card-title { font-size: 1rem; font-weight: 700; color: #fff; margin: 0 0 8px; }
  .si-card-desc { font-size: 0.9rem; color: #999; line-height: 1.5; margin: 0; }
  .si-tags { display: flex; flex-wrap: wrap; gap: 8px; }
  .si-tag { display: inline-block; padding: 4px 16px; border: 1px solid #383838; border-radius: 64px; font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 0.8rem; letter-spacing: 0.06em; text-transform: uppercase; color: #c7c7c7; }
  .si-tag-accent { border-color: #4d9de0; color: #4d9de0; }
  .si-feature-list { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 16px; max-width: 800px; }
  .si-feature-list li { display: flex; align-items: flex-start; gap: 14px; font-size: 1.05rem; color: #c7c7c7; line-height: 1.6; }
  .si-feature-list strong { color: #fff; }
  .si-feat-dot { width: 8px; height: 8px; border-radius: 50%; background: #4d9de0; flex-shrink: 0; margin-top: 8px; }
  .si-two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; max-width: 1000px; }
  .si-graph-vis { display: flex; align-items: center; justify-content: center; }
  .si-graph-svg { width: 100%; max-width: 320px; height: auto; }
  .si-edge { stroke: #333; stroke-width: 1.5; }
  .si-edge-dim { stroke: #222; stroke-dasharray: 4 4; }
  .si-node { fill: #1a1a1a; stroke-width: 2; }
  .si-node-1 { stroke: #4d9de0; animation: siPulse 3s ease-in-out infinite; }
  .si-node-2 { stroke: #8b5cf6; animation: siPulse 3s ease-in-out 0.5s infinite; }
  .si-node-3 { stroke: #10b981; animation: siPulse 3s ease-in-out 1s infinite; }
  .si-node-4 { stroke: #f59e0b; animation: siPulse 3s ease-in-out 1.5s infinite; }
  .si-node-5 { stroke: #ef4444; animation: siPulse 3s ease-in-out 2s infinite; }
  .si-node-label { fill: #666; font-size: 12px; text-anchor: middle; font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; }
  @keyframes siPulse { 0%, 100% { filter: drop-shadow(0 0 2px currentColor); } 50% { filter: drop-shadow(0 0 10px currentColor); } }
  .si-cat-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; max-width: 900px; }
  .si-cat-item { display: flex; align-items: flex-start; gap: 12px; padding: 16px 20px; background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 6px; transition: border-color 0.2s; }
  .si-cat-item:hover { border-color: #444; }
  .si-cat-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; margin-top: 4px; }
  .si-cat-name { font-size: 0.95rem; font-weight: 600; color: #fff; display: block; }
  .si-cat-desc { font-size: 0.85rem; color: #777; display: block; margin-top: 2px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .si-cta-row { display: flex; gap: 14px; margin-top: 8px; }
  .si-cta { display: inline-flex; align-items: center; gap: 8px; padding: 14px 32px; border-radius: 10px; font-size: 1rem; font-weight: 600; cursor: pointer; transition: all 0.2s; border: 1px solid transparent; font-family: inherit; }
  .si-cta-primary { background: #4d9de0; color: #000; }
  .si-cta-primary:hover { background: #5eaee8; box-shadow: 0 0 24px rgba(77,157,224,0.3); }
  .si-cta-secondary { background: transparent; border-color: #383838; color: #c7c7c7; }
  .si-cta-secondary:hover { border-color: #4d9de0; color: #fff; }
  .si-controls { position: absolute; bottom: 0; left: 0; right: 0; display: flex; justify-content: space-between; align-items: center; padding: 10px 32px; z-index: 20; }
  .si-nav-hint { font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 0.8rem; color: #555; }
  .si-dots { display: flex; gap: 8px; }
  .si-dot { width: 10px; height: 10px; border-radius: 50%; border: 1px solid #444; background: transparent; cursor: pointer; padding: 0; transition: all 0.2s; }
  .si-dot-active { background: #4d9de0; border-color: #4d9de0; box-shadow: 0 0 8px rgba(77,157,224,0.4); }
  .si-dot:hover:not(.si-dot-active) { border-color: #888; }
  .si-controls-right { display: flex; align-items: center; gap: 16px; }
  .si-counter { font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 0.8rem; color: #666; }
  .si-counter-current { color: #4d9de0; font-weight: 700; }
  .si-skip { background: none; border: 1px solid #333; color: #888; padding: 6px 16px; border-radius: 6px; font-size: 0.85rem; font-weight: 500; cursor: pointer; font-family: inherit; transition: all 0.2s; }
  .si-skip:hover { border-color: #4d9de0; color: #4d9de0; }
  @media (max-width: 900px) { .si-slide { padding: 48px 28px 80px; } .si-h1 { font-size: 2rem; } .si-three-col { grid-template-columns: 1fr; } .si-two-col { grid-template-columns: 1fr; } .si-cat-grid { grid-template-columns: 1fr; } .si-cta-row { flex-direction: column; } }
`;
