#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG_PATH = path.join(ROOT, 'tmp', 'lignumdata-catalog.json');
const FACTS_PATH = path.join(ROOT, 'data', 'raw', 'lignumdata', 'facts.json');
const MANIFEST_PATH = path.join(ROOT, 'data', 'manual', 'woods', 'lignumdata.json');
const ENGLISH_DATABASE_PATH = path.join(ROOT, 'public', 'data', 'woods.generated.en.json');
const FRENCH_DATABASE_PATH = path.join(ROOT, 'public', 'data', 'woods.generated.fr.json');

const SOURCE_URL = 'https://lignumdata.ch/system/holzarten?locale=en';
const SOURCE_PROVIDER = 'Lignumdata';
const SOURCE_PUBLISHER = 'Lignum – Holzwirtschaft Schweiz';
const EXTRACTION_DATE = '2026-07-23';
const FETCH_CONCURRENCY = 4;
const FETCH_RETRIES = 4;
const FETCH_TIMEOUT_MS = 45_000;
const BETWEEN_REQUEST_DELAY_MS = 150;
const refresh = process.argv.includes('--refresh');

const TAXONOMY_RANKS = [
  'kingdom',
  'phylum',
  'clade',
  'class',
  'order',
  'family',
  'genus',
  'species',
];
const TAXONOMY_LABELS = new Map([
  ['reich', 'kingdom'],
  ['kingdom', 'kingdom'],
  ['tribe', 'phylum'],
  ['phylum', 'phylum'],
  ['gymnosperm', 'clade'],
  ['angiosperm', 'clade'],
  ['clade', 'clade'],
  ['class', 'class'],
  ['order', 'order'],
  ['family', 'family'],
  ['genus', 'genus'],
]);
const CONTINENT_ALIASES = new Map([
  ['africa', 'AF'],
  ['antarctica', 'AN'],
  ['asia', 'AS'],
  ['europe', 'EU'],
  ['north america', 'NA'],
  ['central america', 'NA'],
  ['middle america', 'NA'],
  ['caribbean', 'NA'],
  ['oceania', 'OC'],
  ['australasia', 'OC'],
  ['south america', 'SA'],
]);
const FUNGAL_CODES = new Set([
  '1',
  '1-2',
  '1-3',
  '2',
  '2-3',
  '2-4',
  '2-5',
  '3',
  '3-4',
  '3-5',
  '4',
  '4-5',
  '5',
]);
const TREATABILITY_CODES = new Set(['1', '1-2', '2', '2-3', '3', '3-4', '4']);
const RESISTANCE_CODES = new Set(['D', 'M', 'S']);
const DRY_BORER_CODES = new Set(['D', 'S']);
const COUNTRY_ALIAS_TO_CODE = countryAliasIndex();

const command = process.argv.find((argument) => ['sync', 'generate', 'all'].includes(argument)) ?? 'all';
if (command === 'sync') {
  await sync();
} else if (command === 'generate') {
  await generate();
} else {
  await sync();
  await generate();
}

async function sync() {
  const [catalog, database, cachedFacts] = await Promise.all([
    readJson(CATALOG_PATH),
    readJson(ENGLISH_DATABASE_PATH),
    readOptionalJson(FACTS_PATH),
  ]);
  if (!Array.isArray(catalog.entries) || catalog.entries.length < 4_000) {
    throw new Error(`${relativePath(CATALOG_PATH)} does not contain the expected catalogue`);
  }

  const catalogIndex = indexCatalog(catalog.entries);
  const matches = database.records.map((record) => resolveRecordMatches(record, catalogIndex));
  const selectedEntries = uniqueBy(
    matches.flatMap((match) => match.entries),
    (entry) => entry.detailUrl,
  );
  const cachedByUrl = new Map(
    (cachedFacts?.profiles ?? []).map((profile) => [profile.url, profile]),
  );
  let completed = 0;
  let fetched = 0;
  let reused = 0;

  const profiles = await mapWithConcurrency(
    selectedEntries,
    FETCH_CONCURRENCY,
    async (entry) => {
      const cached = cachedByUrl.get(entry.detailUrl);
      if (!refresh && cached?.schemaVersion === 1) {
        reused += 1;
        completed += 1;
        logProgress(completed, selectedEntries.length, fetched, reused);
        return cached;
      }
      const html = await fetchTextWithRetries(entry.detailUrl);
      const profile = parseProfile(html, entry);
      fetched += 1;
      completed += 1;
      logProgress(completed, selectedEntries.length, fetched, reused);
      await delay(BETWEEN_REQUEST_DELAY_MS);
      return profile;
    },
  );

  const matchCounts = countMatches(matches);
  const fieldCoverage = countProfileCoverage(profiles);
  await writeJson(FACTS_PATH, {
    schemaVersion: 1,
    source: {
      title: 'Wood species catalogue',
      provider: SOURCE_PUBLISHER,
      url: SOURCE_URL,
      extractionDate: EXTRACTION_DATE,
      extractionPolicy:
        'Only scientific names, normalized taxonomy and geography, EN 350 classes, and numeric physical or mechanical facts are retained. Images, descriptions, remarks, applications, and editorial prose are excluded.',
    },
    catalog: {
      path: relativePath(CATALOG_PATH),
      speciesCount: catalog.entries.length,
      generatedAt: catalog.generatedAt,
    },
    matching: {
      ...matchCounts,
      selectedProfileCount: profiles.length,
      fetchedProfileCount: fetched,
      reusedProfileCount: reused,
      records: matches.map(serializeMatch),
    },
    fieldCoverage,
    profiles: profiles.sort((left, right) => left.url.localeCompare(right.url)),
  });

  console.log(
    `Stored ${profiles.length} factual Lignumdata profiles: ${JSON.stringify(fieldCoverage)}`,
  );
  console.log(`Atlas matching: ${JSON.stringify(matchCounts)}`);
}

