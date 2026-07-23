#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, open, readFile, readdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  CATEGORICAL_VALUE_SCOPES,
  isRemovedSourceCategory,
  normalizeCategoryText,
  normalizedCategorySourceKey,
} from './category-normalization.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const SOURCE_DATABASE = path.join(ROOT, 'public/data/woods.generated.en.json');
const I18N_DIRECTORY = path.join(ROOT, 'data/i18n');
const CATALOG_DIRECTORY = path.join(I18N_DIRECTORY, 'translations');
const SOURCE_MANIFEST = path.join(I18N_DIRECTORY, 'source.en.json');
const MANUAL_TRANSLATIONS = path.join(ROOT, 'data/manual/content-translations.json');
const MANUAL_TRANSLATION_DIRECTORY = path.join(ROOT, 'data/manual/content-translations');
const CONTENT_DIRECTORY = path.join(ROOT, 'public/data/content');
const SCHEMA_VERSION = 1;

const TEXT_VALUE_PATHS = [
  'identity.commercialRestrictions',
  'log.sapwoodThickness',
  'log.floats',
  'log.durability',
  'appearance.colourReference',
  'appearance.sapwood',
  'appearance.texture',
  'appearance.grain',
  'appearance.interlockedGrain',
  'physics.stability',
  'durability.fungi',
  'durability.dryWoodBorers',
  'durability.termites',
  'durability.treatability',
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
  'assembly.nailingAndScrewing',
  'assembly.gluing',
];

const NOTE_ARRAY_PATHS = [
  'identity.notes',
  'log.notes',
  'appearance.notes',
  'physics.notes',
  'durability.notes',
  'durability.preservativeTreatment.notes',
  'drying.notes',
  'drying.scheduleNotes',
  'machining.notes',
  'assembly.notes',
  'endUseNotes',
];

const DIRECT_TEXT_PATHS = [
  'identity.primaryName',
  'identity.displayName',
  'cites.raw',
  'origin.continent',
  'grading.appearance',
  'grading.structural',
  'fireSafety.frenchGrading',
  'fireSafety.notes',
];

const ARRAY_TEXT_PATHS = ['origin.countries', 'endUses'];

const SCHEDULE_CELL_PATHS = [
  'durationHours',
  'moistureContent',
  'temperatureC',
  'wetBulbTemperatureC',
  'relativeHumidityPercent',
  'uglPercent',
];

const command = process.argv[2];
const commandArguments = process.argv.slice(3).filter((argument) => argument !== '--');

