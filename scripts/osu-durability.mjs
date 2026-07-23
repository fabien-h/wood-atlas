#!/usr/bin/env node

import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW_DIRECTORY = path.join(ROOT, 'data', 'raw', 'osu-durability');
const RAW_PDF_PATH = path.join(RAW_DIRECTORY, 'worldwide-checklist.pdf');
const MANIFEST_PATH = path.join(ROOT, 'data', 'manual', 'woods', 'osu-durability.json');
const TRANSLATION_MANIFEST_PATH = path.join(
  ROOT,
  'data',
  'manual',
  'content-translations',
  'osu-durability.json',
);
const ENGLISH_DATABASE_PATH = path.join(ROOT, 'public', 'data', 'woods.generated.en.json');
const FRENCH_DATABASE_PATH = path.join(ROOT, 'public', 'data', 'woods.generated.fr.json');

const PDF_URL = 'https://owic.oregonstate.edu/sites/default/files/pubs/durability.pdf';
const CITATION_URL =
  'https://juniper.oregonstate.edu/bibliography/natural-durability-wood-worldwide-checklist-species';
const SOURCE_PROVIDER = 'Oregon State University Wood Innovation Center';
const SOURCE_REFERENCE = {
  title: 'Natural Durability of Wood: A Worldwide Checklist of Species',
  url: PDF_URL,
  publisher: 'Oregon State University, Forest Research Laboratory',
  year: 1998,
};
const EXTRACTION_DATE = '2026-07-23';
const CONTENT_LOCALES = [
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

const CATEGORY_TRANSLATIONS = [
  {
    scope: 'durability.fungi.value',
    source: 'class 2-5 - durable to not durable',
    translations: {
      ar: 'الفئة 2-5 - من متين إلى غير متين',
      bn: 'শ্রেণি 2-5 - টেকসই থেকে অটেকসই',
      de: 'Klasse 2–5 – dauerhaft bis nicht dauerhaft',
      es: 'clase 2-5 - de durable a no durable',
      hi: 'वर्ग 2-5 - टिकाऊ से गैर-टिकाऊ',
      id: 'kelas 2-5 - awet hingga tidak awet',
      it: 'classe 2-5 - da durabile a non durabile',
      ja: 'クラス2-5 - 耐久性あり〜耐久性なし',
      ko: '등급 2-5 - 내구성 있음부터 내구성 없음까지',
      pt: 'classe 2-5 - de durável a não durável',
      ru: 'класс 2–5 — от стойкой до нестойкой',
      tr: 'sınıf 2-5 - dayanıklıdan dayanıksıza',
      ur: 'درجہ 2-5 - پائیدار سے غیر پائیدار',
      vi: 'cấp 2-5 - từ bền đến không bền',
      'zh-Hans': '2-5级 - 从耐久到不耐久',
    },
  },
  {
    scope: 'durability.fungi.value',
    source: 'class 3-5 - moderately durable to not durable',
    translations: {
      ar: 'الفئة 3-5 - من متوسط المتانة إلى غير متين',
      bn: 'শ্রেণি 3-5 - মাঝারি টেকসই থেকে অটেকসই',
      de: 'Klasse 3–5 – mäßig dauerhaft bis nicht dauerhaft',
      es: 'clase 3-5 - de moderadamente durable a no durable',
      hi: 'वर्ग 3-5 - मध्यम टिकाऊ से गैर-टिकाऊ',
      id: 'kelas 3-5 - cukup awet hingga tidak awet',
      it: 'classe 3-5 - da moderatamente durabile a non durabile',
      ja: 'クラス3-5 - 中程度の耐久性〜耐久性なし',
      ko: '등급 3-5 - 보통 내구성부터 내구성 없음까지',
      pt: 'classe 3-5 - de moderadamente durável a não durável',
      ru: 'класс 3–5 — от умеренно стойкой до нестойкой',
      tr: 'sınıf 3-5 - orta dayanıklıdan dayanıksıza',
      ur: 'درجہ 3-5 - معتدل پائیدار سے غیر پائیدار',
      vi: 'cấp 3-5 - từ bền vừa đến không bền',
      'zh-Hans': '3-5级 - 从中等耐久到不耐久',
    },
  },
];

const command = process.argv[2] ?? 'all';
if (command === 'sync') {
  await sync();
} else if (command === 'generate') {
  await generate();
} else if (command === 'all') {
  await sync();
  await generate();
} else {
  console.error('Usage: node scripts/osu-durability.mjs <sync|generate|all>');
  process.exitCode = 1;
}

async function sync() {
  const response = await fetch(PDF_URL, { redirect: 'follow' });
  if (!response.ok) throw new Error(`OSU durability PDF download failed with ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (
    bytes.byteLength < 300_000 ||
    bytes[0] !== 0x25 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x44 ||
    bytes[3] !== 0x46
  ) {
    throw new Error(`OSU durability download is not the expected PDF (${bytes.byteLength} bytes)`);
  }
  await fs.mkdir(RAW_DIRECTORY, { recursive: true });
  await fs.writeFile(RAW_PDF_PATH, bytes);
  console.log(`Downloaded the ${bytes.byteLength.toLocaleString('en')} byte OSU checklist.`);
}

async function generate() {
  const [rows, englishDatabase, frenchDatabase, previousManifest] = await Promise.all([
    extractRows(),
    readJson(ENGLISH_DATABASE_PATH),
    readJson(FRENCH_DATABASE_PATH),
    readOptionalJson(MANIFEST_PATH),
  ]);
  const rowsByScientificName = indexRows(rows);
  const frenchById = new Map(frenchDatabase.records.map((record) => [record.id, record]));
  const previousById = new Map(
    (previousManifest?.dataset?.generatorVersion === 1 ? previousManifest.supplements : []).map(
      (supplement) => [supplement.id, supplement],
    ),
  );
  let exactMatchCount = 0;
  let unpairedMatchCount = 0;
  let fungiCount = 0;
  let termiteCount = 0;
  const supplements = [];

  for (const english of englishDatabase.records) {
    const matchedRows = uniqueRows(
      english.identity.botanicalNames.flatMap(
        ({ name }) => rowsByScientificName.get(scientificKey(name)) ?? [],
      ),
    );
    if (matchedRows.length === 0) continue;
    exactMatchCount += 1;
    const french = frenchById.get(english.id);
    if (!french) {
      unpairedMatchCount += 1;
      continue;
    }
    const previous = previousById.get(english.id);
    const decay = combinedDecay(matchedRows);
    const termiteResistant = matchedRows.some((row) => row.termiteResistant);
    const includeFungi =
      decay !== null &&
      (english.durability.fungi.value === null ||
        previous?.locales?.en?.durability?.fungi?.value != null);
    const includeTermites =
      termiteResistant &&
      (english.durability.termites.value === null ||
        previous?.locales?.en?.durability?.termites?.value != null);
    if (!includeFungi && !includeTermites) continue;
    if (includeFungi) fungiCount += 1;
    if (includeTermites) termiteCount += 1;

    supplements.push({
      id: english.id,
      source: {
        provider: SOURCE_PROVIDER,
        kind: 'manual',
        references: [SOURCE_REFERENCE],
        extractionDate: EXTRACTION_DATE,
      },
      locales: {
        en: buildLocale(english, matchedRows, decay, includeFungi, includeTermites, 'en'),
        fr: buildLocale(french, matchedRows, decay, includeFungi, includeTermites, 'fr'),
      },
    });
  }

  await Promise.all([
    writeJson(MANIFEST_PATH, {
      schemaVersion: 1,
      dataset: {
        generatorVersion: 1,
        title: SOURCE_REFERENCE.title,
        provider: SOURCE_PROVIDER,
        pdfUrl: PDF_URL,
        citationUrl: CITATION_URL,
        sourceScale:
          '1 = very resistant; 2 = resistant; 3 = moderately resistant; 4 = nonresistant',
        mappingPolicy:
          'The source scale is conservatively mapped to atlas classes; source class 4 maps to atlas class 4-5. Only an explicit (T) marker supplies termite resistance.',
        parsedRows: rows.length,
        exactAtlasMatches: exactMatchCount,
        unpairedAtlasMatchesSkipped: unpairedMatchCount,
        supplementedRecords: supplements.length,
        supplementedFields: {
          'durability.fungi': fungiCount,
          'durability.termites': termiteCount,
        },
      },
      records: [],
      supplements: supplements.sort((left, right) => left.id.localeCompare(right.id)),
    }),
    writeJson(TRANSLATION_MANIFEST_PATH, {
      schemaVersion: 1,
      units: CATEGORY_TRANSLATIONS,
    }),
  ]);
  console.log(
    `Parsed ${rows.length} checklist rows and matched ${exactMatchCount} atlas records exactly.`,
  );
  console.log(
    `Generated ${supplements.length} supplements: ${fungiCount} decay ratings and ${termiteCount} explicit termite ratings.`,
  );
}

async function extractRows() {
  const { stdout } = await execFileAsync('pdftotext', ['-layout', RAW_PDF_PATH, '-'], {
    maxBuffer: 10 * 1024 * 1024,
  });
  const rows = [];
  for (const line of stdout.split(/\r?\n/u)) {
    const columns = line.trim().split(/\s{2,}/u);
    if (columns.length < 3 || !/^(?:[1-4](?:-[1-4])?|-)\b/u.test(columns[2])) continue;
    const species = columns[0].replace(/\s+/gu, ' ').trim();
    const rating = columns[2].match(/^[1-4](?:-[1-4])?/u)?.[0] ?? null;
    if (!/^[A-Z][a-z-]+(?:\s+(?:[a-z-]+|spp?\.)){1,3}(?:\s+\([TM]\))?$/u.test(species)) {
      continue;
    }
    rows.push({
      scientificName: species.replace(/\s+\([TM]\)$/u, ''),
      sourceRating: rating,
      termiteResistant: /\(T\)$/u.test(species),
    });
  }
  if (rows.length < 1_300) {
    throw new Error(`Parsed only ${rows.length} checklist rows; expected at least 1,300`);
  }
  return rows;
}

function indexRows(rows) {
  const index = new Map();
  for (const row of rows) {
    const key = scientificKey(row.scientificName);
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(row);
  }
  return index;
}

function combinedDecay(rows) {
  const ranges = rows
    .map((row) => row.sourceRating)
    .filter(Boolean)
    .map((rating) => rating.split('-').map(Number));
  if (ranges.length === 0) return null;
  const sourceMinimum = Math.min(...ranges.map(([minimum]) => minimum));
  const sourceMaximum = Math.max(...ranges.map((range) => range.at(-1)));
  if (sourceMinimum === 1 && sourceMaximum === 4) return null;
  const atlasMinimum = sourceMinimum;
  const atlasMaximum = sourceMaximum === 4 ? 5 : sourceMaximum;
  return {
    sourceRatings: [...new Set(rows.map((row) => row.sourceRating).filter(Boolean))].sort(),
    atlasClass:
      atlasMinimum === atlasMaximum ? String(atlasMinimum) : `${atlasMinimum}-${atlasMaximum}`,
  };
}

function buildLocale(base, rows, decay, includeFungi, includeTermites, language) {
  const locale = emptyLocale(base, language);
  if (includeFungi) locale.durability.fungi = decayValue(decay, language);
  if (includeTermites) {
    locale.durability.termites = {
      raw:
        language === 'fr'
          ? 'Oregon State University — marqueur explicite de résistance aux termites (T)'
          : 'Oregon State University — explicit termite-resistance marker (T)',
      value: language === 'fr' ? 'classe d - durable' : 'class d - durable',
    };
  }
  return locale;
}

function decayValue(decay, language) {
  const labels = {
    en: new Map([
      ['1', 'class 1 - very durable'],
      ['1-2', 'class 1-2 - very durable to durable'],
      ['1-3', 'class 1-3 - very durable to moderately durable'],
      ['2', 'class 2 - durable'],
      ['2-3', 'class 2-3 - durable to moderately durable'],
      ['2-5', 'class 2-5 - durable to not durable'],
      ['3', 'class 3 - moderately durable'],
      ['3-5', 'class 3-5 - moderately durable to not durable'],
      ['4-5', 'class 4-5 - poorly to not durable'],
    ]),
    fr: new Map([
      ['1', 'classe 1 - très durable'],
      ['1-2', 'classe 1-2 - très durable à durable'],
      ['1-3', 'classe 1-3 - très durable à moyennement durable'],
      ['2', 'classe 2 - durable'],
      ['2-3', 'classe 2-3 - durable à moyennement durable'],
      ['2-5', 'classe 2-5 - durable à non durable'],
      ['3', 'classe 3 - moyennement durable'],
      ['3-5', 'classe 3-5 - moyennement durable à non durable'],
      ['4-5', 'classe 4-5 - faiblement à non durable'],
    ]),
  };
  const sourceRatings = decay.sourceRatings.join(', ');
  return {
    raw:
      language === 'fr'
        ? `Liste mondiale OSU — classe(s) de résistance à la dégradation ${sourceRatings} sur l’échelle source de 1 à 4 ; conversion prudente vers la classe ${decay.atlasClass}`
        : `OSU worldwide checklist — decay rating(s) ${sourceRatings} on the source 1–4 scale; conservatively mapped to atlas class ${decay.atlasClass}`,
    value: labels[language].get(decay.atlasClass),
  };
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

function scientificKey(value) {
  return String(value)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/×/gu, 'x')
    .replace(/[.,]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLocaleLowerCase('en');
}

function uniqueRows(rows) {
  return [
    ...new Map(
      rows.map((row) => [
        `${row.scientificName}\0${row.sourceRating}\0${row.termiteResistant}`,
        row,
      ]),
    ).values(),
  ];
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
  const json = await format(`${JSON.stringify(value)}\n`, { parser: 'json' });
  await fs.writeFile(filePath, json);
}