async function generate() {
  const [facts, englishDatabase, frenchDatabase, previousManifest] = await Promise.all([
    readJson(FACTS_PATH),
    readJson(ENGLISH_DATABASE_PATH),
    readJson(FRENCH_DATABASE_PATH),
    readOptionalJson(MANIFEST_PATH),
  ]);
  const profilesByUrl = new Map(facts.profiles.map((profile) => [profile.url, profile]));
  const matchesById = new Map(facts.matching.records.map((match) => [match.id, match]));
  const frenchById = new Map(frenchDatabase.records.map((record) => [record.id, record]));
  const previousById = new Map(
    (previousManifest?.supplements ?? []).map((supplement) => [supplement.id, supplement]),
  );
  const fieldCounts = new Map();
  const skippedExistingCounts = new Map();
  const conflictCounts = new Map();
  const conflictRecords = [];
  const supplements = [];

  for (const english of englishDatabase.records) {
    const match = matchesById.get(english.id);
    if (!match || match.profileUrls.length === 0) continue;
    const french = frenchById.get(english.id);
    if (!french) continue;
    const profiles = match.profileUrls.map((url) => profilesByUrl.get(url)).filter(Boolean);
    if (profiles.length === 0) continue;

    const aggregated = aggregateProfiles(profiles);
    const previous = previousById.get(english.id);
    const fields = selectSupplementFields(english, previous, aggregated, skippedExistingCounts);
    const proposalFields = [];
    if (aggregated.taxonomyPath.length > 0) proposalFields.push('identity.taxonomyPath');
    if (aggregated.continentCodes.length > 0) proposalFields.push('origin.continentCodes');
    if (aggregated.countryCodes.length > 0) proposalFields.push('origin.countryCodes');
    if (
      aggregated.sapwoodTreatability !== null &&
      (getAtPath(english, 'durability.sapwoodTreatability.value') == null ||
        getAtPath(previous, 'locales.en.durability.sapwoodTreatability.value') != null)
    ) {
      proposalFields.push('durability.sapwoodTreatability');
    }
    fields.push(...proposalFields);

    for (const conflict of aggregated.conflicts) {
      conflictCounts.set(conflict.field, (conflictCounts.get(conflict.field) ?? 0) + 1);
    }
    if (aggregated.conflicts.length > 0) {
      conflictRecords.push({ id: english.id, conflicts: aggregated.conflicts });
    }
    if (fields.length === 0) continue;

    for (const field of fields) fieldCounts.set(field, (fieldCounts.get(field) ?? 0) + 1);
    supplements.push({
      id: english.id,
      source: {
        provider: SOURCE_PROVIDER,
        kind: 'manual',
        references: profiles.map((profile) => ({
          title: `${profile.scientificName} — Lignumdata factual data`,
          url: profile.url,
          publisher: SOURCE_PUBLISHER,
          year: null,
        })),
        lastUpdateDate: null,
        extractionDate: EXTRACTION_DATE,
      },
      locales: {
        en: buildLocale(english, aggregated, fields, 'en'),
        fr: buildLocale(french, aggregated, fields, 'fr'),
      },
    });
  }

  await writeJson(MANIFEST_PATH, {
    schemaVersion: 1,
    dataset: {
      generatorVersion: 1,
      title: facts.source.title,
      provider: SOURCE_PUBLISHER,
      url: SOURCE_URL,
      extractionPolicy: facts.source.extractionPolicy,
      catalogSpecies: facts.catalog.speciesCount,
      ...withoutRecords(facts.matching),
      supplementedRecords: supplements.length,
      supplementedFields: sortedObject(fieldCounts),
      existingNonNullFieldsSkipped: sortedObject(skippedExistingCounts),
      aggregationConflicts: sortedObject(conflictCounts),
      conflictRecords,
    },
    records: [],
    supplements: supplements.sort((left, right) => left.id.localeCompare(right.id)),
  });

  console.log(
    `Generated ${supplements.length} Lignumdata supplements: ${JSON.stringify(sortedObject(fieldCounts))}`,
  );
  console.log(
    `Skipped non-null atlas fields: ${JSON.stringify(sortedObject(skippedExistingCounts))}`,
  );
  console.log(`Aggregation conflicts: ${JSON.stringify(sortedObject(conflictCounts))}`);
}

function indexCatalog(entries) {
  const byScientificName = new Map();
  for (const entry of entries) {
    const key = scientificNameKey(entry.scientificName);
    if (!key) continue;
    if (!byScientificName.has(key)) byScientificName.set(key, []);
    byScientificName.get(key).push({
      scientificName: entry.scientificName.trim(),
      detailUrl: entry.detailUrl,
    });
  }
  return byScientificName;
}

function resolveRecordMatches(record, catalogIndex) {
  const acceptedNames = record.identity.botanicalNames
    .filter((name) => !name.isSynonym)
    .map(({ name }) => name);
  const synonymNames = record.identity.botanicalNames
    .filter((name) => name.isSynonym)
    .map(({ name }) => name);
  const accepted = resolveBotanicalNames(acceptedNames, catalogIndex);
  if (accepted.entries.length > 0) {
    return {
      id: record.id,
      matchType: 'accepted',
      matchedNames: accepted.matchedNames,
      ambiguousNames: accepted.ambiguousNames,
      entries: accepted.entries,
    };
  }

  const synonyms = resolveBotanicalNames(synonymNames, catalogIndex);
  if (synonyms.entries.length === 1 && synonyms.ambiguousNames.length === 0) {
    return {
      id: record.id,
      matchType: 'synonym',
      matchedNames: synonyms.matchedNames,
      ambiguousNames: [],
      entries: synonyms.entries,
    };
  }
  return {
    id: record.id,
    matchType:
      accepted.ambiguousNames.length > 0 ||
      synonyms.ambiguousNames.length > 0 ||
      synonyms.entries.length > 1
        ? 'ambiguous'
        : 'unmatched',
    matchedNames: [],
    ambiguousNames: [
      ...accepted.ambiguousNames,
      ...synonyms.ambiguousNames,
      ...(synonyms.entries.length > 1 ? synonymNames : []),
    ],
    entries: [],
  };
}

