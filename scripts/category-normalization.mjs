export const FILTER_CATEGORY_SCOPES = new Set([
  'appearance.colourReference.value',
  'appearance.texture.value',
  'appearance.grain.value',
  'durability.fungi.value',
  'durability.termites.value',
  'durability.treatability.value',
  'drying.rate.value',
  'endUses[]',
]);

const FILTER_TEXT_VALUE_PATHS = [
  'appearance.colourReference',
  'appearance.texture',
  'appearance.grain',
  'durability.fungi',
  'durability.termites',
  'durability.treatability',
  'drying.rate',
];

const CATEGORY_CORRECTIONS = {
  en: {
    'africa-okwen': {
      'appearance.texture': 'medium',
    },
  },
  fr: {
    'africa-gombe-towe': {
      'appearance.grain': 'droit ou contrefilé',
    },
    'africa-tali-missanda': {
      'appearance.texture': 'grossier',
    },
    'america-khaya-african-mahogany': {
      'appearance.grain': 'contrefil',
      'appearance.texture': 'moyen',
    },
  },
};

const ENGLISH_FUNGUS_LABELS = new Map([
  ['1', 'class 1 - very durable'],
  ['1-2', 'class 1-2 - very durable to durable'],
  ['1-3', 'class 1-3 - very durable to moderately durable'],
  ['2', 'class 2 - durable'],
  ['2-3', 'class 2-3 - durable to moderately durable'],
  ['2-4', 'class 2-4 - durable to poorly durable'],
  ['3', 'class 3 - moderately durable'],
  ['3-4', 'class 3-4 - moderately to poorly durable'],
  ['4', 'class 4 - poorly durable'],
  ['4-5', 'class 4-5 - poorly to not durable'],
  ['5', 'class 5 - not durable'],
]);

const FRENCH_FUNGUS_LABELS = new Map([
  ['1', 'classe 1 - très durable'],
  ['1-2', 'classe 1-2 - très durable à durable'],
  ['1-3', 'classe 1-3 - très durable à moyennement durable'],
  ['2', 'classe 2 - durable'],
  ['2-3', 'classe 2-3 - durable à moyennement durable'],
  ['2-4', 'classe 2-4 - durable à faiblement durable'],
  ['3', 'classe 3 - moyennement durable'],
  ['3-4', 'classe 3-4 - moyennement à faiblement durable'],
  ['4', 'classe 4 - faiblement durable'],
  ['4-5', 'classe 4-5 - faiblement à non durable'],
  ['5', 'classe 5 - non durable'],
]);

const ENGLISH_TREATABILITY_LABELS = new Map([
  ['1', 'class 1 - easily permeable'],
  ['1-2', 'class 1-2 - moderately to easily permeable'],
  ['2', 'class 2 - moderately permeable'],
  ['2-3', 'class 2-3 - poorly to moderately permeable'],
  ['3', 'class 3 - poorly permeable'],
  ['3-4', 'class 3-4 - poorly or not permeable'],
  ['4', 'class 4 - not permeable'],
]);

const FRENCH_TREATABILITY_LABELS = new Map([
  ['1', 'classe 1 - imprégnable'],
  ['1-2', 'classe 1-2 - moyennement imprégnable à imprégnable'],
  ['2', 'classe 2 - moyennement imprégnable'],
  ['2-3', 'classe 2-3 - peu à moyennement imprégnable'],
  ['3', 'classe 3 - peu imprégnable'],
  ['3-4', 'classe 3-4 - peu ou non imprégnable'],
  ['4', 'classe 4 - non imprégnable'],
]);

const REMOVED_ENGLISH_END_USES = new Set([
  'erable sycomore',
  'frêne',
  'hêtre',
  'meleze',
  'merisier',
  'page 3/4',
  'peuplier',
  'properties and durability).',
  'resistant to one or several acids',
  'western red cedar',
]);

const REMOVED_FRENCH_END_USES = new Set([
  'anciennes).',
  "cette liste présente les principales utilisations connues, à valider par une mise en œuvre dans le respect des règles de l'art.",
  'des propriétés mécaniques et une durabilité intéressantes).',
  'epicea',
  'erable sycomore',
  'la réunion (france)',
  'meleze',
  'merisier',
  'page 3/4',
  'résistant à un ou plusieurs acides',
  'western red cedar',
]);

const ENGLISH_END_USE_ALIASES = new Map([
  ['stairs (inside)', 'indoor staircases'],
  ['stringed instrument (back and case)', 'stringed instruments (back and case)'],
]);

const FRENCH_END_USE_ALIASES = new Map([
  ["escaliers (à l'intérieur)", "escaliers d'intérieur"],
  ['meuble courant ou éléments', 'meuble courant ou éléments meublants'],
  ['platelage - decking', 'platelage'],
  [
    'platelage - decking (uniquement en région tempérée)',
    'platelage (uniquement en région tempérée)',
  ],
]);

export function normalizeCategoryText(value, locale) {
  if (typeof value !== 'string') return value;
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase(locale);
}

