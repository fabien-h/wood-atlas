import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';
import {
  categoryEntries,
  normalizeCategoryText,
  normalizeWoodCategories,
} from './category-normalization.mjs';

const execFile = promisify(execFileCallback);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW_DIR = path.join(ROOT, 'data', 'raw');
const LINKS_PATH = path.join(RAW_DIR, 'tropix-links.json');
const OUTPUT_DIR = path.join(ROOT, 'public', 'data');
const outputPath = (language) => path.join(OUTPUT_DIR, `woods.generated.${language}.json`);
const LEGACY_OUTPUT_PATH = path.join(OUTPUT_DIR, 'woods.generated.json');
const PUBLIC_WOOD_DIR = path.join(ROOT, 'public', 'assets', 'woods');
const TMP_IMAGE_DIR = path.join(ROOT, 'tmp', 'tropix-images');
const MANUAL_IMAGE_MANIFEST_PATH = path.join(ROOT, 'data', 'manual', 'wood-images.json');
const MANUAL_IMAGE_SOURCE_DIR = path.join(ROOT, 'data', 'manual', 'wood-images');
const GRAIN_IMAGE_SIZE = 400;
const EXAMPLE_IMAGE_MAX_SIZE = 600;
const WOOD_IMAGE_QUALITY = 70;
const IMAGE_PIPELINE_VERSION = `grain-${GRAIN_IMAGE_SIZE}x${GRAIN_IMAGE_SIZE}-crop_example-max-${EXAMPLE_IMAGE_MAX_SIZE}_jpeg-q${WOOD_IMAGE_QUALITY}-v1`;
const IMAGE_VERSION_PATH = path.join(PUBLIC_WOOD_DIR, '.image-version');
const BASE_URL = 'https://tropix.cirad.fr';

const LISTINGS = {
  en: 'https://tropix.cirad.fr/en/fiches-disponibles',
  fr: 'https://tropix.cirad.fr/fiches-disponibles',
};

const CROSS_LANGUAGE_NAME_KEYS = new Map([['Temperate|epicea', 'Temperate|spruce']]);

const REGION_MAP = new Map([
  ['Africa', 'Africa'],
  ['Afrique', 'Africa'],
  ['America', 'America'],
  ['Amerique', 'America'],
  ['Asia', 'Asia'],
  ['Asie', 'Asia'],
  ['Tempered', 'Temperate'],
  ['Temperees', 'Temperate'],
]);

const PHYSICS_RANGES = {
  specificGravity: [0.05, 2],
  monninHardness: [0, 30],
  volumetricShrinkageCoefficient: [0, 2],
  totalTangentialShrinkage: [0, 25],
  totalRadialShrinkage: [0, 20],
  shrinkageRatio: [0.5, 5],
  fibreSaturationPoint: [5, 60],
  thermalConductivity: [0.01, 2],
  lowerHeatingValue: [5000, 40000],
  crushingStrength: [5, 300],
  staticBendingStrength: [5, 500],
  modulusOfElasticity: [1000, 100000],
};

const LANGUAGE_CONFIG = {
  en: {
    sections: {
      logs: 'Description of logs',
      wood: 'Description of wood',
      physics: 'Physics and mechanics',
      durability: 'Natural durability and preservation',
      treatment: 'Requirement of a preservative treatment',
      drying: 'Drying',
      machining: 'Sawing and machining',
      assembly: 'Assembling',
      grading: 'Commercial grading',
      fire: 'Fire safety',
      endUses: 'End-uses',
      localNames: 'Main local names',
    },
    sectionAliases: {
      durability: ['Natural durability and heartwood treatability'],
      machining: ['Sawing and machininig'],
    },
    fields: {
      family: 'Family',
      botanicalNames: 'Botanical Name(s)',
      continent: 'Continent',
      cites: 'CITES',
      diameter: 'Diameter',
      sapwoodThickness: 'Thickness of sapwood',
      floats: 'Floats',
      logDurability: 'Log durability',
      colourReference: 'Colour reference',
      sapwood: 'Sapwood',
      texture: 'Texture',
      grain: 'Grain',
      interlockedGrain: 'Interlocked grain',
      notes: 'Notes',
      fungi: 'Resistance to fungi',
      dryWoodBorers: 'Resistance to dry wood borers',
      termites: 'Resistance to termites',
      treatability: 'Treatability',
      naturalUseClass: 'Use class ensured by natural durability',
      treatmentDryWoodBorer: 'Against dry wood borer',
      treatmentTemporary: 'In case of temporary humidification',
      treatmentPermanent: 'In case of permanent humidification',
      dryingRate: 'Drying rate',
      distortionRisk: 'Risk of distortion',
      distortionRiskAlt: 'Risk of distorsion',
      casehardeningRisk: 'Risk of casehardening',
      checkingRisk: 'Risk of checking',
      collapseRisk: 'Risk of collapse',
      dryingProgram: 'Suggested drying program',
      bluntingEffect: 'Blunting effect',
      sawteethRecommended: 'Sawteeth recommended',
      cuttingTools: 'Cutting tools',
      peeling: 'Peeling',
      slicing: 'Slicing',
      nailingAndScrewing: 'Nailing and screwing',
      gluing: 'Gluing',
      euroclass: 'Euroclasses grading',
      frenchGrading: 'Conventional French grading',
    },
    fieldAliases: {
      fungi: ['Resistance of heartwood to xylophagous fungi'],
      dryWoodBorers: ['Resistance of heartwood to xylophagous dry wood borers'],
      termites: ['Resistance of heartwood to termites'],
      treatability: ['Heartwood treatability'],
      naturalUseClass: ['Use class ensured by natural durability of heartwood'],
    },
    physics: [
      ['Specific gravity', 'specificGravity', undefined],
      ['Monnin hardness', 'monninHardness', undefined],
      ['Coefficient of volumetric shrinkage', 'volumetricShrinkageCoefficient', '% per %'],
      ['Total tangential shrinkage', 'totalTangentialShrinkage', '%'],
      ['Total radial shrinkage', 'totalRadialShrinkage', '%'],
      ['Ratio St/Sr', 'shrinkageRatio', undefined],
      ['Fibre saturation point', 'fibreSaturationPoint', '%'],
      ['Thermal conductivity', 'thermalConductivity', 'W/(m.K)'],
      ['Lower heating value', 'lowerHeatingValue', 'kJ/kg'],
      ['Crushing strength', 'crushingStrength', 'MPa'],
      ['Static bending strength', 'staticBendingStrength', 'MPa'],
      ['Modulus of elasticity', 'modulusOfElasticity', 'MPa'],
    ],
    localNamesHeader: /Country\s+Local name/i,
    phaseNames: /^(Prewarm|Drying|Conditioning|Cooling)/i,
    defaultDryingPhase: 'Drying',
    grading: ['Appearance grading for sawn timbers', 'Visual grading for structural applications'],
  },
  fr: {
    sections: {
      logs: 'Description de la grume',
      wood: 'Description du bois',
      physics: 'Propriétés physiques et mécaniques',
      durability: 'Durabilité naturelle et imprégnabilité du bois',
      treatment: 'Traitement de préservation',
      drying: 'Séchage',
      machining: 'Sciage et usinage',
      assembly: 'Assemblage',
      grading: 'Classements commerciaux',
      fire: 'Réaction au feu',
      endUses: 'Principales utilisations',
      localNames: 'Principales appellations vernaculaires',
    },
    sectionAliases: {
      durability: ['Durabilité naturelle et imprégnabilité du duramen'],
      treatment: ["Nécessité d'un traitement de préservation"],
      endUses: ['Utilisations'],
      localNames: ['Principales appellations'],
    },
    fields: {
      family: 'Famille',
      botanicalNames: 'Noms botaniques',
      continent: 'Continent',
      cites: 'CITES',
      diameter: 'Diamètre',
      sapwoodThickness: "Épaisseur de l'aubier",
      floats: 'Flottabilité',
      logDurability: 'Conservation en forêt',
      colourReference: 'Couleur de référence',
      sapwood: 'Aubier',
      texture: 'Grain',
      grain: 'Fil',
      interlockedGrain: 'Contrefil',
      notes: 'Notes',
      fungi: 'Résistance aux champignons',
      dryWoodBorers: 'Résistance aux insectes de bois sec',
      termites: 'Résistance aux termites',
      treatability: 'Imprégnabilité',
      naturalUseClass: 'Classe d’emploi couverte par la durabilité naturelle',
      treatmentDryWoodBorer: 'Contre les attaques d’insectes de bois sec',
      treatmentTemporary: 'En cas d’humidification temporaire',
      treatmentPermanent: 'En cas d’humidification permanente',
      dryingRate: 'Vitesse de séchage',
      distortionRisk: 'Risque de déformation',
      distortionRiskAlt: 'Risque de distorsion',
      casehardeningRisk: 'Risque de cémentation',
      checkingRisk: 'Risque de fentes',
      collapseRisk: 'Risque de collapse',
      dryingProgram: 'Programme de séchage proposé',
      bluntingEffect: 'Effet désaffûtant',
      sawteethRecommended: 'Denture pour le sciage',
      cuttingTools: 'Outils d’usinage',
      peeling: 'Aptitude au déroulage',
      slicing: 'Aptitude au tranchage',
      nailingAndScrewing: 'Clouage vissage',
      gluing: 'Collage',
      euroclass: 'Classement selon euroclasses',
      frenchGrading: 'Classement conventionnel français',
    },
    fieldAliases: {
      fungi: ['Résistance du duramen aux champignons xylophages'],
      dryWoodBorers: [
        'Résistance du duramen aux insectes xylophages',
        'Résistance du duramen aux insectes xylophages de bois sec',
      ],
      termites: ['Résistance du duramen aux termites'],
      treatability: ['Imprégnabilité du duramen'],
      naturalUseClass: ['Classe d’emploi couverte par la durabilité naturelle du duramen'],
    },
    physics: [
      ['Densité', 'specificGravity', undefined],
      ['Dureté Monnin', 'monninHardness', undefined],
      ['Coefficient de retrait volumique', 'volumetricShrinkageCoefficient', '% par %'],
      ['Retrait tangentiel total (Rt)', 'totalTangentialShrinkage', '%'],
      ['Retrait radial total (Rr)', 'totalRadialShrinkage', '%'],
      ['Ratio Rt/Rr', 'shrinkageRatio', undefined],
      ['Point de saturation des fibres', 'fibreSaturationPoint', '%'],
      ['Conductivité thermique (λ)', 'thermalConductivity', 'W/(m.K)'],
      ['Pouvoir calorifique inférieur', 'lowerHeatingValue', 'kJ/kg'],
      ['Contrainte de rupture en compression', 'crushingStrength', 'MPa'],
      ['Contrainte de rupture en flexion statique', 'staticBendingStrength', 'MPa'],
      ["Module d'élasticité longitudinal", 'modulusOfElasticity', 'MPa'],
    ],
    localNamesHeader: /Pays\s+Appellation/i,
    phaseNames: /^(Préchauffage|Séchage|Équilibrage|Refroidissement)/i,
    defaultDryingPhase: 'Séchage',
    grading: ["Classement d'aspect de produits sciés", 'Classement visuel de structure'],
  },
};