try {
  if (command === 'extract') {
    await extractSourceManifest();
  } else if (command === 'validate') {
    await validateCommand(commandArguments);
  } else if (command === 'compile') {
    await compileCommand(commandArguments);
  } else {
    usage(command ? `Unknown command: ${command}` : undefined);
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`content-i18n: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}

async function extractSourceManifest() {
  const previousManifest = await readOptionalJsonFile(SOURCE_MANIFEST);
  const databaseText = await readFile(SOURCE_DATABASE, 'utf8');
  const database = parseJson(databaseText, relative(SOURCE_DATABASE));
  if (!Array.isArray(database.records)) {
    throw new Error(`${relative(SOURCE_DATABASE)} does not contain a records array`);
  }

  const unitsById = new Map();
  const woodIds = new Set();

  for (const wood of [...database.records].sort((left, right) => compareText(left.id, right.id))) {
    if (typeof wood.id !== 'string' || !wood.id)
      throw new Error('Every source record must have a non-empty id');
    if (woodIds.has(wood.id)) throw new Error(`Duplicate wood id: ${wood.id}`);
    woodIds.add(wood.id);
    extractWood(wood, unitsById);
  }

  const units = [...unitsById.values()]
    .map((unit) => ({
      ...unit,
      contexts: unit.contexts.sort(compareContext),
    }))
    .sort(
      (left, right) =>
        compareText(left.scope, right.scope) ||
        compareText(left.source, right.source) ||
        compareText(left.id, right.id),
    );

  const contextCount = units.reduce((total, unit) => total + unit.contexts.length, 0);
  const hashPayload = { schemaVersion: SCHEMA_VERSION, sourceLanguage: 'en', units };
  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    sourceLanguage: 'en',
    sourceDatabase: relative(SOURCE_DATABASE),
    sourceDatabaseHash: sha256(databaseText),
    sourceGeneratedAt: database.generatedAt,
    manifestHash: sha256(stableJson(hashPayload, false)),
    recordCount: woodIds.size,
    unitCount: units.length,
    contextCount,
    units,
  };

  const manualTranslations = await readManualTranslationSeeds();
  const rebasedCatalogs = await planCatalogRebases(previousManifest, manifest, manualTranslations);
  await atomicWriteJson(SOURCE_MANIFEST, manifest);
  for (const { catalogPath, catalog } of rebasedCatalogs) {
    await atomicWriteJson(catalogPath, catalog, false);
  }
  console.log(
    `Extracted ${units.length.toLocaleString('en')} units across ${contextCount.toLocaleString('en')} contexts from ${woodIds.size.toLocaleString('en')} woods.`,
  );
  console.log(`Source manifest: ${relative(SOURCE_MANIFEST)} (${manifest.manifestHash})`);
  if (rebasedCatalogs.length > 0) {
    console.log(`Rebased and normalized ${rebasedCatalogs.length} locale catalogs.`);
  }
}

async function planCatalogRebases(previousManifest, nextManifest, manualTranslations) {
  if (!previousManifest) return [];

  const catalogPaths = await resolveCatalogs([]);
  const previousById = new Map(previousManifest.units.map((unit) => [unit.id, unit]));
  const previousCategories = Map.groupBy(
    previousManifest.units.filter((unit) => CATEGORICAL_VALUE_SCOPES.has(unit.scope)),
    (unit) => categoryKey(unit.scope, unit.source),
  );
  const previousByContext = Map.groupBy(previousManifest.units, unitContextKey);
  const nextWoodIds = new Set(
    nextManifest.units.flatMap((unit) => unit.contexts.map((context) => context.woodId)),
  );
  const plans = [];

  for (const catalogPath of catalogPaths) {
    const catalog = await readJsonFile(catalogPath);
    const locale = catalog.locale;
    assertLocale(locale);
    if (catalog.sourceManifestHash !== previousManifest.manifestHash) {
      throw new Error(
        `${locale}: cannot rebase a catalog that does not match the previous source manifest`,
      );
    }

    const translations = {};
    const consumedIds = new Set();
    for (const unit of nextManifest.units) {
      const isCategory = CATEGORICAL_VALUE_SCOPES.has(unit.scope);
      const manualUnitTranslations = manualTranslations.get(`${unit.scope}\u0000${unit.source}`);
      const candidates = isCategory
        ? (previousCategories.get(categoryKey(unit.scope, unit.source)) ?? [])
        : previousById.has(unit.id)
          ? [previousById.get(unit.id)]
          : manualUnitTranslations
            ? (previousByContext.get(unitContextKey(unit)) ?? [])
            : [];
      for (const candidate of candidates) consumedIds.add(candidate.id);
      const preferred = candidates.find((candidate) => candidate.id === unit.id) ?? candidates[0];
      const manualTranslation = manualUnitTranslations?.[locale];
      const translated =
        manualTranslation ??
        catalog.translations?.[preferred?.id] ??
        (isLocaleNeutralUnit(unit) ? unit.source : undefined);
      if (typeof translated !== 'string' || !translated.trim()) {
        const reason = preferred
          ? 'missing translation while rebasing'
          : 'no manual translation for';
        throw new Error(`${locale}: ${reason} ${unit.id} (${unit.scope}: ${unit.source})`);
      }
      translations[unit.id] = isCategory
        ? normalizeCategoryTranslation(unit, translated, locale)
        : translated;
    }

    const unconsumed = Object.keys(catalog.translations ?? {}).filter((id) => {
      if (consumedIds.has(id)) return false;
      const oldUnit = previousById.get(id);
      if (
        oldUnit?.contexts.length > 0 &&
        oldUnit.contexts.every((context) => !nextWoodIds.has(context.woodId))
      ) {
        return false;
      }
      return (
        !oldUnit ||
        (oldUnit.scope !== 'identity.aliases[]' &&
          !isRemovedSourceCategory(oldUnit.scope, oldUnit.source))
      );
    });
    if (unconsumed.length > 0) {
      const sample = unconsumed
        .slice(0, 5)
        .map((id) => {
          const unit = previousById.get(id);
          return unit ? `${unit.scope}: ${unit.source}` : id;
        })
        .join('; ');
      throw new Error(
        `${locale}: cannot automatically discard ${unconsumed.length} unrelated catalog units (${sample})`,
      );
    }

    plans.push({
      catalogPath,
      catalog: {
        ...catalog,
        sourceManifestHash: nextManifest.manifestHash,
        translations,
      },
    });
  }

  return plans;
}

function unitContextKey(unit) {
  const contexts = unit.contexts
    .map((context) => `${context.woodId}\u0000${context.path}`)
    .sort(compareText)
    .join('\u0001');
  return `${unit.scope}\u0000${contexts}`;
}

function isLocaleNeutralUnit(unit) {
  return (
    unit.scope === 'log.sapwoodThickness.value' &&
    /^[\d.\s/–]+cm(?:\s*\/\s*[\d.\s–]+cm)*$/u.test(unit.source)
  );
}

async function readManualTranslationSeeds() {
  const manifestPaths = [MANUAL_TRANSLATIONS];
  try {
    const entries = await readdir(MANUAL_TRANSLATION_DIRECTORY, { withFileTypes: true });
    manifestPaths.push(
      ...entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
        .map((entry) => path.join(MANUAL_TRANSLATION_DIRECTORY, entry.name))
        .sort(compareText),
    );
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  const translations = new Map();
  for (const manifestPath of manifestPaths) {
    const manifest = await readJsonFile(manifestPath);
    if (manifest.schemaVersion !== SCHEMA_VERSION || !Array.isArray(manifest.units)) {
      throw new Error(
        `${relative(manifestPath)} must use schemaVersion ${SCHEMA_VERSION} and contain a units array`,
      );
    }

    for (const [index, unit] of manifest.units.entries()) {
      const label = `${relative(manifestPath)} unit ${index + 1}`;
      if (
        typeof unit?.scope !== 'string' ||
        !unit.scope.trim() ||
        typeof unit.source !== 'string' ||
        !unit.source.trim() ||
        !isPlainObject(unit.translations)
      ) {
        throw new Error(`${label} is invalid`);
      }
      if (isRemovedSourceCategory(unit.scope, unit.source)) continue;
      const source = CATEGORICAL_VALUE_SCOPES.has(unit.scope)
        ? normalizedCategorySourceKey(unit.scope, unit.source)
        : unit.source;
      const normalizedSource = normalizeCategoryText(unit.source, 'en');
      if (
        (unit.scope === 'durability.fungi.value' ||
          unit.scope === 'durability.treatability.value') &&
        normalizedSource !== source
      ) {
        continue;
      }
      const signature = `${unit.scope}\u0000${source}`;
      const priority =
        !CATEGORICAL_VALUE_SCOPES.has(unit.scope) || normalizedSource === source ? 1 : 0;
      const normalizedTranslations = {};
      for (const [locale, translated] of Object.entries(unit.translations)) {
        assertLocale(locale);
        if (typeof translated !== 'string' || !translated.trim()) {
          throw new Error(`${label} has an empty ${locale} translation`);
        }
        normalizedTranslations[locale] = CATEGORICAL_VALUE_SCOPES.has(unit.scope)
          ? normalizeCategoryTranslation({ ...unit, source }, translated, locale)
          : translated;
      }
      const existing = translations.get(signature);
      if (
        existing &&
        stableJson(existing.translations, false) !== stableJson(normalizedTranslations, false)
      ) {
        if (priority > existing.priority) {
          translations.set(signature, { priority, translations: normalizedTranslations });
        } else if (priority === existing.priority) {
          throw new Error(`${label} conflicts with another translation for ${unit.scope}`);
        }
      } else if (existing && priority > existing.priority) {
        translations.set(signature, { priority, translations: normalizedTranslations });
      } else if (!existing) {
        translations.set(signature, { priority, translations: normalizedTranslations });
      }
    }
  }
  return new Map(
    [...translations].map(([signature, { translations: normalizedTranslations }]) => [
      signature,
      normalizedTranslations,
    ]),
  );
}

function categoryKey(scope, source) {
  return `${scope}\u0000${normalizedCategorySourceKey(scope, source)}`;
}

function normalizeCategoryTranslation(unit, translated, locale) {
  if (
    locale === 'it' &&
    unit.scope === 'appearance.grain.value' &&
    unit.source === 'straight to entangled'
  ) {
    return 'da diritta a intricata';
  }
  const normalized = normalizeCategoryText(translated, locale);
  if (
    unit.scope === 'durability.fungi.value' &&
    unit.source === 'class 1-3 - very durable to moderately durable'
  ) {
    return normalized.replace(/\s*[（(][^()（）]*[)）]\s*$/u, '');
  }
  return normalized;
}

function extractWood(wood, unitsById) {
  const add = (scope, recordPath, value) =>
    addUnit(unitsById, scope, value, {
      woodId: wood.id,
      path: recordPath,
    });

  for (const recordPath of DIRECT_TEXT_PATHS)
    add(recordPath, recordPath, getAtPath(wood, recordPath));

  for (const recordPath of TEXT_VALUE_PATHS) {
    add(`${recordPath}.value`, `${recordPath}.value`, getAtPath(wood, `${recordPath}.value`));
  }

  for (const recordPath of ARRAY_TEXT_PATHS) {
    const values = getAtPath(wood, recordPath);
    if (!Array.isArray(values)) continue;
    values.forEach((value, index) => add(`${recordPath}[]`, `${recordPath}.${index}`, value));
  }

  for (const recordPath of NOTE_ARRAY_PATHS) {
    const values = getAtPath(wood, recordPath);
    if (!Array.isArray(values)) continue;
    values.forEach((value, index) => add(`${recordPath}[]`, `${recordPath}.${index}`, value));
  }

  const localNames = wood.identity?.localNames;
  if (Array.isArray(localNames)) {
    localNames.forEach((entry, index) => {
      add('identity.localNames[].country', `identity.localNames.${index}.country`, entry?.country);
    });
  }

  const schedule = wood.drying?.schedule;
  if (Array.isArray(schedule)) {
    schedule.forEach((row, index) => {
      add('drying.schedule[].phase', `drying.schedule.${index}.phase`, row?.phase);
      for (const key of SCHEDULE_CELL_PATHS) {
        const value = row?.[key];
        if (typeof value === 'string' && /\p{L}/u.test(value)) {
          add(`drying.schedule[].${key}`, `drying.schedule.${index}.${key}`, value);
        }
      }
    });
  }

  const images = wood.images;
  if (Array.isArray(images)) {
    images.forEach((image, index) => add('images[].alt', `images.${index}.alt`, image?.alt));
  }
}

function addUnit(unitsById, scope, source, context) {
  if (typeof source !== 'string' || !source.trim()) return;
  const signature = `${scope}\u0000${source}`;
  const id = `u_${sha256(signature)}`;
  const existing = unitsById.get(id);
  if (existing && (existing.scope !== scope || existing.source !== source)) {
    throw new Error(`Unit hash collision for ${id}`);
  }
  if (existing) {
    if (
      !existing.contexts.some(
        (item) => item.woodId === context.woodId && item.path === context.path,
      )
    ) {
      existing.contexts.push(context);
    }
    return;
  }
  unitsById.set(id, {
    id,
    scope,
    source,
    protectedTokens: extractProtectedTokens(source),
    contexts: [context],
  });
}

async function validateCommand(arguments_) {
  const manifest = await readSourceManifest();
  const catalogs = await resolveCatalogs(arguments_);
  if (catalogs.length === 0) throw new Error('No locale catalogs found in data/i18n/translations');
  for (const catalogPath of catalogs) {
    const { catalog, locale } = await readAndValidateCatalog(catalogPath, manifest);
    console.log(
      `Valid ${locale} catalog: ${Object.keys(catalog.translations).length.toLocaleString('en')} units (${relative(catalogPath)})`,
    );
  }
}

async function compileCommand(arguments_) {
  const manifest = await readSourceManifest();
  const catalogs = await resolveCatalogs(arguments_);
  if (catalogs.length === 0) throw new Error('No locale catalogs found in data/i18n/translations');

  for (const catalogPath of catalogs) {
    const { catalog, locale } = await readAndValidateCatalog(catalogPath, manifest);
    const records = {};
    let valueCount = 0;

    for (const unit of manifest.units) {
      const translated = CATEGORICAL_VALUE_SCOPES.has(unit.scope)
        ? normalizeCategoryTranslation(unit, catalog.translations[unit.id], locale)
        : catalog.translations[unit.id];
      for (const context of unit.contexts) {
        const record = (records[context.woodId] ??= {});
        if (Object.hasOwn(record, context.path) && record[context.path] !== translated) {
          throw new Error(
            `${locale}: conflicting translations for ${context.woodId}:${context.path}`,
          );
        }
        record[context.path] = translated;
        valueCount += 1;
      }
    }

    const sortedRecords = Object.fromEntries(
      Object.entries(records)
        .sort(([left], [right]) => compareText(left, right))
        .map(([woodId, overlay]) => [
          woodId,
          Object.fromEntries(
            Object.entries(overlay).sort(([left], [right]) => compareText(left, right)),
          ),
        ]),
    );
    const output = {
      schemaVersion: SCHEMA_VERSION,
      locale,
      sourceLanguage: 'en',
      sourceGeneratedAt: manifest.sourceGeneratedAt,
      records: sortedRecords,
    };
    const outputPath = path.join(CONTENT_DIRECTORY, `${locale}.json`);
    await atomicWriteJson(outputPath, output);
    console.log(
      `Compiled ${locale}: ${valueCount.toLocaleString('en')} values for ${Object.keys(sortedRecords).length.toLocaleString('en')} woods (${relative(outputPath)})`,
    );
  }
}

async function readSourceManifest() {
  const manifest = await readJsonFile(SOURCE_MANIFEST);
  if (
    manifest.schemaVersion !== SCHEMA_VERSION ||
    manifest.sourceLanguage !== 'en' ||
    typeof manifest.sourceGeneratedAt !== 'string' ||
    !Array.isArray(manifest.units)
  ) {
    throw new Error(
      `${relative(SOURCE_MANIFEST)} is not a supported source manifest; run content:extract`,
    );
  }
  const expectedHash = sha256(
    stableJson(
      {
        schemaVersion: manifest.schemaVersion,
        sourceLanguage: manifest.sourceLanguage,
        units: manifest.units,
      },
      false,
    ),
  );
  if (manifest.manifestHash !== expectedHash) {
    throw new Error(
      `${relative(SOURCE_MANIFEST)} has an invalid manifest hash; run content:extract`,
    );
  }
  const currentSource = await readFile(SOURCE_DATABASE, 'utf8');
  if (manifest.sourceDatabaseHash !== sha256(currentSource)) {
    throw new Error(
      `${relative(SOURCE_MANIFEST)} is stale for ${relative(SOURCE_DATABASE)}; run content:extract`,
    );
  }
  return manifest;
}

async function resolveCatalogs(arguments_) {
  if (arguments_.length > 0) {
    return [
      ...new Set(
        arguments_.map((argument) => {
          if (argument.endsWith('.json') || argument.includes('/') || argument.includes('\\')) {
            return path.resolve(process.cwd(), argument);
          }
          assertLocale(argument);
          return path.join(CATALOG_DIRECTORY, `${argument}.json`);
        }),
      ),
    ].sort(compareText);
  }

  let entries;
  try {
    entries = await readdir(CATALOG_DIRECTORY, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
  return entries
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith('.json') &&
        entry.name !== path.basename(SOURCE_MANIFEST),
    )
    .map((entry) => path.join(CATALOG_DIRECTORY, entry.name))
    .sort(compareText);
}

async function readAndValidateCatalog(catalogPath, manifest) {
  const catalog = await readJsonFile(catalogPath);
  const locale = catalog.locale;
  assertLocale(locale);
  if (catalog.schemaVersion !== SCHEMA_VERSION)
    fail(locale, `schemaVersion must be ${SCHEMA_VERSION}`);
  if (catalog.sourceLanguage !== 'en') fail(locale, 'sourceLanguage must be en');
  if (catalog.sourceManifestHash !== manifest.manifestHash) {
    fail(
      locale,
      `sourceManifestHash does not match ${relative(SOURCE_MANIFEST)}; rebase this catalog`,
    );
  }
  if (!isPlainObject(catalog.translations))
    fail(locale, 'translations must be an object keyed by unit id');

  const expectedIds = manifest.units.map((unit) => unit.id);
  const expectedSet = new Set(expectedIds);
  const actualIds = Object.keys(catalog.translations);
  const missing = expectedIds.filter((id) => !Object.hasOwn(catalog.translations, id));
  const extra = actualIds.filter((id) => !expectedSet.has(id));
  if (missing.length || extra.length) {
    fail(
      locale,
      `unit coverage mismatch (${missing.length} missing, ${extra.length} extra)${sampleIds(missing, extra)}`,
    );
  }

  const problems = [];
  for (const unit of manifest.units) {
    const translated = catalog.translations[unit.id];
    if (typeof translated !== 'string' || !translated.trim()) {
      problems.push(`${unit.id}: translation is empty`);
      continue;
    }
    if (
      CATEGORICAL_VALUE_SCOPES.has(unit.scope) &&
      translated !== normalizeCategoryText(translated, locale)
    ) {
      problems.push(`${unit.id}: categorical translation is not normalized lowercase`);
      continue;
    }
    const targetTokens = extractProtectedTokens(translated, unit.protectedTokens);
    if (!sameTokenMultiset(unit.protectedTokens, targetTokens)) {
      problems.push(
        `${unit.id}: protected tokens differ (expected ${formatTokens(unit.protectedTokens)}, received ${formatTokens(targetTokens)})`,
      );
    }
    if (problems.length >= 20) break;
  }
  if (problems.length) fail(locale, `translation validation failed:\n  ${problems.join('\n  ')}`);
  return { catalog, locale };
}

function extractProtectedTokens(text, requiredTokens = []) {
  const occurrences = new Map();
  const collect = (regex, capture = 0, transform = (value) => value) => {
    for (const match of text.matchAll(regex)) {
      const rawToken = match[capture];
      const token = rawToken && transform(rawToken);
      if (!token) continue;
      const relativeIndex = capture === 0 ? 0 : match[0].indexOf(rawToken);
      const start = (match.index ?? 0) + Math.max(0, relativeIndex);
      occurrences.set(`${start}:${start + token.length}:${token}`, token);
    }
  };

  collect(/https?:\/\/[^\s<>"']+/gu, 0, (value) => value.replace(/[),.;:!?]+$/u, ''));
  collect(
    /\b(?:NF(?:\s+NF)?\s+(?:EN|[A-Z])|FD\s+[A-Z]|UNE|BS(?:\s+EN)?|EN|ISO|ASTM|DIN)\s*\d+(?:[.-]\d+)*(?:\s+\d+)*(?:[+/]A\d+)?(?::\d+)?(?:\s+A\d+)?\b/gu,
  );
  collect(/\b(?:CITES|ATIBT|FAS|UGL|RH|MC|CSTB|NHLA|NLGA|HSR|STI|XX)\b/gu);
  collect(/\b[A-Z]\d+(?:-[a-z]\d+)?(?:,\s*d\d+)?\b/gu);
  collect(/\b(?=[A-Z0-9/-]*\d)[A-Z][A-Z0-9]*(?:[-/][A-Z0-9]+)+\b/gu);
  collect(/\b[CFQ]-[A-Z][A-Z0-9]*\b/gu);
  collect(/\bClass\s+([A-Z])\b/gu, 1);
  collect(
    /(?:°C|MPa|N\/mm(?:²|2)?|kJ\/kg|W\/\(m[.]K\)|kg\/m(?:³|3)|\b(?:mm|cm|m³|m3|kg|kW)\b|%)/gu,
  );
  collect(/(?<![\p{L}\p{N}])\d+(?:[.,]\d+)*(?![\p{L}\p{N}])/gu);

  // Some scripts naturally place a required numeric value directly beside
  // letters (for example, Japanese "収縮率4.5%"). Find only numbers already
  // required by the source here so translated prose such as "one fourth"
  // written with digits does not become a new protected token.
  for (const token of new Set(requiredTokens)) {
    if (!/^\d+(?:[.,]\d+)*$/u.test(token)) continue;
    const expectedCount = requiredTokens.filter(
      (requiredToken) => canonicalProtectedToken(requiredToken) === canonicalProtectedToken(token),
    ).length;
    const collectedCount = [...occurrences.values()].filter(
      (collectedToken) =>
        canonicalProtectedToken(collectedToken) === canonicalProtectedToken(token),
    ).length;
    let missingCount = expectedCount - collectedCount;
    if (missingCount <= 0) continue;

    const localizedTokenPattern = token.replace(/[.,]/gu, '[.,]');
    const pattern = new RegExp(`(?<![A-Za-z\\d.,])${localizedTokenPattern}(?![A-Za-z\\d.,])`, 'gu');
    for (const match of text.matchAll(pattern)) {
      const translatedToken = match[0];
      const start = match.index ?? 0;
      const end = start + translatedToken.length;
      const occurrenceKey = `${start}:${end}:${translatedToken}`;
      if (occurrences.has(occurrenceKey)) continue;

      for (const [key, collectedToken] of occurrences) {
        if (!/^\d+(?:[.,]\d+)*$/u.test(collectedToken)) continue;
        const [collectedStart, collectedEnd] = key.split(':', 2).map(Number);
        if (collectedStart >= start && collectedEnd <= end) occurrences.delete(key);
      }
      occurrences.set(occurrenceKey, translatedToken);
      missingCount -= 1;
      if (missingCount === 0) break;
    }
  }

  // A class letter is language-independent, but the word introducing it is
  // translated (Class, Klasse, classe, クラス, فئة, …). When validating a
  // translation, preserve required single-letter class tokens without making
  // the extractor depend on every target language's spelling of “class”.
  for (const token of requiredTokens) {
    if (!/^[A-Z]$/u.test(token)) continue;
    const pattern = new RegExp(`(?<![A-Z])${token}(?![A-Z])`, 'gu');
    collect(pattern);
  }

  return [...occurrences.entries()]
    .sort(([left], [right]) => {
      const leftStart = Number(left.split(':', 1)[0]);
      const rightStart = Number(right.split(':', 1)[0]);
      return leftStart - rightStart || compareText(left, right);
    })
    .map(([, token]) => token);
}

function getAtPath(value, dottedPath) {
  return dottedPath.split('.').reduce((current, key) => current?.[key], value);
}

function compareContext(left, right) {
  return compareText(left.woodId, right.woodId) || compareText(left.path, right.path);
}

function compareText(left, right) {
  const leftText = String(left);
  const rightText = String(right);
  return leftText < rightText ? -1 : leftText > rightText ? 1 : 0;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort(compareText)
      .map((key) => [key, sortDeep(value[key])]),
  );
}

function stableJson(value, pretty = true) {
  return `${JSON.stringify(sortDeep(value), null, pretty ? 2 : undefined)}${pretty ? '\n' : ''}`;
}

async function atomicWriteJson(filePath, value, sortKeys = true) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`,
  );
  let handle;
  try {
    handle = await open(temporaryPath, 'wx', 0o644);
    const contents = sortKeys ? stableJson(value) : `${JSON.stringify(value, null, 2)}\n`;
    await handle.writeFile(contents, 'utf8');
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporaryPath, filePath);
  } finally {
    await handle?.close().catch(() => {});
    await rm(temporaryPath, { force: true }).catch(() => {});
  }
}

