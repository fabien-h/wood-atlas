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
  termites: string[];
  treatability: string[];
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
  'regions' | 'colours' | 'textures' | 'grains' | 'fungi' | 'termites' | 'treatability' | 'drying';

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
  termites: [],
  treatability: [],
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
    colours: unique(records.map((wood) => wood.appearance.colourReference.value)),
    textures: unique(records.map((wood) => wood.appearance.texture.value)),
    grains: unique(records.map((wood) => wood.appearance.grain.value)),
    fungi: unique(records.map((wood) => wood.durability.fungi.value)),
    termites: unique(records.map((wood) => wood.durability.termites.value)),
    treatability: unique(records.map((wood) => wood.durability.treatability.value)),
    drying: unique(records.map((wood) => wood.drying.rate.value)),
    endUses: unique(records.flatMap((wood) => wood.endUses)),
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
  addValues('termites', copy.termites);
  addValues('treatability', copy.treatability);
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
  addRange('hardness', copy.hardness);
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