function usage() {
  console.log('Usage: node scripts/tropix.mjs <sync|extract|normalize|manual-images|validate|all>');
}

async function main() {
  const command = process.argv[2] ?? 'all';
  if (command === 'sync') {
    await sync();
  } else if (command === 'extract') {
    await extract();
  } else if (command === 'normalize') {
    await normalizeGeneratedDatabases();
  } else if (command === 'manual-images') {
    await applyManualImagesToGeneratedDatabases();
  } else if (command === 'validate') {
    await validateGeneratedDatabases();
  } else if (command === 'all') {
    await sync();
    await extract();
  } else {
    usage();
    process.exitCode = 1;
  }
}

async function sync() {
  await fsp.mkdir(RAW_DIR, { recursive: true });
  const byLanguage = {};

  for (const [language, listingUrl] of Object.entries(LISTINGS)) {
    const html = await fetchText(listingUrl);
    await fsp.mkdir(path.join(RAW_DIR, 'html'), { recursive: true });
    await fsp.writeFile(path.join(RAW_DIR, 'html', `${language}.html`), html);
    byLanguage[language] = parseListing(html, language, listingUrl);
  }

  const allLinks = Object.values(byLanguage).flat();
  await fsp.writeFile(
    LINKS_PATH,
    JSON.stringify(
      { generatedAt: new Date().toISOString(), listings: LISTINGS, links: allLinks },
      null,
      2,
    ),
  );

  console.log(
    `Found ${byLanguage.en.length} English PDFs and ${byLanguage.fr.length} French PDFs.`,
  );
  await downloadLinks(allLinks);
}

async function extract() {
  const links = await readLinks();
  const englishLinks = links.filter((link) => link.language === 'en');
  const frenchLinks = links.filter((link) => link.language === 'fr');

  await fsp.mkdir(OUTPUT_DIR, { recursive: true });
  await prepareImageOutput();
  await fsp.mkdir(TMP_IMAGE_DIR, { recursive: true });

  const englishRecords = Array.from({ length: englishLinks.length });
  let completed = 0;
  await runLimited(
    englishLinks.map((link, index) => ({ link, index })),
    4,
    async ({ link, index }) => {
      const text = await extractText(link);
      const record = parseWoodRecord(link, text);
      normalizeWoodCategories(record, link.language);
      record.images = await extractImages(link, record);
      record.extraction = qualityReport(record);
      record.searchText = makeSearchText(record);
      englishRecords[index] = record;
      completed += 1;
      if (completed % 20 === 0 || completed === englishLinks.length) {
        console.log(`Extracting English ${completed}/${englishLinks.length}`);
      }
    },
  );

  const englishByBotanicalName = new Map();
  const englishByLooseName = new Map();
  for (const record of englishRecords) {
    for (const key of botanicalMatchKeys(record)) englishByBotanicalName.set(key, record);
    englishByLooseName.set(
      `${record.origin.region}|${looseNameKey(record.identity.primaryName)}`,
      record,
    );
    for (const alias of record.identity.aliases) {
      englishByLooseName.set(`${record.origin.region}|${looseNameKey(alias)}`, record);
    }
  }

  const frenchRecords = Array.from({ length: frenchLinks.length });
  let matchedFrenchRecords = 0;
  completed = 0;
  await runLimited(
    frenchLinks.map((link, index) => ({ link, index })),
    4,
    async ({ link, index }) => {
      const text = await extractText(link);
      const record = parseWoodRecord(link, text);
      normalizeWoodCategories(record, link.language);
      const englishMatch = findEnglishMatch(record, englishByBotanicalName, englishByLooseName);
      if (englishMatch) {
        matchedFrenchRecords += 1;
        record.id = englishMatch.id;
        record.images = englishMatch.images.map((image) => ({
          ...image,
          alt: `${record.identity.displayName} ${labelForImageKind(image.kind, 'fr')}`,
        }));
        record.source.pdfs.en = englishMatch.source.pdfs.en;
        englishMatch.source.pdfs.fr = record.source.pdfs.fr;
      } else {
        record.id = `fr-${record.id}`;
        record.images = await extractImages(link, record);
      }
      record.extraction = qualityReport(record);
      record.searchText = makeSearchText(record);
      frenchRecords[index] = record;
      completed += 1;
      if (completed % 20 === 0 || completed === frenchLinks.length) {
        console.log(`Extracting French ${completed}/${frenchLinks.length}`);
      }
    },
  );

  synchronizePairedMeasurements(englishRecords, frenchRecords);
  const manualImages = await publishManualImages();
  mergeManualImages(
    [
      { records: englishRecords, language: 'en' },
      { records: frenchRecords, language: 'fr' },
    ],
    manualImages,
  );
  for (const record of [...englishRecords, ...frenchRecords]) {
    record.extraction = qualityReport(record);
    record.searchText = makeSearchText(record);
  }

  const publishableEnglishRecords = englishRecords.filter(isPublishableRecord);
  const publishableFrenchRecords = frenchRecords.filter(isPublishableRecord);
  publishableEnglishRecords.sort((a, b) =>
    a.identity.displayName.localeCompare(b.identity.displayName, 'en'),
  );
  publishableFrenchRecords.sort((a, b) =>
    a.identity.displayName.localeCompare(b.identity.displayName, 'fr'),
  );

  const generatedAt = new Date().toISOString();
  const databaseFor = (language, records) => ({
    language,
    generatedAt,
    source: {
      name: 'CIRAD Tropix',
      englishListing: LISTINGS.en,
      frenchListing: LISTINGS.fr,
      englishSheets: englishLinks.length,
      frenchSheets: frenchLinks.length,
    },
    records,
  });
  const englishDatabase = databaseFor('en', publishableEnglishRecords);
  const frenchDatabase = databaseFor('fr', publishableFrenchRecords);
  const validation = validateDatabases(englishDatabase, frenchDatabase);

  await Promise.all([
    fsp.writeFile(outputPath('en'), JSON.stringify(englishDatabase, null, 2)),
    fsp.writeFile(outputPath('fr'), JSON.stringify(frenchDatabase, null, 2)),
    fsp.writeFile(LEGACY_OUTPUT_PATH, JSON.stringify(englishDatabase, null, 2)),
  ]);
  console.log(
    `Wrote ${publishableEnglishRecords.length} English and ${publishableFrenchRecords.length} French records ` +
      `(${matchedFrenchRecords} paired across languages; ` +
      `${englishRecords.length - publishableEnglishRecords.length} English and ` +
      `${frenchRecords.length - publishableFrenchRecords.length} French unparsed records excluded).`,
  );
  console.log(
    `Validated ${validation.checkedValues} numeric values across ${validation.pairedRecords} bilingual records.`,
  );
  console.log(`Published ${manualImages.length} manually sourced images.`);
}

async function normalizeGeneratedDatabases() {
  const [englishDatabase, frenchDatabase] = await Promise.all([
    fsp.readFile(outputPath('en'), 'utf8').then(JSON.parse),
    fsp.readFile(outputPath('fr'), 'utf8').then(JSON.parse),
  ]);

  for (const record of englishDatabase.records) {
    normalizeWoodCategories(record, 'en');
    record.searchText = makeSearchText(record);
  }
  for (const record of frenchDatabase.records) {
    normalizeWoodCategories(record, 'fr');
    record.searchText = makeSearchText(record);
  }

  const validation = validateDatabases(englishDatabase, frenchDatabase);
  await Promise.all([
    fsp.writeFile(outputPath('en'), JSON.stringify(englishDatabase, null, 2)),
    fsp.writeFile(outputPath('fr'), JSON.stringify(frenchDatabase, null, 2)),
    fsp.writeFile(LEGACY_OUTPUT_PATH, JSON.stringify(englishDatabase, null, 2)),
  ]);
  console.log(
    `Normalized filter categories in ${englishDatabase.records.length} English and ` +
      `${frenchDatabase.records.length} French records; validated ${validation.checkedValues} numeric values.`,
  );
}

async function applyManualImagesToGeneratedDatabases() {
  const [englishDatabase, frenchDatabase] = await Promise.all([
    fsp.readFile(outputPath('en'), 'utf8').then(JSON.parse),
    fsp.readFile(outputPath('fr'), 'utf8').then(JSON.parse),
  ]);
  const manualImages = await publishManualImages();
  mergeManualImages(
    [
      { records: englishDatabase.records, language: 'en' },
      { records: frenchDatabase.records, language: 'fr' },
    ],
    manualImages,
  );

  for (const record of [...englishDatabase.records, ...frenchDatabase.records]) {
    record.extraction = qualityReport(record);
    record.searchText = makeSearchText(record);
  }

  const validation = validateDatabases(englishDatabase, frenchDatabase);
  await Promise.all([
    fsp.writeFile(outputPath('en'), JSON.stringify(englishDatabase, null, 2)),
    fsp.writeFile(outputPath('fr'), JSON.stringify(frenchDatabase, null, 2)),
    fsp.writeFile(LEGACY_OUTPUT_PATH, JSON.stringify(englishDatabase, null, 2)),
  ]);
  console.log(
    `Published ${manualImages.length} manually sourced images and validated ` +
      `${validation.checkedValues} numeric values across ${validation.pairedRecords} bilingual records.`,
  );
}

async function validateGeneratedDatabases() {
  await readManualImageManifest();
  const [englishDatabase, frenchDatabase] = await Promise.all([
    fsp.readFile(outputPath('en'), 'utf8').then(JSON.parse),
    fsp.readFile(outputPath('fr'), 'utf8').then(JSON.parse),
  ]);
  const validation = validateDatabases(englishDatabase, frenchDatabase);
  console.log(
    `Validated ${validation.checkedValues} numeric values across ${validation.pairedRecords} bilingual records.`,
  );
}

