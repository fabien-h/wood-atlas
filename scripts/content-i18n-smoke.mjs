#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { categoryEntries, normalizeCategoryText } from './category-normalization.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const SOURCE_DATABASE_PATH = path.join(ROOT, 'public/data/woods.generated.en.json');
const SOURCE_MANIFEST_PATH = path.join(ROOT, 'data/i18n/source.en.json');
const CATALOG_DIRECTORY = path.join(ROOT, 'data/i18n/translations');
const CONTENT_DIRECTORY = path.join(ROOT, 'public/data/content');

const LOCALES = [
  'ar',
  'bn',
  'de',
  'es',
  'hi',
  'id',
  'it',
  'ja',
  'ko',
  'pt',
  'ru',
  'tr',
  'ur',
  'vi',
  'zh-Hans',
];
const EXPECTED_UNIT_COUNT = 5_838;
const EXPECTED_RECORD_COUNT = 728;
const EXPECTED_CONTEXT_COUNT = 37_416;
const EXPECTED_DRY_WOOD_BORER_VALUES = new Set([
  'class d - durable',
  'class d - durable (heartwood durable but sapwood not clearly demarcated)',
  'class d - durable (sapwood demarcated, risk limited to sapwood)',
  'class s - susceptible (risk in all the wood)',
]);
const EXPECTED_TREATABILITY_VALUES = new Set([
  'class 1 - easily permeable',
  'class 1-2 - moderately to easily permeable',
  'class 2 - moderately permeable',
  'class 2-3 - poorly to moderately permeable',
  'class 3 - poorly permeable',
  'class 3-4 - poorly or not permeable',
  'class 4 - not permeable',
]);
const OVERLAY_KEYS = new Set([
  'schemaVersion',
  'locale',
  'sourceLanguage',
  'sourceGeneratedAt',
  'records',
]);

const FIXED_OVERLAY_PATHS = new Set([
  'identity.primaryName',
  'identity.displayName',
  'identity.commercialRestrictions.value',
  'origin.continent',
  'cites.raw',
  'log.sapwoodThickness.value',
  'log.floats.value',
  'log.durability.value',
  'physics.stability.value',
  'fireSafety.frenchGrading',
  'fireSafety.euroclass.value',
  'fireSafety.notes',
]);

const INDEXED_OVERLAY_PATHS = [
  /^identity\.localNames\.\d+\.country$/,
  /^identity\.notes\.\d+$/,
  /^origin\.countries\.\d+$/,
  /^log\.notes\.\d+$/,
  /^appearance\.(?:colourReference|sapwood|texture|grain|interlockedGrain)\.value$/,
  /^appearance\.notes\.\d+$/,
  /^physics\.notes\.\d+$/,
  /^durability\.(?:fungi|dryWoodBorers|termites|treatability|sapwoodTreatability|naturalUseClass|coversUseClass5)\.value$/,
  /^durability\.preservativeTreatment\.(?:dryWoodBorer|temporaryHumidification|permanentHumidification)\.value$/,
  /^durability\.preservativeTreatment\.notes\.\d+$/,
  /^durability\.notes\.\d+$/,
  /^drying\.(?:rate|distortionRisk|casehardeningRisk|checkingRisk|collapseRisk)\.value$/,
  /^drying\.notes\.\d+$/,
  /^drying\.schedule\.\d+\.(?:phase|durationHours|moistureContent|temperatureC|wetBulbTemperatureC|relativeHumidityPercent|uglPercent)$/,
  /^drying\.scheduleNotes\.\d+$/,
  /^machining\.(?:bluntingEffect|sawteethRecommended|cuttingTools|peeling|slicing)\.value$/,
  /^machining\.notes\.\d+$/,
  /^assembly\.(?:nailingAndScrewing|gluing)\.value$/,
  /^assembly\.notes\.\d+$/,
  /^grading\.(?:appearance|structural)$/,
  /^endUses\.\d+$/,
  /^endUseNotes\.\d+$/,
  /^images\.\d+\.alt$/,
];

const NUMERIC_MEASURE_PATHS = [
  'log.diameterCm',
  'physics.specificGravity',
  'physics.monninHardness',
  'physics.jankaHardness',
  'physics.volumetricShrinkageCoefficient',
  'physics.totalTangentialShrinkage',
  'physics.totalRadialShrinkage',
  'physics.shrinkageRatio',
  'physics.fibreSaturationPoint',
  'physics.thermalConductivity',
  'physics.lowerHeatingValue',
  'physics.crushingStrength',
  'physics.staticBendingStrength',
  'physics.modulusOfElasticity',
];

