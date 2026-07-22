import { useMemo, useSyncExternalStore } from 'react';
import {
  defaultFilters,
  type Filters,
  type MultiValueFilterKey,
  type RangeFilterKey,
} from '../domain/filters';
import {
  defaultSort,
  sortKeys,
  type SortDirection,
  type SortKey,
  type WoodSort,
} from '../domain/woods';
import { appLanguages } from '../i18n';
import type { AppLanguage } from '../types/wood';

export interface NavigationState {
  language: AppLanguage;
  query: string;
  filters: Filters;
  filtersOpen: boolean;
  sort: WoodSort;
  selectedIds: string[];
  activeId: string | null;
}

const navigationEvent = 'wood-atlas:navigation';
const arrayParams: Record<MultiValueFilterKey, string> = {
  regions: 'region',
  colours: 'colour',
  textures: 'texture',
  grains: 'grain',
  fungi: 'fungi',
  termites: 'termite',
  treatability: 'treatability',
  drying: 'drying',
};
const rangeParams: Record<RangeFilterKey, [string, string]> = {
  density: ['densityMin', 'densityMax'],
  hardness: ['hardnessMin', 'hardnessMax'],
  radialShrinkage: ['radialMin', 'radialMax'],
  tangentialShrinkage: ['tangentialMin', 'tangentialMax'],
  modulus: ['modulusMin', 'modulusMax'],
};

export function ensureLanguageInUrl() {
  const url = new URL(window.location.href);
  if (isLanguage(url.searchParams.get('lang'))) return;
  url.searchParams.set('lang', browserLanguage());
  window.history.replaceState(null, '', url);
}

export function useNavigationState() {
  const search = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return useMemo(() => parseNavigationState(new URLSearchParams(search)), [search]);
}

export function updateNavigationState(
  update: Partial<NavigationState> | ((current: NavigationState) => NavigationState),
  options: { replace?: boolean } = {},
) {
  const current = parseNavigationState(new URLSearchParams(window.location.search));
  const next = typeof update === 'function' ? update(current) : { ...current, ...update };
  const url = new URL(window.location.href);
  url.search = serializeNavigationState(next).toString();
  window.history[options.replace ? 'replaceState' : 'pushState'](null, '', url);
  window.dispatchEvent(new Event(navigationEvent));
}

function parseNavigationState(params: URLSearchParams): NavigationState {
  const language = isLanguage(params.get('lang')) ? (params.get('lang') as AppLanguage) : 'en';
  const filters: Filters = {
    ...defaultFilters,
    regions: params.getAll(arrayParams.regions),
    colours: params.getAll(arrayParams.colours),
    textures: params.getAll(arrayParams.textures),
    grains: params.getAll(arrayParams.grains),
    fungi: params.getAll(arrayParams.fungi),
    termites: params.getAll(arrayParams.termites),
    treatability: params.getAll(arrayParams.treatability),
    drying: params.getAll(arrayParams.drying),
    endUse: params.get('endUse') ?? '',
    cites: isCitesFilter(params.get('cites')) ? (params.get('cites') as Filters['cites']) : 'all',
    density: parseRange(params, 'density'),
    hardness: parseRange(params, 'hardness'),
    radialShrinkage: parseRange(params, 'radialShrinkage'),
    tangentialShrinkage: parseRange(params, 'tangentialShrinkage'),
    modulus: parseRange(params, 'modulus'),
  };
  const hasSort = sortKeys.includes(params.get('sort') as SortKey);
  const key = hasSort ? (params.get('sort') as SortKey) : defaultSort.key;
  const direction: SortDirection = hasSort
    ? params.get('direction') === 'desc'
      ? 'desc'
      : 'asc'
    : 'none';
  return {
    language,
    query: params.get('q') ?? '',
    filters,
    filtersOpen: params.get('filters') === 'open',
    sort: { key, direction },
    selectedIds: [...new Set(params.getAll('compare'))].slice(0, 5),
    activeId: params.get('wood'),
  };
}

function serializeNavigationState(state: NavigationState) {
  const params = new URLSearchParams();
  params.set('lang', state.language);
  if (state.query.trim()) params.set('q', state.query);
  (Object.keys(arrayParams) as MultiValueFilterKey[]).forEach((key) => {
    state.filters[key].forEach((value) => params.append(arrayParams[key], value));
  });
  if (state.filters.endUse) params.set('endUse', state.filters.endUse);
  if (state.filters.cites !== 'all') params.set('cites', state.filters.cites);
  (Object.keys(rangeParams) as RangeFilterKey[]).forEach((key) => {
    const [minParam, maxParam] = rangeParams[key];
    if (state.filters[key].min.trim()) params.set(minParam, state.filters[key].min);
    if (state.filters[key].max.trim()) params.set(maxParam, state.filters[key].max);
  });
  if (state.filtersOpen) params.set('filters', 'open');
  if (state.sort.direction !== 'none') {
    params.set('sort', state.sort.key);
    if (state.sort.direction === 'desc') params.set('direction', 'desc');
  }
  state.selectedIds.slice(0, 5).forEach((id) => params.append('compare', id));
  if (state.activeId) params.set('wood', state.activeId);
  return params;
}

function parseRange(params: URLSearchParams, key: RangeFilterKey) {
  const [minParam, maxParam] = rangeParams[key];
  return { min: params.get(minParam) ?? '', max: params.get(maxParam) ?? '' };
}

function subscribe(callback: () => void) {
  window.addEventListener('popstate', callback);
  window.addEventListener(navigationEvent, callback);
  return () => {
    window.removeEventListener('popstate', callback);
    window.removeEventListener(navigationEvent, callback);
  };
}

function getSnapshot() {
  return window.location.search;
}
function getServerSnapshot() {
  return '';
}
function isLanguage(value: string | null): value is AppLanguage {
  return appLanguages.includes(value as AppLanguage);
}
function isCitesFilter(value: string | null): value is Filters['cites'] {
  return value === 'all' || value === 'listed' || value === 'not-listed' || value === 'unknown';
}
function browserLanguage(): AppLanguage {
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const language of languages) {
    const normalized = language.toLowerCase();
    if (normalized.startsWith('zh')) return 'zh-Hans';
    const base = normalized.split('-')[0];
    const supported = appLanguages.find((candidate) => candidate.toLowerCase() === base);
    if (supported) return supported;
  }
  return 'en';
}
