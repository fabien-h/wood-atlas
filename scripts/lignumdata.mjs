#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LEGACY_CATALOG_PATH = path.join(ROOT, 'tmp', 'lignumdata-catalog.json');
const CATALOG_PATH = path.join(ROOT, 'data', 'raw', 'lignumdata', 'catalog.json');
const FACTS_PATH = path.join(ROOT, 'data', 'raw', 'lignumdata', 'facts.json');
const MANIFEST_PATH = path.join(ROOT, 'data', 'manual', 'woods', 'lignumdata.json');
const ENGLISH_DATABASE_PATH = path.join(ROOT, 'public', 'data', 'woods.generated.en.json');
const FRENCH_DATABASE_PATH = path.join(ROOT, 'public', 'data', 'woods.generated.fr.json');

const SOURCE_URL = 'https://lignumdata.ch/system/holzarten?locale=en';
const SOURCE_PROVIDER = 'Lignumdata';
const SOURCE_PUBLISHER = 'Lignum – Holzwirtschaft Schweiz';
const EXTRACTION_DATE = '2026-07-24';
const FETCH_CONCURRENCY = 4;
const FETCH_RETRIES = 4;
const FETCH_TIMEOUT_MS = 45_000;
const BETWEEN_REQUEST_DELAY_MS = 150;
const PROFILE_SCHEMA_VERSION = 6;
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
const RESISTANCE_CODES = new Set(['D', 'D-M', 'M', 'M-S', 'S']);
const DRY_BORER_CODES = new Set(['D', 'S']);
const COUNTRY_ALIAS_TO_CODE = countryAliasIndex();
const LIGNUMDATA_REGION_CODE_TO_COUNTRY = new Map(
  Object.entries({
    AUT: 'AT',
    BGM: 'BE',
    BUL: 'BG',
    CZE: 'CZ',
    DEN: 'DK',
    FRA: 'FR',
    GER: 'DE',
    HUN: 'HU',
    ITA: 'IT',
    KRY: 'UA',
    NET: 'NL',
    NZN: 'NZ',
    NZS: 'NZ',
    POL: 'PL',
    POR: 'PT',
    ROM: 'RO',
    SAR: 'IT',
    SPA: 'ES',
    SWE: 'SE',
    SWI: 'CH',
    UKR: 'UA',
  }),
);
const NORTH_AMERICAN_SUBDIVISION_TO_COUNTRY = new Map(
  [
    'Alabama',
    'Alaska',
    'Arizona',
    'Arkansas',
    'California',
    'Colorado',
    'Connecticut',
    'Delaware',
    'District of Columbia',
    'Florida',
    'Georgia',
    'Hawaii',
    'Idaho',
    'Illinois',
    'Indiana',
    'Iowa',
    'Kansas',
    'Kentucky',
    'Louisiana',
    'Maine',
    'Maryland',
    'Massachusetts',
    'Michigan',
    'Minnesota',
    'Mississippi',
    'Missouri',
    'Montana',
    'Nebraska',
    'Nevada',
    'New Hampshire',
    'New Jersey',
    'New Mexico',
    'New York',
    'North Carolina',
    'North Dakota',
    'Ohio',
    'Oklahoma',
    'Oregon',
    'Pennsylvania',
    'Rhode Island',
    'South Carolina',
    'South Dakota',
    'Tennessee',
    'Texas',
    'Utah',
    'Vermont',
    'Virginia',
    'Washington',
    'West Virginia',
    'Wisconsin',
    'Wyoming',
  ].map((name) => [normalizeText(name), 'US']),
);
for (const name of [
  'Alberta',
  'British Columbia',
  'Manitoba',
  'New Brunswick',
  'Newfoundland and Labrador',
  'Northwest Territories',
  'Nova Scotia',
  'Nunavut',
  'Ontario',
  'Prince Edward Island',
  'Québec',
  'Saskatchewan',
  'Yukon',
]) {
  NORTH_AMERICAN_SUBDIVISION_TO_COUNTRY.set(normalizeText(name), 'CA');
}
const DUPLICATE_PROFILE_OVERRIDES = new Map([
  [
    'africa-antiaris',
    ['https://lignumdata.ch/system/holzarten/2402E007-42A9-3823-8B3F-956FEC9AA49C?locale=en'],
  ],
  [
    'temperate-baldcypress',
    ['https://lignumdata.ch/system/holzarten/4E269D4D-7CA1-3566-AEAB-CEED27F36A90?locale=en'],
  ],
  [
    'temperate-douglas-fir',
    ['https://lignumdata.ch/system/holzarten/AD667294-A577-3301-ADAC-E2F25875B6F7?locale=en'],
  ],
  [
    'asia-jarrah',
    ['https://lignumdata.ch/system/holzarten/3208D6B9-C737-3C74-BA17-B0D11D47E2CB?locale=en'],
  ],
  [
    'temperate-loblolly-pine',
    ['https://lignumdata.ch/system/holzarten/972CCA61-59C5-3387-B577-734DB7C42B0A?locale=en'],
  ],
  [
    'africa-niangon',
    [
      'https://lignumdata.ch/system/holzarten/2F038950-3CF4-3A22-BF7F-74613D6E94B0?locale=en',
      'https://lignumdata.ch/system/holzarten/D83C9AE6-4983-3C93-88CF-574EACF757B2?locale=en',
    ],
  ],
  [
    'america-red-grandis',
    ['https://lignumdata.ch/system/holzarten/F452F21C-1582-3C4E-B982-976CBF237CC4?locale=en'],
  ],
  [
    'asia-sesendok',
    ['https://lignumdata.ch/system/holzarten/4AC707FF-78E6-3F94-8026-BCC172BC8E76?locale=en'],
  ],
  [
    'temperate-slash-pine',
    [
      'https://lignumdata.ch/system/holzarten/188F4C04-FD6C-353D-9568-21FC4227680A?locale=en',
      'https://lignumdata.ch/system/holzarten/6D0A4E4D-6A47-3736-8AA7-507DF27CC709?locale=en',
    ],
  ],
  [
    'africa-teak',
    ['https://lignumdata.ch/system/holzarten/D7F9E5F7-D8CA-356A-AE19-B6CBED8BADF6?locale=en'],
  ],
  [
    'asia-teak',
    ['https://lignumdata.ch/system/holzarten/59673B04-AEB4-393D-A77E-B1EC46D0FDDC?locale=en'],
  ],
  [
    'temperate-western-hemlock',
    ['https://lignumdata.ch/system/holzarten/8C2A5FB6-3E6C-3F70-A87A-86E2EFD644F1?locale=en'],
  ],
  [
    'temperate-western-red-cedar',
    ['https://lignumdata.ch/system/holzarten/478A9CAF-EF12-360F-A040-0D5B89327E01?locale=en'],
  ],
]);