function validateDatabases(englishDatabase, frenchDatabase) {
  const errors = [];
  let checkedValues = 0;

  for (const database of [englishDatabase, frenchDatabase]) {
    const seenIds = new Set();
    for (const record of database.records) {
      if (seenIds.has(record.id))
        errors.push(`${database.language}:${record.id} has a duplicate id`);
      seenIds.add(record.id);

      for (const [recordPath, value] of categoryEntries(record)) {
        if (
          typeof value === 'string' &&
          value !== normalizeCategoryText(value, database.language)
        ) {
          errors.push(
            `${database.language}:${record.id}.${recordPath} is not normalized lowercase`,
          );
        }
      }
      const canonicalRecord = structuredClone(record);
      normalizeWoodCategories(canonicalRecord, database.language);
      if (
        JSON.stringify(categoryEntries(record)) !== JSON.stringify(categoryEntries(canonicalRecord))
      ) {
        errors.push(`${database.language}:${record.id} has noncanonical filter categories`);
      }

      for (const [key, [minimum, maximum]] of Object.entries(PHYSICS_RANGES)) {
        const measurement = record.physics?.[key];
        if (!measurement) {
          errors.push(`${database.language}:${record.id}.${key} is missing`);
          continue;
        }
        if (measurement.value !== null) checkedValues += 1;
        for (const part of ['value', 'min', 'max']) {
          const value = measurement[part];
          if (value === null) continue;
          if (!Number.isFinite(value)) {
            errors.push(`${database.language}:${record.id}.${key}.${part} is not a finite number`);
          } else if (value < minimum || value > maximum) {
            errors.push(
              `${database.language}:${record.id}.${key}.${part}=${value} is outside ${minimum}–${maximum}`,
            );
          }
        }
        if (
          measurement.min !== null &&
          measurement.max !== null &&
          measurement.min > measurement.max
        ) {
          errors.push(`${database.language}:${record.id}.${key} has an inverted range`);
        }
      }

      const diameter = record.log?.diameterCm;
      if (!diameter) {
        errors.push(`${database.language}:${record.id}.diameterCm is missing`);
      } else {
        if (diameter.value !== null) checkedValues += 1;
        for (const part of ['value', 'min', 'max']) {
          const value = diameter[part];
          if (value === null) continue;
          if (!Number.isFinite(value)) {
            errors.push(
              `${database.language}:${record.id}.diameterCm.${part} is not a finite number`,
            );
          } else if (value < 1 || value > 500) {
            errors.push(
              `${database.language}:${record.id}.diameterCm.${part}=${value} is outside 1–500`,
            );
          }
        }
        if (diameter.min !== null && diameter.max !== null && diameter.min > diameter.max) {
          errors.push(`${database.language}:${record.id}.diameterCm has an inverted range`);
        }
      }
    }
  }

  const englishById = new Map(englishDatabase.records.map((record) => [record.id, record]));
  let pairedRecords = 0;
  for (const frenchRecord of frenchDatabase.records) {
    const englishRecord = englishById.get(frenchRecord.id);
    if (!englishRecord) continue;
    pairedRecords += 1;
    for (const key of Object.keys(PHYSICS_RANGES)) {
      for (const part of ['value', 'min', 'max']) {
        const englishValue = englishRecord.physics[key][part];
        const frenchValue = frenchRecord.physics[key][part];
        if (englishValue === null && frenchValue === null) continue;
        if (
          englishValue === null ||
          frenchValue === null ||
          Math.abs(englishValue - frenchValue) > 1e-9
        ) {
          errors.push(
            `${frenchRecord.id}.${key}.${part} differs between English (${englishValue}) and French (${frenchValue})`,
          );
        }
      }
    }
    for (const part of ['value', 'min', 'max']) {
      const englishValue = englishRecord.log.diameterCm[part];
      const frenchValue = frenchRecord.log.diameterCm[part];
      if (englishValue === null && frenchValue === null) continue;
      if (
        englishValue === null ||
        frenchValue === null ||
        Math.abs(englishValue - frenchValue) > 1e-9
      ) {
        errors.push(
          `${frenchRecord.id}.diameterCm.${part} differs between English (${englishValue}) and French (${frenchValue})`,
        );
      }
    }
  }

  if (errors.length > 0) {
    const displayedErrors = errors
      .slice(0, 30)
      .map((error) => `- ${error}`)
      .join('\n');
    const remaining = errors.length > 30 ? `\n- …and ${errors.length - 30} more` : '';
    throw new Error(
      `Data validation failed with ${errors.length} error(s):\n${displayedErrors}${remaining}`,
    );
  }

  return { checkedValues, pairedRecords };
}

function synchronizePairedMeasurements(englishRecords, frenchRecords) {
  const englishById = new Map(englishRecords.map((record) => [record.id, record]));
  for (const frenchRecord of frenchRecords) {
    const englishRecord = englishById.get(frenchRecord.id);
    if (!englishRecord) continue;
    for (const key of Object.keys(PHYSICS_RANGES)) {
      const englishMeasurement = englishRecord.physics[key];
      const frenchMeasurement = frenchRecord.physics[key];
      if (englishMeasurement.value === null && frenchMeasurement.value !== null) {
        englishRecord.physics[key] = { ...frenchMeasurement };
      } else if (frenchMeasurement.value === null && englishMeasurement.value !== null) {
        frenchRecord.physics[key] = { ...englishMeasurement };
      }
    }
    const englishDiameter = englishRecord.log.diameterCm;
    const frenchDiameter = frenchRecord.log.diameterCm;
    if (englishDiameter.value === null && frenchDiameter.value !== null) {
      englishRecord.log.diameterCm = { ...frenchDiameter };
    } else if (frenchDiameter.value === null && englishDiameter.value !== null) {
      frenchRecord.log.diameterCm = { ...englishDiameter };
    }
  }
}

function isPublishableRecord(record) {
  return record.physics.specificGravity.value !== null;
}

function botanicalMatchKeys(record) {
  return record.identity.botanicalNames.map(
    (item) => `${record.origin.region}|${slugify(item.name.replace(/\s*\([^)]*\)/g, ''))}`,
  );
}

function findEnglishMatch(record, byBotanicalName, byLooseName) {
  for (const key of botanicalMatchKeys(record)) {
    const match = byBotanicalName.get(key);
    if (match) return match;
  }
  for (const candidate of [record.identity.primaryName, ...record.identity.aliases]) {
    const candidateKey = `${record.origin.region}|${looseNameKey(candidate)}`;
    const match = byLooseName.get(CROSS_LANGUAGE_NAME_KEYS.get(candidateKey) ?? candidateKey);
    if (match) return match;
  }
  return null;
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

function parseListing(html, language, listingUrl) {
  const matches = html.matchAll(/<a\s+href="([^"]+\.[Pp][Dd][Ff])"[^>]*>(.*?)<\/a>/g);
  const links = [];
  for (const match of matches) {
    const href = decodeHtml(match[1]);
    const title = stripTags(decodeHtml(match[2])).replace(/\s+/g, ' ').trim();
    const url = new URL(href, BASE_URL).href;
    const rawPath = new URL(url).pathname.split('/').map((part) => safeDecode(part));
    const regionSource = rawPath[3] ?? 'Unknown';
    const fileName = rawPath.at(-1) ?? title;
    const sheetName = cleanSheetName(title || fileName);
    links.push({
      language,
      listingUrl,
      url,
      regionSource,
      region: REGION_MAP.get(regionSource) ?? 'Unknown',
      fileName,
      sheetName,
      year: extractYear(fileName),
      localPath: localPdfPath(language, regionSource, fileName),
    });
  }
  return links;
}

async function downloadLinks(links) {
  let completed = 0;
  let reused = 0;
  let downloaded = 0;
  const failures = [];

  await runLimited(links, 8, async (link) => {
    const destination = path.join(ROOT, link.localPath);
    await fsp.mkdir(path.dirname(destination), { recursive: true });
    if (await fileExists(destination)) {
      const stat = await fsp.stat(destination);
      if (stat.size > 0) {
        reused += 1;
        completed += 1;
        return;
      }
    }
    try {
      const response = await fetch(link.url);
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      await fsp.writeFile(destination, bytes);
      downloaded += 1;
    } catch (error) {
      failures.push({ url: link.url, error: String(error) });
    } finally {
      completed += 1;
      if (completed % 50 === 0 || completed === links.length) {
        console.log(
          `PDF sync ${completed}/${links.length} (${downloaded} downloaded, ${reused} reused)`,
        );
      }
    }
  });

  if (failures.length > 0) {
    await fsp.writeFile(
      path.join(RAW_DIR, 'download-failures.json'),
      JSON.stringify(failures, null, 2),
    );
    throw new Error(`${failures.length} PDF downloads failed. See data/raw/download-failures.json`);
  }
}

async function readLinks() {
  const raw = JSON.parse(await fsp.readFile(LINKS_PATH, 'utf8'));
  return raw.links;
}

async function extractText(link) {
  const pdfPath = path.join(ROOT, link.localPath);
  const textPath = path.join(
    ROOT,
    'data',
    'raw',
    'text',
    link.language,
    link.regionSource,
    `${path.basename(link.fileName, path.extname(link.fileName))}.txt`,
  );
  await fsp.mkdir(path.dirname(textPath), { recursive: true });
  if (!(await fileExists(textPath))) {
    await execFile('pdftotext', ['-layout', pdfPath, textPath], { maxBuffer: 1024 * 1024 * 10 });
  }
  return fsp.readFile(textPath, 'utf8');
}

function sectionLabels(config, key) {
  return [config.sections[key], ...(config.sectionAliases?.[key] ?? [])];
}

function allSectionHeadings(config) {
  return Object.keys(config.sections).flatMap((key) => sectionLabels(config, key));
}

function sectionValue(sections, config, key) {
  for (const label of sectionLabels(config, key)) {
    if (sections[label] !== undefined) return sections[label];
  }
  return '';
}

function fieldLabels(config, key) {
  return [config.fields[key], ...(config.fieldAliases?.[key] ?? [])];
}

function allFieldLabels(config) {
  return [...Object.values(config.fields), ...Object.values(config.fieldAliases ?? {}).flat()];
}

function isLegacySheet(text) {
  return (
    /\bTROPIX 7\b/i.test(text) ||
    /^\s*(?:Commercial restriction|Restrictions commerciales)\s*:/im.test(text)
  );
}