async function readJsonFile(filePath) {
  let text;
  try {
    text = await readFile(filePath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error(`Missing ${relative(filePath)}`);
    throw error;
  }
  return parseJson(text, relative(filePath));
}

async function readOptionalJsonFile(filePath) {
  try {
    return parseJson(await readFile(filePath, 'utf8'), relative(filePath));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(
      `Invalid JSON in ${label}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function assertLocale(locale) {
  if (typeof locale !== 'string' || !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(locale)) {
    throw new Error(`Invalid locale: ${String(locale)}`);
  }
}

function fail(locale, message) {
  throw new Error(`${locale}: ${message}`);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sameTokenMultiset(left, right) {
  if (left.length !== right.length) return false;
  const sortedLeft = left.map(canonicalProtectedToken).sort(compareText);
  const sortedRight = right.map(canonicalProtectedToken).sort(compareText);
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

function canonicalProtectedToken(token) {
  return /^\d+(?:[.,]\d+)+$/u.test(token) ? token.replaceAll(',', '.') : token;
}

function formatTokens(tokens) {
  return tokens.length ? JSON.stringify(tokens) : 'none';
}

function sampleIds(missing, extra) {
  const parts = [];
  if (missing.length) parts.push(`missing: ${missing.slice(0, 3).join(', ')}`);
  if (extra.length) parts.push(`extra: ${extra.slice(0, 3).join(', ')}`);
  return parts.length ? `; ${parts.join('; ')}` : '';
}

function relative(filePath) {
  return path.relative(ROOT, filePath) || '.';
}

function usage(error) {
  if (error) console.error(`content-i18n: ${error}`);
  console.error(
    'Usage: node scripts/content-i18n.mjs <extract|validate|compile> [locale-or-catalog ...]',
  );
}