function resolveBotanicalNames(names, catalogIndex) {
  const entries = [];
  const matchedNames = [];
  const ambiguousNames = [];
  for (const name of names) {
    const candidates = uniqueBy(
      catalogIndex.get(scientificNameKey(name)) ?? [],
      (entry) => entry.detailUrl,
    );
    if (candidates.length === 1) {
      entries.push(candidates[0]);
      matchedNames.push(name);
    } else if (candidates.length > 1) {
      ambiguousNames.push(name);
    }
  }
  return {
    entries: uniqueBy(entries, (entry) => entry.detailUrl),
    matchedNames: [...new Set(matchedNames)],
    ambiguousNames: [...new Set(ambiguousNames)],
  };
}

function parseProfile(html, catalogEntry) {
  const sections = parseSections(html);
  const detailScientificName = stripTags(
    html.match(
      /<h1\b[^>]*class="[^"]*holzart-scientific-name[^"]*"[^>]*>([\s\S]*?)<\/h1>/iu,
    )?.[1],
  )
    .trim();
  const catalogNameKey = scientificNameKey(catalogEntry.scientificName);
  const detailNameKey = scientificNameKey(detailScientificName);
  if (detailNameKey !== catalogNameKey && !detailNameKey.startsWith(`${catalogNameKey} `)) {
    throw new Error(
      `${catalogEntry.detailUrl} scientific name mismatch: ${detailScientificName} != ${catalogEntry.scientificName}`,
    );
  }

  const originRows = sectionRows(sections, 'origin');
  const botanyRows = sectionRows(sections, 'botany');
  const durabilityRows = sectionRows(sections, 'natural durability');
  const impregnabilityRows = sectionRows(sections, 'impregnability');
  const densityRows = sectionRows(sections, 'raw density');
  const physicalRows = sectionRows(sections, 'physical properties');
  const mechanicalRows = sectionRows(sections, 'mechanical properties');

  const geographicRegions = rowValue(originRows, 'geographic regions');
  const statesAndTerritories = rowValue(originRows, 'states and territories');
  const taxonomyPath = taxonomyFromRows(botanyRows, catalogEntry.scientificName);
  const fungalField = durabilityClass(rowValue(durabilityRows, 'mushrooms field'));
  const fungalLaboratory = durabilityClass(rowValue(durabilityRows, 'mushrooms laboratory'));
  const dryBorerValues = [
    resistanceClass(rowValue(durabilityRows, 'house longhorn beetle hylotrupes bajulus')),
    resistanceClass(rowValue(durabilityRows, 'common furniture beetle anobium')),
    resistanceClass(rowValue(durabilityRows, 'powderpost beetle lyctus')),
  ].filter(Boolean);

  return {
    schemaVersion: 1,
    scientificName: catalogEntry.scientificName,
    normalizedScientificName: scientificNameKey(catalogEntry.scientificName),
    url: catalogEntry.detailUrl,
    facts: {
      taxonomyPath,
      continentCodes: continentCodes(geographicRegions),
      countryCodes: countryCodes(statesAndTerritories),
      durability: {
        fungi: fungalField ?? fungalLaboratory,
        fungalBasis: fungalField ? 'field' : fungalLaboratory ? 'laboratory' : null,
        dryWoodBorers: combineExactClasses(dryBorerValues, DRY_BORER_CODES),
        termites: resistanceClass(rowValue(durabilityRows, 'termites')),
        heartwoodTreatability: treatabilityClass(
          rowValue(impregnabilityRows, 'impregnability of heartwood'),
        ),
        sapwoodTreatability: treatabilityClass(
          rowValue(impregnabilityRows, 'impregnability of the sapwood'),
        ),
      },
      physics: parsePhysicalFacts(densityRows, physicalRows),
      mechanics: parseMechanicalFacts(mechanicalRows),
    },
  };
}

function parseSections(html) {
  const sections = [];
  for (const match of html.matchAll(/<div\b[^>]*class="[^"]*\bsection\b[^"]*"[^>]*>([\s\S]*?)<\/div>/giu)) {
    const block = match[1];
    const title = stripTags(block.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/iu)?.[1]);
    if (!title) continue;
    const rows = [];
    for (const rowMatch of block.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/giu)) {
      const cells = [...rowMatch[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/giu)].map(
        (cell) => stripTags(cell[1]),
      );
      if (cells.length < 2 || !cells[0]) continue;
      rows.push({
        label: cells[0],
        normalizedLabel: normalizeText(cells[0]),
        value: cells[1],
        unit: cells.at(-1) === cells[1] ? '' : cells.at(-1),
      });
    }
    sections.push({ title, normalizedTitle: normalizeText(title), rows });
  }
  return sections;
}

function sectionRows(sections, titlePrefix) {
  return (
    sections.find((section) => section.normalizedTitle.startsWith(normalizeText(titlePrefix)))?.rows ??
    []
  );
}

function rowValue(rows, label) {
  return rows.find((row) => row.normalizedLabel === normalizeText(label))?.value ?? '';
}

function taxonomyFromRows(rows, scientificName) {
  const valuesByRank = new Map();
  for (const row of rows) {
    const rank = TAXONOMY_LABELS.get(row.normalizedLabel);
    if (!rank || !isTaxonomyValue(row.value)) continue;
    valuesByRank.set(rank, cleanTaxonomyValue(row.value));
  }
  if (scientificNameKey(scientificName)) valuesByRank.set('species', scientificName.trim());
  return TAXONOMY_RANKS.flatMap((rank) => {
    const name = valuesByRank.get(rank);
    return name ? [{ rank, name }] : [];
  });
}

function parsePhysicalFacts(densityRows, physicalRows) {
  const density = {
    min: numericRowValue(densityRows, /density oven dry u 12 lower limit/u, 'kg/m3', 1 / 1000),
    value: numericRowValue(densityRows, /density oven dry u 12 mean value/u, 'kg/m3', 1 / 1000),
    max: numericRowValue(densityRows, /density oven dry u 12 upper limit/u, 'kg/m3', 1 / 1000),
    unit: null,
    sourceUnit: 'kg/m³ at 12% moisture',
  };
  const allRows = [...densityRows, ...physicalRows];
  return {
    specificGravity:
      density.min !== null || density.value !== null || density.max !== null ? density : null,
    totalTangentialShrinkage: numericMeasureFromRows(allRows, [
      /total tangential shrinkage/u,
      /tangential shrinkage total/u,
    ], '%', 1),
    totalRadialShrinkage: numericMeasureFromRows(
      allRows,
      [/total radial shrinkage/u, /radial shrinkage total/u],
      '%',
      1,
    ),
    fibreSaturationPoint: numericMeasureFromRows(
      allRows,
      [/fibre saturation point/u, /fiber saturation point/u],
      '%',
      1,
    ),
    thermalConductivity: numericMeasureFromRows(
      allRows,
      [/thermal conductivity/u],
      'w/mk',
      1,
    ),
  };
}