function legacyLabels(language) {
  if (language === 'fr') {
    return {
      family: ['Famille'],
      commercialRestrictions: ['Restrictions commerciales', 'Restriction commerciale'],
      botanicalNames: ['Nom(s) scientifique(s)'],
      diameter: ['Diamètre'],
      sapwoodThickness: ["Épaisseur de l'aubier"],
      floats: ['Flottabilité'],
      logDurability: ['Conservation en forêt'],
      colourReference: ['Couleur référence'],
      sapwood: ['Aubier'],
      texture: ['Grain'],
      grain: ['Fil'],
      interlockedGrain: ['Contrefil'],
      fungi: ['Champignons'],
      dryWoodBorers: ['Insectes de bois sec'],
      termites: ['Termites'],
      treatability: ['Impregnabilité', 'Imprégnabilité'],
      naturalUseClass: ["Classe d'emploi", 'Classe d’emploi'],
      coversUseClass5: ['Essence couvrant la classe 5'],
      stability: ['Stabilité en service', 'Stabilité'],
      treatmentDryWoodBorer: ["Contre les attaques d'insectes de bois sec"],
      treatmentTemporary: ["En cas d'humidification temporaire"],
      treatmentPermanent: ["En cas d'humidification permanente"],
      dryingRate: ['Vitesse de séchage'],
      distortionRisk: ['Risque de déformation'],
      casehardeningRisk: ['Risque de cémentation'],
      checkingRisk: ['Risque de gerces', 'Risque de fentes'],
      collapseRisk: ['Risque de collapse'],
      bluntingEffect: ['Effet désaffûtant'],
      sawteethRecommended: ['Denture pour le sciage'],
      cuttingTools: ["Outils d'usinage"],
      peeling: ['Aptitude au déroulage'],
      slicing: ['Aptitude au tranchage'],
      nailingAndScrewing: ['Clouage vissage'],
      gluing: ['Collage'],
      frenchGrading: ['Classement conventionnel français'],
      euroclass: ['Classement selon euroclasses'],
      appearanceGrading: [
        "Classement d'aspect des produits sciés",
        "Classement d'aspect de produits sciés",
      ],
      structuralGrading: ['Classement visuel de structure'],
    };
  }
  return {
    family: ['Family'],
    commercialRestrictions: ['Commercial restriction', 'Commercial restrictions'],
    botanicalNames: ['Scientific name(s)'],
    diameter: ['Diameter'],
    sapwoodThickness: ['Thickness of sapwood'],
    floats: ['Floats'],
    logDurability: ['Log durability'],
    colourReference: ['Color', 'Colour'],
    sapwood: ['Sapwood'],
    texture: ['Texture'],
    grain: ['Grain'],
    interlockedGrain: ['Interlocked grain'],
    fungi: ['Funghi (according to E.N. standards)', 'Fungi (according to E.N. standards)'],
    dryWoodBorers: ['Dry wood borers'],
    termites: ['Termites (according to E.N. standards)'],
    treatability: ['Treatability (according to E.N. standards)'],
    naturalUseClass: ['Use class ensured by natural durability'],
    coversUseClass5: ['Species covering the use class 5'],
    stability: ['Stability', 'Stability in service'],
    treatmentDryWoodBorer: ['Against dry wood borer attacks'],
    treatmentTemporary: ['In case of risk of temporary humidification'],
    treatmentPermanent: ['In case of risk of permanent humidification'],
    dryingRate: ['Drying rate'],
    distortionRisk: ['Risk of distortion'],
    casehardeningRisk: ['Risk of casehardening'],
    checkingRisk: ['Risk of checking'],
    collapseRisk: ['Risk of collapse'],
    bluntingEffect: ['Blunting effect'],
    sawteethRecommended: ['Sawteeth recommended'],
    cuttingTools: ['Cutting tools'],
    peeling: ['Peeling'],
    slicing: ['Slicing'],
    nailingAndScrewing: ['Nailing / screwing', 'Nailing and screwing'],
    gluing: ['Gluing'],
    frenchGrading: ['Conventional French grading'],
    euroclass: ['Euroclasses grading'],
    appearanceGrading: ['Appearance grading for sawn timbers'],
    structuralGrading: ['Visual grading for structural applications'],
  };
}

