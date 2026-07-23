import type { Translation } from '../i18n';
import type { WoodRecord } from '../types/wood';

export interface RangeFilter {
  min: string;
  max: string;
}

export interface Filters {
  regions: string[];
  colours: string[];
  textures: string[];
  grains: string[];
  fungi: string[];
  dryWoodBorers: string[];
  termites: string[];
  treatability: string[];
  naturalUseClasses: string[];
  drying: string[];
  endUse: string;
  cites: 'all' | 'listed' | 'not-listed' | 'unknown';
  density: RangeFilter;
  hardness: RangeFilter;
  radialShrinkage: RangeFilter;
  tangentialShrinkage: RangeFilter;
  modulus: RangeFilter;
}

export type MultiValueFilterKey =
  | 'regions'
  | 'colours'
  | 'textures'
  | 'grains'
  | 'fungi'
  | 'dryWoodBorers'
  | 'termites'
  | 'treatability'
  | 'naturalUseClasses'
  | 'drying';

export type RangeFilterKey =
  'density' | 'hardness' | 'radialShrinkage' | 'tangentialShrinkage' | 'modulus';

export interface ActiveFilterTag {
  id: string;
  label: string;
  remove: (filters: Filters) => Filters;
}

export const blankRange = (): RangeFilter => ({ min: '', max: '' });

export const defaultFilters: Filters = {
  regions: [],
  colours: [],
  textures: [],
  grains: [],
  fungi: [],
  dryWoodBorers: [],
  termites: [],
  treatability: [],
  naturalUseClasses: [],
  drying: [],
  endUse: '',
  cites: 'all',
  density: blankRange(),
  hardness: blankRange(),
  radialShrinkage: blankRange(),
  tangentialShrinkage: blankRange(),
  modulus: blankRange(),
};

export function buildFacets(records: WoodRecord[]) {
  return {
    regions: unique(records.map((wood) => wood.origin.region)),
    colours: uniqueCategory(records.map((wood) => wood.appearance.colourReference.value)),
    textures: uniqueCategory(records.map((wood) => wood.appearance.texture.value)),
    grains: uniqueCategory(records.map((wood) => wood.appearance.grain.value)),
    fungi: uniqueCategory(records.map((wood) => wood.durability.fungi.value)),
    dryWoodBorers: uniqueCategory(records.map((wood) => wood.durability.dryWoodBorers.value)),
    termites: uniqueCategory(records.map((wood) => wood.durability.termites.value)),
    treatability: uniqueCategory(records.map((wood) => wood.durability.treatability.value)),
    naturalUseClasses: uniqueCategory(records.map((wood) => wood.durability.naturalUseClass.value)),
    drying: uniqueCategory(records.map((wood) => wood.drying.rate.value)),
    endUses: uniqueCategory(records.flatMap((wood) => wood.endUses)),
  };
}

export type FilterFacets = ReturnType<typeof buildFacets>;

export function buildActiveFilterTags(filters: Filters, copy: Translation): ActiveFilterTag[] {
  const tags: ActiveFilterTag[] = [];
  const addValues = (
    key: MultiValueFilterKey,
    label: string,
    formatValue: (value: string) => string = (value) => value,
  ) => {
    filters[key].forEach((value) => {
      tags.push({
        id: `${key}:${value}`,
        label: `${label}: ${formatValue(value)}`,
        remove: (current) => ({ ...current, [key]: current[key].filter((item) => item !== value) }),
      });
    });
  };

  addValues('regions', copy.origin, (value) => copy.regions[value] ?? value);
  addValues('colours', copy.colour);
  addValues('textures', copy.texture);
  addValues('grains', copy.grain);
  addValues('fungi', copy.fungi);
  addValues('dryWoodBorers', copy.dryWoodBorers);
  addValues('termites', copy.termites);
  addValues('treatability', copy.treatability);
  addValues('naturalUseClasses', copy.naturalUseClass);
  addValues('drying', copy.drying);

  if (filters.endUse) {
    tags.push({
      id: `endUse:${filters.endUse}`,
      label: `${copy.endUse}: ${filters.endUse}`,
      remove: (current) => ({ ...current, endUse: '' }),
    });
  }

  if (filters.cites !== 'all') {
    const labels = { listed: copy.listed, 'not-listed': copy.notListed, unknown: copy.unknown };
    tags.push({
      id: `cites:${filters.cites}`,
      label: `CITES: ${labels[filters.cites]}`,
      remove: (current) => ({ ...current, cites: 'all' }),
    });
  }

  const addRange = (key: RangeFilterKey, label: string) => {
    const min = filters[key].min.trim();
    const max = filters[key].max.trim();
    if (!min && !max) return;
    const range = min && max ? `${min}–${max}` : min ? `≥ ${min}` : `≤ ${max}`;
    tags.push({
      id: key,
      label: `${label}: ${range}`,
      remove: (current) => ({ ...current, [key]: blankRange() }),
    });
  };

  addRange('density', copy.density);
  addRange('hardness', copy.monninHardness);
  addRange('radialShrinkage', copy.radialShrinkageShort);
  addRange('tangentialShrinkage', copy.tangentialShrinkageShort);
  addRange('modulus', copy.elasticityMpa);
  return tags;
}

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort((a, b) =>
    a.localeCompare(b),
  );
}

function uniqueCategory(values: Array<string | null | undefined>) {
  return unique(values.map((value) => (value ? normalizeFilterCategory(value) : value)));
}

export function normalizeFilterCategory(value: string) {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}