function parseMechanicalFacts(rows) {
  return {
    crushingStrength: numericMeasureFromRows(
      rows,
      [/compressive strength mean value/u, /compression strength mean value/u],
      'n/mm2',
      1,
    ),
    staticBendingStrength: numericMeasureFromRows(
      rows,
      [/flexural strength mean/u, /static bending strength mean/u],
      'n/mm2',
      1,
    ),
    modulusOfElasticity: numericMeasureFromRows(
      rows,
      [/young s modulus mean/u, /modulus of elasticity mean/u],
      'n/mm2',
      1,
    ),
  };
}

function numericMeasureFromRows(rows, labelPatterns, expectedUnit, multiplier) {
  const row = rows.find((candidate) =>
    labelPatterns.some((pattern) => pattern.test(candidate.normalizedLabel)),
  );
  if (!row) return null;
  const value = parseNumeric(row.value);
  if (value === null || !unitMatches(row.unit, expectedUnit)) return null;
  return {
    value: round(value * multiplier, 6),
    min: null,
    max: null,
    unit: targetUnit(expectedUnit),
    sourceUnit: cleanUnit(row.unit),
  };
}

function numericRowValue(rows, labelPattern, expectedUnit, multiplier) {
  const row = rows.find((candidate) => labelPattern.test(candidate.normalizedLabel));
  if (!row || !unitMatches(row.unit, expectedUnit)) return null;
  const value = parseNumeric(row.value);
  return value === null ? null : round(value * multiplier, 6);
}

function aggregateProfiles(profiles) {
  const conflicts = [];
  const taxonomyPath = commonTaxonomyPath(profiles.map((profile) => profile.facts.taxonomyPath));
  const continentCodes = sortedUnique(profiles.flatMap((profile) => profile.facts.continentCodes));
  const countryCodes = sortedUnique(profiles.flatMap((profile) => profile.facts.countryCodes));
  const fungi = aggregateRangeCategory(
    profiles.map((profile) => profile.facts.durability.fungi).filter(Boolean),
    FUNGAL_CODES,
    'durability.fungi',
    conflicts,
  );
  const heartwoodTreatability = aggregateRangeCategory(
    profiles
      .map((profile) => profile.facts.durability.heartwoodTreatability)
      .filter(Boolean),
    TREATABILITY_CODES,
    'durability.treatability',
    conflicts,
  );
  const sapwoodTreatability = aggregateRangeCategory(
    profiles
      .map((profile) => profile.facts.durability.sapwoodTreatability)
      .filter(Boolean),
    TREATABILITY_CODES,
    'durability.sapwoodTreatability',
    conflicts,
  );
  const dryWoodBorers = aggregateExactCategory(
    profiles.map((profile) => profile.facts.durability.dryWoodBorers).filter(Boolean),
    'durability.dryWoodBorers',
    conflicts,
  );
  const termites = aggregateExactCategory(
    profiles.map((profile) => profile.facts.durability.termites).filter(Boolean),
    'durability.termites',
    conflicts,
  );

  return {
    taxonomyPath,
    continentCodes,
    countryCodes,
    fungi,
    fungalBasis: commonValue(
      profiles.map((profile) => profile.facts.durability.fungalBasis).filter(Boolean),
    ),
    dryWoodBorers,
    termites,
    heartwoodTreatability,
    sapwoodTreatability,
    physics: {
      specificGravity: aggregateMeasures(
        profiles.map((profile) => profile.facts.physics.specificGravity).filter(Boolean),
      ),
      totalTangentialShrinkage: aggregateMeasures(
        profiles
          .map((profile) => profile.facts.physics.totalTangentialShrinkage)
          .filter(Boolean),
      ),
      totalRadialShrinkage: aggregateMeasures(
        profiles.map((profile) => profile.facts.physics.totalRadialShrinkage).filter(Boolean),
      ),
      fibreSaturationPoint: aggregateMeasures(
        profiles.map((profile) => profile.facts.physics.fibreSaturationPoint).filter(Boolean),
      ),
      thermalConductivity: aggregateMeasures(
        profiles.map((profile) => profile.facts.physics.thermalConductivity).filter(Boolean),
      ),
    },
    mechanics: {
      crushingStrength: aggregateMeasures(
        profiles.map((profile) => profile.facts.mechanics.crushingStrength).filter(Boolean),
      ),
      staticBendingStrength: aggregateMeasures(
        profiles.map((profile) => profile.facts.mechanics.staticBendingStrength).filter(Boolean),
      ),
      modulusOfElasticity: aggregateMeasures(
        profiles.map((profile) => profile.facts.mechanics.modulusOfElasticity).filter(Boolean),
      ),
    },
    conflicts,
  };
}

function aggregateMeasures(measures) {
  if (measures.length === 0) return null;
  const units = sortedUnique(measures.map((measure) => measure.unit ?? ''));
  if (units.length > 1) return null;
  const lowerValues = measures
    .map((measure) => measure.min ?? measure.value)
    .filter((value) => value !== null);
  const upperValues = measures
    .map((measure) => measure.max ?? measure.value)
    .filter((value) => value !== null);
  const sourceMeans = sortedUnique(
    measures.map((measure) => measure.value).filter((value) => value !== null),
  );
  const value = sourceMeans.length === 1 ? sourceMeans[0] : null;
  const min = lowerValues.length > 0 ? Math.min(...lowerValues) : null;
  const max = upperValues.length > 0 ? Math.max(...upperValues) : null;
  return {
    value,
    min,
    max,
    unit: measures[0].unit,
    sourceUnit: sortedUnique(measures.map((measure) => measure.sourceUnit).filter(Boolean)).join(
      '; ',
    ),
    sourceMeanCount: measures.filter((measure) => measure.value !== null).length,
  };
}