function readLegacyField(text, labels) {
  for (const label of labels) {
    const match = new RegExp(`${escapeRegExp(label)}\\s*\\*?\\s*:\\s*([^\\n]+)`, 'i').exec(text);
    if (!match) continue;
    return match[1]
      .replace(/\s{2,}(?=\p{L}[^:\n]{0,80}\s*:).*$/u, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  return '';
}

function legacySectionBlocks(text, language) {
  const headings =
    language === 'fr'
      ? [
          ['appearance', 'DESCRIPTION DU BOIS'],
          ['physics', 'PROPRIÉTÉS PHYSIQUES'],
          ['durability', 'DURABILITÉ NATURELLE ET IMPRÉGNABILITÉ DU BOIS'],
          ['treatment', "NÉCESSITÉ D'UN TRAITEMENT DE PRÉSERVATION"],
          ['drying', 'SÉCHAGE'],
          ['machining', 'SCIAGE ET USINAGE'],
          ['assembly', 'ASSEMBLAGE'],
          ['grading', 'CLASSEMENTS COMMERCIAUX'],
          ['fire', 'RÉACTION AU FEU'],
          ['endUses', 'UTILISATIONS'],
          ['localNames', 'PRINCIPALES APPELLATIONS'],
        ]
      : [
          ['appearance', 'WOOD DESCRIPTION'],
          ['physics', 'PHYSICAL PROPERTIES'],
          ['durability', 'NATURAL DURABILITY AND TREATABILITY'],
          ['treatment', 'REQUIREMENT OF A PRESERVATIVE TREATMENT'],
          ['drying', 'DRYING'],
          ['machining', 'SAWING AND MACHINING'],
          ['assembly', 'ASSEMBLING'],
          ['grading', 'COMMERCIAL GRADING'],
          ['fire', 'FIRE SAFETY'],
          ['endUses', 'END-USES'],
          ['localNames', 'MAIN LOCAL NAMES'],
        ];
  const positions = headings
    .map(([key, heading]) => ({
      key,
      match: new RegExp(`^[ \\t]*${escapeRegExp(heading)}\\b`, 'im').exec(text),
    }))
    .filter((item) => item.match)
    .map((item) => ({ key: item.key, index: item.match.index }))
    .sort((a, b) => a.index - b.index);
  return Object.fromEntries(
    positions.map((item, index) => [
      item.key,
      text.slice(item.index, positions[index + 1]?.index ?? text.length),
    ]),
  );
}

function readLegacyNotes(block) {
  if (!block) return [];
  const lines = block.split('\n');
  const start = lines.findIndex((line) => /^\s*(?:Notes?|Note)\s*:/i.test(line));
  if (start === -1) return [];
  const values = [lines[start].replace(/^\s*(?:Notes?|Note)\s*:\s*/i, '')];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed) break;
    if (
      /^(?:This schedule|It must be used|For thickness|(?:Cette )?Table (?:de séchage )?(?:est )?donnée|Elle est à valider|Pour des épaisseurs)/i.test(
        trimmed,
      )
    )
      break;
    if (/^(?:Green|Vert|\d+)\s{2,}\d/i.test(trimmed)) continue;
    values.push(trimmed);
  }
  const value = values
    .map((line) => line.replace(/\s{8,}(?=(?:Green|Vert|\d))[^\n]*$/i, ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return notes(value);
}

function parseLegacyGrading(block, legacy) {
  if (!block) return { appearance: null, structural: null };
  return {
    appearance: valueOrNull(
      cleanExtractedProse(betweenAny(block, legacy.appearanceGrading, legacy.structuralGrading)),
    ),
    structural: valueOrNull(cleanExtractedProse(afterAny(block, legacy.structuralGrading))),
  };
}

function parseLegacyFireSafety(block, legacy) {
  if (!block) return null;
  const conventional = cleanExtractedProse(
    betweenAny(block, legacy.frenchGrading, legacy.euroclass),
  );
  const euroLabel = legacy.euroclass.map(escapeRegExp).join('|');
  const euroMatch = new RegExp(`^\\s*(?:${euroLabel})\\s*:\\s*([^\\n]+)`, 'im').exec(block);
  const euro = cleanExtractedProse(euroMatch?.[1] ?? '');
  const notesText = euroMatch
    ? cleanLegacyBoilerplate(block.slice((euroMatch.index ?? 0) + euroMatch[0].length))
    : '';
  return {
    frenchGrading: valueOrNull(conventional),
    euroclass: textValue(euro),
    notes: valueOrNull(cleanExtractedProse(notesText)),
  };
}

function betweenAny(text, startLabels, endLabels) {
  const start = firstLabelMatch(text, startLabels);
  if (!start) return '';
  const remainder = text.slice(start.index + start[0].length);
  const end = firstLabelMatch(remainder, endLabels);
  return remainder.slice(0, end?.index ?? remainder.length);
}

function afterAny(text, labels) {
  const match = firstLabelMatch(text, labels);
  return match ? text.slice(match.index + match[0].length) : '';
}

function firstLabelMatch(text, labels) {
  return new RegExp(`(?:${labels.map(escapeRegExp).join('|')})`, 'i').exec(text);
}

function cleanLegacyBoilerplate(text) {
  return text
    .split('\n')
    .filter((line) => {
      const value = line.trim();
      return (
        value &&
        !/^(?:TROPIX|Tropix|Page \d|Imprimé le|\d{2}\/\d{2}\/\d{4}|ur-biowooeb)/.test(value)
      );
    })
    .join(' ');
}

function parseLegacyBotanicalNames(text, language) {
  const raw = readLegacyField(text, legacyLabels(language).botanicalNames);
  if (!raw) return [];
  return raw
    .split(/\s*;\s*/)
    .filter(Boolean)
    .map((name) => ({ name, isSynonym: false }));
}

function parseLegacyPhysics(text, language) {
  const config = LANGUAGE_CONFIG[language];
  const physics = Object.fromEntries(
    config.physics.map(([, key, unit]) => [key, measure('', unit)]),
  );
  const labels =
    language === 'fr'
      ? {
          specificGravity: ['Densité'],
          monninHardness: ['Dureté Monnin'],
          volumetricShrinkageCoefficient: ['Coeff. de retrait volumique'],
          totalTangentialShrinkage: ['Retrait tangentiel total (RT)'],
          totalRadialShrinkage: ['Retrait radial total (RR)'],
          shrinkageRatio: ['Ratio RT/RR'],
          fibreSaturationPoint: ['Pt de saturation des fibres', 'Point de saturation des fibres'],
          crushingStrength: ['Contrainte de rupture en compression'],
          staticBendingStrength: ['Contrainte de rupture en flexion statique'],
          modulusOfElasticity: ["Module d'élasticité longitudinal"],
        }
      : {
          specificGravity: ['Specific gravity'],
          monninHardness: ['Monnin hardness'],
          volumetricShrinkageCoefficient: ['Coeff. of volumetric shrinkage'],
          totalTangentialShrinkage: ['Total tangential shrinkage (TS)'],
          totalRadialShrinkage: ['Total radial shrinkage (RS)'],
          shrinkageRatio: ['TS/RS ratio'],
          fibreSaturationPoint: ['Fiber saturation point', 'Fibre saturation point'],
          crushingStrength: ['Crushing strength'],
          staticBendingStrength: ['Static bending strength'],
          modulusOfElasticity: ['Modulus of elasticity'],
        };

  for (const [key, candidates] of Object.entries(labels)) {
    for (const label of candidates) {
      const raw = readLegacyField(text, [label]);
      if (!raw) continue;
      const unit = config.physics.find(([, physicsKey]) => physicsKey === key)?.[2];
      const parsed = measure(raw, unit);
      const values = raw.match(/[0-9]+(?:[ \u00a0][0-9]{3})*(?:[.,][0-9]+)?/g) ?? [];
      parsed.standardDeviation = values[1] ? parseLocalizedNumber(values[1]) : null;
      physics[key] = parsed;
      break;
    }
  }
  return physics;
}

function mergeMissingPhysics(target, source) {
  for (const key of Object.keys(PHYSICS_RANGES)) {
    if (target[key].value === null && source[key].value !== null) target[key] = source[key];
  }
}

function parseWoodRecord(link, rawText) {
  const config = LANGUAGE_CONFIG[link.language];
  const sectionHeadings = allSectionHeadings(config);
  const fields = config.fields;
  const text = normalizeText(rawText);
  const legacyFormat = isLegacySheet(text);
  const preamble = text.slice(0, firstHeadingIndex(text, sectionHeadings));
  const sections = splitSections(text, sectionHeadings);
  const preambleLines = cleanLines(preamble);
  const sourceTitleLine = cleanSheetName(preambleLines[0] ?? link.sheetName);
  const titleLine =
    legacyFormat && link.language === 'en' ? cleanSheetName(link.sheetName) : sourceTitleLine;
  const secondaryName = preambleLines.find(
    (line, idx) =>
      idx > 0 &&
      !startsWithField(line, fields.family) &&
      !startsWithField(line, fields.botanicalNames),
  );
  const displayName = titleCaseName(
    legacyFormat ? titleLine : (secondaryName ?? titleLine ?? link.sheetName),
  );
  const id = `${slugify(link.region)}-${slugify(titleLine || link.sheetName)}`;
  const localNames = parseLocalNames(sectionValue(sections, config, 'localNames'), config);
  const family = valueOrNull(
    readField(preamble, fields.family, config) ||
      readLegacyField(text, legacyLabels(link.language).family),
  );
  const botanicalNames = parseBotanicalNames(preamble, config);
  if (botanicalNames.length === 0)
    botanicalNames.push(...parseLegacyBotanicalNames(text, link.language));
  const citesRaw = valueOrNull(readField(preamble, fields.cites, config));
  const originContinent = valueOrNull(readField(preamble, fields.continent, config));

  const logSection = sectionValue(sections, config, 'logs');
  const appearanceSection = sectionValue(sections, config, 'wood');
  const physicsSection = sectionValue(sections, config, 'physics');
  const durabilitySection = sectionValue(sections, config, 'durability');
  const treatmentSection = sectionValue(sections, config, 'treatment');
  const dryingSection = sectionValue(sections, config, 'drying');
  const machiningSection = sectionValue(sections, config, 'machining');
  const assemblySection = sectionValue(sections, config, 'assembly');
  const gradingSection = sectionValue(sections, config, 'grading');
  const fireSection = sectionValue(sections, config, 'fire');
  const endUsesSection = sectionValue(sections, config, 'endUses');
  const physics = parsePhysics(physicsSection, config);
  if (legacyFormat) mergeMissingPhysics(physics, parseLegacyPhysics(text, link.language));
  const legacy = legacyLabels(link.language);
  const legacyBlocks = legacyFormat ? legacySectionBlocks(text, link.language) : {};
  physics.stability = textValue(legacyFormat ? readLegacyField(text, legacy.stability) : '');
  physics.notes = legacyFormat
    ? readLegacyNotes(legacyBlocks.physics)
    : notes(readField(physicsSection, fields.notes, config));
  const legacyFireSafety = legacyFormat ? parseLegacyFireSafety(legacyBlocks.fire, legacy) : null;
  const fireSafety = legacyFireSafety ?? parseFireSafety(fireSection, config);
  if (!fireSafety.frenchGrading)
    fireSafety.frenchGrading = valueOrNull(readLegacyField(text, legacy.frenchGrading));
  if (!fireSafety.euroclass.value)
    fireSafety.euroclass = textValue(readLegacyField(text, legacy.euroclass));
  const legacyGrading = legacyFormat ? parseLegacyGrading(legacyBlocks.grading, legacy) : null;
  const grading =
    legacyGrading && (legacyGrading.appearance || legacyGrading.structural)
      ? legacyGrading
      : parseGrading(gradingSection, config);
  const scheduleSource = legacyFormat ? (legacyBlocks.drying ?? text) : dryingSection;

  return {
    id,
    identity: {
      primaryName: titleCaseName(titleLine || link.sheetName),
      displayName,
      slug: slugify(titleLine || link.sheetName),
      family,
      botanicalNames,
      aliases: parseAliases(sourceTitleLine, titleLine, displayName, link.sheetName),
      localNames,
      commercialRestrictions: textValue(
        legacyFormat ? readLegacyField(text, legacy.commercialRestrictions) : '',
      ),
      notes: notes(readField(preamble, fields.notes, config)),
    },
    origin: {
      region: link.region,
      continent: originContinent,
      countries: [...new Set(localNames.map((item) => item.country))].sort(),
    },
    cites: {
      raw: citesRaw,
      listed: parseCitesListed(citesRaw),
    },
    log: {
      diameterCm: measure(
        readField(logSection, fields.diameter, config) || readLegacyField(text, legacy.diameter),
        'cm',
      ),
      sapwoodThickness: textValue(
        readField(logSection, fields.sapwoodThickness, config) ||
          readLegacyField(text, legacy.sapwoodThickness),
      ),
      floats: textValue(
        readField(logSection, fields.floats, config) || readLegacyField(text, legacy.floats),
      ),
      durability: textValue(
        readField(logSection, fields.logDurability, config) ||
          readLegacyField(text, legacy.logDurability),
      ),
      notes: legacyFormat ? [] : notes(readField(logSection, fields.notes, config)),
    },
    appearance: {
      colourReference: textValue(
        readField(appearanceSection, fields.colourReference, config) ||
          readLegacyField(text, legacy.colourReference),
      ),
      sapwood: textValue(
        readField(appearanceSection, fields.sapwood, config) ||
          readLegacyField(text, legacy.sapwood),
      ),
      texture: textValue(
        readField(appearanceSection, fields.texture, config) ||
          readLegacyField(text, legacy.texture),
      ),
      grain: textValue(
        readField(appearanceSection, fields.grain, config) || readLegacyField(text, legacy.grain),
      ),
      interlockedGrain: textValue(
        readField(appearanceSection, fields.interlockedGrain, config) ||
          readLegacyField(text, legacy.interlockedGrain),
      ),
      notes: legacyFormat
        ? readLegacyNotes(legacyBlocks.appearance)
        : notes(readField(appearanceSection, fields.notes, config)),
    },
    physics,
    durability: {
      fungi: textValue(
        readField(durabilitySection, fieldLabels(config, 'fungi'), config) ||
          readLegacyField(text, legacy.fungi),
      ),
      dryWoodBorers: textValue(
        readField(durabilitySection, fieldLabels(config, 'dryWoodBorers'), config) ||
          readLegacyField(text, legacy.dryWoodBorers),
      ),
      termites: textValue(
        readField(durabilitySection, fieldLabels(config, 'termites'), config) ||
          readLegacyField(text, legacy.termites),
      ),
      treatability: textValue(
        readField(durabilitySection, fieldLabels(config, 'treatability'), config) ||
          readLegacyField(text, legacy.treatability),
      ),
      naturalUseClass: textValue(
        readField(durabilitySection, fieldLabels(config, 'naturalUseClass'), config) ||
          readLegacyField(text, legacy.naturalUseClass),
      ),
      coversUseClass5: textValue(legacyFormat ? readLegacyField(text, legacy.coversUseClass5) : ''),
      preservativeTreatment: {
        dryWoodBorer: textValue(
          readField(treatmentSection, fields.treatmentDryWoodBorer, config) ||
            readLegacyField(text, legacy.treatmentDryWoodBorer),
        ),
        temporaryHumidification: textValue(
          readField(treatmentSection, fields.treatmentTemporary, config) ||
            readLegacyField(text, legacy.treatmentTemporary),
        ),
        permanentHumidification: textValue(
          readField(treatmentSection, fields.treatmentPermanent, config) ||
            readLegacyField(text, legacy.treatmentPermanent),
        ),
        notes: legacyFormat
          ? readLegacyNotes(legacyBlocks.treatment)
          : notes(readField(treatmentSection, fields.notes, config)),
      },
      notes: legacyFormat
        ? readLegacyNotes(legacyBlocks.durability)
        : notes(readField(durabilitySection, fields.notes, config)),
    },
    drying: {
      rate: textValue(
        readField(dryingSection, fields.dryingRate, config) ||
          readLegacyField(text, legacy.dryingRate),
      ),
      distortionRisk: textValue(
        readField(dryingSection, fields.distortionRisk, config) ||
          readField(dryingSection, fields.distortionRiskAlt, config) ||
          readLegacyField(text, legacy.distortionRisk),
      ),
      casehardeningRisk: textValue(
        readField(dryingSection, fields.casehardeningRisk, config) ||
          readLegacyField(text, legacy.casehardeningRisk),
      ),
      checkingRisk: textValue(
        readField(dryingSection, fields.checkingRisk, config) ||
          readLegacyField(text, legacy.checkingRisk),
      ),
      collapseRisk: textValue(
        readField(dryingSection, fields.collapseRisk, config) ||
          readLegacyField(text, legacy.collapseRisk),
      ),
      notes: legacyFormat
        ? readLegacyNotes(legacyBlocks.drying)
        : notes(readField(dryingSection, fields.notes, config)),
      schedule: parseDryingSchedule(scheduleSource, config),
      scheduleNotes: parseDryingScheduleNotes(scheduleSource),
    },
    machining: {
      bluntingEffect: textValue(
        readField(machiningSection, fields.bluntingEffect, config) ||
          readLegacyField(text, legacy.bluntingEffect),
      ),
      sawteethRecommended: textValue(
        readField(machiningSection, fields.sawteethRecommended, config) ||
          readLegacyField(text, legacy.sawteethRecommended),
      ),
      cuttingTools: textValue(
        readField(machiningSection, fields.cuttingTools, config) ||
          readLegacyField(text, legacy.cuttingTools),
      ),
      peeling: textValue(
        readField(machiningSection, fields.peeling, config) ||
          readLegacyField(text, legacy.peeling),
      ),
      slicing: textValue(
        readField(machiningSection, fields.slicing, config) ||
          readLegacyField(text, legacy.slicing),
      ),
      notes: legacyFormat
        ? readLegacyNotes(legacyBlocks.machining)
        : notes(readField(machiningSection, fields.notes, config)),
    },
    assembly: {
      nailingAndScrewing: textValue(
        readField(assemblySection, fields.nailingAndScrewing, config) ||
          readLegacyField(text, legacy.nailingAndScrewing),
      ),
      gluing: textValue(legacyFormat ? readLegacyField(text, legacy.gluing) : ''),
      notes: legacyFormat
        ? readLegacyNotes(legacyBlocks.assembly)
        : notes(readField(assemblySection, fields.notes, config)),
    },
    grading,
    fireSafety,
    endUses: parseEndUses(endUsesSection),
    endUseNotes: legacyFormat
      ? readLegacyNotes(legacyBlocks.endUses)
      : notes(readField(endUsesSection, fields.notes, config)),
    images: [],
    source: {
      provider: 'CIRAD Tropix',
      listingUrls: LISTINGS,
      pdfs: {
        [link.language]: sourcePdf(link),
      },
      lastUpdateDate: parseLastUpdate(rawText),
      extractionDate: new Date().toISOString(),
    },
    rawSections: sections,
    extraction: {
      parsedFields: 0,
      missingImportantFields: [],
      warnings: [],
    },
    searchText: '',
  };
}

async function readManualImageManifest() {
  const manifest = JSON.parse(await fsp.readFile(MANUAL_IMAGE_MANIFEST_PATH, 'utf8'));
  if (!manifest || !Array.isArray(manifest.images)) {
    throw new Error(`${MANUAL_IMAGE_MANIFEST_PATH} must contain an images array`);
  }

  const seen = new Set();
  const registeredSourceFiles = new Set();
  for (const [index, image] of manifest.images.entries()) {
    const label = `manual image ${index + 1}`;
    for (const key of ['woodId', 'kind', 'sourceFile']) {
      if (typeof image?.[key] !== 'string' || !image[key].trim()) {
        throw new Error(`${label} has an invalid ${key}`);
      }
    }
    if (!['flatSawn', 'quarterSawn'].includes(image.kind)) {
      throw new Error(`${label} has an unsupported kind: ${image.kind}`);
    }
    const expectedSourceFile = `${image.woodId}/${
      image.kind === 'flatSawn' ? 'tangential.jpg' : 'radial.jpg'
    }`;
    if (image.sourceFile !== expectedSourceFile) {
      throw new Error(`${label} must use the conventional source path ${expectedSourceFile}`);
    }
    const uniqueKey = `${image.woodId}|${image.kind}`;
    if (seen.has(uniqueKey)) throw new Error(`${label} duplicates ${uniqueKey}`);
    seen.add(uniqueKey);
    if (registeredSourceFiles.has(image.sourceFile)) {
      throw new Error(`${label} reuses ${image.sourceFile}`);
    }
    registeredSourceFiles.add(image.sourceFile);

    const sourcePath = manualImageSourcePath(image.sourceFile);
    await fsp.access(sourcePath);
    const metadata = await sharp(sourcePath).metadata();
    if (!metadata.width || !metadata.height) throw new Error(`${label} is not a readable image`);
    if (metadata.format !== 'jpeg') throw new Error(`${label} must be a JPEG image`);

    const creditKeys = ['sourceUrl', 'creator', 'license', 'licenseUrl'];
    const providedCreditKeys = creditKeys.filter(
      (key) => typeof image?.[key] === 'string' && image[key].trim(),
    );
    if (providedCreditKeys.length > 0 && providedCreditKeys.length !== creditKeys.length) {
      throw new Error(`${label} must provide either all credit fields or none of them`);
    }
    if (providedCreditKeys.length > 0) {
      for (const key of ['sourceUrl', 'licenseUrl']) {
        const url = new URL(image[key]);
        if (!['http:', 'https:'].includes(url.protocol)) {
          throw new Error(`${label} has an unsupported ${key} protocol`);
        }
      }
    }
  }

  const unregisteredSourceFiles = (await listManualImageSourceFiles()).filter(
    (sourceFile) => !registeredSourceFiles.has(sourceFile),
  );
  if (unregisteredSourceFiles.length > 0) {
    throw new Error(
      `Manual image sources are missing from the manifest: ${unregisteredSourceFiles.join(', ')}`,
    );
  }
  return manifest.images;
}

async function listManualImageSourceFiles(directory = MANUAL_IMAGE_SOURCE_DIR) {
  const entries = await fsp.readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return listManualImageSourceFiles(entryPath);
      if (!/\.(?:jpe?g|png|webp)$/i.test(entry.name)) return [];
      return [path.relative(MANUAL_IMAGE_SOURCE_DIR, entryPath).split(path.sep).join('/')];
    }),
  );
  return files.flat().sort();
}

