import type { AppLanguage, WoodDatabase, WoodRecord } from '../types/wood';

export const contentOverlayLanguages = [
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
] as const satisfies readonly AppLanguage[];

export type ContentOverlayLanguage = (typeof contentOverlayLanguages)[number];
type ArrayIndex = `${number}`;

export type ContentOverlayPath =
  | 'identity.primaryName'
  | 'identity.displayName'
  | `identity.aliases.${ArrayIndex}`
  | `identity.localNames.${ArrayIndex}.country`
  | 'identity.commercialRestrictions.value'
  | `identity.notes.${ArrayIndex}`
  | 'origin.continent'
  | `origin.countries.${ArrayIndex}`
  | 'cites.raw'
  | 'log.sapwoodThickness.value'
  | 'log.floats.value'
  | 'log.durability.value'
  | `log.notes.${ArrayIndex}`
  | `appearance.${'colourReference' | 'sapwood' | 'texture' | 'grain' | 'interlockedGrain'}.value`
  | `appearance.notes.${ArrayIndex}`
  | 'physics.stability.value'
  | `physics.notes.${ArrayIndex}`
  | `durability.${'fungi' | 'dryWoodBorers' | 'termites' | 'treatability' | 'naturalUseClass' | 'coversUseClass5'}.value`
  | `durability.preservativeTreatment.${'dryWoodBorer' | 'temporaryHumidification' | 'permanentHumidification'}.value`
  | `durability.preservativeTreatment.notes.${ArrayIndex}`
  | `durability.notes.${ArrayIndex}`
  | `drying.${'rate' | 'distortionRisk' | 'casehardeningRisk' | 'checkingRisk' | 'collapseRisk'}.value`
  | `drying.notes.${ArrayIndex}`
  | `drying.schedule.${ArrayIndex}.${'phase' | 'durationHours' | 'moistureContent' | 'temperatureC' | 'wetBulbTemperatureC' | 'relativeHumidityPercent' | 'uglPercent'}`
  | `drying.scheduleNotes.${ArrayIndex}`
  | `machining.${'bluntingEffect' | 'sawteethRecommended' | 'cuttingTools' | 'peeling' | 'slicing'}.value`
  | `machining.notes.${ArrayIndex}`
  | `assembly.${'nailingAndScrewing' | 'gluing'}.value`
  | `assembly.notes.${ArrayIndex}`
  | `grading.${'appearance' | 'structural'}`
  | 'fireSafety.frenchGrading'
  | 'fireSafety.euroclass.value'
  | 'fireSafety.notes'
  | `endUses.${ArrayIndex}`
  | `endUseNotes.${ArrayIndex}`
  | `images.${ArrayIndex}.alt`;

export interface ContentOverlay {
  schemaVersion: 1;
  locale: ContentOverlayLanguage;
  sourceLanguage: 'en';
  sourceGeneratedAt: string;
  records: Record<string, Partial<Record<ContentOverlayPath, string>>>;
}

export interface ContentOverlayValidationOptions {
  expectedLocale: ContentOverlayLanguage;
  expectedSourceGeneratedAt: string;
}

const fixedPaths = new Set<ContentOverlayPath>([
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

const indexedPathPatterns = [
  /^identity\.aliases\.\d+$/,
  /^identity\.localNames\.\d+\.country$/,
  /^identity\.notes\.\d+$/,
  /^origin\.countries\.\d+$/,
  /^log\.notes\.\d+$/,
  /^appearance\.(?:colourReference|sapwood|texture|grain|interlockedGrain)\.value$/,
  /^appearance\.notes\.\d+$/,
  /^physics\.notes\.\d+$/,
  /^durability\.(?:fungi|dryWoodBorers|termites|treatability|naturalUseClass|coversUseClass5)\.value$/,
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
] as const;

const overlayLanguageSet = new Set<string>(contentOverlayLanguages);
const topLevelKeys = new Set([
  'schemaVersion',
  'locale',
  'sourceLanguage',
  'sourceGeneratedAt',
  'records',
]);

export class ContentOverlayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContentOverlayError';
  }
}

export function isContentOverlayLanguage(
  language: AppLanguage,
): language is ContentOverlayLanguage {
  return overlayLanguageSet.has(language);
}

export function isAllowedContentOverlayPath(path: string): path is ContentOverlayPath {
  return (
    fixedPaths.has(path as ContentOverlayPath) ||
    indexedPathPatterns.some((pattern) => pattern.test(path))
  );
}

