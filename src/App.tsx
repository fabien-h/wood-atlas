import { useEffect, useMemo, useRef, useState } from 'react';
import { buildActiveFilterTags, buildFacets } from './domain/filters';
import {
  buildSearchIndex,
  normalizeSearchText,
  sortWoods,
  woodMatches,
  type SortKey,
} from './domain/woods';
import { AboutDrawer } from './features/about/AboutDrawer';
import { ComparePanel } from './features/compare/ComparePanel';
import { DetailDrawer } from './features/detail/DetailDrawer';
import { FilterDrawer } from './features/filters/FilterDrawer';
import { WorkspaceHeader } from './features/header/WorkspaceHeader';
import { WoodTable } from './features/table/WoodTable';
import { useWoodDatabase } from './hooks/useWoodDatabase';
import { isRtlLanguage, translations } from './i18n';
import { updateNavigationState, useNavigationState } from './navigation/urlState';
import type { AppLanguage, WoodRecord } from './types/wood';
import styles from './App.module.css';

export default function App() {
  const navigation = useNavigationState();
  const { language, query, filters, filtersOpen, sort, selectedIds, activeId } = navigation;
  const copy = translations[language];
  const { database, status } = useWoodDatabase(language);
  const filterToggleRef = useRef<HTMLButtonElement>(null);
  const detailTriggerRef = useRef<HTMLElement | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const woods = database.records ?? [];

  const facets = useMemo(() => buildFacets(woods), [woods]);
  const activeFilterTags = useMemo(() => buildActiveFilterTags(filters, copy), [filters, copy]);
  const normalizedQuery = useMemo(() => normalizeSearchText(query), [query]);
  const searchIndex = useMemo(() => buildSearchIndex(woods), [woods]);
  const filteredWoods = useMemo(
    () =>
      sortWoods(
        woods.filter((wood) =>
          woodMatches(wood, normalizedQuery, filters, searchIndex.get(wood.id)),
        ),
        sort,
      ),
    [woods, normalizedQuery, filters, searchIndex, sort],
  );
  const selectedWoods = useMemo(
    () => selectedIds.map((id) => woods.find((wood) => wood.id === id)).filter(isWoodRecord),
    [selectedIds, woods],
  );
  const activeWood = useMemo(
    () => (activeId ? woods.find((wood) => wood.id === activeId) : undefined),
    [activeId, woods],
  );

  useEffect(() => {
    document.title = copy.atlas;
    document.documentElement.lang = language;
    document.documentElement.dir = isRtlLanguage(language) ? 'rtl' : 'ltr';
  }, [copy.atlas, language]);

  function toggleSort(key: SortKey) {
    const direction =
      sort.key !== key || sort.direction === 'none'
        ? 'asc'
        : sort.direction === 'asc'
          ? 'desc'
          : 'none';
    updateNavigationState({
      sort: { key, direction },
    });
  }

  function toggleSelected(id: string) {
    updateNavigationState((current) => {
      const ids = current.selectedIds.includes(id)
        ? current.selectedIds.filter((item) => item !== id)
        : current.selectedIds.length < 5
          ? [...current.selectedIds, id]
          : current.selectedIds;
      return { ...current, selectedIds: ids };
    });
  }

  function clearSelected() {
    updateNavigationState((current) => ({ ...current, selectedIds: [] }));
  }

  function changeLanguage(nextLanguage: AppLanguage) {
    updateNavigationState({ language: nextLanguage });
  }

  function openDetail(id: string) {
    detailTriggerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    updateNavigationState({ activeId: id });
  }

  function closeDetail() {
    updateNavigationState({ activeId: null });
    requestAnimationFrame(() => detailTriggerRef.current?.focus());
  }

  return (
    <main className={`${styles.shell} ${filtersOpen ? styles.filtersOpen : ''}`}>
      <FilterDrawer
        open={filtersOpen}
        facets={facets}
        filters={filters}
        triggerRef={filterToggleRef}
        copy={copy}
        onChange={(nextFilters) => updateNavigationState({ filters: nextFilters })}
        onClose={() => updateNavigationState({ filtersOpen: false })}
      />

      <section className={styles.workspace} aria-label={copy.atlas}>
        <div className={styles.controls}>
          <WorkspaceHeader
            language={language}
            query={query}
            filtersOpen={filtersOpen}
            activeFilterTags={activeFilterTags}
            filterToggleRef={filterToggleRef}
            copy={copy}
            filters={filters}
            onLanguageChange={changeLanguage}
            onQueryChange={(nextQuery) =>
              updateNavigationState({ query: nextQuery }, { replace: true })
            }
            onFiltersOpenChange={(open) => updateNavigationState({ filtersOpen: open })}
            onFiltersChange={(nextFilters) => updateNavigationState({ filters: nextFilters })}
            onAboutOpen={() => setAboutOpen(true)}
          />

          {selectedWoods.length >= 2 && (
            <ComparePanel
              woods={selectedWoods}
              onRemove={toggleSelected}
              onClear={clearSelected}
              copy={copy}
            />
          )}
        </div>

        <section className={styles.dataZone} aria-label={copy.woodTableCaption}>
          <WoodTable
            woods={filteredWoods}
            taxonomy={database.taxonomy ?? []}
            selectedIds={selectedIds}
            activeId={activeWood?.id}
            sort={sort}
            status={status}
            onSort={toggleSort}
            onSelect={toggleSelected}
            onOpen={openDetail}
            copy={copy}
          />
        </section>
      </section>

      <DetailDrawer
        wood={activeWood}
        taxonomy={database.taxonomy ?? []}
        copy={copy}
        onClose={closeDetail}
      />
      <AboutDrawer open={aboutOpen} copy={copy} onClose={() => setAboutOpen(false)} />
    </main>
  );
}

function isWoodRecord(wood: WoodRecord | undefined): wood is WoodRecord {
  return Boolean(wood);
}
