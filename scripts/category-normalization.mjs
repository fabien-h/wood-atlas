export const CATEGORICAL_VALUE_SCOPES = new Set([
  'appearance.colourReference.value',
  'appearance.sapwood.value',
  'appearance.texture.value',
  'appearance.grain.value',
  'appearance.interlockedGrain.value',
  'durability.fungi.value',
  'durability.dryWoodBorers.value',
  'durability.termites.value',
  'durability.treatability.value',
  'durability.sapwoodTreatability.value',
  'durability.naturalUseClass.value',
  'durability.coversUseClass5.value',
  'durability.preservativeTreatment.dryWoodBorer.value',
  'durability.preservativeTreatment.temporaryHumidification.value',
  'durability.preservativeTreatment.permanentHumidification.value',
  'drying.rate.value',
  'drying.distortionRisk.value',
  'drying.casehardeningRisk.value',
  'drying.checkingRisk.value',
  'drying.collapseRisk.value',
  'machining.bluntingEffect.value',
  'machining.sawteethRecommended.value',
  'machining.cuttingTools.value',
  'machining.peeling.value',
  'machining.slicing.value',
  'endUses[]',
]);

const CATEGORICAL_TEXT_VALUE_PATHS = [
  'appearance.colourReference',
  'appearance.sapwood',
  'appearance.texture',
  'appearance.grain',
  'appearance.interlockedGrain',
  'durability.fungi',
  'durability.dryWoodBorers',
  'durability.termites',
  'durability.treatability',
  'durability.sapwoodTreatability',
  'durability.naturalUseClass',
  'durability.coversUseClass5',
  'durability.preservativeTreatment.dryWoodBorer',
  'durability.preservativeTreatment.temporaryHumidification',
  'durability.preservativeTreatment.permanentHumidification',
  'drying.rate',
  'drying.distortionRisk',
  'drying.casehardeningRisk',
  'drying.checkingRisk',
  'drying.collapseRisk',
  'machining.bluntingEffect',
  'machining.sawteethRecommended',
  'machining.cuttingTools',
  'machining.peeling',
  'machining.slicing',
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
  ['2-5', 'class 2-5 - durable to not durable'],
  ['3', 'class 3 - moderately durable'],
  ['3-4', 'class 3-4 - moderately to poorly durable'],
  ['3-5', 'class 3-5 - moderately durable to not durable'],
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
  ['2-5', 'classe 2-5 - durable à non durable'],
  ['3', 'classe 3 - moyennement durable'],
  ['3-4', 'classe 3-4 - moyennement à faiblement durable'],
  ['3-5', 'classe 3-5 - moyennement durable à non durable'],
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

const ENGLISH_DRY_WOOD_BORER_LABELS = {
  demarcated: 'class d - durable (sapwood demarcated, risk limited to sapwood)',
  notDemarcated: 'class d - durable (heartwood durable but sapwood not clearly demarcated)',
  susceptible: 'class s - susceptible (risk in all the wood)',
  lyctineResistant: 'class d - not susceptible to lyctine attack',
  lyctineSusceptible: 'class s - lyctine-susceptible sapwood',
};

const FRENCH_DRY_WOOD_BORER_LABELS = {
  demarcated: "classe d - durable (aubier distinct, risque limité à l'aubier)",
  notDemarcated: 'classe d - durable (duramen durable mais aubier peu distinct)',
  susceptible: 'classe s - sensible (risque dans tout le bois)',
  lyctineResistant: 'classe d - non sensible aux lyctes',
  lyctineSusceptible: 'classe s - aubier sensible aux lyctes',
};

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

const ENGLISH_COLOUR_ALIASES = new Map([
  ['black half quarter sawn', 'black'],
  ['black half-quarter sawn', 'black'],
  ['black half-quartrer sawn', 'black'],
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
  if (scope === 'endUses[]') {
    return REMOVED_ENGLISH_END_USES.has(normalizeCategoryText(value, 'en'));
  }
  if (
    scope === 'durability.treatability.value' ||
    scope === 'durability.sapwoodTreatability.value'
  ) {
    return canonicalizeEnglishCategory(scope, normalizeCategoryText(value, 'en')) === null;
  }
  if (scope === 'durability.dryWoodBorers.value') {
    return normalizeCategoryText(value, 'en')?.includes('lyctine') ?? false;
  }
  return false;
}

export function normalizeWoodCategories(record, locale) {
  const corrections = CATEGORY_CORRECTIONS[locale]?.[record.id] ?? {};
  for (const [recordPath, value] of Object.entries(corrections)) {
    const textValue = getAtPath(record, recordPath);
    if (textValue && typeof textValue === 'object') textValue.value = value;
  }

  const sapwoodThickness = record.log?.sapwoodThickness;
  if (sapwoodThickness && typeof sapwoodThickness.value === 'string') {
    sapwoodThickness.value = normalizeSapwoodThickness(sapwoodThickness.value);
  }

  for (const recordPath of CATEGORICAL_TEXT_VALUE_PATHS) {
    const textValue = getAtPath(record, recordPath);
    if (!textValue || typeof textValue !== 'object') continue;
    const useRawFungusClass =
      recordPath === 'durability.fungi' &&
      typeof textValue.raw === 'string' &&
      /^(?:(?:durability\s+)?class|classe(?:\s+de\s+durabilité)?)\s+\d/iu.test(
        textValue.raw.trim(),
      );
    const recoverMissingTreatability =
      (recordPath === 'durability.treatability' ||
        recordPath === 'durability.sapwoodTreatability') &&
      textValue.value == null &&
      typeof textValue.raw === 'string' &&
      textValue.raw.trim().length > 0;
    const sourceValue =
      useRawFungusClass || recoverMissingTreatability ? textValue.raw : textValue.value;
    textValue.value =
      locale === 'en'
        ? normalizedCategorySourceKey(`${recordPath}.value`, sourceValue)
        : locale === 'fr'
          ? canonicalizeFrenchCategory(`${recordPath}.value`, sourceValue)
          : normalizeCategoryText(sourceValue, locale);
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
  if (scope === 'appearance.colourReference.value') {
    return ENGLISH_COLOUR_ALIASES.get(normalized) ?? normalized;
  }
  if (scope === 'appearance.sapwood.value') {
    return (
      {
        'clearly demarcated quartersawn': 'clearly demarcated',
      }[normalized] ?? normalized
    );
  }
  if (scope === 'appearance.interlockedGrain.value') {
    return (
      {
        'marked quartersawn': 'marked',
        'slight to very marked flat-sawn': 'slight to very marked',
      }[normalized] ?? normalized
    );
  }
  if (scope === 'durability.fungi.value') {
    const descriptiveClass = englishDecayClass(normalized);
    if (descriptiveClass) return ENGLISH_FUNGUS_LABELS.get(descriptiveClass);
    return categoryFromClassRange(normalized, /^durability\s+class|^class/, ENGLISH_FUNGUS_LABELS);
  }
  if (scope === 'durability.dryWoodBorers.value') {
    if (normalized.includes('lyctine')) {
      if (normalized.includes('not susceptible') || normalized.includes('non-susceptible')) {
        return ENGLISH_DRY_WOOD_BORER_LABELS.lyctineResistant;
      }
      if (normalized.includes('susceptible')) {
        return ENGLISH_DRY_WOOD_BORER_LABELS.lyctineSusceptible;
      }
    }
    if (normalized.includes('susceptible')) return ENGLISH_DRY_WOOD_BORER_LABELS.susceptible;
    if (
      normalized.includes('heartw') ||
      (normalized.includes('durable') && normalized.includes('not clearly demarcated'))
    ) {
      return ENGLISH_DRY_WOOD_BORER_LABELS.notDemarcated;
    }
    if (normalized.includes('durable') && normalized.includes('sapwood demarcated')) {
      return ENGLISH_DRY_WOOD_BORER_LABELS.demarcated;
    }
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
  if (
    scope === 'durability.treatability.value' ||
    scope === 'durability.sapwoodTreatability.value'
  ) {
    return englishTreatabilityCategory(normalized);
  }
  if (scope === 'drying.casehardeningRisk.value') {
    if (/^no information available\b/u.test(normalized)) return 'no information available';
    if (/^no(?:\s|$)/u.test(normalized)) return 'no known specific risk';
    if (/^yes(?:\s|$)/u.test(normalized)) return 'yes';
  }
  if (scope === 'drying.checkingRisk.value') {
    if (/^high risk green\b/u.test(normalized)) return 'high risk';
    if (/^slight risk green\b/u.test(normalized)) return 'slight risk';
  }
  if (scope === 'drying.collapseRisk.value') {
    if (/^no information available\b/u.test(normalized)) return 'no information available';
    if (/^no(?:\s|$)/u.test(normalized)) return 'no known specific risk';
    if (/^yes(?:\s|$)/u.test(normalized)) return 'yes';
  }
  if (scope === 'machining.slicing.value' && normalized === 'nood') return 'good';
  return normalized;
}

function canonicalizeFrenchCategory(scope, value) {
  const normalized = normalizeCategoryText(value, 'fr');
  if (typeof normalized !== 'string') return normalized;
  if (scope === 'appearance.sapwood.value') {
    return (
      {
        'bien distinct dosse': 'bien distinct',
      }[normalized] ?? normalized
    );
  }
  if (scope === 'appearance.interlockedGrain.value') {
    return (
      {
        'absent dosse': 'absent',
        'accusé quartier': 'accusé',
        'léger débit dur quartier': 'léger',
      }[normalized] ?? normalized
    );
  }
  if (scope === 'durability.fungi.value') {
    const descriptiveClass = frenchDecayClass(normalized);
    if (descriptiveClass) return FRENCH_FUNGUS_LABELS.get(descriptiveClass);
    return categoryFromClassRange(
      normalized,
      /^classe de durabilité|^classe/,
      FRENCH_FUNGUS_LABELS,
    );
  }
  if (scope === 'durability.dryWoodBorers.value') {
    if (normalized.includes('lycte')) {
      if (normalized.includes('non sensible')) {
        return FRENCH_DRY_WOOD_BORER_LABELS.lyctineResistant;
      }
      if (normalized.includes('sensible')) {
        return FRENCH_DRY_WOOD_BORER_LABELS.lyctineSusceptible;
      }
    }
    if (normalized.includes('sensible')) return FRENCH_DRY_WOOD_BORER_LABELS.susceptible;
    if (normalized.includes('duramen durable') || normalized.includes('aubier peu distinct')) {
      return FRENCH_DRY_WOOD_BORER_LABELS.notDemarcated;
    }
    if (normalized.includes('durable') && normalized.includes('aubier distinct')) {
      return FRENCH_DRY_WOOD_BORER_LABELS.demarcated;
    }
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
  if (
    scope === 'durability.treatability.value' ||
    scope === 'durability.sapwoodTreatability.value'
  ) {
    return frenchTreatabilityCategory(normalized);
  }
  if (scope === 'drying.rate.value' && normalized === 'normale à lente température (°c)') {
    return 'normale à lente';
  }
  if (
    (scope === 'drying.distortionRisk.value' || scope === 'drying.checkingRisk.value') &&
    normalized === 'elevé'
  ) {
    return 'élevé';
  }
  if (scope === 'drying.casehardeningRisk.value') {
    if (/^aucune information dispon/u.test(normalized)) return 'aucune information disponible';
    if (/^non(?:\s|$)/u.test(normalized)) return 'pas de risque particulier connu';
    if (/^oui(?:\s|$)/u.test(normalized)) return 'oui';
  }
  if (scope === 'drying.checkingRisk.value') {
    if (/^élevé vert\b/u.test(normalized)) return 'élevé';
    if (/^peu élevé vert\b/u.test(normalized)) return 'peu élevé';
  }
  if (scope === 'drying.collapseRisk.value') {
    if (/^aucune information dispon/u.test(normalized)) return 'aucune information disponible';
    if (/^pas de risque particulier connu(?:\s+\d)/u.test(normalized)) {
      return 'pas de risque particulier connu';
    }
    if (/^non(?:\s|$)/u.test(normalized)) return 'pas de risque particulier connu';
    if (/^oui(?:\s|$)/u.test(normalized)) return 'oui';
  }
  return normalized;
}

function englishDecayClass(normalized) {
  if (/\bresistant to nonresistant\b/u.test(normalized)) return '2-5';
  if (
    /\b(?:slightly resistant to nonresistant|slightly to nonresistant|nonresistant)\b/u.test(
      normalized,
    )
  ) {
    return '4-5';
  }
  if (/\bsusceptible to fungal attack\b/u.test(normalized)) return '5';
  if (/\b(?:moderately resistant|moderate resistance)\b/u.test(normalized)) return '3';
  if (/\b(?:exceptionally|very|highly) resistant\b/u.test(normalized)) return '1';
  if (
    normalized === 'resistant' ||
    normalized === 'durable' ||
    normalized === 'good natural durability'
  ) {
    return '2';
  }
  return null;
}

function frenchDecayClass(normalized) {
  if (/\brésistant à non résistant\b/u.test(normalized)) return '2-5';
  if (
    /\b(?:légèrement résistant à non résistant|faiblement à non résistant|non résistant|faiblement à non durable)\b/u.test(
      normalized,
    )
  ) {
    return '4-5';
  }
  if (/\bsensible aux attaques fongiques\b/u.test(normalized)) return '5';
  if (/\b(?:modérément résistant|résistance modérée)\b/u.test(normalized)) return '3';
  if (/\b(?:exceptionnellement|très) résistant(?:e)?\b/u.test(normalized)) return '1';
  if (
    normalized === 'résistant' ||
    normalized === 'durable' ||
    normalized === 'bonne durabilité naturelle'
  ) {
    return '2';
  }
  return null;
}

function englishTreatabilityCategory(normalized) {
  if (/^class\b/u.test(normalized)) {
    return categoryFromClassRange(normalized, /^class/, ENGLISH_TREATABILITY_LABELS);
  }
  if (/\b(?:no information|variable)\b/u.test(normalized)) return null;
  if (/\bmore easily impregnated\b.*\bheartwood\b/u.test(normalized)) return null;
  if (/\bresistant to extremely resistant\b/u.test(normalized)) {
    return ENGLISH_TREATABILITY_LABELS.get('3-4');
  }
  if (/\bextremely resistant\b/u.test(normalized)) {
    return ENGLISH_TREATABILITY_LABELS.get('4');
  }
  if (/\bmoderately resistant\b/u.test(normalized)) {
    return ENGLISH_TREATABILITY_LABELS.get('2');
  }
  if (
    /\bresistant to (?:preservative|preservation) treatment/u.test(normalized) ||
    /\bresistant to preservative treatments/u.test(normalized) ||
    /\bdifficult to (?:penetrate|treat|impregnate)\b/u.test(normalized) ||
    /\bpenetration (?:by|with) preservatives is difficult\b/u.test(normalized)
  ) {
    return ENGLISH_TREATABILITY_LABELS.get('3');
  }
  if (
    normalized === 'permeable' ||
    /\beasy to treat with preservatives\b/u.test(normalized) ||
    /\beasily impregnated with preservatives\b/u.test(normalized) ||
    /\beasy to impregnate with preservatives\b/u.test(normalized) ||
    /\bpermeable to (?:preservatives|preservative treatments)\b/u.test(normalized)
  ) {
    return ENGLISH_TREATABILITY_LABELS.get('1');
  }
  return null;
}

function frenchTreatabilityCategory(normalized) {
  if (/^classe\b/u.test(normalized)) {
    return categoryFromClassRange(normalized, /^classe/, FRENCH_TREATABILITY_LABELS);
  }
  if (/\b(?:aucune information|variable)\b/u.test(normalized)) return null;
  if (/\bplus facilement imprégné\b.*\bcœur\b/u.test(normalized)) return null;
  if (/\btrès résistant\b/u.test(normalized)) {
    return FRENCH_TREATABILITY_LABELS.get('3-4');
  }
  if (/\bmodérément résistant/u.test(normalized)) {
    return FRENCH_TREATABILITY_LABELS.get('2');
  }
  if (
    /\brésist/u.test(normalized) ||
    /\bdifficile à (?:pénétrer|traiter|féconder|imprégner)\b/u.test(normalized) ||
    /\bdifficile de (?:le )?pénétrer\b/u.test(normalized) ||
    /\bpénétration (?:avec|par) (?:les|des) conservateurs est difficile\b/u.test(normalized)
  ) {
    return FRENCH_TREATABILITY_LABELS.get('3');
  }
  if (
    normalized === 'perméable' ||
    /\bfacile à traiter avec des conservateurs\b/u.test(normalized) ||
    /\bfacilement imprégné avec des conservateurs\b/u.test(normalized) ||
    /\bfacile à imprégner avec des conservateurs\b/u.test(normalized) ||
    /\bperméable aux (?:conservateurs|traitements de conservation)\b/u.test(normalized)
  ) {
    return FRENCH_TREATABILITY_LABELS.get('1');
  }
  return null;
}

function normalizeSapwoodThickness(value) {
  const numeric = value
    .normalize('NFKC')
    .trim()
    .split(';')[0]
    .replace(/(?<=\d),(?=\d)/gu, '.')
    .replace(/\s*(?:cm\s*)?(?:to|à|-)\s*/giu, '–')
    .replace(/\s*cm\s*(?:thick|d['’]épaisseur)?/giu, ' cm')
    .replace(/\s*\/\s*/gu, ' / ')
    .replace(/(\d+)\.0\b/gu, '$1')
    .replace(/\s+/gu, ' ')
    .trim();
  return /^[\d.\s/–]+cm(?:\s*\/\s*[\d.\s–]+cm)*$/u.test(numeric) ? numeric : value;
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
    ['appearance.sapwood.value', record.appearance?.sapwood?.value],
    ['appearance.texture.value', record.appearance?.texture?.value],
    ['appearance.grain.value', record.appearance?.grain?.value],
    ['appearance.interlockedGrain.value', record.appearance?.interlockedGrain?.value],
    ['durability.fungi.value', record.durability?.fungi?.value],
    ['durability.dryWoodBorers.value', record.durability?.dryWoodBorers?.value],
    ['durability.termites.value', record.durability?.termites?.value],
    ['durability.treatability.value', record.durability?.treatability?.value],
    ['durability.sapwoodTreatability.value', record.durability?.sapwoodTreatability?.value],
    ['durability.naturalUseClass.value', record.durability?.naturalUseClass?.value],
    ['durability.coversUseClass5.value', record.durability?.coversUseClass5?.value],
    [
      'durability.preservativeTreatment.dryWoodBorer.value',
      record.durability?.preservativeTreatment?.dryWoodBorer?.value,
    ],
    [
      'durability.preservativeTreatment.temporaryHumidification.value',
      record.durability?.preservativeTreatment?.temporaryHumidification?.value,
    ],
    [
      'durability.preservativeTreatment.permanentHumidification.value',
      record.durability?.preservativeTreatment?.permanentHumidification?.value,
    ],
    ['drying.rate.value', record.drying?.rate?.value],
    ['drying.distortionRisk.value', record.drying?.distortionRisk?.value],
    ['drying.casehardeningRisk.value', record.drying?.casehardeningRisk?.value],
    ['drying.checkingRisk.value', record.drying?.checkingRisk?.value],
    ['drying.collapseRisk.value', record.drying?.collapseRisk?.value],
    ['machining.bluntingEffect.value', record.machining?.bluntingEffect?.value],
    ['machining.sawteethRecommended.value', record.machining?.sawteethRecommended?.value],
    ['machining.cuttingTools.value', record.machining?.cuttingTools?.value],
    ['machining.peeling.value', record.machining?.peeling?.value],
    ['machining.slicing.value', record.machining?.slicing?.value],
    ...(record.endUses ?? []).map((value, index) => [`endUses.${index}`, value]),
  ];
}

function getAtPath(value, dottedPath) {
  return dottedPath.split('.').reduce((current, key) => current?.[key], value);
}