export function validateContentOverlay(
  input: unknown,
  { expectedLocale, expectedSourceGeneratedAt }: ContentOverlayValidationOptions,
): ContentOverlay {
  if (!isPlainObject(input)) throw new ContentOverlayError('Content overlay must be an object.');
  for (const key of Object.keys(input)) {
    if (!topLevelKeys.has(key))
      throw new ContentOverlayError(`Unknown content overlay property: ${key}`);
  }
  if (input.schemaVersion !== 1)
    throw new ContentOverlayError('Unsupported content overlay schema version.');
  if (input.locale !== expectedLocale || !overlayLanguageSet.has(String(input.locale))) {
    throw new ContentOverlayError(`Content overlay locale does not match ${expectedLocale}.`);
  }
  if (input.sourceLanguage !== 'en')
    throw new ContentOverlayError('Content overlays must use English source content.');
  if (input.sourceGeneratedAt !== expectedSourceGeneratedAt) {
    throw new ContentOverlayError(
      'Content overlay was generated from a different source database version.',
    );
  }
  if (!isPlainObject(input.records))
    throw new ContentOverlayError('Content overlay records must be an object.');

  for (const [woodId, values] of Object.entries(input.records)) {
    if (!woodId.trim()) throw new ContentOverlayError('Content overlay contains an empty wood id.');
    if (!isPlainObject(values))
      throw new ContentOverlayError(`Translations for ${woodId} must be an object.`);
    for (const [path, value] of Object.entries(values)) {
      if (!isAllowedContentOverlayPath(path)) {
        throw new ContentOverlayError(`Disallowed content path for ${woodId}: ${path}`);
      }
      if (typeof value !== 'string' || !value.trim()) {
        throw new ContentOverlayError(
          `Translation for ${woodId}.${path} must be a non-empty string.`,
        );
      }
    }
  }

  return input as unknown as ContentOverlay;
}

export function applyContentOverlay(database: WoodDatabase, overlay: ContentOverlay): WoodDatabase {
  if (database.language !== 'en')
    throw new ContentOverlayError('Content overlays can only be applied to English data.');
  if (database.generatedAt !== overlay.sourceGeneratedAt) {
    throw new ContentOverlayError('Content overlay source version does not match the database.');
  }

  const localized = structuredClone(database);
  const recordsById = new Map(localized.records.map((record) => [record.id, record]));

  for (const [woodId, values] of Object.entries(overlay.records)) {
    const record = recordsById.get(woodId);
    if (!record)
      throw new ContentOverlayError(`Content overlay references unknown wood id: ${woodId}`);
    for (const [path, value] of Object.entries(values)) {
      if (!isAllowedContentOverlayPath(path)) {
        throw new ContentOverlayError(`Disallowed content path for ${woodId}: ${path}`);
      }
      if (typeof value !== 'string' || !value.trim()) {
        throw new ContentOverlayError(
          `Translation for ${woodId}.${path} must be a non-empty string.`,
        );
      }
      setLocalizedValue(record, path, value);
    }
  }

  for (const record of localized.records) record.searchText = buildWoodSearchText(record);
  return localized;
}

export function buildWoodSearchText(record: WoodRecord) {
  return [
    record.identity.displayName,
    record.identity.primaryName,
    ...record.identity.aliases,
    record.identity.family,
    ...record.identity.botanicalNames.map((item) => item.name),
    ...record.identity.localNames.flatMap((item) => [item.country, item.name]),
    record.identity.commercialRestrictions.value,
    ...record.identity.notes,
    record.origin.region,
    record.origin.continent,
    ...record.origin.countries,
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
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .toLocaleLowerCase();
}

function setLocalizedValue(record: WoodRecord, path: ContentOverlayPath, value: string) {
  const segments = path.split('.');
  let current: unknown = record;

  for (const segment of segments.slice(0, -1)) {
    current = getOwnChild(current, segment, path);
  }

  const finalSegment = segments.at(-1);
  if (
    !finalSegment ||
    (typeof current !== 'object' && !Array.isArray(current)) ||
    current === null
  ) {
    throw new ContentOverlayError(`Content path does not exist in the source record: ${path}`);
  }
  if (!Object.hasOwn(current, finalSegment)) {
    throw new ContentOverlayError(`Content path does not exist in the source record: ${path}`);
  }

  const container = current as Record<string, unknown>;
  const sourceValue = container[finalSegment];
  if (typeof sourceValue !== 'string' && sourceValue !== null) {
    throw new ContentOverlayError(`Content path is not a textual field: ${path}`);
  }
  if (
    isDryingScheduleCell(path) &&
    finalSegment !== 'phase' &&
    !isTextualScheduleToken(sourceValue)
  ) {
    throw new ContentOverlayError(`Numeric drying schedule cells cannot be localized: ${path}`);
  }
  container[finalSegment] = value;
}

function getOwnChild(value: unknown, segment: string, path: string) {
  if (typeof value !== 'object' || value === null || !Object.hasOwn(value, segment)) {
    throw new ContentOverlayError(`Content path does not exist in the source record: ${path}`);
  }
  return (value as Record<string, unknown>)[segment];
}

function isDryingScheduleCell(path: string) {
  return /^drying\.schedule\.\d+\./.test(path);
}

function isTextualScheduleToken(value: string | null) {
  return typeof value === 'string' && /\p{L}/u.test(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