function selectSupplementFields(base, previous, aggregated, skippedCounts) {
  const candidates = [
    ['durability.fungi', aggregated.fungi],
    ['durability.dryWoodBorers', aggregated.dryWoodBorers],
    ['durability.termites', aggregated.termites],
    ['durability.treatability', aggregated.heartwoodTreatability],
    ['physics.specificGravity', aggregated.physics.specificGravity?.value],
    ['physics.totalTangentialShrinkage', aggregated.physics.totalTangentialShrinkage?.value],
    ['physics.totalRadialShrinkage', aggregated.physics.totalRadialShrinkage?.value],
    ['physics.fibreSaturationPoint', aggregated.physics.fibreSaturationPoint?.value],
    ['physics.thermalConductivity', aggregated.physics.thermalConductivity?.value],
    ['physics.crushingStrength', aggregated.mechanics.crushingStrength?.value],
    ['physics.staticBendingStrength', aggregated.mechanics.staticBendingStrength?.value],
    ['physics.modulusOfElasticity', aggregated.mechanics.modulusOfElasticity?.value],
  ];
  return candidates.flatMap(([field, value]) => {
    if (value == null) return [];
    if (
      getAtPath(base, `${field}.value`) == null ||
      getAtPath(previous, `locales.en.${field}.value`) != null
    ) {
      return [field];
    }
    skippedCounts.set(field, (skippedCounts.get(field) ?? 0) + 1);
    return [];
  });
}

function buildLocale(base, aggregated, fields, language) {
  const locale = emptyLocale(base, language);
  if (fields.includes('identity.taxonomyPath')) {
    locale.identity.taxonomyPath = structuredClone(aggregated.taxonomyPath);
  }
  if (fields.includes('origin.continentCodes')) {
    locale.origin.continentCodes = [...aggregated.continentCodes];
  }
  if (fields.includes('origin.countryCodes')) {
    locale.origin.countryCodes = [...aggregated.countryCodes];
  }
  if (fields.includes('durability.fungi')) {
    locale.durability.fungi = fungalValue(aggregated.fungi, aggregated.fungalBasis, language);
  }
  if (fields.includes('durability.dryWoodBorers')) {
    locale.durability.dryWoodBorers = resistanceValue(
      aggregated.dryWoodBorers,
      'dryWoodBorers',
      language,
    );
  }
  if (fields.includes('durability.termites')) {
    locale.durability.termites = resistanceValue(aggregated.termites, 'termites', language);
  }
  if (fields.includes('durability.treatability')) {
    locale.durability.treatability = treatabilityValue(
      aggregated.heartwoodTreatability,
      'heartwood',
      language,
    );
  }
  if (fields.includes('durability.sapwoodTreatability')) {
    locale.durability.sapwoodTreatability = treatabilityValue(
      aggregated.sapwoodTreatability,
      'sapwood',
      language,
    );
  }

  const numericFields = [
    ['physics.specificGravity', aggregated.physics.specificGravity],
    ['physics.totalTangentialShrinkage', aggregated.physics.totalTangentialShrinkage],
    ['physics.totalRadialShrinkage', aggregated.physics.totalRadialShrinkage],
    ['physics.fibreSaturationPoint', aggregated.physics.fibreSaturationPoint],
    ['physics.thermalConductivity', aggregated.physics.thermalConductivity],
    ['physics.crushingStrength', aggregated.mechanics.crushingStrength],
    ['physics.staticBendingStrength', aggregated.mechanics.staticBendingStrength],
    ['physics.modulusOfElasticity', aggregated.mechanics.modulusOfElasticity],
  ];
  for (const [field, measure] of numericFields) {
    if (!fields.includes(field) || !measure) continue;
    setAtPath(locale, field, numericValue(field, measure, language));
  }
  return locale;
}

function fungalValue(code, basis, language) {
  const labels = language === 'fr' ? FRENCH_FUNGAL_LABELS : ENGLISH_FUNGAL_LABELS;
  const basisLabel =
    language === 'fr'
      ? basis === 'field'
        ? 'essai en plein air'
        : 'essai en laboratoire'
      : basis === 'field'
        ? 'field test'
        : 'laboratory test';
  return {
    raw:
      language === 'fr'
        ? `Lignumdata — durabilité EN 350 aux champignons : ${code} (${basisLabel})`
        : `Lignumdata — EN 350 fungal durability: ${code} (${basisLabel})`,
    value: labels.get(code),
  };
}

function resistanceValue(code, field, language) {
  const labels =
    field === 'termites'
      ? language === 'fr'
        ? FRENCH_TERMITE_LABELS
        : ENGLISH_TERMITE_LABELS
      : language === 'fr'
        ? FRENCH_BORER_LABELS
        : ENGLISH_BORER_LABELS;
  const subject =
    language === 'fr'
      ? field === 'termites'
        ? 'résistance EN 350 aux termites'
        : 'résistance EN 350 aux insectes de bois sec'
      : field === 'termites'
        ? 'EN 350 termite resistance'
        : 'EN 350 dry-wood-borer resistance';
  return {
    raw: `Lignumdata — ${subject}: ${code}`,
    value: labels.get(code),
  };
}

function treatabilityValue(code, woodPart, language) {
  const labels = language === 'fr' ? FRENCH_TREATABILITY_LABELS : ENGLISH_TREATABILITY_LABELS;
  const subject =
    language === 'fr'
      ? woodPart === 'heartwood'
        ? 'imprégnabilité EN 350 du duramen'
        : "imprégnabilité EN 350 de l'aubier"
      : woodPart === 'heartwood'
        ? 'EN 350 heartwood impregnability'
        : 'EN 350 sapwood impregnability';
  return {
    raw: `Lignumdata — ${subject}: ${code}`,
    value: labels.get(code),
  };
}