async function sync() {
  const [catalog, database, cachedFacts] = await Promise.all([
    loadCatalog(),
    readJson(ENGLISH_DATABASE_PATH),
    readOptionalJson(FACTS_PATH),
  ]);
  if (!Array.isArray(catalog.entries) || catalog.entries.length < 4_000) {
    throw new Error(`${relativePath(CATALOG_PATH)} does not contain the expected catalogue`);
  }

  const catalogIndex = indexCatalog(catalog.entries);
  const catalogByUrl = new Map(catalog.entries.map((entry) => [entry.detailUrl, entry]));
  const matches = database.records.map((record) =>
    resolveRecordMatches(record, catalogIndex, catalogByUrl),
  );
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

  const profileResults = await mapWithConcurrency(
    selectedEntries,
    FETCH_CONCURRENCY,
    async (entry) => {
      const cached = cachedByUrl.get(entry.detailUrl);
      if (!refresh && cached?.schemaVersion === PROFILE_SCHEMA_VERSION) {
        reused += 1;
        completed += 1;
        logProgress(completed, selectedEntries.length, fetched, reused);
        return { ...cached, schemaVersion: PROFILE_SCHEMA_VERSION };
      }
      try {
        const html = await fetchTextWithRetries(entry.detailUrl);
        const profile = parseProfile(html, entry);
        fetched += 1;
        return profile;
      } catch (error) {
        return {
          failed: true,
          scientificName: entry.scientificName,
          url: entry.detailUrl,
          error: error instanceof Error ? error.message : String(error),
        };
      } finally {
        completed += 1;
        logProgress(completed, selectedEntries.length, fetched, reused);
        await delay(BETWEEN_REQUEST_DELAY_MS);
      }
    },
  );
  const failures = profileResults.filter((result) => result.failed);
  const profiles = profileResults.filter((result) => !result.failed);

  const matchCounts = countMatches(matches);
  const fieldCoverage = countProfileCoverage(profiles);
  await writeJson(FACTS_PATH, {
    schemaVersion: PROFILE_SCHEMA_VERSION,
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
      failedProfileCount: failures.length,
      failures,
      records: matches.map(serializeMatch),
    },
    fieldCoverage,
    profiles: profiles.sort((left, right) => left.url.localeCompare(right.url)),
  });

  console.log(
    `Stored ${profiles.length} factual Lignumdata profiles: ${JSON.stringify(fieldCoverage)}`,
  );
  if (failures.length > 0) console.warn(`Skipped ${failures.length} failed profile pages.`);
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

    const aggregated = aggregateProfiles(profiles, { targetIsGroup: match.targetIsGroup });
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