function manualImageSourcePath(sourceFile) {
  const sourcePath = path.resolve(MANUAL_IMAGE_SOURCE_DIR, sourceFile);
  const relativePath = path.relative(MANUAL_IMAGE_SOURCE_DIR, sourcePath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`Manual image source escapes its source directory: ${sourceFile}`);
  }
  return sourcePath;
}

async function publishManualImages() {
  const images = await readManualImageManifest();
  return Promise.all(
    images.map(async (image) => {
      const fileName = `${kebabCase(image.kind)}.jpg`;
      const output = path.join(PUBLIC_WOOD_DIR, image.woodId, fileName);
      await fsp.mkdir(path.dirname(output), { recursive: true });
      await fsp.copyFile(manualImageSourcePath(image.sourceFile), output);
      const metadata = await sharp(output).metadata();
      return {
        ...image,
        src: `/assets/woods/${image.woodId}/${fileName}`,
        width: metadata.width,
        height: metadata.height,
      };
    }),
  );
}

function mergeManualImages(databases, manualImages) {
  const unmatched = new Set(manualImages.map((image) => `${image.woodId}|${image.kind}`));
  for (const { records } of databases) {
    const recordsById = new Map(records.map((record) => [record.id, record]));
    for (const manualImage of manualImages) {
      const record = recordsById.get(manualImage.woodId);
      if (!record) continue;
      unmatched.delete(`${manualImage.woodId}|${manualImage.kind}`);
      const credit = manualImage.creator
        ? {
            creator: manualImage.creator,
            sourceUrl: manualImage.sourceUrl,
            license: manualImage.license,
            licenseUrl: manualImage.licenseUrl,
          }
        : undefined;
      const image = {
        kind: manualImage.kind,
        src: manualImage.src,
        alt: '',
        width: manualImage.width,
        height: manualImage.height,
        ...(credit ? { credit } : {}),
      };
      record.images = [...record.images.filter((item) => item.kind !== image.kind), image].sort(
        (left, right) => imageKindOrder(left.kind) - imageKindOrder(right.kind),
      );
    }
  }
  if (unmatched.size > 0) {
    throw new Error(`Manual images target unknown wood records: ${[...unmatched].join(', ')}`);
  }
}

function imageKindOrder(kind) {
  if (kind === 'flatSawn') return 0;
  if (kind === 'quarterSawn') return 1;
  return 2;
}

async function extractImages(link, record) {
  const pdfPath = path.join(ROOT, link.localPath);
  const imageRoot = path.join(PUBLIC_WOOD_DIR, record.id);
  await fsp.mkdir(imageRoot, { recursive: true });
  const imageList = await pdfImageList(pdfPath);
  const selected = selectImages(imageList);
  if (selected.length === 0) {
    return [];
  }

  const outputs = selected.map((item, idx) => {
    const kind = item.kind === 'example' ? 'example' : idx === 0 ? 'flatSawn' : 'quarterSawn';
    const count = selected
      .slice(0, idx + 1)
      .filter((candidate, cIdx) => cIdx > 1 && candidate.kind === 'example').length;
    const fileName =
      kind === 'example' ? `example-${count || idx - 1}.jpg` : `${kebabCase(kind)}.jpg`;
    return { ...item, kind, output: path.join(imageRoot, fileName), fileName };
  });

  const allExist = await Promise.all(outputs.map((item) => fileExists(item.output)));
  if (!allExist.every(Boolean)) {
    const tmp = path.join(TMP_IMAGE_DIR, record.id);
    await fsp.rm(tmp, { recursive: true, force: true });
    await fsp.mkdir(tmp, { recursive: true });
    const base = path.join(tmp, 'image');
    await execFile('pdfimages', ['-png', pdfPath, base], { maxBuffer: 1024 * 1024 * 10 });
    for (const item of outputs) {
      const input = `${base}-${String(item.num).padStart(3, '0')}.png`;
      if (!(await fileExists(input))) continue;
      await convertImage(input, item.output, item.kind);
    }
  }

  const published = [];
  for (const item of outputs) {
    if (!fs.existsSync(item.output)) continue;
    const metadata = await sharp(item.output).metadata();
    published.push({
      kind: item.kind,
      src: `/assets/woods/${record.id}/${item.fileName}`,
      alt: `${record.identity.displayName} ${labelForImageKind(item.kind, link.language)}`,
      width: metadata.width,
      height: metadata.height,
    });
  }
  return published;
}