function numericValue(field, measure, language) {
  const labels = {
    en: {
      'physics.specificGravity': 'density at 12% moisture content',
      'physics.totalTangentialShrinkage': 'total tangential shrinkage',
      'physics.totalRadialShrinkage': 'total radial shrinkage',
      'physics.fibreSaturationPoint': 'fibre saturation point',
      'physics.thermalConductivity': 'thermal conductivity',
      'physics.crushingStrength': 'mean compressive strength',
      'physics.staticBendingStrength': 'mean flexural strength',
      'physics.modulusOfElasticity': "mean Young's modulus",
    },
    fr: {
      'physics.specificGravity': 'masse volumique à 12 % d’humidité',
      'physics.totalTangentialShrinkage': 'retrait tangentiel total',
      'physics.totalRadialShrinkage': 'retrait radial total',
      'physics.fibreSaturationPoint': 'point de saturation des fibres',
      'physics.thermalConductivity': 'conductivité thermique',
      'physics.crushingStrength': 'résistance moyenne en compression',
      'physics.staticBendingStrength': 'résistance moyenne en flexion',
      'physics.modulusOfElasticity': 'module d’élasticité moyen',
    },
  };
  const range =
    measure.min !== null && measure.max !== null && measure.min !== measure.max
      ? language === 'fr'
        ? ` ; plage ${measure.min}–${measure.max}`
        : `; range ${measure.min}–${measure.max}`
      : '';
  const sourceUnit = measure.sourceUnit ? ` ${measure.sourceUnit}` : '';
  const raw =
    language === 'fr'
      ? `Lignumdata — ${labels.fr[field]} : moyenne publiée ${measure.value}${sourceUnit}${range}`
      : `Lignumdata — ${labels.en[field]}: published mean ${measure.value}${sourceUnit}${range}`;
  return {
    raw,
    value: measure.value,
    min: measure.min,
    max: measure.max,
    ...(measure.unit ? { unit: measure.unit } : {}),
  };
}

const ENGLISH_FUNGAL_LABELS = classLabels(
  ['1', 'very durable'],
  ['2', 'durable'],
  ['3', 'moderately durable'],
  ['4', 'poorly durable'],
  ['5', 'not durable'],
);
const FRENCH_FUNGAL_LABELS = classLabels(
  ['1', 'très durable'],
  ['2', 'durable'],
  ['3', 'moyennement durable'],
  ['4', 'faiblement durable'],
  ['5', 'non durable'],
  'classe',
);
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
const ENGLISH_TERMITE_LABELS = new Map([
  ['D', 'class d - durable'],
  ['M', 'class m - moderately durable'],
  ['S', 'class s - susceptible'],
]);
const FRENCH_TERMITE_LABELS = new Map([
  ['D', 'classe d - durable'],
  ['M', 'classe m - moyennement durable'],
  ['S', 'classe s - sensible'],
]);
const ENGLISH_BORER_LABELS = new Map([
  ['D', 'class d - durable'],
  ['S', 'class s - susceptible'],
]);
const FRENCH_BORER_LABELS = new Map([
  ['D', 'classe d - durable'],
  ['S', 'classe s - sensible'],
]);

function classLabels(...arguments_) {
  let prefix = 'class';
  if (typeof arguments_.at(-1) === 'string') prefix = arguments_.pop();
  const entries = arguments_;
  const map = new Map(entries.map(([code, label]) => [code, `${prefix} ${code} - ${label}`]));
  const descriptions = new Map(entries);
  for (let minimum = 1; minimum <= 5; minimum += 1) {
    for (let maximum = minimum + 1; maximum <= 5; maximum += 1) {
      const code = `${minimum}-${maximum}`;
      if (!FUNGAL_CODES.has(code)) continue;
      const separator = prefix === 'classe' ? ' à ' : ' to ';
      map.set(
        code,
        `${prefix} ${code} - ${descriptions.get(String(minimum))}${separator}${descriptions.get(String(maximum))}`,
      );
    }
  }
  return map;
}

function emptyLocale(base, language) {
  const text = () => ({ raw: '', value: null });
  const measure = (unit) => ({
    raw: '',
    value: null,
    min: null,
    max: null,
    ...(unit ? { unit } : {}),
  });
  return {
    identity: {
      primaryName: base.identity.primaryName,
      displayName: base.identity.displayName,
      slug: base.identity.slug,
      family: base.identity.family,
      botanicalNames: structuredClone(base.identity.botanicalNames),
      aliases: [],
      localNames: [],
      commercialRestrictions: text(),
      notes: [],
    },
    origin: {
      region: base.origin.region,
      continent: base.origin.continent,
      countries: [],
    },
    cites: { raw: null, listed: null },
    log: {
      diameterCm: measure('cm'),
      sapwoodThickness: text(),
      floats: text(),
      durability: text(),
      notes: [],
    },
    appearance: {
      colourReference: text(),
      sapwood: text(),
      texture: text(),
      grain: text(),
      interlockedGrain: text(),
      notes: [],
    },
    physics: {
      specificGravity: measure(),
      monninHardness: measure(),
      jankaHardness: measure('N'),
      volumetricShrinkageCoefficient: measure(language === 'fr' ? '% par %' : '% per %'),
      totalTangentialShrinkage: measure('%'),
      totalRadialShrinkage: measure('%'),
      shrinkageRatio: measure(),
      fibreSaturationPoint: measure('%'),
      thermalConductivity: measure('W/(m.K)'),
      lowerHeatingValue: measure('kJ/kg'),
      crushingStrength: measure('MPa'),
      staticBendingStrength: measure('MPa'),
      modulusOfElasticity: measure('MPa'),
      stability: text(),
      notes: [],
    },
    durability: {
      fungi: text(),
      dryWoodBorers: text(),
      termites: text(),
      treatability: text(),
      sapwoodTreatability: text(),
      naturalUseClass: text(),
      coversUseClass5: text(),
      preservativeTreatment: {
        dryWoodBorer: text(),
        temporaryHumidification: text(),
        permanentHumidification: text(),
        notes: [],
      },
      notes: [],
    },
    drying: {
      rate: text(),
      distortionRisk: text(),
      casehardeningRisk: text(),
      checkingRisk: text(),
      collapseRisk: text(),
      notes: [],
      schedule: [],
      scheduleNotes: [],
    },
    machining: {
      bluntingEffect: text(),
      sawteethRecommended: text(),
      cuttingTools: text(),
      peeling: text(),
      slicing: text(),
      notes: [],
    },
    assembly: {
      nailingAndScrewing: text(),
      gluing: text(),
      notes: [],
    },
    grading: { appearance: null, structural: null },
    fireSafety: { frenchGrading: null, euroclass: text(), notes: null },
    endUses: [],
    endUseNotes: [],
  };
}

