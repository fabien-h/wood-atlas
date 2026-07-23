#!/usr/bin/env node

import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { format } from 'prettier';

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(import.meta.dirname, '..');
const PDF_PATH = path.join(ROOT, 'data', 'raw', 'usda', 'tropical-timbers-world.pdf');
const FACTS_PATH = path.join(ROOT, 'data', 'raw', 'usda', 'tropical-timbers-hardness.json');
const MANIFEST_PATH = path.join(ROOT, 'data', 'manual', 'woods', 'usda-tropical-hardness.json');
const SOURCE_MANIFEST_PATHS = [
  path.join(ROOT, 'data', 'manual', 'woods', 'usda-tropical-a-m.json'),
  path.join(ROOT, 'data', 'manual', 'woods', 'usda-tropical-n-z.json'),
];
const ENGLISH_DATABASE_PATH = path.join(ROOT, 'public', 'data', 'woods.generated.en.json');
const FRENCH_DATABASE_PATH = path.join(ROOT, 'public', 'data', 'woods.generated.fr.json');

const SOURCE_URL = 'https://research.fs.usda.gov/download/treesearch/69634.pdf';
const SOURCE_PROVIDER = 'USDA Forest Service, Forest Products Laboratory';
const SOURCE_TITLE = 'Tropical Timbers of the World (Agriculture Handbook 607)';
const EXTRACTION_DATE = '2026-07-23';
const NEWTONS_PER_POUND_FORCE = 4.4482216153;
const PAGE_HINTS = new Map([
  ['africa-podo', 'Podo'],
  ['america-rauli-coigue', 'Rauli'],
]);

const command = process.argv[2] ?? 'all';
if (command === 'sync') {
  await sync();
} else if (command === 'generate') {
  await generate();
} else if (command === 'all') {
  await sync();
  await generate();
} else {
  console.error('Usage: node scripts/usda-tropical-hardness.mjs <sync|generate|all>');
  process.exitCode = 1;
}

async function sync() {
  await downloadPdf();
  const sourceRecords = await readSourceRecords();
  const pages = await extractProfilePages();
  const profiles = [];

  for (const sourceRecord of sourceRecords) {
    const page = matchProfilePage(sourceRecord, pages);
    const hardness = extractJankaHardness(page.text);
    profiles.push({
      id: sourceRecord.id,
      page: page.number,
      headings: page.headings,
      hardness,
    });
  }

  const usableProfiles = profiles.filter(({ hardness }) => hardness !== null);
  await writeJson(FACTS_PATH, {
    schemaVersion: 1,
    source: {
      title: SOURCE_TITLE,
      provider: SOURCE_PROVIDER,
      url: SOURCE_URL,
      year: 1984,
      extractionDate: EXTRACTION_DATE,
      conversion: `1 lbf = ${NEWTONS_PER_POUND_FORCE} N`,
    },
    matchedAtlasProfiles: profiles.length,
    profilesWithComparableJankaHardness: usableProfiles.length,
    profiles,
  });
  console.log(
    `Matched ${profiles.length} USDA profiles and retained ${usableProfiles.length} dry, air-dry, or moisture-unspecified Janka results.`,
  );
}

async function generate() {
  const [facts, sourceRecords, englishDatabase, frenchDatabase, previousManifest] =
    await Promise.all([
      readJson(FACTS_PATH),
      readSourceRecords(),
      readJson(ENGLISH_DATABASE_PATH),
      readJson(FRENCH_DATABASE_PATH),
      readOptionalJson(MANIFEST_PATH),
    ]);
  const sourceById = new Map(sourceRecords.map((record) => [record.id, record]));
  const englishById = new Map(englishDatabase.records.map((record) => [record.id, record]));
  const frenchById = new Map(frenchDatabase.records.map((record) => [record.id, record]));
  const previousIds = new Set((previousManifest?.supplements ?? []).map(({ id }) => id));
  const supplements = [];

  for (const profile of facts.profiles) {
    if (!profile.hardness) continue;
    const currentEnglish = englishById.get(profile.id);
    const currentFrench = frenchById.get(profile.id);
    const sourceRecord = sourceById.get(profile.id);
    if (!currentEnglish || !currentFrench || !sourceRecord) {
      throw new Error(`USDA hardness profile ${profile.id} does not have a bilingual atlas record`);
    }
    if (currentEnglish.physics.jankaHardness.value !== null && !previousIds.has(profile.id)) {
      continue;
    }

    supplements.push({
      id: profile.id,
      source: {
        provider: sourceRecord.source.provider,
        kind: 'manual',
        references: [
          {
            title: `${SOURCE_TITLE}, PDF p. ${profile.page}`,
            url: `${SOURCE_URL}#page=${profile.page}`,
            publisher: SOURCE_PROVIDER,
            year: 1984,
          },
        ],
        extractionDate: EXTRACTION_DATE,
      },
      locales: {
        en: buildLocale(sourceRecord.locales.en, profile, 'en'),
        fr: buildLocale(sourceRecord.locales.fr, profile, 'fr'),
      },
    });
  }

  await writeJson(MANIFEST_PATH, {
    schemaVersion: 1,
    dataset: {
      generatorVersion: 1,
      title: `${SOURCE_TITLE} — Janka side hardness`,
      provider: SOURCE_PROVIDER,
      url: SOURCE_URL,
      matchedAtlasProfiles: facts.matchedAtlasProfiles,
      sourceProfilesWithComparableJankaHardness: facts.profilesWithComparableJankaHardness,
      supplementedRecords: supplements.length,
    },
    records: [],
    supplements: supplements.sort((left, right) => left.id.localeCompare(right.id)),
  });
  console.log(`Generated ${supplements.length} missing Janka hardness supplements.`);
}

