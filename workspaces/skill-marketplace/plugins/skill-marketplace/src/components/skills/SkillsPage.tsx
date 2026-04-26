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
import { useState, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  useSkills,
  useSemanticSearch,
  useBundle,
  useSkillCatalog,
} from '../../hooks';
import { SkillCard } from './SkillCard';
import { SkillDetailDrawer } from './SkillDetailDrawer';
import { SemanticResultCard } from './SemanticResultCard';
import LoadingSpinner from '../shared/LoadingSpinner';
import ErrorMessage from '../shared/ErrorMessage';
import { catalogToSkillData } from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import type { SkillData } from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import styles from './SkillsPage.module.css';

type SearchMode = 'keyword' | 'semantic' | 'catalog';

export default function SkillsPage() {
  const { skills, marketplace, loading, error } = useSkills();
  const semantic = useSemanticSearch();
  const catalog = useSkillCatalog(50);
  const { addSkills, setDrawerOpen } = useBundle();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [semanticQuery, setSemanticQuery] = useState('');
  const [catalogQuery, setCatalogQuery] = useState('');
  const [catalogNs, setCatalogNs] = useState('');
  const [catalogStatus, setCatalogStatus] = useState('');
  const [searchMode, setSearchMode] = useState<SearchMode>('keyword');
  const [selectionMode, setSelectionMode] = useState(
    () => searchParams.get('mode') === 'select',
  );
  const [selectedSlugs, setSelectedSlugs] = useState<Set<string>>(new Set());
  const [activePlugin, setActivePlugin] = useState<string | null>(() =>
    searchParams.get('category'),
  );
  const [detailSkill, setDetailSkill] = useState<SkillData | null>(null);

  const catalogSkillsAsSkillData = useMemo(
    () => catalog.skills.map(catalogToSkillData),
    [catalog.skills],
  );

  const catalogNamespaces = useMemo(() => {
    const ns = new Set<string>();
    catalog.skills.forEach(s => ns.add(s.namespace));
    return [...ns].sort();
  }, [catalog.skills]);

  const pluginCounts = useMemo(() => {
    return skills.reduce(
      (acc, s) => {
        acc[s.pluginName] = (acc[s.pluginName] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
  }, [skills]);

  const filtered = useMemo(() => {
    let result = skills;
    if (activePlugin) {
      result = result.filter(s => s.pluginName === activePlugin);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        s =>
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.pluginName.toLowerCase().includes(q) ||
          s.sections.title.toLowerCase().includes(q),
      );
    }
    return result;
  }, [skills, searchQuery, activePlugin]);

  const handlePluginClick = useCallback(
    (plugin: string | null) => {
      setActivePlugin(prev => {
        const next = prev === plugin ? null : plugin;
        if (next) {
          setSearchParams({ category: next }, { replace: true });
        } else {
          setSearchParams({}, { replace: true });
        }
        return next;
      });
    },
    [setSearchParams],
  );

  const toggleSelect = useCallback((slug: string) => {
    setSelectedSlugs(prev => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedSlugs(new Set(filtered.map(s => s.slug)));
  }, [filtered]);

  const clearSelection = useCallback(() => {
    setSelectedSlugs(new Set());
  }, []);

  const handleAddSelectedToCart = useCallback(() => {
    const bySlug = new Map<string, SkillData>();
    for (const s of skills) {
      bySlug.set(s.slug, s);
    }
    for (const s of catalogSkillsAsSkillData) {
      if (!bySlug.has(s.slug)) {
        bySlug.set(s.slug, s);
      }
    }
    const toAdd = Array.from(selectedSlugs)
      .map(slug => bySlug.get(slug))
      .filter((s): s is SkillData => s !== null && s !== undefined)
      .map(s => ({
        name: s.skillName,
        slug: s.slug,
        category: s.pluginName,
        description: s.description,
      }));
    const added = addSkills(toAdd);
    if (added > 0) {
      setDrawerOpen(true);
    }
    setSelectedSlugs(new Set());
    setSelectionMode(false);
  }, [
    skills,
    catalogSkillsAsSkillData,
    selectedSlugs,
    addSkills,
    setDrawerOpen,
  ]);

  const toggleSelectionMode = useCallback(() => {
    setSelectionMode(prev => {
      if (prev) setSelectedSlugs(new Set());
      return !prev;
    });
  }, []);

  const openSkillDetail = useCallback((s: SkillData) => {
    setDetailSkill(s);
  }, []);

  const closeSkillDetail = useCallback(() => {
    setDetailSkill(null);
  }, []);

  if (loading) return <LoadingSpinner message="Loading skills catalog..." />;
  if (error) return <ErrorMessage message={error} />;

  const plugins = marketplace?.plugins ?? [];

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Browse Skills</h1>
          <p className={styles.subtitle}>
            Explore {skills.length} AI agent skills across {plugins.length}{' '}
            categories
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            className={
              selectionMode ? styles.selectToggleActive : styles.selectToggle
            }
            onClick={toggleSelectionMode}
            aria-label={
              selectionMode
                ? 'Exit selection mode'
                : 'Enter selection mode for bundle'
            }
          >
            <svg viewBox="0 0 16 16" width={14} height={14} fill="currentColor">
              <path d="M2 0a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V2a2 2 0 00-2-2H2zm10.03 4.97a.75.75 0 010 1.06l-5 5a.75.75 0 01-1.06 0l-2.5-2.5a.75.75 0 111.06-1.06L6.5 9.44l4.47-4.47a.75.75 0 011.06 0z" />
            </svg>
            {selectionMode ? 'Exit Selection' : 'Select for Bundle'}
          </button>
          <span className={styles.count}>
            {filtered.length} of {skills.length} skills
          </span>
        </div>
      </div>

      {selectionMode && searchMode === 'keyword' && (
        <div className={styles.selectBar}>
          <span className={styles.selectInfo}>
            {selectedSlugs.size} of {filtered.length} selected
          </span>
          <button
            className={styles.selectAction}
            onClick={selectAll}
            aria-label="Select all skills"
          >
            Select All
          </button>
          {selectedSlugs.size > 0 && (
            <button
              className={styles.selectAction}
              onClick={clearSelection}
              aria-label="Deselect all skills"
            >
              Deselect All
            </button>
          )}
        </div>
      )}

      {/* Search mode toggle */}
      <div className={styles.searchModeBar}>
        <button
          className={
            searchMode === 'keyword' ? styles.modeBtnActive : styles.modeBtn
          }
          onClick={() => {
            setSearchMode('keyword');
            semantic.clear();
          }}
          aria-label="Keyword search mode"
        >
          <svg viewBox="0 0 16 16" width={14} height={14} fill="currentColor">
            <path d="M11.742 10.344a6.5 6.5 0 10-1.397 1.398h-.001l3.85 3.85a1 1 0 001.415-1.414l-3.85-3.85zm-5.442.156a5 5 0 110-10 5 5 0 010 10z" />
          </svg>
          Keyword
        </button>
        <button
          className={
            searchMode === 'semantic' ? styles.modeBtnActive : styles.modeBtn
          }
          onClick={() => {
            setSearchMode('semantic');
            setSearchQuery('');
          }}
          aria-label="AI semantic search mode"
        >
          <svg
            viewBox="0 0 24 24"
            width={14}
            height={14}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path d="M12 2a4 4 0 014 4c0 1.95-1.4 3.58-3.25 3.93L12 10l-.75-.07A4.001 4.001 0 0112 2z" />
            <path d="M12 10v4" />
            <path d="M8 18h8" />
            <path d="M7 22h10" />
          </svg>
          AI Semantic
        </button>
        {catalog.available && (
          <button
            className={
              searchMode === 'catalog' ? styles.modeBtnActive : styles.modeBtn
            }
            onClick={() => {
              setSearchMode('catalog');
              setSearchQuery('');
              semantic.clear();
            }}
            aria-label="Catalog search mode"
          >
            <svg
              viewBox="0 0 24 24"
              width={14}
              height={14}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
            </svg>
            Catalog
            <span className={styles.catalogBadge}>
              {catalog.pagination.total}
            </span>
          </button>
        )}
      </div>

      {/* Search input (keyword / semantic) */}
      {searchMode !== 'catalog' && (
        <div className={styles.searchWrap}>
          <svg
            className={styles.searchIcon}
            viewBox="0 0 16 16"
            width={18}
            height={18}
            fill="currentColor"
          >
            <path d="M11.742 10.344a6.5 6.5 0 10-1.397 1.398h-.001l3.85 3.85a1 1 0 001.415-1.414l-3.85-3.85zm-5.442.156a5 5 0 110-10 5 5 0 010 10z" />
          </svg>
          <input
            type="text"
            className={styles.searchInput}
            placeholder={
              searchMode === 'keyword'
                ? "Search skills... e.g. 'dockerfile review' or 'API testing'"
                : "Describe what you need... e.g. 'process PDFs and extract structured data'"
            }
            value={searchMode === 'keyword' ? searchQuery : semanticQuery}
            onChange={e => {
              if (searchMode === 'keyword') {
                setSearchQuery(e.target.value);
              } else {
                setSemanticQuery(e.target.value);
                semantic.search(e.target.value);
              }
            }}
          />
          {(searchQuery || semanticQuery) && (
            <button
              className={styles.searchClear}
              onClick={() => {
                setSearchQuery('');
                setSemanticQuery('');
                semantic.clear();
              }}
              aria-label="Clear search"
            >
              <svg
                viewBox="0 0 16 16"
                width={14}
                height={14}
                fill="currentColor"
              >
                <path d="M4.646 4.646a.5.5 0 01.708 0L8 7.293l2.646-2.647a.5.5 0 01.708.708L8.707 8l2.647 2.646a.5.5 0 01-.708.708L8 8.707l-2.646 2.647a.5.5 0 01-.708-.708L7.293 8 4.646 5.354a.5.5 0 010-.708z" />
              </svg>
            </button>
          )}
        </div>
      )}

      {/* Catalog mode */}
      {searchMode === 'catalog' && (
        <div className={styles.catalogControls}>
          <div className={styles.searchWrap}>
            <svg
              className={styles.searchIcon}
              viewBox="0 0 16 16"
              width={18}
              height={18}
              fill="currentColor"
            >
              <path d="M11.742 10.344a6.5 6.5 0 10-1.397 1.398h-.001l3.85 3.85a1 1 0 001.415-1.414l-3.85-3.85zm-5.442.156a5 5 0 110-10 5 5 0 010 10z" />
            </svg>
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Search the skill catalog..."
              value={catalogQuery}
              onChange={e => {
                setCatalogQuery(e.target.value);
                catalog.search(e.target.value);
              }}
            />
            {catalogQuery && (
              <button
                className={styles.searchClear}
                onClick={() => {
                  setCatalogQuery('');
                  catalog.search('');
                }}
                aria-label="Clear catalog search"
              >
                <svg
                  viewBox="0 0 16 16"
                  width={14}
                  height={14}
                  fill="currentColor"
                >
                  <path d="M4.646 4.646a.5.5 0 01.708 0L8 7.293l2.646-2.647a.5.5 0 01.708.708L8.707 8l2.647 2.646a.5.5 0 01-.708.708L8 8.707l-2.646 2.647a.5.5 0 01-.708-.708L7.293 8 4.646 5.354a.5.5 0 010-.708z" />
                </svg>
              </button>
            )}
          </div>
          <div className={styles.catalogFilters}>
            <select
              className={styles.catalogSelect}
              value={catalogNs}
              onChange={e => {
                setCatalogNs(e.target.value);
                catalog.setFilters({
                  ...catalog.filters,
                  namespace: e.target.value || undefined,
                });
              }}
              aria-label="Filter by namespace"
            >
              <option value="">All Namespaces</option>
              {catalogNamespaces.map(ns => (
                <option key={ns} value={ns}>
                  {ns.charAt(0).toUpperCase() + ns.slice(1)}
                </option>
              ))}
            </select>
            <select
              className={styles.catalogSelect}
              value={catalogStatus}
              onChange={e => {
                setCatalogStatus(e.target.value);
                catalog.setFilters({
                  ...catalog.filters,
                  status: e.target.value || undefined,
                });
              }}
              aria-label="Filter by status"
            >
              <option value="">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="testing">Testing</option>
              <option value="published">Published</option>
              <option value="deprecated">Deprecated</option>
            </select>
            <span className={styles.catalogCount}>
              {catalog.pagination.total} result
              {catalog.pagination.total !== 1 ? 's' : ''}
              {catalog.pagination.total > catalog.pagination.per_page && (
                <> &middot; Page {catalog.pagination.page}</>
              )}
            </span>
          </div>
          {catalog.loading ? (
            <LoadingSpinner message="Searching catalog..." />
          ) : catalog.error ? (
            <ErrorMessage message={catalog.error} />
          ) : catalogSkillsAsSkillData.length === 0 ? (
            <div className={styles.empty}>
              <svg
                width={48}
                height={48}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <h3>No catalog skills found</h3>
              <p>Try adjusting your search or filters.</p>
            </div>
          ) : (
            <>
              <div className={styles.grid}>
                {catalogSkillsAsSkillData.map(skill => (
                  <SkillCard
                    key={skill.slug}
                    skill={skill}
                    selectionMode={selectionMode}
                    selected={selectedSlugs.has(skill.slug)}
                    onToggleSelect={toggleSelect}
                    onOpenDetail={selectionMode ? undefined : openSkillDetail}
                  />
                ))}
              </div>
              {catalog.pagination.total > catalog.pagination.per_page && (
                <div className={styles.pagination}>
                  <button
                    className={styles.pageBtn}
                    disabled={catalog.pagination.page <= 1}
                    onClick={() => catalog.setPage(catalog.pagination.page - 1)}
                    aria-label="Previous page"
                  >
                    Previous
                  </button>
                  <span className={styles.pageInfo}>
                    Page {catalog.pagination.page} of{' '}
                    {Math.ceil(
                      catalog.pagination.total / catalog.pagination.per_page,
                    )}
                  </span>
                  <button
                    className={styles.pageBtn}
                    disabled={
                      catalog.pagination.page >=
                      Math.ceil(
                        catalog.pagination.total / catalog.pagination.per_page,
                      )
                    }
                    onClick={() => catalog.setPage(catalog.pagination.page + 1)}
                    aria-label="Next page"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Semantic results OR keyword grid */}
      {searchMode === 'semantic' &&
        semanticQuery.trim().length > 0 &&
        semanticQuery.trim().length < 3 && (
          <div className={styles.ssHint}>
            <svg
              viewBox="0 0 24 24"
              width={16}
              height={16}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
            Type at least 3 characters to activate AI semantic search
          </div>
        )}
      {searchMode === 'semantic' && semanticQuery.trim().length >= 3 ? (
        <div className={styles.ssResultsArea}>
          {semantic.loading && (
            <div className={styles.ssStatus}>
              <span className={styles.ssSpinner} />
              Searching with AI...
            </div>
          )}
          {semantic.error && (
            <div className={`${styles.ssStatus} ${styles.ssError}`}>
              {semantic.error}
            </div>
          )}
          {!semantic.loading && semantic.results.length > 0 && (
            <>
              <div className={styles.ssResultsMeta}>
                {semantic.results.length} results
                <span
                  className={
                    semantic.queryEmbeddingUsed
                      ? styles.ssSearchChipVector
                      : styles.ssSearchChipFulltext
                  }
                >
                  {semantic.queryEmbeddingUsed
                    ? 'AI Vector Search'
                    : 'Fulltext Search'}
                </span>
              </div>
              <div className={styles.ssResultsGrid}>
                {semantic.results.map(hit => (
                  <SemanticResultCard
                    key={hit.skill.name}
                    hit={hit}
                    onOpenDetail={openSkillDetail}
                  />
                ))}
              </div>
            </>
          )}
          {!semantic.loading &&
            !semantic.error &&
            semantic.results.length === 0 &&
            semanticQuery.trim().length >= 3 && (
              <div className={styles.empty}>
                <svg
                  width={48}
                  height={48}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                <h3>No semantic matches</h3>
                <p>
                  Try rephrasing your description or switch to keyword search.
                </p>
              </div>
            )}
        </div>
      ) : (
        <>
          {/* Filter pills */}
          <div className={styles.filters}>
            <button
              className={
                activePlugin === null ? styles.pillActive : styles.pill
              }
              onClick={() => handlePluginClick(null)}
            >
              All<span className={styles.pillCount}>{skills.length}</span>
            </button>
            {plugins.map(p => {
              const isActive = activePlugin === p.name;
              const catCount = pluginCounts[p.name] || 0;
              return (
                <span key={p.name} className={styles.pillWrap}>
                  <button
                    className={isActive ? styles.pillActive : styles.pill}
                    onClick={() => handlePluginClick(p.name)}
                    style={
                      isActive
                        ? {
                            backgroundColor:
                              p.color ?? 'var(--sm-text-secondary)',
                            borderColor: p.color ?? 'var(--sm-text-secondary)',
                          }
                        : undefined
                    }
                  >
                    <span
                      className={styles.pillDot}
                      style={{
                        backgroundColor: p.color ?? 'var(--sm-text-secondary)',
                      }}
                    />
                    {p.name}
                    <span className={styles.pillCount}>{catCount}</span>
                  </button>
                  {catCount > 0 && (
                    <button
                      className={styles.pillAdd}
                      title={`Add all ${catCount} ${p.name} skills to cart`}
                      aria-label={`Add all ${p.name} skills to cart`}
                      onClick={e => {
                        e.stopPropagation();
                        const catSkills = skills
                          .filter(s => s.pluginName === p.name)
                          .map(s => ({
                            name: s.skillName,
                            slug: s.slug,
                            category: s.pluginName,
                            description: s.description,
                          }));
                        addSkills(catSkills);
                      }}
                    >
                      +
                    </button>
                  )}
                </span>
              );
            })}
          </div>

          {/* Grid */}
          {filtered.length === 0 ? (
            <div className={styles.empty}>
              <svg
                width={48}
                height={48}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <h3>No skills found</h3>
              <p>
                {searchQuery
                  ? `No results for "${searchQuery}". Try a different search.`
                  : 'No skills available in this category.'}
              </p>
            </div>
          ) : (
            <div className={styles.grid}>
              {filtered.map(skill => (
                <SkillCard
                  key={skill.slug}
                  skill={skill}
                  selectionMode={selectionMode}
                  selected={selectedSlugs.has(skill.slug)}
                  onToggleSelect={toggleSelect}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Floating action bar */}
      {selectionMode && selectedSlugs.size > 0 && (
        <div className={styles.floatingBar} aria-label="Selection actions">
          <span className={styles.floatingCount}>
            {selectedSlugs.size} skill{selectedSlugs.size !== 1 ? 's' : ''}{' '}
            selected
          </span>
          <button
            className={styles.floatingBtnPrimary}
            onClick={handleAddSelectedToCart}
            aria-label="Add selected skills to bundle cart"
          >
            <svg
              viewBox="0 0 24 24"
              width={14}
              height={14}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <circle cx="9" cy="21" r="1" />
              <circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6" />
            </svg>
            Add to Bundle Cart
          </button>
          <button
            className={styles.floatingBtnGhost}
            onClick={clearSelection}
            aria-label="Clear selection"
          >
            Clear
          </button>
        </div>
      )}

      <SkillDetailDrawer
        open={detailSkill !== null && detailSkill !== undefined}
        onClose={closeSkillDetail}
        skill={detailSkill}
      />
    </div>
  );
}