async function loadCatalog() {
  if (!refresh) {
    const committed = await readOptionalJson(CATALOG_PATH);
    if (Array.isArray(committed?.entries) && committed.entries.length > 0) return committed;

    const legacy = await readOptionalJson(LEGACY_CATALOG_PATH);
    if (Array.isArray(legacy?.entries) && legacy.entries.length > 0) {
      const migrated = normalizedCatalog(legacy.entries, legacy.generatedAt);
      await writeJson(CATALOG_PATH, migrated);
      console.log(
        `Migrated ${migrated.entries.length} factual catalogue entries to ${relativePath(CATALOG_PATH)}`,
      );
      return migrated;
    }
  }

  const firstPage = await fetchListingPage(1);
  if (firstPage.pageCount < 200 || firstPage.totalSpecies < 4_000) {
    throw new Error(
      `Lignumdata listing reported only ${firstPage.totalSpecies} species across ${firstPage.pageCount} pages`,
    );
  }
  const remainingPages = Array.from(
    { length: firstPage.pageCount - 1 },
    (_unused, index) => index + 2,
  );
  let completed = 1;
  const remainingResults = await mapWithConcurrency(
    remainingPages,
    FETCH_CONCURRENCY,
    async (page) => {
      const result = await fetchListingPage(page);
      completed += 1;
      if (completed % 20 === 0 || completed === firstPage.pageCount) {
        console.log(`Indexed ${completed}/${firstPage.pageCount} Lignumdata listing pages`);
      }
      await delay(BETWEEN_REQUEST_DELAY_MS);
      return result;
    },
  );
  const entries = [firstPage, ...remainingResults].flatMap((page) => page.entries);
  const catalog = normalizedCatalog(entries);
  if (catalog.entries.length < 4_000) {
    throw new Error(
      `Lignumdata listing yielded only ${catalog.entries.length} unique species pages`,
    );
  }
  await writeJson(CATALOG_PATH, catalog);
  console.log(`Stored ${catalog.entries.length} factual catalogue entries.`);
  return catalog;
}

function normalizedCatalog(entries, generatedAt = new Date().toISOString()) {
  return {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    generatedAt,
    sourceUrl: SOURCE_URL,
    extractionPolicy:
      'Only the scientific name and public species-detail URL are retained. Trade names, images, captions, and descriptive content are excluded.',
    entries: uniqueBy(
      entries.flatMap((entry) =>
        typeof entry?.scientificName === 'string' &&
        entry.scientificName.trim() &&
        typeof entry?.detailUrl === 'string' &&
        /^https:\/\/lignumdata[.]ch\/system\/holzarten\/[A-F0-9-]{36}[?]locale=en$/u.test(
          entry.detailUrl,
        )
          ? [
              {
                scientificName: entry.scientificName.trim(),
                normalizedScientificName: scientificNameKey(entry.scientificName),
                detailUrl: entry.detailUrl,
              },
            ]
          : [],
      ),
      (entry) => entry.detailUrl,
    ).sort(
      (left, right) =>
        left.normalizedScientificName.localeCompare(right.normalizedScientificName) ||
        left.detailUrl.localeCompare(right.detailUrl),
    ),
  };
}

async function fetchListingPage(page) {
  const url = `${SOURCE_URL}&page=${page}`;
  const responseText = await fetchTextWithRetries(url, {
    Accept: 'text/javascript, application/javascript, */*; q=0.01',
    'X-Requested-With': 'XMLHttpRequest',
  });
  const html = parseRemoteHtml(responseText);
  const pageCount = Number(
    html.match(/Page\s*<b>\d+<\/b>\s*of\s*(\d+)/iu)?.[1] ??
      html.match(/Page\s+\d+\s+of\s+(\d+)/iu)?.[1] ??
      1,
  );
  const totalSpecies = Number(
    html.match(/There were\s*<b>(\d+)<\/b>\s*matching wood species/iu)?.[1] ?? 0,
  );
  const table = html.match(/<table\b[^>]*id="searchresult-table"[^>]*>([\s\S]*?)<\/table>/iu)?.[1];
  const entries = [];
  if (table) {
    for (const block of table.split(/<tr class="row-1">/iu).slice(1)) {
      const scientificName = stripTags(
        block.match(
          /<h[34]\b[^>]*class="[^"]*holzart-scientific-name[^"]*"[^>]*>([\s\S]*?)<\/h[34]>/iu,
        )?.[1],
      );
      const detailPath = decodeHtml(
        block.match(
          /href="(\/system\/holzarten\/[A-F0-9-]{36}[?]locale=en)"[^>]*>[\s\S]*?<span>Detail<\/span>/iu,
        )?.[1] ??
          block.match(/href="(\/system\/holzarten\/[A-F0-9-]{36}[?]locale=en)"/iu)?.[1] ??
          '',
      );
      if (!scientificName || !detailPath) continue;
      entries.push({
        scientificName,
        detailUrl: new URL(detailPath, SOURCE_URL).href,
      });
    }
  }
  return { pageCount, totalSpecies, entries };
}

