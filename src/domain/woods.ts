import type { Translation } from '../i18n';
import type { NumericMeasure, TextValue, WoodRecord } from '../types/wood';
import { normalizeFilterCategory, type Filters, type RangeFilter } from './filters';

export type SortKey =
  | 'name'
  | 'region'
  | 'density'
  | 'monninHardness'
  | 'jankaHardness'
  | 'radialShrinkage'
  | 'tangentialShrinkage'
  | 'modulus'
  | 'fungi'
  | 'termites'
  | 'treatability'
  | 'naturalUseClass';
export type SortDirection = 'none' | 'asc' | 'desc';
export interface WoodSort {
  key: SortKey;
  direction: SortDirection;
}
export interface SearchIndexEntry {
  text: string;
  terms: string[];
}
type ClassKind = 'fungi' | 'termites' | 'treatability' | 'naturalUseClass';
interface ClassSortValue {
  type: 'class';
  start: number;
  end: number;
}
type SortValue = string | number | ClassSortValue | null;

export const defaultSort: WoodSort = { key: 'name', direction: 'none' };
export const sortKeys: SortKey[] = [
  'name',
  'region',
  'density',
  'monninHardness',
  'jankaHardness',
  'radialShrinkage',
  'tangentialShrinkage',
  'modulus',
  'fungi',
  'termites',
  'treatability',
  'naturalUseClass',
];

export function buildSearchIndex(records: WoodRecord[]) {
  return new Map(records.map((wood) => [wood.id, buildSearchIndexEntry(wood.searchText)]));
}

export function primaryGrainImage(wood: WoodRecord) {
  return (
    wood.images.find((image) => image.kind === 'flatSawn') ??
    wood.images.find((image) => image.kind === 'quarterSawn')
  );
}

export function commonName(wood: WoodRecord) {
  return wood.identity.primaryName || wood.identity.displayName;
}

export function woodMatches(
  wood: WoodRecord,
  normalizedQuery: string,
  filters: Filters,
  searchEntry?: SearchIndexEntry,
) {
  if (
    normalizedQuery &&
    !searchMatches(searchEntry ?? buildSearchIndexEntry(wood.searchText), normalizedQuery)
  )
    return false;
  if (!includesOrEmpty(filters.regions, wood.origin.region)) return false;
  if (!includesCategoryOrEmpty(filters.colours, wood.appearance.colourReference.value))
    return false;
  if (!includesCategoryOrEmpty(filters.textures, wood.appearance.texture.value)) return false;
  if (!includesCategoryOrEmpty(filters.grains, wood.appearance.grain.value)) return false;
  if (!includesCategoryOrEmpty(filters.fungi, wood.durability.fungi.value)) return false;
  if (!includesCategoryOrEmpty(filters.dryWoodBorers, wood.durability.dryWoodBorers.value))
    return false;
  if (!includesCategoryOrEmpty(filters.termites, wood.durability.termites.value)) return false;
  if (!includesCategoryOrEmpty(filters.treatability, wood.durability.treatability.value))
    return false;
  if (!includesCategoryOrEmpty(filters.naturalUseClasses, wood.durability.naturalUseClass.value))
    return false;
  if (!includesCategoryOrEmpty(filters.drying, wood.drying.rate.value)) return false;
  if (
    filters.endUse &&
    !wood.endUses.some(
      (value) => normalizeFilterCategory(value) === normalizeFilterCategory(filters.endUse),
    )
  )
    return false;
  if (filters.cites === 'listed' && wood.cites.listed !== true) return false;
  if (filters.cites === 'not-listed' && wood.cites.listed !== false) return false;
  if (filters.cites === 'unknown' && wood.cites.listed !== null) return false;
  if (!rangeMatches(wood.physics.specificGravity.value, filters.density)) return false;
  if (!rangeMatches(wood.physics.monninHardness.value, filters.hardness)) return false;
  if (!rangeMatches(wood.physics.totalRadialShrinkage.value, filters.radialShrinkage)) return false;
  if (!rangeMatches(wood.physics.totalTangentialShrinkage.value, filters.tangentialShrinkage))
    return false;
  return rangeMatches(wood.physics.modulusOfElasticity.value, filters.modulus);
}

export function normalizeSearchText(value: string) {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/ß/g, 'ss')
    .replace(/ø/g, 'o')
    .replace(/ł/g, 'l')
    .replace(/đ/g, 'd')
    .replace(/þ/g, 'th')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function buildSearchIndexEntry(value: string): SearchIndexEntry {
  const text = normalizeSearchText(value);
  return { text, terms: [...new Set(text.split(' ').filter(Boolean))] };
}