async function downloadPdf() {
  const response = await fetch(SOURCE_URL, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`USDA returned ${response.status} for ${SOURCE_URL}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length < 5_000_000 || new TextDecoder().decode(bytes.slice(0, 4)) !== '%PDF') {
    throw new Error(`USDA download is not the expected PDF (${bytes.length} bytes)`);
  }
  await fs.mkdir(path.dirname(PDF_PATH), { recursive: true });
  await fs.writeFile(PDF_PATH, bytes);
  console.log(`Downloaded ${SOURCE_TITLE} (${bytes.length.toLocaleString('en')} bytes).`);
}

async function extractProfilePages() {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'wood-atlas-usda-'));
  const textPath = path.join(temporaryDirectory, 'tropical-timbers.txt');
  try {
    await execFileAsync('pdftotext', ['-layout', PDF_PATH, textPath]);
    const text = await fs.readFile(textPath, 'utf8');
    return text.split('\f').map(parseProfilePage).filter(Boolean);
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
}

function parseProfilePage(text, pageIndex) {
  const headingMatch = text.match(/([\s\S]*?)Fami(?:ly|iy):/iu);
  if (!headingMatch) return null;
  const headings = headingMatch[1]
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line &&
        !/^\d+$/u.test(line) &&
        line !== 'Tree and Wood Characteristics' &&
        !/^Part [IVX]+/u.test(line),
    );
  if (headings.length === 0) return null;
  return {
    number: pageIndex + 1,
    headings,
    normalizedHeadings: headings.map(normalizeName),
    text,
  };
}

function matchProfilePage(sourceRecord, pages) {
  const identity = sourceRecord.locales.en.identity;
  const botanicalNames = identity.botanicalNames.map(({ name }) => normalizeName(name));
  let matches = pages.filter((page) =>
    page.normalizedHeadings.some((heading) => botanicalNames.includes(heading)),
  );

  const identityNames = [
    identity.displayName,
    identity.primaryName,
    ...(identity.aliases ?? []),
    ...(identity.localNames ?? []).map((entry) => (typeof entry === 'string' ? entry : entry.name)),
    PAGE_HINTS.get(sourceRecord.id),
  ]
    .filter(Boolean)
    .map(normalizeName);
  if (matches.length !== 1) {
    const searchPages = matches.length === 0 ? pages : matches;
    const exactMatches = searchPages.filter((page) =>
      page.normalizedHeadings.some((heading) => identityNames.includes(heading)),
    );
    if (exactMatches.length === 1) {
      matches = exactMatches;
    } else {
      const partialMatches = searchPages.filter((page) =>
        page.normalizedHeadings.some((heading) =>
          identityNames.some(
            (name) =>
              name.length >= 4 && (heading.startsWith(`${name} `) || heading.endsWith(` ${name}`)),
          ),
        ),
      );
      if (partialMatches.length === 1) matches = partialMatches;
    }
  }

  if (matches.length !== 1) {
    throw new Error(
      `Expected one USDA profile page for ${sourceRecord.id}, found ${matches.length}`,
    );
  }
  return matches[0];
}

function extractJankaHardness(pageText) {
  const statementMatch = pageText.match(
    /(?:dry\s+)?Janka side hardness[\s\S]{0,320}?(?:\.(?=\s+[A-Z])|\n\s*\n)/iu,
  );
  if (!statementMatch) return null;
  const statement = statementMatch[0].replace(/\s+/gu, ' ').trim();
  const normalizedStatement = statement.toLocaleLowerCase('en').replace(/[‐‑‒–—]/gu, '-');
  const measurements = [
    ...normalizedStatement.matchAll(/(\d[\d,]*)(?:\s*(?:to|-)\s*(\d[\d,]*))?\s*lb\b/giu),
  ].map((match) => ({
    min: Number(match[1].replaceAll(',', '')),
    max: Number((match[2] ?? match[1]).replaceAll(',', '')),
    index: match.index,
    end: match.index + match[0].length,
  }));
  if (measurements.length === 0) return null;

  const hasGreenCondition = /\bgreen\b/u.test(normalizedStatement);
  const hasDryCondition =
    /\b(?:air[- ]?dry|dry|seasoned)\b/u.test(normalizedStatement) ||
    /\b(?:12|14|15)\s*%\s*(?:moisture|m\.?c\.?)?/u.test(normalizedStatement);
  let selectedMeasurements = measurements;
  if (hasGreenCondition && !hasDryCondition) return null;
  if (hasGreenCondition && hasDryCondition) {
    selectedMeasurements = measurements.filter((measurement, index) => {
      const previousEnd = index === 0 ? 0 : measurements[index - 1].end;
      const nextIndex =
        index === measurements.length - 1
          ? normalizedStatement.length
          : measurements[index + 1].index;
      const nearbyText = normalizedStatement.slice(previousEnd, nextIndex);
      return (
        /\b(?:air[- ]?dry|dry|seasoned)\b/u.test(nearbyText) ||
        /\b(?:12|14|15)\s*%\s*(?:moisture|m\.?c\.?)?/u.test(nearbyText)
      );
    });
  }
  if (selectedMeasurements.length === 0) return null;

  const minPounds = Math.min(...selectedMeasurements.map(({ min }) => min));
  const maxPounds = Math.max(...selectedMeasurements.map(({ max }) => max));
  const minNewtons = Math.round(minPounds * NEWTONS_PER_POUND_FORCE);
  const maxNewtons = Math.round(maxPounds * NEWTONS_PER_POUND_FORCE);
  return {
    condition: hasDryCondition ? 'dry or air-dry' : 'moisture condition not stated',
    minPounds,
    maxPounds,
    valuePounds: Math.round((minPounds + maxPounds) / 2),
    minNewtons,
    maxNewtons,
    valueNewtons: Math.round((minNewtons + maxNewtons) / 2),
  };
}

function buildLocale(baseLocale, profile, language) {
  const locale = structuredClone(baseLocale);
  const hardness = profile.hardness;
  const pounds =
    hardness.minPounds === hardness.maxPounds
      ? `${hardness.valuePounds} lbf`
      : `${hardness.minPounds}–${hardness.maxPounds} lbf`;
  const newtons =
    hardness.minNewtons === hardness.maxNewtons
      ? `${hardness.valueNewtons} N`
      : `${hardness.minNewtons}–${hardness.maxNewtons} N`;
  const condition =
    language === 'fr'
      ? hardness.condition === 'dry or air-dry'
        ? 'bois sec ou séché à l’air'
        : 'humidité non précisée'
      : hardness.condition;
  locale.physics.jankaHardness = {
    raw:
      language === 'fr'
        ? `Dureté Janka latérale USDA, ${condition} : ${pounds} = ${newtons} (PDF p. ${profile.page})`
        : `USDA Janka side hardness, ${condition}: ${pounds} = ${newtons} (PDF p. ${profile.page})`,
    value: hardness.valueNewtons,
    min: hardness.minNewtons === hardness.maxNewtons ? null : hardness.minNewtons,
    max: hardness.minNewtons === hardness.maxNewtons ? null : hardness.maxNewtons,
    unit: 'N',
  };
  return locale;
}

function normalizeName(value) {
  return String(value)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('en')
    .replace(/\bsyn\.?\b/gu, '')
    .replace(/\bschlma\b/gu, 'schima')
    .replace(/[^a-z0-9]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

async function readSourceRecords() {
  const manifests = await Promise.all(SOURCE_MANIFEST_PATHS.map(readJson));
  return manifests.flatMap(({ records }) => records);
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
  const output = await format(`${JSON.stringify(value, null, 2)}\n`, { parser: 'json' });
  await fs.writeFile(filePath, output);
}
