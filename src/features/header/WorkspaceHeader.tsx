import { ChevronDown, Search, X } from 'lucide-react';
import type { RefObject } from 'react';
import type { ActiveFilterTag, Filters } from '../../domain/filters';
import { appLanguages, translations, type Translation } from '../../i18n';
import type { AppLanguage } from '../../types/wood';
import styles from './WorkspaceHeader.module.css';

interface WorkspaceHeaderProps {
  language: AppLanguage;
  query: string;
  filtersOpen: boolean;
  activeFilterTags: ActiveFilterTag[];
  filterToggleRef: RefObject<HTMLButtonElement | null>;
  copy: Translation;
  onLanguageChange: (language: AppLanguage) => void;
  onQueryChange: (query: string) => void;
  onFiltersOpenChange: (open: boolean) => void;
  onFiltersChange: (filters: Filters) => void;
  onAboutOpen: () => void;
  filters: Filters;
}

export function WorkspaceHeader({
  language,
  query,
  filtersOpen,
  activeFilterTags,
  filterToggleRef,
  copy,
  onLanguageChange,
  onQueryChange,
  onFiltersOpenChange,
  onFiltersChange,
  onAboutOpen,
  filters,
}: WorkspaceHeaderProps) {
  return (
    <header>
      <div className={styles.header}>
        <h1 className={styles.title}>{copy.atlas}</h1>

        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.aboutButton}
            aria-haspopup="dialog"
            onClick={onAboutOpen}
          >
            {copy.about}
          </button>
          <label className={styles.languageSelect}>
            <span className="sr-only">{copy.chooseLanguage}</span>
            <select
              value={language}
              aria-label={copy.chooseLanguage}
              title={copy.chooseLanguage}
              onChange={(event) => onLanguageChange(event.target.value as AppLanguage)}
            >
              {appLanguages.map((option) => (
                <option value={option} key={option}>
                  {`${translations[option].languageFlag}\u00a0\u00a0${translations[option].languageName}`}
                </option>
              ))}
            </select>
            <ChevronDown size={15} aria-hidden="true" />
          </label>
        </div>
      </div>

      <div className={styles.tools}>
        <button
          ref={filterToggleRef}
          type="button"
          className={`${styles.filterToggle} ${filtersOpen ? styles.active : ''}`}
          aria-controls="filter-panel"
          aria-expanded={filtersOpen}
          aria-label={filtersOpen ? copy.hideFilters : copy.showFilters}
          title={filtersOpen ? copy.hideFilters : copy.showFilters}
          onClick={() => onFiltersOpenChange(!filtersOpen)}
        >
          <span>{copy.filters}</span>
        </button>

        <label className={styles.searchBox}>
          <span className="sr-only">{copy.searchPlaceholder}</span>
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={copy.searchPlaceholder}
            aria-label={copy.searchPlaceholder}
          />
        </label>
      </div>

      {activeFilterTags.length > 0 && (
        <div className={styles.tags} aria-label={copy.activeFilters}>
          {activeFilterTags.map((tag) => (
            <span className={styles.tag} key={tag.id}>
              <span>{tag.label}</span>
              <button
                type="button"
                aria-label={`${copy.remove} ${tag.label}`}
                title={`${copy.remove} ${tag.label}`}
                onClick={() => onFiltersChange(tag.remove(filters))}
              >
                <X size={13} aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      )}
    </header>
  );
}