export function sortWoods(records: WoodRecord[], sort: WoodSort) {
  if (sort.direction === 'none') return [...records];
  const direction = sort.direction === 'asc' ? 1 : -1;
  return [...records].sort((a, b) =>
    compareValues(sortValue(a, sort.key), sortValue(b, sort.key), direction),
  );
}

export function formatMeasure(
  measure: NumericMeasure,
  unit: string | null | undefined,
  copy: Translation,
) {
  if (measure.value === null) return copy.unknown;
  const displayedUnit = unit === null ? undefined : (unit ?? measure.unit);
  const formatted = formatNumber(
    measure.value,
    displayedUnit === 'N' ? 0 : measure.value < 10 ? 2 : 1,
    copy,
  );
  return `${formatted}${displayedUnit ? ` ${displayedUnit}` : ''}`;
}

export function formatNumber(value: number | null, digits: number, copy: Translation) {
  return value === null
    ? copy.unknown
    : value.toLocaleString(copy.locale, {
        maximumFractionDigits: digits,
        minimumFractionDigits: value < 10 ? Math.min(digits, 1) : 0,
      });
}

export function shortClass(value: string | null, copy: Translation, kind: ClassKind = 'fungi') {
  const classRange = parseClassRange(value, kind);
  if (!classRange) return copy.unknown;
  const [start, end] = classRange;
  return `${copy.classLabel} ${start}${end ? `–${end}` : ''}`;
}

export function durabilityScore(raw: string) {
  return classSortValue(raw, 'fungi')?.start ?? null;
}

function parseClassRange(value: string | null, kind: ClassKind): [string, string?] | null {
  if (!value) return null;
  const match = value.match(
    /\bclass(?:e)?(?:\s+de\s+durabilit[ée])?\s*:?\s*(\d+(?:\.\d+)?|[DMS])\b(?:\s*\([^)]*\))?(?:\s*(?:-|–|—|to|à)\s*(?:class(?:e)?\s*)?(\d+(?:\.\d+)?|[DMS])\b(?:\s*\([^)]*\))?)?/i,
  );
  if (match) {
    return [match[1].toUpperCase(), match[2]?.toUpperCase()];
  }

  const normalized = value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
  if (kind === 'termites') {
    if (/susceptible|sensible|not resistant|non resistant/u.test(normalized)) return ['S'];
    if (/moderately|moyennement/u.test(normalized)) return ['M'];
    if (/resistant|durable/u.test(normalized)) return ['D'];
    return null;
  }

  if (/moderate to low|moyenne? a faible/u.test(normalized)) return ['3', '4'];
  if (
    /slightly resistant (?:to|or) nonresistant|legerement resistant (?:a|ou) non resistant/u.test(
      normalized,
    )
  ) {
    return ['4', '5'];
  }
  if (
    /exceptionally high|very resistant|highly resistant|very durable|tres resistant|tres durable/u.test(
      normalized,
    )
  ) {
    return ['1'];
  }
  if (
    /susceptible|nonresistant|not durable|very limited|non durable|tres faible/u.test(normalized)
  ) {
    return ['5'];
  }
  if (/moderately|moyennement|moderate resistance/u.test(normalized)) return ['3'];
  if (/slightly|poorly durable|low resistance|faiblement|legerement/u.test(normalized)) {
    return ['4'];
  }
  if (/resistant|durable|good natural durability/u.test(normalized)) return ['2'];
  return null;
}

function classSortValue(value: string | null, kind: ClassKind): ClassSortValue | null {
  const classRange = parseClassRange(value, kind);
  if (!classRange) return null;
  const start = classTokenValue(classRange[0]);
  const end = classRange[1] ? classTokenValue(classRange[1]) : start;
  if (start === null || end === null) return null;
  return { type: 'class', start, end };
}

function classTokenValue(token: string) {
  const numeric = Number(token);
  if (Number.isFinite(numeric)) return numeric;
  const letterRanks: Record<string, number> = { D: 1, M: 2, S: 3 };
  return letterRanks[token] ?? null;
}

export function winningIndexes<T extends WoodRecord>(
  records: T[],
  getScore: (wood: T) => number | null,
  better: 'high' | 'low',
) {
  const values = records.map(getScore);
  const clean = values.filter((value): value is number => value !== null);
  if (clean.length === 0) return [];
  const best = better === 'high' ? Math.max(...clean) : Math.min(...clean);
  return values.flatMap((value, index) => (value === best ? [index] : []));
}

export function isMeaningful(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();
  return Boolean(normalized && !['-', '–', '—', 'unknown', 'inconnu'].includes(normalized));
}

export function hasTextValue(value: TextValue) {
  return isMeaningful(value?.value) || isMeaningful(value?.raw);
}

export function hasMeasure(value: NumericMeasure) {
  return value?.value !== null || isMeaningful(value?.raw);
}