const sourceDatabaseText = await readRequiredText(SOURCE_DATABASE_PATH);
const sourceManifestText = await readRequiredText(SOURCE_MANIFEST_PATH);
const sourceDatabase = parseJson(sourceDatabaseText, SOURCE_DATABASE_PATH);
const manifest = parseJson(sourceManifestText, SOURCE_MANIFEST_PATH);

validateSourceAndManifest(sourceDatabaseText, sourceDatabase, manifest);
const manifestIndex = buildManifestIndex(sourceDatabase, manifest);
const sourceDatabaseSnapshot = JSON.stringify(sourceDatabase);
const protectedSourceSnapshot = protectedSnapshot(sourceDatabase);

let passed = 0;
const failures = [];

for (const locale of LOCALES) {
  try {
    const result = await smokeLocale(
      locale,
      sourceDatabase,
      manifest,
      manifestIndex,
      protectedSourceSnapshot,
    );
    passed += 1;
    console.log(
      `[${locale}] PASS ${formatNumber(result.units)} units, ${formatNumber(result.contexts)} contexts, ${formatNumber(result.records)} woods, ${formatNumber(result.regeneratedSearchTexts)} search indexes`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push({ locale, message });
    console.error(`[${locale}] FAIL ${message}`);
  }
}

if (JSON.stringify(sourceDatabase) !== sourceDatabaseSnapshot) {
  failures.push({ locale: 'source', message: 'the in-memory English source database was mutated' });
  console.error('[source] FAIL the in-memory English source database was mutated');
}
const sourceDatabaseTextAfter = await readRequiredText(SOURCE_DATABASE_PATH);
if (sha256(sourceDatabaseTextAfter) !== manifest.sourceDatabaseHash) {
  failures.push({
    locale: 'source',
    message: 'the English source database changed while smoke tests were running',
  });
  console.error('[source] FAIL the English source database changed while smoke tests were running');
}

console.log(`Content i18n smoke: ${passed}/${LOCALES.length} locales passed.`);
if (failures.length > 0) {
  console.error(
    `Content i18n smoke failed for ${failures.map(({ locale }) => locale).join(', ')}.`,
  );
  process.exitCode = 1;
}

async function smokeLocale(locale, database, source, index, protectedSnapshotBefore) {
  const catalogPath = path.join(CATALOG_DIRECTORY, `${locale}.json`);
  const overlayPath = path.join(CONTENT_DIRECTORY, `${locale}.json`);
  const catalog = await readJsonForLocale(catalogPath, locale, 'catalog');
  const overlay = await readJsonForLocale(overlayPath, locale, 'compiled overlay');

  validateCatalog(locale, catalog, source, index.unitIds);
  validateOverlay(locale, overlay, catalog, database, source, index);

  const localized = applyOverlay(database, overlay);
  validateNormalizedCategories(localized.records, locale);
  const protectedSnapshotAfter = protectedSnapshot(localized);
  if (protectedSnapshotAfter !== protectedSnapshotBefore) {
    throw new Error('applying the overlay changes protected scientific/source fields');
  }
  if (JSON.stringify(localized.source) !== JSON.stringify(database.source)) {
    throw new Error('applying the overlay changes database source metadata');
  }

  let changedSearchTexts = 0;
  const sourceById = new Map(database.records.map((record) => [record.id, record]));
  for (const record of localized.records) {
    const generated = buildWoodSearchText(record, localized.taxonomy, locale);
    if (typeof generated !== 'string' || !generated.trim()) {
      throw new Error(`cannot regenerate a non-empty searchText for ${record.id}`);
    }
    if (generated !== buildWoodSearchText(record, localized.taxonomy, locale)) {
      throw new Error(`searchText regeneration is not deterministic for ${record.id}`);
    }
    record.searchText = generated;
    if (generated !== sourceById.get(record.id)?.searchText) changedSearchTexts += 1;
  }
  if (changedSearchTexts === 0)
    throw new Error('localized searchText regeneration did not change any record');

  return {
    units: Object.keys(catalog.translations).length,
    contexts: index.contextCount,
    records: Object.keys(overlay.records).length,
    regeneratedSearchTexts: localized.records.length,
  };
}

function validateSourceAndManifest(databaseText, database, source) {
  if (!isPlainObject(database) || !Array.isArray(database.records)) {
    throw new Error('English source database does not contain a records array');
  }
  if (database.language !== 'en') throw new Error('English source database language must be en');
  if (database.records.length !== EXPECTED_RECORD_COUNT) {
    throw new Error(
      `English source database has ${database.records.length} records; expected ${EXPECTED_RECORD_COUNT}`,
    );
  }
  if (
    !isPlainObject(source) ||
    source.schemaVersion !== 1 ||
    source.sourceLanguage !== 'en' ||
    !Array.isArray(source.units)
  ) {
    throw new Error('source manifest schema is invalid');
  }
  if (source.unitCount !== EXPECTED_UNIT_COUNT || source.units.length !== EXPECTED_UNIT_COUNT) {
    throw new Error(
      `source manifest has ${source.units.length} units; expected ${EXPECTED_UNIT_COUNT}`,
    );
  }
  if (source.recordCount !== EXPECTED_RECORD_COUNT) {
    throw new Error(
      `source manifest has ${source.recordCount} records; expected ${EXPECTED_RECORD_COUNT}`,
    );
  }
  if (source.contextCount !== EXPECTED_CONTEXT_COUNT) {
    throw new Error(
      `source manifest has ${source.contextCount} contexts; expected ${EXPECTED_CONTEXT_COUNT}`,
    );
  }
  if (source.sourceGeneratedAt !== database.generatedAt) {
    throw new Error('source manifest generatedAt does not match the English source database');
  }
  if (source.sourceDatabaseHash !== sha256(databaseText)) {
    throw new Error('English source database hash differs from the source manifest');
  }
  const expectedManifestHash = sha256(
    stableJson({
      schemaVersion: source.schemaVersion,
      sourceLanguage: source.sourceLanguage,
      units: source.units,
    }),
  );
  if (source.manifestHash !== expectedManifestHash)
    throw new Error('source manifest hash is invalid');

  const woodIds = database.records.map((record) => record.id);
  if (
    new Set(woodIds).size !== EXPECTED_RECORD_COUNT ||
    woodIds.some((id) => typeof id !== 'string' || !id)
  ) {
    throw new Error('English source database has empty or duplicate wood ids');
  }
  validateNormalizedCategories(database.records, 'en');
  validateCanonicalDurabilityValues(database.records);
}

function validateNormalizedCategories(records, locale) {
  for (const record of records) {
    for (const [recordPath, value] of categoryEntries(record)) {
      if (typeof value !== 'string') continue;
      if (value !== normalizeCategoryText(value, locale)) {
        throw new Error(`${record.id}:${recordPath} is not normalized lowercase for ${locale}`);
      }
    }
  }
}

function validateCanonicalDurabilityValues(records) {
  const dryWoodBorerValues = new Set(
    records.map((record) => record.durability.dryWoodBorers.value).filter(Boolean),
  );
  if (
    dryWoodBorerValues.size !== EXPECTED_DRY_WOOD_BORER_VALUES.size ||
    [...dryWoodBorerValues].some((value) => !EXPECTED_DRY_WOOD_BORER_VALUES.has(value))
  ) {
    throw new Error(
      `dry-wood-borer categories are not canonical: ${[...dryWoodBorerValues].join(' | ')}`,
    );
  }

  const treatabilityValues = new Set(
    records
      .flatMap((record) => [
        record.durability.treatability.value,
        record.durability.sapwoodTreatability.value,
      ])
      .filter(Boolean),
  );
  if (
    treatabilityValues.size !== EXPECTED_TREATABILITY_VALUES.size ||
    [...treatabilityValues].some((value) => !EXPECTED_TREATABILITY_VALUES.has(value))
  ) {
    throw new Error(
      `treatability categories are not canonical: ${[...treatabilityValues].join(' | ')}`,
    );
  }

  const naturalUseClassValues = new Set(
    records.map((record) => record.durability.naturalUseClass.value).filter(Boolean),
  );
  if (
    naturalUseClassValues.size !== 15 ||
    [...naturalUseClassValues].some((value) => !value.startsWith('class '))
  ) {
    throw new Error(
      `natural-use-class categories are not canonical: ${[...naturalUseClassValues].join(' | ')}`,
    );
  }
}

function buildManifestIndex(database, source) {
  const recordsById = new Map(database.records.map((record) => [record.id, record]));
  const unitIds = new Set();
  const contextsByWood = new Map(database.records.map((record) => [record.id, new Map()]));
  let contextCount = 0;

  for (const unit of source.units) {
    if (
      !isPlainObject(unit) ||
      typeof unit.id !== 'string' ||
      !unit.id ||
      typeof unit.source !== 'string' ||
      !Array.isArray(unit.contexts)
    ) {
      throw new Error('source manifest contains an invalid unit');
    }
    if (unitIds.has(unit.id)) throw new Error(`source manifest contains duplicate unit ${unit.id}`);
    unitIds.add(unit.id);
    for (const context of unit.contexts) {
      const record = recordsById.get(context?.woodId);
      if (!record)
        throw new Error(`source manifest references unknown wood ${String(context?.woodId)}`);
      if (typeof context.path !== 'string' || !isAllowedOverlayPath(context.path)) {
        throw new Error(`source manifest contains disallowed path ${String(context.path)}`);
      }
      const contexts = contextsByWood.get(context.woodId);
      if (contexts.has(context.path))
        throw new Error(`source manifest repeats ${context.woodId}:${context.path}`);
      if (getAtPath(record, context.path) !== unit.source) {
        throw new Error(
          `source manifest value differs from English data at ${context.woodId}:${context.path}`,
        );
      }
      contexts.set(context.path, unit.id);
      contextCount += 1;
    }
  }

  if (contextCount !== EXPECTED_CONTEXT_COUNT) {
    throw new Error(
      `source manifest expands to ${contextCount} contexts; expected ${EXPECTED_CONTEXT_COUNT}`,
    );
  }
  return { unitIds, contextsByWood, contextCount };
}

function validateCatalog(locale, catalog, source, expectedUnitIds) {
  if (!isPlainObject(catalog)) throw new Error('catalog must be an object');
  if (catalog.schemaVersion !== 1) throw new Error('catalog schemaVersion must be 1');
  if (catalog.locale !== locale) throw new Error(`catalog locale is ${String(catalog.locale)}`);
  if (catalog.sourceLanguage !== 'en') throw new Error('catalog sourceLanguage must be en');
  if (catalog.sourceManifestHash !== source.manifestHash)
    throw new Error('catalog sourceManifestHash is stale');
  if (!isPlainObject(catalog.translations))
    throw new Error('catalog translations must be an object');

  const actualIds = Object.keys(catalog.translations);
  if (actualIds.length !== EXPECTED_UNIT_COUNT) {
    throw new Error(
      `catalog has ${actualIds.length} translations; expected ${EXPECTED_UNIT_COUNT}`,
    );
  }
  const missing = [...expectedUnitIds].filter((id) => !Object.hasOwn(catalog.translations, id));
  const extra = actualIds.filter((id) => !expectedUnitIds.has(id));
  if (missing.length || extra.length) {
    throw new Error(`catalog coverage differs (${missing.length} missing, ${extra.length} extra)`);
  }
  for (const id of actualIds) {
    const value = catalog.translations[id];
    if (typeof value !== 'string' || !value.trim())
      throw new Error(`catalog translation ${id} is empty or non-textual`);
  }
}

function validateOverlay(locale, overlay, catalog, database, source, index) {
  if (!isPlainObject(overlay)) throw new Error('compiled overlay must be an object');
  const unknownTopLevel = Object.keys(overlay).filter((key) => !OVERLAY_KEYS.has(key));
  const missingTopLevel = [...OVERLAY_KEYS].filter((key) => !Object.hasOwn(overlay, key));
  if (unknownTopLevel.length || missingTopLevel.length) {
    throw new Error(
      `compiled overlay schema differs (${missingTopLevel.length} missing properties, ${unknownTopLevel.length} unknown properties)`,
    );
  }
  if (overlay.schemaVersion !== 1) throw new Error('compiled overlay schemaVersion must be 1');
  if (overlay.locale !== locale)
    throw new Error(`compiled overlay locale is ${String(overlay.locale)}`);
  if (overlay.sourceLanguage !== 'en')
    throw new Error('compiled overlay sourceLanguage must be en');
  if (
    overlay.sourceGeneratedAt !== source.sourceGeneratedAt ||
    overlay.sourceGeneratedAt !== database.generatedAt
  ) {
    throw new Error('compiled overlay sourceGeneratedAt is stale');
  }
  if (!isPlainObject(overlay.records))
    throw new Error('compiled overlay records must be an object');

  const knownWoodIds = new Set(database.records.map((record) => record.id));
  const overlayWoodIds = Object.keys(overlay.records);
  const missingWoods = [...knownWoodIds].filter((id) => !Object.hasOwn(overlay.records, id));
  const unknownWoods = overlayWoodIds.filter((id) => !knownWoodIds.has(id));
  if (
    overlayWoodIds.length !== EXPECTED_RECORD_COUNT ||
    missingWoods.length ||
    unknownWoods.length
  ) {
    throw new Error(
      `compiled overlay wood coverage differs (${overlayWoodIds.length}/${EXPECTED_RECORD_COUNT}, ${missingWoods.length} missing, ${unknownWoods.length} unknown)`,
    );
  }

  let valueCount = 0;
  for (const woodId of overlayWoodIds) {
    const values = overlay.records[woodId];
    if (!isPlainObject(values)) throw new Error(`compiled values for ${woodId} must be an object`);
    const expectedContexts = index.contextsByWood.get(woodId);
    for (const [contextPath, value] of Object.entries(values)) {
      valueCount += 1;
      if (!isAllowedOverlayPath(contextPath))
        throw new Error(`compiled overlay contains disallowed path ${woodId}:${contextPath}`);
      const unitId = expectedContexts.get(contextPath);
      if (!unitId)
        throw new Error(`compiled overlay contains unexpected path ${woodId}:${contextPath}`);
      if (value !== catalog.translations[unitId]) {
        throw new Error(
          `compiled value differs from catalog at ${woodId}:${contextPath} (${unitId})`,
        );
      }
    }
    for (const [contextPath, unitId] of expectedContexts) {
      if (!Object.hasOwn(values, contextPath))
        throw new Error(`compiled overlay is missing ${woodId}:${contextPath} (${unitId})`);
    }
  }
  if (valueCount !== EXPECTED_CONTEXT_COUNT) {
    throw new Error(
      `compiled overlay has ${valueCount} values; expected ${EXPECTED_CONTEXT_COUNT}`,
    );
  }
}

function applyOverlay(database, overlay) {
  const localized = structuredClone(database);
  const recordsById = new Map(localized.records.map((record) => [record.id, record]));
  for (const [woodId, values] of Object.entries(overlay.records)) {
    const record = recordsById.get(woodId);
    if (!record) throw new Error(`compiled overlay references unknown wood ${woodId}`);
    for (const [contextPath, value] of Object.entries(values))
      setAtPath(record, contextPath, value);
  }
  return localized;
}

function protectedSnapshot(database) {
  return JSON.stringify({
    source: database.source,
    taxonomy: database.taxonomy,
    records: database.records.map((record) => ({
      id: record.id,
      numericMeasures: Object.fromEntries(
        NUMERIC_MEASURE_PATHS.map((measurePath) => [measurePath, getAtPath(record, measurePath)]),
      ),
      botanicalNames: record.identity.botanicalNames,
      taxonomyId: record.identity.taxonomyId,
      source: record.source,
      rawSections: record.rawSections,
      extraction: record.extraction,
      localVernacularNames: record.identity.localNames.map(({ name }) => name),
      canonicalRegion: record.origin.region,
      continentCodes: record.origin.continentCodes,
      countryCodes: record.origin.countryCodes,
    })),
  });
}

function buildWoodSearchText(record, taxonomy, locale) {
  const nodesById = new Map(taxonomy.map((node) => [node.id, node]));
  const taxonomyNames = [];
  const visited = new Set();
  let node = nodesById.get(record.identity.taxonomyId);
  while (node && !visited.has(node.id)) {
    visited.add(node.id);
    taxonomyNames.push(node.name);
    node = node.parentId === null ? null : nodesById.get(node.parentId);
  }
  const continentRegionCodes = {
    AF: '002',
    AN: '010',
    AS: '142',
    EU: '150',
    NA: '003',
    OC: '009',
    SA: '005',
  };
  let displayNames;
  try {
    displayNames = new Intl.DisplayNames([locale], { type: 'region', fallback: 'code' });
  } catch {
    displayNames = null;
  }
  return [
    record.identity.displayName,
    record.identity.primaryName,
    ...record.identity.aliases,
    ...taxonomyNames,
    ...record.identity.botanicalNames.map((item) => item.name),
    ...record.identity.localNames.flatMap((item) => [item.country, item.name]),
    record.identity.commercialRestrictions.value,
    ...record.identity.notes,
    record.origin.region,
    ...record.origin.continentCodes,
    ...record.origin.continentCodes.map(
      (code) => displayNames?.of(continentRegionCodes[code]) ?? code,
    ),
    ...record.origin.countryCodes,
    ...record.origin.countryCodes.map((code) => displayNames?.of(code) ?? code),
    record.cites.raw,
    record.log.sapwoodThickness.value,
    record.log.floats.value,
    record.log.durability.value,
    ...record.log.notes,
    record.appearance.colourReference.value,
    record.appearance.sapwood.value,
    record.appearance.texture.value,
    record.appearance.grain.value,
    record.appearance.interlockedGrain.value,
    ...record.appearance.notes,
    record.physics.stability.value,
    ...record.physics.notes,
    record.durability.fungi.value,
    record.durability.dryWoodBorers.value,
    record.durability.termites.value,
    record.durability.treatability.value,
    record.durability.sapwoodTreatability.value,
    record.durability.naturalUseClass.value,
    record.durability.coversUseClass5.value,
    ...record.durability.notes,
    record.durability.preservativeTreatment.dryWoodBorer.value,
    record.durability.preservativeTreatment.temporaryHumidification.value,
    record.durability.preservativeTreatment.permanentHumidification.value,
    ...record.durability.preservativeTreatment.notes,
    record.drying.rate.value,
    record.drying.distortionRisk.value,
    record.drying.casehardeningRisk.value,
    record.drying.checkingRisk.value,
    record.drying.collapseRisk.value,
    ...record.drying.notes,
    ...record.drying.schedule.flatMap((row) => [
      row.phase,
      row.durationHours,
      row.moistureContent,
      row.temperatureC,
      row.wetBulbTemperatureC,
      row.relativeHumidityPercent,
      row.uglPercent,
    ]),
    ...record.drying.scheduleNotes,
    record.machining.bluntingEffect.value,
    record.machining.sawteethRecommended.value,
    record.machining.cuttingTools.value,
    record.machining.peeling.value,
    record.machining.slicing.value,
    ...record.machining.notes,
    record.assembly.nailingAndScrewing.value,
    record.assembly.gluing.value,
    ...record.assembly.notes,
    record.grading.appearance,
    record.grading.structural,
    record.fireSafety.frenchGrading,
    record.fireSafety.euroclass.value,
    record.fireSafety.notes,
    ...record.endUses,
    ...record.endUseNotes,
    ...record.images.map((image) => image.alt),
  ]
    .filter((value) => Boolean(value))
    .join(' ')
    .toLocaleLowerCase();
}

function isAllowedOverlayPath(contextPath) {
  return (
    FIXED_OVERLAY_PATHS.has(contextPath) ||
    INDEXED_OVERLAY_PATHS.some((pattern) => pattern.test(contextPath))
  );
}

function getAtPath(value, dottedPath) {
  return dottedPath.split('.').reduce((current, key) => current?.[key], value);
}

function setAtPath(value, dottedPath, translated) {
  const segments = dottedPath.split('.');
  let current = value;
  for (const segment of segments.slice(0, -1)) {
    if (
      (typeof current !== 'object' && !Array.isArray(current)) ||
      current === null ||
      !Object.hasOwn(current, segment)
    ) {
      throw new Error(`compiled path does not exist in source data: ${dottedPath}`);
    }
    current = current[segment];
  }
  const finalSegment = segments.at(-1);
  if (
    !finalSegment ||
    (typeof current !== 'object' && !Array.isArray(current)) ||
    current === null ||
    !Object.hasOwn(current, finalSegment)
  ) {
    throw new Error(`compiled path does not exist in source data: ${dottedPath}`);
  }
  if (typeof current[finalSegment] !== 'string' && current[finalSegment] !== null) {
    throw new Error(`compiled path is not textual in source data: ${dottedPath}`);
  }
  current[finalSegment] = translated;
}

async function readJsonForLocale(filePath, locale, kind) {
  let text;
  try {
    text = await readFile(filePath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error(`missing ${kind}: ${relative(filePath)}`);
    throw error;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(
      `invalid JSON in ${kind} ${relative(filePath)}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function readRequiredText(filePath) {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error(`missing required file ${relative(filePath)}`);
    throw error;
  }
}

function parseJson(text, filePath) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(
      `invalid JSON in ${relative(filePath)}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortDeep(value[key])]),
  );
}

function stableJson(value) {
  return JSON.stringify(sortDeep(value));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function relative(filePath) {
  return path.relative(ROOT, filePath) || '.';
}

function formatNumber(value) {
  return value.toLocaleString('en');
}