export function normalizedCategorySourceKey(scope, value) {
  const normalized = normalizeCategoryText(value, 'en');
  if (typeof normalized !== 'string') return normalized;
  if (scope === 'appearance.colourReference.value' && normalized === 'orange - yellow') {
    return 'orange yellow';
  }
  if (scope === 'appearance.colourReference.value' && normalized === 'orange-brown') {
    return 'orange brown';
  }
  if (scope === 'appearance.texture.value' && normalized === 'medium quartersawn') {
    return 'medium';
  }
  return canonicalizeEnglishCategory(scope, normalized);
}

export function isRemovedSourceCategory(scope, value) {
  return scope === 'endUses[]' && REMOVED_ENGLISH_END_USES.has(normalizeCategoryText(value, 'en'));
}

export function normalizeWoodCategories(record, locale) {
  const corrections = CATEGORY_CORRECTIONS[locale]?.[record.id] ?? {};
  for (const [recordPath, value] of Object.entries(corrections)) {
    const textValue = getAtPath(record, recordPath);
    if (textValue && typeof textValue === 'object') textValue.value = value;
  }

  for (const recordPath of FILTER_TEXT_VALUE_PATHS) {
    const textValue = getAtPath(record, recordPath);
    if (!textValue || typeof textValue !== 'object') continue;
    textValue.value =
      locale === 'en'
        ? normalizedCategorySourceKey(`${recordPath}.value`, textValue.value)
        : locale === 'fr'
          ? canonicalizeFrenchCategory(`${recordPath}.value`, textValue.value)
          : normalizeCategoryText(textValue.value, locale);
  }

  if (Array.isArray(record.endUses)) {
    record.endUses = [
      ...new Set(
        record.endUses
          .map((value) => canonicalizeEndUse(value, locale))
          .filter((value) => typeof value === 'string' && value.length > 0),
      ),
    ].sort((left, right) => left.localeCompare(right, locale));
  }

  return record;
}

function canonicalizeEnglishCategory(scope, normalized) {
  if (scope === 'endUses[]') {
    return ENGLISH_END_USE_ALIASES.get(normalized) ?? normalized;
  }
  if (scope === 'durability.fungi.value') {
    return categoryFromClassRange(normalized, /^durability\s+class|^class/, ENGLISH_FUNGUS_LABELS);
  }
  if (scope === 'durability.termites.value') {
    const classCode = /^class\s+([dms])\b/u.exec(normalized)?.[1];
    return (
      {
        d: 'class d - durable',
        m: 'class m - moderately durable',
        s: 'class s - susceptible',
      }[classCode] ?? normalized
    );
  }
  if (scope === 'durability.treatability.value') {
    return categoryFromClassRange(normalized, /^class/, ENGLISH_TREATABILITY_LABELS);
  }
  return normalized;
}

function canonicalizeFrenchCategory(scope, value) {
  const normalized = normalizeCategoryText(value, 'fr');
  if (typeof normalized !== 'string') return normalized;
  if (scope === 'durability.fungi.value') {
    return categoryFromClassRange(
      normalized,
      /^classe de durabilité|^classe/,
      FRENCH_FUNGUS_LABELS,
    );
  }
  if (scope === 'durability.termites.value') {
    const classCode = /^classe\s+([dms])\b/u.exec(normalized)?.[1];
    return (
      {
        d: 'classe d - durable',
        m: 'classe m - moyennement durable',
        s: 'classe s - sensible',
      }[classCode] ?? normalized
    );
  }
  if (scope === 'durability.treatability.value') {
    return categoryFromClassRange(normalized, /^classe/, FRENCH_TREATABILITY_LABELS);
  }
  if (scope === 'drying.rate.value' && normalized === 'normale à lente température (°c)') {
    return 'normale à lente';
  }
  return normalized;
}

function categoryFromClassRange(value, prefix, labels) {
  if (typeof value !== 'string') return value;
  const withoutPrefix = value.replace(prefix, '').trim();
  const match =
    /^(\d)(?:\s*\(v\))?(?:\s*(?:-|to|à)\s*(?:class|classe)?\s*(\d)(?:\s*\(v\))?)?/u.exec(
      withoutPrefix,
    );
  if (!match) return value;
  const range = match[2] ? `${match[1]}-${match[2]}` : match[1];
  return labels.get(range) ?? value;
}

function canonicalizeEndUse(value, locale) {
  const normalized = normalizeCategoryText(value, locale);
  if (locale === 'en') {
    if (REMOVED_ENGLISH_END_USES.has(normalized)) return null;
    return ENGLISH_END_USE_ALIASES.get(normalized) ?? normalized;
  }
  if (locale === 'fr') {
    if (REMOVED_FRENCH_END_USES.has(normalized)) return null;
    return FRENCH_END_USE_ALIASES.get(normalized) ?? normalized;
  }
  return normalized;
}

export function categoryEntries(record) {
  return [
    ['appearance.colourReference.value', record.appearance?.colourReference?.value],
    ['appearance.texture.value', record.appearance?.texture?.value],
    ['appearance.grain.value', record.appearance?.grain?.value],
    ['durability.fungi.value', record.durability?.fungi?.value],
    ['durability.termites.value', record.durability?.termites?.value],
    ['durability.treatability.value', record.durability?.treatability?.value],
    ['drying.rate.value', record.drying?.rate?.value],
    ...(record.endUses ?? []).map((value, index) => [`endUses.${index}`, value]),
  ];
}

function getAtPath(value, dottedPath) {
  return dottedPath.split('.').reduce((current, key) => current?.[key], value);
}