function parseRemoteHtml(responseText) {
  const match = responseText.match(/[.]html\(("(?:\\.|[^"\\])*")\);?\s*$/su);
  if (!match) return responseText;
  const encoded = match[1].slice(1, -1);
  return encoded.replace(
    /\\(?:u([0-9a-f]{4})|x([0-9a-f]{2})|([0-7]{1,3})|([\s\S]))/giu,
    (_escape, unicode, hexadecimal, octal, character) => {
      if (unicode) return String.fromCodePoint(Number.parseInt(unicode, 16));
      if (hexadecimal) return String.fromCodePoint(Number.parseInt(hexadecimal, 16));
      if (octal) return String.fromCodePoint(Number.parseInt(octal, 8));
      return (
        {
          b: '\b',
          f: '\f',
          n: '\n',
          r: '\r',
          t: '\t',
          v: '\v',
        }[character] ?? character
      );
    },
  );
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

function resolveRecordMatches(record, catalogIndex, catalogByUrl) {
  const acceptedNames = uniqueBy(
    record.identity.botanicalNames.filter((name) => !name.isSynonym).map(({ name }) => name),
    scientificNameKey,
  );
  const synonymNames = uniqueBy(
    record.identity.botanicalNames.filter((name) => name.isSynonym).map(({ name }) => name),
    scientificNameKey,
  );
  const targetIsGroup = acceptedNames.length !== 1 || !isConcreteSpeciesName(acceptedNames[0]);
  const profileOverride = DUPLICATE_PROFILE_OVERRIDES.get(record.id);
  if (profileOverride) {
    const entries = profileOverride.map((url) => catalogByUrl.get(url));
    if (entries.some((entry) => !entry)) {
      throw new Error(`${record.id} has a Lignumdata profile override missing from the catalogue`);
    }
    return {
      id: record.id,
      matchType: 'accepted',
      targetAcceptedNameCount: acceptedNames.length,
      targetIsGroup,
      matchedNames: acceptedNames,
      ambiguousNames: [],
      unmatchedNames: [],
      entries,
    };
  }
  const accepted = resolveBotanicalNames(acceptedNames, catalogIndex);
  const acceptedMatchIsComplete =
    acceptedNames.length > 0 &&
    accepted.matchedNames.length === acceptedNames.length &&
    accepted.ambiguousNames.length === 0 &&
    accepted.unmatchedNames.length === 0;
  if (acceptedMatchIsComplete) {
    return {
      id: record.id,
      matchType: 'accepted',
      targetAcceptedNameCount: acceptedNames.length,
      targetIsGroup,
      matchedNames: accepted.matchedNames,
      ambiguousNames: accepted.ambiguousNames,
      unmatchedNames: [],
      entries: accepted.entries,
    };
  }

  if (accepted.entries.length > 0 || accepted.ambiguousNames.length > 0) {
    return {
      id: record.id,
      matchType: accepted.ambiguousNames.length > 0 ? 'ambiguous' : 'partial',
      targetAcceptedNameCount: acceptedNames.length,
      targetIsGroup,
      matchedNames: accepted.matchedNames,
      ambiguousNames: accepted.ambiguousNames,
      unmatchedNames: accepted.unmatchedNames,
      entries: [],
    };
  }

  const synonyms = resolveBotanicalNames(synonymNames, catalogIndex);
  const concreteSynonymMatch =
    acceptedNames.length === 1 &&
    isConcreteSpeciesName(acceptedNames[0]) &&
    synonyms.entries.length === 1 &&
    synonyms.matchedNames.length > 0 &&
    synonyms.matchedNames.every(isConcreteSpeciesName) &&
    synonyms.ambiguousNames.length === 0;
  if (concreteSynonymMatch) {
    return {
      id: record.id,
      matchType: 'synonym',
      targetAcceptedNameCount: acceptedNames.length,
      targetIsGroup: false,
      matchedNames: synonyms.matchedNames,
      ambiguousNames: [],
      unmatchedNames: synonyms.unmatchedNames,
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
    targetAcceptedNameCount: acceptedNames.length,
    targetIsGroup,
    matchedNames: [],
    ambiguousNames: [
      ...accepted.ambiguousNames,
      ...synonyms.ambiguousNames,
      ...(synonyms.entries.length > 1 ? synonymNames : []),
    ],
    unmatchedNames: [...accepted.unmatchedNames, ...synonyms.unmatchedNames],
    entries: [],
  };
}

function resolveBotanicalNames(names, catalogIndex) {
  const entries = [];
  const matchedNames = [];
  const ambiguousNames = [];
  const unmatchedNames = [];
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
    } else {
      unmatchedNames.push(name);
    }
  }
  return {
    entries: uniqueBy(entries, (entry) => entry.detailUrl),
    matchedNames: [...new Set(matchedNames)],
    ambiguousNames: [...new Set(ambiguousNames)],
    unmatchedNames: [...new Set(unmatchedNames)],
  };
}

function parseProfile(html, catalogEntry) {
  const sections = parseSections(html);
  const detailScientificName = stripTags(
    html.match(/<h1\b[^>]*class="[^"]*holzart-scientific-name[^"]*"[^>]*>([\s\S]*?)<\/h1>/iu)?.[1],
  ).trim();
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
  const jankaRows = sectionRows(sections, 'janka hardness');
  const mechanicalRows = sectionRows(sections, 'mechanical properties');

  const geographicRegions = rowValue(originRows, 'geographic regions');
  const statesAndTerritories = rowValue(originRows, 'states and territories');
  const taxonomyPath = taxonomyFromRows(botanyRows, catalogEntry.scientificName);
  const fungalField = durabilityClass(rowValue(durabilityRows, 'mushrooms field'));
  const fungalLaboratory = durabilityClass(rowValue(durabilityRows, 'mushrooms laboratory'));
  const genericDryWoodBorer = resistanceClass(rowValue(durabilityRows, 'beetle'));
  const dryBorerValues = [
    resistanceClass(rowValue(durabilityRows, 'house longhorn beetle hylotrupes bajulus')),
    resistanceClass(rowValue(durabilityRows, 'common furniture beetle anobium')),
    resistanceClass(rowValue(durabilityRows, 'powderpost beetle lyctus')),
  ].filter(Boolean);
  const dryWoodBorerClasses = {
    houseLonghorn: resistanceClass(
      rowValue(durabilityRows, 'house longhorn beetle hylotrupes bajulus'),
    ),
    commonFurniture: resistanceClass(rowValue(durabilityRows, 'common furniture beetle anobium')),
    lyctus: resistanceClass(rowValue(durabilityRows, 'powderpost beetle lyctus')),
  };

  return {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    scientificName: catalogEntry.scientificName,
    normalizedScientificName: scientificNameKey(catalogEntry.scientificName),
    url: catalogEntry.detailUrl,
    facts: {
      taxonomyPath,
      continentCodes: continentCodes(geographicRegions),
      countryCodes: countryCodes(statesAndTerritories, geographicRegions),
      durability: {
        fungi: fungalField ?? fungalLaboratory,
        fungalBasis: fungalField ? 'field' : fungalLaboratory ? 'laboratory' : null,
        dryWoodBorers:
          genericDryWoodBorer ?? combineExactClasses(dryBorerValues, DRY_BORER_CODES),
        dryWoodBorerClasses,
        termites: resistanceClass(rowValue(durabilityRows, 'termites')),
        heartwoodTreatability: treatabilityClass(
          rowValue(impregnabilityRows, 'impregnability of heartwood'),
        ),
        sapwoodTreatability: treatabilityClass(
          rowValue(impregnabilityRows, 'impregnability of the sapwood'),
        ),
      },
      physics: parsePhysicalFacts(densityRows, physicalRows, jankaRows),
      mechanics: parseMechanicalFacts(mechanicalRows),
    },
  };
}

function parseSections(html) {
  const sections = [];
  for (const match of html.matchAll(
    /<div\b[^>]*class="[^"]*\bsection\b[^"]*"[^>]*>([\s\S]*?)<\/div>/giu,
  )) {
    const block = match[1];
    const title = stripTags(block.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/iu)?.[1]);
    if (!title) continue;
    const rows = [];
    for (const rowMatch of block.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/giu)) {
      const cells = [...rowMatch[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/giu)].map((cell) =>
        stripTags(cell[1]),
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
    sections.find((section) => section.normalizedTitle.startsWith(normalizeText(titlePrefix)))
      ?.rows ?? []
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

function parsePhysicalFacts(densityRows, physicalRows, jankaRows) {
  const density = {
    min: numericRowValue(densityRows, /density oven dry u 12 lower limit/u, 'kg/m3', 1 / 1000),
    value: numericRowValue(densityRows, /density oven dry u 12 mean value/u, 'kg/m3', 1 / 1000),
    max: numericRowValue(densityRows, /density oven dry u 12 upper limit/u, 'kg/m3', 1 / 1000),
    unit: null,
    sourceUnit: 'kg/m³@12%',
  };
  const allRows = [...densityRows, ...physicalRows];
  const totalTangentialShrinkage = numericMeasureFromRows(
    allRows,
    [
      /total tangential shrinkage/u,
      /tangential shrinkage total/u,
      /shrinkage tangential mean/u,
    ],
    '%',
    1,
  );
  const totalRadialShrinkage = numericMeasureFromRows(
    allRows,
    [/total radial shrinkage/u, /radial shrinkage total/u, /shrinkage radial mean/u],
    '%',
    1,
  );
  const jankaHardness =
    numericMeasureWithoutUnit(jankaRows, [/^traversal$/u], 'N', 'transverse') ??
    numericMeasureWithoutUnit(jankaRows, [/^parallel$/u], 'N', 'parallel');
  return {
    specificGravity:
      density.min !== null || density.value !== null || density.max !== null ? density : null,
    jankaHardness,
    totalTangentialShrinkage,
    totalRadialShrinkage,
    shrinkageRatio:
      totalTangentialShrinkage?.value != null &&
      totalRadialShrinkage?.value != null &&
      totalRadialShrinkage.value > 0
        ? {
            value: round(totalTangentialShrinkage.value / totalRadialShrinkage.value, 6),
            min: null,
            max: null,
            unit: null,
            sourceUnit: null,
            basis: 'derived from tangential and radial shrinkage',
          }
        : null,
    fibreSaturationPoint: numericMeasureFromRows(
      allRows,
      [/fibre saturation point/u, /fiber saturation point/u],
      '%',
      1,
    ),
    thermalConductivity: numericMeasureFromRows(allRows, [/thermal conductivity/u], 'w/mk', 1),
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

function numericMeasureWithoutUnit(rows, labelPatterns, targetMeasureUnit, basis) {
  const row = rows.find((candidate) =>
    labelPatterns.some((pattern) => pattern.test(candidate.normalizedLabel)),
  );
  if (!row) return null;
  const value = parseNumeric(row.value);
  if (value === null) return null;
  return {
    value,
    min: null,
    max: null,
    unit: targetMeasureUnit,
    sourceUnit: targetMeasureUnit,
    basis,
  };
}

function numericRowValue(rows, labelPattern, expectedUnit, multiplier) {
  const row = rows.find((candidate) => labelPattern.test(candidate.normalizedLabel));
  if (!row || !unitMatches(row.unit, expectedUnit)) return null;
  const value = parseNumeric(row.value);
  return value === null ? null : round(value * multiplier, 6);
}

function aggregateProfiles(profiles, { targetIsGroup }) {
  const conflicts = [];
  const taxonomyPath = commonTaxonomyPath(
    completeProfileValues(profiles, (profile) => profile.facts.taxonomyPath),
  ).filter((node) => !targetIsGroup || node.rank !== 'species');
  const continentCodes = sortedUnique(
    completeProfileValues(profiles, (profile) => profile.facts.continentCodes).flat(),
  );
  const countryCodes = sortedUnique(
    completeProfileValues(profiles, (profile) => profile.facts.countryCodes).flat(),
  );
  const fungi = aggregateRangeCategory(
    completeProfileValues(profiles, (profile) => profile.facts.durability.fungi),
    FUNGAL_CODES,
    'durability.fungi',
    conflicts,
  );
  const heartwoodTreatability = aggregateRangeCategory(
    completeProfileValues(profiles, (profile) => profile.facts.durability.heartwoodTreatability),
    TREATABILITY_CODES,
    'durability.treatability',
    conflicts,
  );
  const sapwoodTreatability = aggregateRangeCategory(
    completeProfileValues(profiles, (profile) => profile.facts.durability.sapwoodTreatability),
    TREATABILITY_CODES,
    'durability.sapwoodTreatability',
    conflicts,
  );
  const dryWoodBorers = aggregateDryWoodBorers(profiles, conflicts);
  const termites = aggregateExactCategory(
    completeProfileValues(profiles, (profile) => profile.facts.durability.termites),
    'durability.termites',
    conflicts,
  );

  return {
    taxonomyPath,
    continentCodes,
    countryCodes,
    fungi,
    fungalBasis: commonValue(
      completeProfileValues(profiles, (profile) => profile.facts.durability.fungalBasis),
    ),
    dryWoodBorers,
    termites,
    heartwoodTreatability,
    sapwoodTreatability,
    physics: {
      specificGravity: aggregateMeasures(
        completeProfileValues(profiles, (profile) => profile.facts.physics.specificGravity),
      ),
      jankaHardness: aggregateMeasures(
        completeProfileValues(profiles, (profile) => profile.facts.physics.jankaHardness),
      ),
      totalTangentialShrinkage: aggregateMeasures(
        completeProfileValues(
          profiles,
          (profile) => profile.facts.physics.totalTangentialShrinkage,
        ),
      ),
      totalRadialShrinkage: aggregateMeasures(
        completeProfileValues(profiles, (profile) => profile.facts.physics.totalRadialShrinkage),
      ),
      shrinkageRatio: aggregateMeasures(
        completeProfileValues(profiles, (profile) => profile.facts.physics.shrinkageRatio),
      ),
      fibreSaturationPoint: aggregateMeasures(
        completeProfileValues(profiles, (profile) => profile.facts.physics.fibreSaturationPoint),
      ),
      thermalConductivity: aggregateMeasures(
        completeProfileValues(profiles, (profile) => profile.facts.physics.thermalConductivity),
      ),
    },
    mechanics: {
      crushingStrength: aggregateMeasures(
        completeProfileValues(profiles, (profile) => profile.facts.mechanics.crushingStrength),
      ),
      staticBendingStrength: aggregateMeasures(
        completeProfileValues(profiles, (profile) => profile.facts.mechanics.staticBendingStrength),
      ),
      modulusOfElasticity: aggregateMeasures(
        completeProfileValues(profiles, (profile) => profile.facts.mechanics.modulusOfElasticity),
      ),
    },
    conflicts,
  };
}

function completeProfileValues(profiles, valueForProfile) {
  const values = profiles.map(valueForProfile);
  return values.some((value) => value == null || (Array.isArray(value) && value.length === 0))
    ? []
    : values;
}

function aggregateMeasures(measures) {
  if (measures.length === 0 || measures.some((measure) => measure.value === null)) return null;
  const units = sortedUnique(measures.map((measure) => measure.unit ?? ''));
  if (units.length > 1) return null;
  const bases = sortedUnique(measures.map((measure) => measure.basis).filter(Boolean));
  if (bases.length > 1) return null;
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
    basis: bases[0] ?? null,
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
    ['physics.jankaHardness', aggregated.physics.jankaHardness?.value],
    ['physics.totalTangentialShrinkage', aggregated.physics.totalTangentialShrinkage?.value],
    ['physics.totalRadialShrinkage', aggregated.physics.totalRadialShrinkage?.value],
    ['physics.shrinkageRatio', aggregated.physics.shrinkageRatio?.value],
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
    ['physics.jankaHardness', aggregated.physics.jankaHardness],
    ['physics.totalTangentialShrinkage', aggregated.physics.totalTangentialShrinkage],
    ['physics.totalRadialShrinkage', aggregated.physics.totalRadialShrinkage],
    ['physics.shrinkageRatio', aggregated.physics.shrinkageRatio],
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
      'physics.jankaHardness': 'Janka hardness',
      'physics.totalTangentialShrinkage': 'total tangential shrinkage',
      'physics.totalRadialShrinkage': 'total radial shrinkage',
      'physics.shrinkageRatio': 'tangential/radial shrinkage ratio',
      'physics.fibreSaturationPoint': 'fibre saturation point',
      'physics.thermalConductivity': 'thermal conductivity',
      'physics.crushingStrength': 'mean compressive strength',
      'physics.staticBendingStrength': 'mean flexural strength',
      'physics.modulusOfElasticity': "mean Young's modulus",
    },
    fr: {
      'physics.specificGravity': 'masse volumique à 12 % d’humidité',
      'physics.jankaHardness': 'dureté Janka',
      'physics.totalTangentialShrinkage': 'retrait tangentiel total',
      'physics.totalRadialShrinkage': 'retrait radial total',
      'physics.shrinkageRatio': 'rapport des retraits tangentiel/radial',
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
  const basis =
    measure.basis === 'transverse'
      ? language === 'fr'
        ? ' transversale'
        : ' transverse'
      : measure.basis === 'parallel'
        ? language === 'fr'
          ? ' parallèle au fil'
          : ' parallel to the grain'
        : '';
  const raw =
    field === 'physics.specificGravity'
      ? language === 'fr'
        ? `Lignumdata — ${labels.fr[field]} : densité relative moyenne publiée ${measure.value} (source en kg/m³ divisée par 1000)${range}`
        : `Lignumdata — ${labels.en[field]}: published mean relative density ${measure.value} (source kg/m³ divided by 1000)${range}`
      : field === 'physics.shrinkageRatio'
        ? language === 'fr'
          ? `Lignumdata — ${labels.fr[field]} : ${measure.value}, calculé à partir des retraits moyens publiés`
          : `Lignumdata — ${labels.en[field]}: ${measure.value}, calculated from the published mean shrinkage values`
        : language === 'fr'
          ? `Lignumdata — ${labels.fr[field]}${basis} : valeur publiée ${measure.value}${sourceUnit}${range}`
          : `Lignumdata — ${labels.en[field]}${basis}: published value ${measure.value}${sourceUnit}${range}`;
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
  ['D-M', 'class d-m - durable to moderately durable'],
  ['M', 'class m - moderately durable'],
  ['M-S', 'class m-s - moderately durable to susceptible'],
  ['S', 'class s - susceptible'],
]);
const FRENCH_TERMITE_LABELS = new Map([
  ['D', 'classe d - durable'],
  ['D-M', 'classe d-m - durable à moyennement durable'],
  ['M', 'classe m - moyennement durable'],
  ['M-S', 'classe m-s - moyennement durable à sensible'],
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
  const byRank = paths.map(
    (taxonomyPath) => new Map(taxonomyPath.map((node) => [node.rank, node.name])),
  );
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

function aggregateDryWoodBorers(profiles, conflicts) {
  const individualClasses = profiles.map((profile) => {
    const genericClass = profile.facts.durability.dryWoodBorers;
    return genericClass
      ? [genericClass]
      : sortedUnique(
          Object.values(profile.facts.durability.dryWoodBorerClasses ?? {}).filter(Boolean),
        );
  });
  if (individualClasses.some((classes) => classes.length === 0)) return null;
  const conflictingProfileClasses = individualClasses.filter((classes) => classes.length > 1);
  if (conflictingProfileClasses.length > 0) {
    conflicts.push({
      field: 'durability.dryWoodBorers',
      values: sortedUnique(conflictingProfileClasses.flat()),
      reason: 'conflicting borer-specific classes',
    });
    return null;
  }
  return aggregateExactCategory(individualClasses.flat(), 'durability.dryWoodBorers', conflicts);
}

function durabilityClass(value) {
  const normalized = normalizeClassValue(value)
    .replace(/^dc\s*/u, '')
    .replace(/([1-5])to([1-5])/gu, '$1-$2');
  const match = normalized.match(/^([1-5])(?:-([1-5]))?[a-z]?$/u);
  if (!match) return null;
  const code = match[2] ? `${match[1]}-${match[2]}` : match[1];
  return FUNGAL_CODES.has(code) ? code : null;
}

function treatabilityClass(value) {
  const normalized = normalizeClassValue(value)
    .replace(/[()]/gu, '')
    .replace(/([1-4])to([1-4])/gu, '$1-$2');
  const match = normalized.match(/^([1-4])(?:-([1-4]))?[a-z]?$/u);
  if (!match) return null;
  const code = match[2] ? `${match[1]}-${match[2]}` : match[1];
  return TREATABILITY_CODES.has(code) ? code : null;
}

function resistanceClass(value) {
  const sourceCode = String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[‐‑‒–—]/gu, '-')
    .replace(/\s+/gu, '');
  const code =
    new Map([
      ['M-D', 'D-M'],
      ['S-M', 'M-S'],
    ]).get(sourceCode) ?? sourceCode;
  return RESISTANCE_CODES.has(code) ? code : null;
}

function normalizeClassValue(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[‐‑‒–—]/gu, '-')
    .toLocaleLowerCase('en')
    .replace(/\s+/gu, '');
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

function countryCodes(value, geographicRegions) {
  const codes = [];
  const isNorthAmerican = continentCodes(geographicRegions).includes('NA');
  for (const rawToken of String(value ?? '').split(';')) {
    const sourceToken = rawToken.replace(/\s*\[I\]\s*/giu, '').trim();
    if (!sourceToken) continue;
    const normalizedToken = normalizeText(sourceToken);
    const subdivisionCode = isNorthAmerican
      ? NORTH_AMERICAN_SUBDIVISION_TO_COUNTRY.get(normalizedToken)
      : null;
    const code =
      LIGNUMDATA_REGION_CODE_TO_COUNTRY.get(sourceToken.toUpperCase()) ??
      subdivisionCode ??
      COUNTRY_ALIAS_TO_CODE.get(normalizedToken);
    if (code) codes.push(code);
  }
  const normalized = normalizeText(value)
    .replace(/\bnew mexico\b/gu, ' ')
    .replace(/\bnew jersey\b/gu, ' ');
  const aliases = [...COUNTRY_ALIAS_TO_CODE.keys()].sort(
    (left, right) => right.length - left.length || left.localeCompare(right),
  );
  const pattern = new RegExp(`(?:^|\\b)(${aliases.map(escapeRegExp).join('|')})(?=\\b|$)`, 'gu');
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
    usa: 'US',
    venezuela: 'VE',
    vietnam: 'VN',
  };
  for (const [name, code] of Object.entries(manualAliases)) aliases.set(normalizeText(name), code);
  aliases.delete('congo');
  aliases.delete('georgia');
  aliases.delete('guinea');
  aliases.delete('jersey');
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
  return String(value ?? '')
    .replace(/\s+/gu, ' ')
    .trim();
}

function parseNumeric(value) {
  const normalized = String(value ?? '')
    .trim()
    .replace(',', '.');
  if (!/^-?\d+(?:[.]\d+)?$/u.test(normalized)) return null;
  const result = Number(normalized);
  return Number.isFinite(result) ? result : null;
}

function unitMatches(actual, expected) {
  return cleanUnit(actual) === cleanUnit(expected);
}

function cleanUnit(value) {
  return normalizeText(value).replace(/\s+/gu, '').replace(/³/gu, '3').replace(/[()]/gu, '');
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

function isConcreteSpeciesName(value) {
  const tokens = scientificNameKey(value).split(' ').filter(Boolean);
  if (tokens.length < 2) return false;
  return !new Set(['sp', 'spp', 'species', 'p']).has(tokens.at(-1));
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
    targetAcceptedNameCount: match.targetAcceptedNameCount,
    targetIsGroup: match.targetIsGroup,
    matchedNames: match.matchedNames,
    ambiguousNames: match.ambiguousNames,
    unmatchedNames: match.unmatchedNames,
    profileUrls: match.entries.map((entry) => entry.detailUrl).sort(),
  };
}

function countMatches(matches) {
  return {
    atlasRecordCount: matches.length,
    acceptedMatchRecords: matches.filter((match) => match.matchType === 'accepted').length,
    synonymMatchRecords: matches.filter((match) => match.matchType === 'synonym').length,
    partialMatchRecords: matches.filter((match) => match.matchType === 'partial').length,
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
    'durability.dryWoodBorerClasses.houseLonghorn',
    'durability.dryWoodBorerClasses.commonFurniture',
    'durability.dryWoodBorerClasses.lyctus',
    'durability.termites',
    'durability.heartwoodTreatability',
    'durability.sapwoodTreatability',
    'physics.specificGravity',
    'physics.jankaHardness',
    'physics.totalTangentialShrinkage',
    'physics.totalRadialShrinkage',
    'physics.shrinkageRatio',
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

async function fetchTextWithRetries(url, headers = {}) {
  let lastError;
  for (let attempt = 1; attempt <= FETCH_RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'User-Agent':
            'WoodAtlasFactualDataImporter/1.0 (+https://github.com/fabien-h/wood-atlas)',
          ...headers,
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
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
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

const command =
  process.argv.find((argument) => ['sync', 'generate', 'all'].includes(argument)) ?? 'all';
if (command === 'sync') {
  await sync();
} else if (command === 'generate') {
  await generate();
} else {
  await sync();
  await generate();
}