async function prepareImageOutput() {
  let currentVersion = '';
  try {
    currentVersion = (await fsp.readFile(IMAGE_VERSION_PATH, 'utf8')).trim();
  } catch {
    // A missing version marker means the existing images use an obsolete format.
  }

  if (currentVersion !== IMAGE_PIPELINE_VERSION) {
    await fsp.rm(PUBLIC_WOOD_DIR, { recursive: true, force: true });
  }

  await fsp.mkdir(PUBLIC_WOOD_DIR, { recursive: true });
  await fsp.writeFile(IMAGE_VERSION_PATH, `${IMAGE_PIPELINE_VERSION}\n`);
}

async function pdfImageList(pdfPath) {
  try {
    const { stdout } = await execFile('pdfimages', ['-list', pdfPath], {
      maxBuffer: 1024 * 1024 * 10,
    });
    return stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => /^\d+\s+\d+\s+image\s+/.test(line))
      .map((line) => {
        const parts = line.split(/\s+/);
        return {
          page: Number(parts[0]),
          num: Number(parts[1]),
          width: Number(parts[3]),
          height: Number(parts[4]),
        };
      });
  } catch {
    return [];
  }
}

function selectImages(images) {
  const grains = images
    .filter((image) => image.page === 1 && image.width >= 900 && image.height >= 900)
    .sort((a, b) => a.num - b.num)
    .slice(0, 2);
  const examples = images
    .filter((image) => image.page > 1 && image.width >= 900 && image.height >= 900)
    .sort((a, b) => b.width * b.height - a.width * a.height)
    .slice(0, 1)
    .map((image) => ({ ...image, kind: 'example' }));
  return [...grains, ...examples];
}

async function convertImage(input, output, kind) {
  await fsp.mkdir(path.dirname(output), { recursive: true });
  const metadata = await sharp(input).metadata();
  const pipeline = sharp(input);
  if ((metadata.height ?? 0) > (metadata.width ?? 0) * 1.2) pipeline.rotate(90);
  if (kind === 'example') {
    pipeline.resize({
      width: EXAMPLE_IMAGE_MAX_SIZE,
      height: EXAMPLE_IMAGE_MAX_SIZE,
      fit: 'inside',
      withoutEnlargement: true,
    });
  } else {
    pipeline.resize(GRAIN_IMAGE_SIZE, GRAIN_IMAGE_SIZE, {
      fit: 'cover',
      position: 'centre',
    });
  }
  await pipeline
    .flatten({ background: '#fff' })
    .jpeg({ quality: WOOD_IMAGE_QUALITY, mozjpeg: true })
    .toFile(output);
}

function normalizeText(text) {
  return text
    .replace(/\r/g, '')
    .replace(/\u000c/g, '\n')
    .split('\n')
    .map((line) =>
      line
        .replace(
          /[ \t]{2,}(?:[A-Za-z-]*quarter sawn|flat sawn|débit sur faux quartier|débit sur quartier|débit sur dosse)[ \t]*$/i,
          '',
        )
        .replace(
          /(?:Half[- ]quarter sawn|Quarter sawn|Flat sawn|Débit sur faux quartier|Débit sur quartier|Débit sur dosse)/g,
          ' ',
        )
        .replace(/[ \t]+$/g, ''),
    )
    .join('\n');
}

function firstHeadingIndex(text, sectionHeadings) {
  const positions = sectionHeadings
    .map((heading) => headingMatch(text, heading)?.index ?? -1)
    .filter((idx) => idx >= 0);
  return positions.length ? Math.min(...positions) : text.length;
}

function splitSections(text, sectionHeadings) {
  const entries = sectionHeadings
    .map((heading) => ({ heading, match: headingMatch(text, heading) }))
    .filter((entry) => entry.match)
    .map(({ heading, match }) => ({
      heading,
      index: match.index,
      end: match.index + match[0].length,
    }))
    .sort((a, b) => a.index - b.index);
  const sections = {};
  for (let i = 0; i < entries.length; i += 1) {
    const current = entries[i];
    const next = entries[i + 1];
    const content = text.slice(current.end, next ? next.index : text.length);
    sections[current.heading] = stripBoilerplate(content);
  }
  return sections;
}

function headingMatch(text, heading) {
  return new RegExp(`^[ \\t]*${escapeRegExp(heading)}[ \\t]*$`, 'im').exec(text);
}

function stripBoilerplate(text) {
  return text
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      if (/^Copyright\b/.test(trimmed)) return false;
      if (/^(Last update date:|Date de dernière mise à jour\s*:)/i.test(trimmed)) return false;
      if (/^Page \d+\/\d+/.test(trimmed)) return false;
      return true;
    })
    .join('\n')
    .trim();
}

function cleanLines(text) {
  return stripBoilerplate(text)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function readField(text, label, config) {
  const lines = stripBoilerplate(text).split('\n');
  const labels = Array.isArray(label) ? label : [label];
  const labelRegex = new RegExp(`^\\s*(?:${labels.map(escapeRegExp).join('|')})\\.\\s*(.*)$`, 'i');
  const allLabels = [...new Set(allFieldLabels(config))];
  const allLabelRegex = new RegExp(`^\\s*(?:${allLabels.map(escapeRegExp).join('|')})\\.`);
  const start = lines.findIndex((line) => labelRegex.test(line));
  if (start === -1) return '';

  const values = [];
  const first = lines[start].match(labelRegex)?.[1]?.trim() ?? '';
  if (first) values.push(first);

  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      if (values.length) break;
      continue;
    }
    if (allLabelRegex.test(line)) break;
    if (allSectionHeadings(config).includes(trimmed)) break;
    if (/^(Property|Country|Phases|Propriété|Pays)\b/i.test(trimmed)) break;
    values.push(trimmed);
  }
  return values.join(' ').replace(/\s+/g, ' ').trim();
}

function parseBotanicalNames(preamble, config) {
  const lines = cleanLines(preamble);
  const startRegex = new RegExp(`^${escapeRegExp(config.fields.botanicalNames)}\\.`, 'i');
  const stopRegex = new RegExp(
    `^(?:${[config.fields.continent, config.fields.cites, config.fields.family].map(escapeRegExp).join('|')})\\.`,
    'i',
  );
  const start = lines.findIndex((line) => startRegex.test(line));
  if (start === -1) return [];
  const names = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (stopRegex.test(line)) break;
    if (!line || line.length < 2) continue;
    names.push({
      name: line.replace(/\s*\((?:synonymous|synonyme)\)\s*/i, '').trim(),
      isSynonym: /\((?:synonymous|synonyme)\)/i.test(line),
    });
  }
  return names;
}

function parsePhysics(section, config) {
  const byKey = {};
  for (const [, key, unit] of config.physics) {
    byKey[key] = measure('', unit);
  }
  const lines = cleanLines(section).map((line) =>
    line.replace(/[0-9]\s*(?:At 12 % moisture content|À 12 % d’humidité).*/, '').trim(),
  );
  for (const line of lines) {
    const normalized = line.replace(/[¹²³]/g, '').replace(/\s+/g, ' ').trim();
    for (const [label, key, unit] of config.physics) {
      if (normalized.toLowerCase().startsWith(label.toLowerCase())) {
        const raw = normalized.slice(label.length).trim();
        if (byKey[key].value === null && looksLikeMeasureValue(raw)) {
          byKey[key] = measure(raw, unit);
        }
        break;
      }
    }
  }
  return byKey;
}

function looksLikeMeasureValue(raw) {
  const withoutQualifier = raw.replace(/^\([^)]{1,16}\)\s*/, '').trim();
  return /^(?:[-–—]|[<>~≈]?\s*\d|(?:from|de)\s+\d)/i.test(withoutQualifier);
}

function parseDryingSchedule(section, config) {
  const rows = [];
  const lines = stripBoilerplate(section)
    .split('\n')
    .map((line) => line.trimEnd());
  const start = lines.findIndex((line) => /^Phases\b/i.test(line));
  if (start === -1) return parseLegacyDryingSchedule(section, config);
  let currentPhase = '';
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;
    if (/^\(\d+\)/.test(line)) break;
    const parts = line
      .split(/\s{2,}/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length < 4) continue;
    let phase = parts[0];
    let durationHours = null;
    let moistureContent = null;
    let temperatureC = null;
    let relativeHumidityPercent = null;
    let uglPercent = null;

    if (config.phaseNames.test(phase)) {
      currentPhase = phase;
      if (
        /^(?:Conditioning|Cooling|Équilibrage|Refroidissement)/i.test(phase) &&
        parts.length >= 5
      ) {
        [, durationHours, temperatureC, relativeHumidityPercent, uglPercent] = parts;
      } else if (parts.length >= 6) {
        [, durationHours, moistureContent, temperatureC, relativeHumidityPercent, uglPercent] =
          parts;
      } else {
        [, moistureContent, temperatureC, relativeHumidityPercent, uglPercent] = parts;
      }
    } else {
      phase = currentPhase || config.defaultDryingPhase;
      [moistureContent, temperatureC, relativeHumidityPercent, uglPercent] = parts;
    }
    rows.push({
      phase,
      durationHours,
      moistureContent,
      temperatureC,
      relativeHumidityPercent,
      uglPercent,
    });
  }
  return rows;
}

function parseLegacyDryingSchedule(section, config) {
  const rows = [];
  for (const line of section.split('\n')) {
    const match =
      /(?:^|\s{2,})(Green|Vert|\d+)\s{2,}(\d+(?:[.,]\d+)?)\s{2,}(\d+(?:[.,]\d+)?)\s{2,}(\d+(?:[.,]\d+)?)/i.exec(
        line,
      );
    if (!match) continue;
    rows.push({
      phase: config.defaultDryingPhase,
      durationHours: null,
      moistureContent: match[1],
      temperatureC: match[2],
      wetBulbTemperatureC: match[3],
      relativeHumidityPercent: match[4],
      uglPercent: null,
    });
  }
  return rows;
}

function parseDryingScheduleNotes(section) {
  const numbered = section
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^\(\d+\)\s+/.test(line));
  if (numbered.length > 0) return numbered;
  return section
    .split('\n')
    .map((line) => line.trim())
    .filter((line) =>
      /^(?:This schedule|It must be used|For thickness|(?:Cette )?Table (?:de séchage )?(?:est )?donnée|Elle est à valider|Pour des épaisseurs)/i.test(
        line,
      ),
    );
}