function commonTaxonomyPath(paths) {
  if (paths.length === 0) return [];
  const byRank = paths.map((taxonomyPath) => new Map(taxonomyPath.map((node) => [node.rank, node.name])));
  const common = [];
  for (const rank of TAXONOMY_RANKS) {
    const names = byRank.map((pathValue) => pathValue.get(rank)).filter(Boolean);
    if (names.length !== byRank.length || new Set(names.map(normalizeText)).size !== 1) break;
    common.push({ rank, name: names[0] });
  }
  return common;
}

function aggregateRangeCategory(values, allowedCodes, field, conflicts) {
  if (values.length === 0) return null;
  const endpoints = values.flatMap((value) => value.split('-').map(Number));
  const minimum = Math.min(...endpoints);
  const maximum = Math.max(...endpoints);
  const code = minimum === maximum ? String(minimum) : `${minimum}-${maximum}`;
  if (allowedCodes.has(code)) return code;
  conflicts.push({ field, values: sortedUnique(values), reason: 'unrepresentable range' });
  return null;
}

function aggregateExactCategory(values, field, conflicts) {
  const unique = sortedUnique(values);
  if (unique.length === 0) return null;
  if (unique.length === 1) return unique[0];
  conflicts.push({ field, values: unique, reason: 'conflicting classes' });
  return null;
}

function durabilityClass(value) {
  const normalized = normalizeText(value)
    .replace(/^dc\s*/u, '')
    .replace(/\bto\b/gu, '-')
    .replace(/\s+/gu, '');
  const match = normalized.match(/^([1-5])(?:-([1-5]))?[a-z]?$/u);
  if (!match) return null;
  const code = match[2] ? `${match[1]}-${match[2]}` : match[1];
  return FUNGAL_CODES.has(code) ? code : null;
}

function treatabilityClass(value) {
  const normalized = normalizeText(value)
    .replace(/\bto\b/gu, '-')
    .replace(/\s+/gu, '');
  const match = normalized.match(/^([1-4])(?:-([1-4]))?[a-z]?$/u);
  if (!match) return null;
  const code = match[2] ? `${match[1]}-${match[2]}` : match[1];
  return TREATABILITY_CODES.has(code) ? code : null;
}

function resistanceClass(value) {
  const code = String(value ?? '').trim().toUpperCase();
  return RESISTANCE_CODES.has(code) ? code : null;
}

function combineExactClasses(values, allowed) {
  const unique = sortedUnique(values.filter((value) => allowed.has(value)));
  return unique.length === 1 ? unique[0] : null;
}

function commonValue(values) {
  const unique = sortedUnique(values);
  return unique.length === 1 ? unique[0] : null;
}

function continentCodes(value) {
  const normalized = normalizeText(value);
  return sortedUnique(
    [...CONTINENT_ALIASES.entries()].flatMap(([name, code]) =>
      new RegExp(`(?:^|\\b)${escapeRegExp(name)}(?:\\b|$)`, 'u').test(normalized) ? [code] : [],
    ),
  );
}

function countryCodes(value) {
  const normalized = normalizeText(value);
  const aliases = [...COUNTRY_ALIAS_TO_CODE.keys()].sort(
    (left, right) => right.length - left.length || left.localeCompare(right),
  );
  const pattern = new RegExp(
    `(?:^|\\b)(${aliases.map(escapeRegExp).join('|')})(?=\\b|$)`,
    'gu',
  );
  const codes = [];
  for (const match of normalized.matchAll(pattern)) {
    const code = COUNTRY_ALIAS_TO_CODE.get(match[1]);
    if (code) codes.push(code);
  }
  return sortedUnique(codes);
}

function countryAliasIndex() {
  const codes =
    'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(
      ' ',
    );
  const names = new Intl.DisplayNames(['en'], { type: 'region' });
  const aliases = new Map();
  for (const code of codes) {
    const name = normalizeText(names.of(code));
    if (name && !aliases.has(name)) aliases.set(name, code);
  }
  const manualAliases = {
    'antigua and barbuda': 'AG',
    bolivia: 'BO',
    'bosnia and herzegovina': 'BA',
    britain: 'GB',
    brunei: 'BN',
    burma: 'MM',
    'cape verde': 'CV',
    'central african republic': 'CF',
    china: 'CN',
    'czech republic': 'CZ',
    'democratic republic of the congo': 'CD',
    'dominican republic': 'DO',
    easttimor: 'TL',
    'east timor': 'TL',
    'equatorial guinea': 'GQ',
    'falkland islands': 'FK',
    'french guiana': 'GF',
    'great britain': 'GB',
    'guinea bissau': 'GW',
    iran: 'IR',
    ivorycoast: 'CI',
    'ivory coast': 'CI',
    laos: 'LA',
    macedonia: 'MK',
    moldavia: 'MD',
    moldova: 'MD',
    'north korea': 'KP',
    palestine: 'PS',
    'papua new guinea': 'PG',
    'republic of congo': 'CG',
    russia: 'RU',
    'saint kitts and nevis': 'KN',
    'saint lucia': 'LC',
    'saint vincent and the grenadines': 'VC',
    'sao tome and principe': 'ST',
    'solomon islands': 'SB',
    'south korea': 'KR',
    swaziland: 'SZ',
    syria: 'SY',
    taiwan: 'TW',
    tanzania: 'TZ',
    turkey: 'TR',
    uk: 'GB',
    'united kingdom': 'GB',
    'united states': 'US',
    'united states of america': 'US',
    venezuela: 'VE',
    vietnam: 'VN',
  };
  for (const [name, code] of Object.entries(manualAliases)) aliases.set(normalizeText(name), code);
  aliases.delete('congo');
  aliases.delete('guinea');
  aliases.delete('korea');
  return aliases;
}