export function hasNotes(items: string[] | undefined): items is string[] {
  return Boolean(items?.some(isMeaningful));
}

export function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function searchMatches(entry: SearchIndexEntry, normalizedQuery: string) {
  if (entry.text.includes(normalizedQuery)) return true;
  return normalizedQuery.split(' ').every((queryTerm) => {
    if (entry.text.includes(queryTerm)) return true;
    const tolerance =
      queryTerm.length < 4 ? 0 : queryTerm.length < 8 ? 1 : queryTerm.length < 12 ? 2 : 3;
    return (
      tolerance > 0 &&
      entry.terms.some(
        (candidate) =>
          Math.abs(candidate.length - queryTerm.length) <= tolerance &&
          isWithinEditDistance(queryTerm, candidate, tolerance),
      )
    );
  });
}

function isWithinEditDistance(source: string, target: string, maximum: number) {
  if (source === target) return true;
  if (Math.abs(source.length - target.length) > maximum) return false;
  const distances = Array.from({ length: source.length + 1 }, () =>
    Array<number>(target.length + 1).fill(0),
  );
  for (let i = 0; i <= source.length; i += 1) distances[i][0] = i;
  for (let i = 0; i <= target.length; i += 1) distances[0][i] = i;
  for (let sourceIndex = 1; sourceIndex <= source.length; sourceIndex += 1) {
    let rowMinimum = maximum + 1;
    for (let targetIndex = 1; targetIndex <= target.length; targetIndex += 1) {
      const substitutionCost = source[sourceIndex - 1] === target[targetIndex - 1] ? 0 : 1;
      let distance = Math.min(
        distances[sourceIndex - 1][targetIndex] + 1,
        distances[sourceIndex][targetIndex - 1] + 1,
        distances[sourceIndex - 1][targetIndex - 1] + substitutionCost,
      );
      if (
        sourceIndex > 1 &&
        targetIndex > 1 &&
        source[sourceIndex - 1] === target[targetIndex - 2] &&
        source[sourceIndex - 2] === target[targetIndex - 1]
      ) {
        distance = Math.min(distance, distances[sourceIndex - 2][targetIndex - 2] + 1);
      }
      distances[sourceIndex][targetIndex] = distance;
      rowMinimum = Math.min(rowMinimum, distance);
    }
    if (rowMinimum > maximum) return false;
  }
  return distances[source.length][target.length] <= maximum;
}

function sortValue(wood: WoodRecord, key: SortKey) {
  switch (key) {
    case 'name':
      return commonName(wood);
    case 'region':
      return wood.origin.region;
    case 'density':
      return wood.physics.specificGravity.value;
    case 'monninHardness':
      return wood.physics.monninHardness.value;
    case 'jankaHardness':
      return wood.physics.jankaHardness.value;
    case 'radialShrinkage':
      return wood.physics.totalRadialShrinkage.value;
    case 'tangentialShrinkage':
      return wood.physics.totalTangentialShrinkage.value;
    case 'modulus':
      return wood.physics.modulusOfElasticity.value;
    case 'fungi':
      return classSortValue(wood.durability.fungi.value, 'fungi');
    case 'termites':
      return classSortValue(wood.durability.termites.value, 'termites');
    case 'treatability':
      return classSortValue(wood.durability.treatability.value, 'treatability');
    case 'naturalUseClass':
      return classSortValue(wood.durability.naturalUseClass.value, 'naturalUseClass');
  }
}

function compareValues(a: SortValue, b: SortValue, direction: 1 | -1) {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (isClassSortValue(a) && isClassSortValue(b)) {
    const startComparison = a.start - b.start;
    return (startComparison || a.end - b.end) * direction;
  }
  if (typeof a === 'number' && typeof b === 'number') return (a - b) * direction;
  return String(a).localeCompare(String(b)) * direction;
}

function isClassSortValue(value: Exclude<SortValue, null>): value is ClassSortValue {
  return typeof value === 'object' && value.type === 'class';
}

function rangeMatches(value: number | null, range: RangeFilter) {
  const min = range.min.trim() === '' ? null : Number(range.min);
  const max = range.max.trim() === '' ? null : Number(range.max);
  if (min === null && max === null) return true;
  if (value === null) return false;
  if (min !== null && value < min) return false;
  return max === null || value <= max;
}

function includesOrEmpty(values: string[], value: string | null | undefined) {
  return values.length === 0 || (value ? values.includes(value) : false);
}

function includesCategoryOrEmpty(values: string[], value: string | null | undefined) {
  if (values.length === 0) return true;
  if (!value) return false;
  const normalized = normalizeFilterCategory(value);
  return values.some((item) => normalizeFilterCategory(item) === normalized);
}