function parseGrading(section, config) {
  const text = stripRepeatedPageTitles(stripBoilerplate(section));
  const [appearanceMarker, structuralMarker] = config.grading;
  const appearance = between(text, appearanceMarker, structuralMarker);
  const structural = after(text, structuralMarker);
  return {
    appearance: valueOrNull(cleanExtractedProse(appearance)),
    structural: valueOrNull(cleanExtractedProse(structural)),
  };
}

function parseFireSafety(section, config) {
  const text = stripRepeatedPageTitles(stripBoilerplate(section));
  const french = cleanExtractedProse(
    between(text, config.fields.frenchGrading, config.fields.euroclass),
  );
  const euroMatch = new RegExp(
    `^\\s*${escapeRegExp(config.fields.euroclass)}\\.\\s*([^\\n]+)`,
    'im',
  ).exec(text);
  const euro = cleanExtractedProse(euroMatch?.[1] ?? '');
  const notesText = euroMatch
    ? cleanExtractedProse(text.slice((euroMatch.index ?? 0) + euroMatch[0].length))
    : '';
  return {
    frenchGrading: valueOrNull(french),
    euroclass: textValue(euro),
    notes: valueOrNull(notesText),
  };
}

function stripRepeatedPageTitles(text) {
  return text
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      return !(trimmed.length > 1 && trimmed.length < 60 && /^[\p{Lu}\s'’/-]+$/u.test(trimmed));
    })
    .join('\n');
}

function cleanExtractedProse(value) {
  return value
    .replace(/^\s*[.:]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseEndUses(section) {
  const uses = [];
  for (const line of section.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- ')) {
      uses.push(trimmed.slice(2).trim());
    }
  }
  if (uses.length === 0) {
    for (const line of section.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || /^(?:Notes?\s*:|TROPIX\b|Copyright\b|\d{2}\/\d{2}\/\d{4})/i.test(trimmed))
        continue;
      const parts = trimmed
        .split(/\s{2,}/)
        .map((part) => part.trim())
        .filter(Boolean);
      for (const part of parts) {
        if (!part.includes(':') && part.length > 1) uses.push(part);
      }
    }
  }
  return [...new Set(uses)].sort((a, b) => a.localeCompare(b));
}

function parseLocalNames(section, config) {
  const names = [];
  for (const line of section.split('\n')) {
    const trimmed = line.trim();
    if (
      !trimmed ||
      config.localNamesHeader.test(trimmed) ||
      /^(?:TROPIX\b|Copyright\b|\d{2}\/\d{2}\/\d{4})/i.test(trimmed)
    )
      continue;
    const parts = trimmed
      .split(/\s{2,}/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length >= 2) {
      for (let index = 0; index + 1 < parts.length; index += 2) {
        names.push({ country: parts[index], name: parts[index + 1] });
      }
    }
  }
  return names;
}

function measure(raw, fallbackUnit) {
  const cleanRaw = (raw ?? '').replace(/\s+/g, ' ').trim();
  const range = parseRange(cleanRaw);
  const first = parseFirstNumber(cleanRaw);
  return {
    raw: cleanRaw,
    value: range ? (range.min + range.max) / 2 : first,
    min: range?.min ?? null,
    max: range?.max ?? null,
    unit: fallbackUnit ?? parseUnit(cleanRaw),
  };
}

function parseRange(raw) {
  const fromTo = raw.match(/(?:from\s+|de\s+)([0-9.,]+)\s+(?:to|à)\s+([0-9.,]+)/i);
  if (fromTo) {
    return { min: parseLocalizedNumber(fromTo[1]), max: parseLocalizedNumber(fromTo[2]) };
  }
  const dashed = raw.match(/([0-9.,]+)\s*-\s*([0-9.,]+)/);
  if (dashed) {
    return { min: parseLocalizedNumber(dashed[1]), max: parseLocalizedNumber(dashed[2]) };
  }
  return null;
}

function parseFirstNumber(raw) {
  const match = raw.match(/[0-9]+(?:[ \u00a0][0-9]{3})*(?:[.,][0-9]+)?/);
  return match ? parseLocalizedNumber(match[0]) : null;
}

function parseLocalizedNumber(value) {
  let next = value.trim().replace(/[ \u00a0]/g, '');
  if (/^\d{1,3}(,\d{3})+(?:\.\d+)?$/.test(next)) {
    next = next.replace(/,/g, '');
  } else {
    next = next.replace(',', '.');
  }
  const parsed = Number(next);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseUnit(raw) {
  if (/% (?:per|par) %/.test(raw)) return raw.includes(' par ') ? '% par %' : '% per %';
  if (/W\/\(m\.K\)/.test(raw)) return 'W/(m.K)';
  if (/MPa/.test(raw)) return 'MPa';
  if (/%/.test(raw)) return '%';
  if (/cm/.test(raw)) return 'cm';
  return undefined;
}

function textValue(raw) {
  const value = valueOrNull(raw);
  return { raw: raw?.trim?.() ?? '', value };
}

function notes(raw) {
  if (!raw) return [];
  return raw
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseAliases(...values) {
  const aliases = new Set();
  for (const value of values) {
    if (!value) continue;
    const cleaned = cleanSheetName(value);
    for (const part of cleaned.split(/\s+(?:or|ou)\s+| \/ |,|_/i)) {
      const alias = titleCaseName(part.trim());
      if (alias) aliases.add(alias);
    }
  }
  return [...aliases].filter(Boolean);
}

function parseCitesListed(raw) {
  if (!raw) return null;
  if (/not listed|n['’]est pas inscrite/i.test(raw)) return false;
  if (/listed|est inscrite/i.test(raw)) return true;
  return null;
}

function sourcePdf(link) {
  return {
    language: link.language,
    region: link.regionSource,
    url: link.url,
    fileName: link.fileName,
    localPath: link.localPath,
    year: link.year,
  };
}

function qualityReport(record) {
  const missingImportantFields = [];
  const warnings = [];
  const checks = [
    ['family', record.identity.family],
    ['specificGravity', record.physics.specificGravity.value],
    ['monninHardness', record.physics.monninHardness.value],
    ['totalRadialShrinkage', record.physics.totalRadialShrinkage.value],
    ['fungiResistance', record.durability.fungi.value],
    ['termiteResistance', record.durability.termites.value],
  ];
  for (const [key, value] of checks) {
    if (value === null || value === undefined || value === '') missingImportantFields.push(key);
  }
  if (record.endUses.length === 0) missingImportantFields.push('endUses');
  if (record.images.filter((image) => image.kind !== 'example').length < 2)
    warnings.push('Missing one or both grain images');
  return {
    parsedFields: countParsedFields(record),
    missingImportantFields,
    warnings,
  };
}

function countParsedFields(record) {
  let count = 0;
  JSON.stringify(record, (_key, value) => {
    if (value && typeof value === 'object' && 'value' in value && value.value !== null) count += 1;
    return value;
  });
  count += record.identity.botanicalNames.length;
  count += record.endUses.length;
  count += record.identity.localNames.length;
  count += record.images.length;
  return count;
}

function makeSearchText(record) {
  return [
    record.identity.displayName,
    record.identity.primaryName,
    ...record.identity.aliases,
    record.identity.family,
    ...record.identity.botanicalNames.map((item) => item.name),
    ...record.identity.localNames.flatMap((item) => [item.country, item.name]),
    record.origin.region,
    record.origin.continent,
    record.appearance.colourReference.value,
    record.appearance.texture.value,
    record.appearance.grain.value,
    record.durability.fungi.value,
    record.durability.termites.value,
    ...record.endUses,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function parseLastUpdate(text) {
  return (
    text.match(/(?:Last update date|Date de dernière mise à jour)\s*:\s*([0-9/.-]+)/i)?.[1] ?? null
  );
}

function between(text, start, end) {
  const startIndex = text.indexOf(start);
  if (startIndex === -1) return '';
  const afterStart = startIndex + start.length;
  const endIndex = text.indexOf(end, afterStart);
  return text
    .slice(afterStart, endIndex === -1 ? text.length : endIndex)
    .replace(/\s+/g, ' ')
    .trim();
}

function after(text, marker) {
  const index = text.indexOf(marker);
  if (index === -1) return '';
  return text
    .slice(index + marker.length)
    .replace(/\s+/g, ' ')
    .trim();
}

async function runLimited(items, concurrency, worker) {
  const queue = [...items];
  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length) {
      const item = queue.shift();
      await worker(item);
    }
  });
  await Promise.all(workers);
}

async function fileExists(filePath) {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function localPdfPath(language, regionSource, fileName) {
  return path.join('data', 'raw', 'pdfs', language, regionSource, fileName);
}

function cleanSheetName(name) {
  return name
    .replace(/\.[Pp][Dd][Ff]$/, '')
    .replace(/\b20\d{2}\b/g, '')
    .replace(/\s+Page\s+\d+(?:\s*(?:\/|of|sur)\s*\d+)?$/i, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+-\s*$/, '')
    .trim();
}

function extractYear(name) {
  const match = name.match(/\b(20\d{2})\b/);
  return match ? Number(match[1]) : null;
}

function titleCaseName(name) {
  return String(name ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(
      /(^|[\s'(-])(\p{L})/gu,
      (_match, prefix, letter) => `${prefix}${letter.toUpperCase()}`,
    );
}

function slugify(value) {
  return (
    String(value ?? 'unknown')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'unknown'
  );
}

function looseNameKey(value) {
  return slugify(cleanSheetName(value)).replace(/\b(or|ou)\b/g, '');
}

function kebabCase(value) {
  return String(value)
    .replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)
    .replace(/^-/, '');
}

function labelForImageKind(kind, language = 'en') {
  if (language === 'fr') {
    if (kind === 'flatSawn') return 'débit sur dosse';
    if (kind === 'quarterSawn') return 'débit sur quartier';
    return "exemple d'utilisation";
  }
  if (kind === 'flatSawn') return 'flat sawn grain';
  if (kind === 'quarterSawn') return 'quarter sawn grain';
  return 'use example';
}

function startsWithField(line, label) {
  return new RegExp(`^${escapeRegExp(label)}\\.`, 'i').test(line);
}

function valueOrNull(raw) {
  const value = raw?.replace(/\s+/g, ' ').trim() ?? '';
  return value && value !== '-' ? value : null;
}

function stripTags(value) {
  return value.replace(/<[^>]*>/g, '');
}

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