function isTaxonomyValue(value) {
  const clean = cleanTaxonomyValue(value);
  return (
    clean.length > 0 &&
    clean.length <= 100 &&
    /^[\p{L}\p{M}× .'-]+$/u.test(clean) &&
    !/[;:]/u.test(clean)
  );
}

function cleanTaxonomyValue(value) {
  return String(value ?? '').replace(/\s+/gu, ' ').trim();
}

function parseNumeric(value) {
  const normalized = String(value ?? '').trim().replace(',', '.');
  if (!/^-?\d+(?:[.]\d+)?$/u.test(normalized)) return null;
  const result = Number(normalized);
  return Number.isFinite(result) ? result : null;
}

function unitMatches(actual, expected) {
  return cleanUnit(actual) === cleanUnit(expected);
}

function cleanUnit(value) {
  return normalizeText(value)
    .replace(/\s+/gu, '')
    .replace(/³/gu, '3')
    .replace(/[()]/gu, '');
}

function targetUnit(sourceUnit) {
  const units = {
    '%': '%',
    'w/mk': 'W/(m.K)',
    'n/mm2': 'MPa',
  };
  return units[sourceUnit] ?? undefined;
}

function scientificNameKey(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[×]/gu, ' x ')
    .replace(/[^A-Za-z0-9-]+/gu, ' ')
    .trim()
    .replace(/\s+/gu, ' ')
    .toLocaleLowerCase('en');
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/&/gu, ' and ')
    .replace(/[‐‑‒–—-]/gu, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .toLocaleLowerCase('en')
    .replace(/\s+/gu, ' ')
    .trim();
}

function stripTags(value) {
  return decodeHtml(
    String(value ?? '')
      .replace(/<script\b[\s\S]*?<\/script>/giu, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/giu, ' ')
      .replace(/<[^>]+>/gu, ' '),
  )
    .replace(/\s+/gu, ' ')
    .trim();
}

function decodeHtml(value) {
  return String(value)
    .replace(/&#x([0-9a-f]+);/giu, (_match, hexadecimal) =>
      String.fromCodePoint(Number.parseInt(hexadecimal, 16)),
    )
    .replace(/&#(\d+);/gu, (_match, decimal) => String.fromCodePoint(Number(decimal)))
    .replace(/&nbsp;/giu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/&quot;/giu, '"')
    .replace(/&apos;|&rsquo;/giu, "'")
    .replace(/&ndash;/giu, '–')
    .replace(/&mdash;/giu, '—')
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>');
}

function serializeMatch(match) {
  return {
    id: match.id,
    matchType: match.matchType,
    matchedNames: match.matchedNames,
    ambiguousNames: match.ambiguousNames,
    profileUrls: match.entries.map((entry) => entry.detailUrl).sort(),
  };
}

function countMatches(matches) {
  return {
    atlasRecordCount: matches.length,
    acceptedMatchRecords: matches.filter((match) => match.matchType === 'accepted').length,
    synonymMatchRecords: matches.filter((match) => match.matchType === 'synonym').length,
    ambiguousRecords: matches.filter((match) => match.matchType === 'ambiguous').length,
    unmatchedRecords: matches.filter((match) => match.matchType === 'unmatched').length,
    multiSpeciesGroupRecords: matches.filter(
      (match) => match.matchType === 'accepted' && match.entries.length > 1,
    ).length,
    ambiguousBotanicalNamesSkipped: matches.reduce(
      (sum, match) => sum + match.ambiguousNames.length,
      0,
    ),
  };
}

function countProfileCoverage(profiles) {
  const paths = [
    'taxonomyPath',
    'continentCodes',
    'countryCodes',
    'durability.fungi',
    'durability.dryWoodBorers',
    'durability.termites',
    'durability.heartwoodTreatability',
    'durability.sapwoodTreatability',
    'physics.specificGravity',
    'physics.totalTangentialShrinkage',
    'physics.totalRadialShrinkage',
    'physics.fibreSaturationPoint',
    'physics.thermalConductivity',
    'mechanics.crushingStrength',
    'mechanics.staticBendingStrength',
    'mechanics.modulusOfElasticity',
  ];
  return Object.fromEntries(
    paths.map((field) => [
      field,
      profiles.filter((profile) => {
        const value = getAtPath(profile.facts, field);
        return Array.isArray(value) ? value.length > 0 : value != null;
      }).length,
    ]),
  );
}

function withoutRecords(matching) {
  const { records: _records, ...summary } = matching;
  return summary;
}

function sortedObject(map) {
  return Object.fromEntries([...map].sort(([left], [right]) => left.localeCompare(right)));
}

function sortedUnique(values) {
  return [...new Set(values)].sort((left, right) =>
    String(left).localeCompare(String(right), 'en', { numeric: true }),
  );
}

function uniqueBy(values, keyForValue) {
  return [...new Map(values.map((value) => [keyForValue(value), value])).values()];
}

function getAtPath(value, fieldPath) {
  return fieldPath.split('.').reduce((current, key) => current?.[key], value);
}

function setAtPath(value, fieldPath, fieldValue) {
  const keys = fieldPath.split('.');
  const last = keys.pop();
  const parent = keys.reduce((current, key) => current[key], value);
  parent[last] = fieldValue;
}

function round(value, precision) {
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function logProgress(completed, total, fetched, reused) {
  if (completed % 25 === 0 || completed === total) {
    console.log(`Processed ${completed}/${total} profiles (${fetched} fetched, ${reused} cached)`);
  }
}

async function fetchTextWithRetries(url) {
  let lastError;
  for (let attempt = 1; attempt <= FETCH_RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'User-Agent': 'WoodAtlasFactualDataImporter/1.0 (+https://github.com/fabien-h/wood-atlas)',
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < FETCH_RETRIES) await delay(attempt * 750);
    }
  }
  throw new Error(`${url}: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

async function mapWithConcurrency(values, concurrency, callback) {
  const results = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await callback(values[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => worker()),
  );
  return results;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function relativePath(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join('/');
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function readOptionalJson(filePath) {
  try {
    return await readJson(filePath);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const output = await format(`${JSON.stringify(value, null, 2)}\n`, {
    parser: 'json',
    printWidth: 100,
  });
  await fs.writeFile(filePath, output);
}
