#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FACTS_PATH = path.join(ROOT, 'data', 'raw', 'lpf', 'website-facts.json');
const MANIFEST_PATH = path.join(ROOT, 'data', 'manual', 'woods', 'lpf-website.json');
const ENGLISH_DATABASE_PATH = path.join(ROOT, 'public', 'data', 'woods.generated.en.json');
const FRENCH_DATABASE_PATH = path.join(ROOT, 'public', 'data', 'woods.generated.fr.json');

const LIST_URL = 'https://lpf.florestal.gov.br/en-us/brazilian-woods';
const SPECIES_PAGE_BASE_URL = 'https://lpf.florestal.gov.br';
const SOURCE_PROVIDER = 'Brazilian Forest Service — Forest Products Laboratory (LPF/SFB)';
const SOURCE_PUBLISHER = 'Brazilian Forest Service, Forest Products Laboratory (LPF/SFB)';
const EXTRACTION_DATE = '2026-07-23';
const PAGE_SIZE = 20;
const PAGE_COUNT = 14;
const BATCH_SIZE = 6;
const BATCH_DELAY_MS = 250;
const USER_AGENT = 'Wood Atlas research enrichment (contact: fabien.huet@gmail.com)';

const CURATED_DURABILITY = new Map([
  [
    nameKey('Cedrela sp.'),
    {
      fungi: '2-3',
      termites: 'D',
      dryWoodBorers: 'S',
    },
  ],
  [
    nameKey('Caryocar sp.'),
    {
      fungi: '1',
    },
  ],
  [
    nameKey('Manilkara sp.'),
    {
      fungi: '1',
      dryWoodBorers: 'D',
    },
  ],
]);

const PROFILE_TARGET_IDS = new Map([
  [31, 'america-lpf-brosimum-gaudichaudii'],
  [32, 'america-lpf-brosimum-acutifolium-subsp-interjectum'],
]);

const TREE_LABELS = [
  'Commercial height (m)',
  'Commercial height',
  'Commercia height',
  'Commercial heig ht',
  'Ommercial height',
  'Diameter (DBH) (cm)',
  'Diameter (DBH)(cm)',
  'Diameter ( DBH)',
  'Diameter (DBH)',
  'Diameter (DAB) (cm)',
  'Diameter (DAB)',
  'Diameter (DBA)',
  'Diameter',
  'Trunk',
  'Bark',
  'Buttresses',
  'Buttresse',
  'Buttress',
  'Butress',
];

const CHARACTERISTIC_LABELS = [
  'Resistance to manual cross-cutting',
  'Resistance to manual crosscutting',
  'Basic especific gravity (g/cm 3 )',
  'Basic specific gravity (g/cm 3 )',
  'Green weight ( kg/m 3 )',
  'Green weight (kg/m 3 )',
  'Thickness of sapwood',
  'Heartwood /sapwood',
  'Heartwood/sapwood',
  'Heartwood color',
  'Sapwood color',
  'Growth rings',
  'Tangenciall figure',
  'Tangenctial figure',
  'Tangencial figure',
  'Tangential figure',
  'Figure tangential',
  'Radial figure',
  'Figure radial',
  'Cross-cutting',
  'Heartwood',
  'Sapwood',
  'Texture',
  'Textare',
  'Grain',
  'Figure',
  'Luster',
  'Odor',
  'Color',
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
  console.error('Usage: node scripts/lpf-website.mjs <sync|generate|all>');
  process.exitCode = 1;
}

async function sync() {
  const listPages = [];
  for (let start = 0; start < PAGE_COUNT * PAGE_SIZE; start += PAGE_SIZE) {
    listPages.push(await fetchText(`${LIST_URL}?start=${start}`));
  }
  const entries = new Map();
  for (const html of listPages) {
    for (const match of html.matchAll(
      /href="([^"]*especieestudadaid=(\d+)[^"]*)"[^>]*>([^<]+)<\/a>/giu,
    )) {
      entries.set(match[2], {
        sourceId: Number(match[2]),
        scientificNames: scientificNames(decodeHtml(match[3])),
        url: speciesPageUrl(match[2], 'en'),
        portugueseUrl: speciesPageUrl(match[2], 'pt'),
      });
    }
  }
  if (entries.size < 260) {
    throw new Error(`LPF website listed only ${entries.size} studied-species pages`);
  }

  const facts = [];
  const values = [...entries.values()];
  for (let index = 0; index < values.length; index += BATCH_SIZE) {
    const batch = values.slice(index, index + BATCH_SIZE);
    const parsed = await Promise.all(
      batch.map(async (entry) => {
        const html = await fetchText(entry.url);
        const page = parseSpeciesPage(html);
        const preservation = page.sections.preservation ?? '';
        const treatability =
          classifyTreatabilityTable(page.tables.treatability) ?? classifyTreatability(preservation);
        const curated = entry.scientificNames
          .map((name) => CURATED_DURABILITY.get(nameKey(name)))
          .find(Boolean);
        return {
          ...entry,
          scientificNames:
            page.identity.scientificNames.length > 0
              ? page.identity.scientificNames
              : entry.scientificNames,
          page,
          facts: {
            treatability,
            fungi: curated?.fungi ?? null,
            termites: curated?.termites ?? null,
            dryWoodBorers: curated?.dryWoodBorers ?? null,
          },
        };
      }),
    );
    facts.push(...parsed);
    if (index + BATCH_SIZE < values.length) await delay(BATCH_DELAY_MS);
  }

  await writeJson(FACTS_PATH, {
    schemaVersion: 1,
    source: {
      title: 'LPF Brazilian Woods Database — studied species pages',
      provider: SOURCE_PROVIDER,
      url: LIST_URL,
      extractionDate: EXTRACTION_DATE,
      extractionPolicy:
        'Structured factual fields, short official descriptions, end uses, workability results, and normalized treatment classifications are retained; page images are excluded.',
    },
    studiedSpeciesPages: facts.length,
    factualProfiles: facts.filter(
      (entry) =>
        Object.values(entry.facts).some(Boolean) ||
        Object.values(entry.page.sections).some(Boolean),
    ).length,
    profiles: facts.sort((left, right) => left.sourceId - right.sourceId),
  });
  console.log(
    `Inspected ${facts.length} LPF pages and retained structured page data for every profile.`,
  );
}

async function generate() {
  const [facts, englishDatabase, frenchDatabase, previousManifest] = await Promise.all([
    readJson(FACTS_PATH),
    readJson(ENGLISH_DATABASE_PATH),
    readJson(FRENCH_DATABASE_PATH),
    readOptionalJson(MANIFEST_PATH),
  ]);
  const profilesByName = indexProfiles(facts.profiles);
  const frenchById = new Map(frenchDatabase.records.map((record) => [record.id, record]));
  const previousById = new Map(
    (previousManifest?.dataset?.generatorVersion === 1 ? previousManifest.supplements : []).map(
      (supplement) => [supplement.id, supplement],
    ),
  );
  const fieldCounts = new Map();
  let exactMatchCount = 0;
  let unpairedMatchCount = 0;
  const supplements = [];

  for (const english of englishDatabase.records) {
    const profiles = uniqueProfiles([
      ...english.identity.botanicalNames.flatMap(
        ({ name }) => profilesByName.get(nameKey(name)) ?? [],
      ),
      ...facts.profiles.filter(
        (profile) => PROFILE_TARGET_IDS.get(profile.sourceId) === english.id,
      ),
    ]);
    if (profiles.length === 0) continue;
    exactMatchCount += 1;
    const french = frenchById.get(english.id);
    if (!french) {
      unpairedMatchCount += 1;
      continue;
    }
    const combined = combineProfiles(profiles);
    const fields = selectFields(english, combined, previousById.get(english.id));
    if (fields.length === 0) continue;
    for (const field of fields) fieldCounts.set(field, (fieldCounts.get(field) ?? 0) + 1);
    supplements.push({
      id: english.id,
      source: {
        provider: SOURCE_PROVIDER,
        kind: 'manual',
        references: profiles.map((profile) => ({
          title: `LPF Brazilian Woods — ${profile.scientificNames[0]}`,
          url: profile.url,
          publisher: SOURCE_PUBLISHER,
          year: null,
        })),
        extractionDate: EXTRACTION_DATE,
      },
      locales: {
        en: buildLocale(english, combined, fields, 'en'),
        fr: buildLocale(french, combined, fields, 'fr'),
      },
    });
  }

  await writeJson(MANIFEST_PATH, {
    schemaVersion: 1,
    dataset: {
      generatorVersion: 1,
      title: facts.source.title,
      provider: SOURCE_PROVIDER,
      url: LIST_URL,
      studiedSpeciesPages: facts.studiedSpeciesPages,
      factualProfiles: facts.factualProfiles,
      exactAtlasMatches: exactMatchCount,
      unpairedAtlasMatchesSkipped: unpairedMatchCount,
      supplementedRecords: supplements.length,
      supplementedFields: Object.fromEntries(
        [...fieldCounts].sort(([left], [right]) => left.localeCompare(right)),
      ),
    },
    records: [],
    supplements: supplements.sort((left, right) => left.id.localeCompare(right.id)),
  });
  console.log(
    `Generated ${supplements.length} LPF website supplements from ${exactMatchCount} exact matches: ${JSON.stringify(Object.fromEntries(fieldCounts))}`,
  );
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`LPF website returned ${response.status} for ${url}`);
  return response.text();
}

function speciesPageUrl(sourceId, language) {
  const locale = language === 'pt' ? 'pt-br' : 'en-us';
  const url = new URL(`/${locale}/`, SPECIES_PAGE_BASE_URL);
  url.searchParams.set('option', 'com_madeirasbrasileiras');
  url.searchParams.set('view', 'especieestudada');
  url.searchParams.set('especieestudadaid', String(sourceId));
  return url.href;
}

function parseSpeciesPage(html) {
  const paragraphs = paragraphFields(html);
  const paragraphText = (label) => paragraphs.get(label)?.text ?? null;
  const tables = headingTables(html);
  return {
    identity: {
      primaryName: firstHeading(html, 'h4'),
      scientificNames: scientificNames(paragraphText('scientific name') ?? ''),
      family: paragraphText('family'),
      collectionLocation: paragraphText('collection location'),
      commonNames: splitCommaList(paragraphText('common names') ?? ''),
    },
    sections: {
      tree: paragraphText('tree'),
      generalCharacteristics: paragraphText('general characteristics'),
      endUses: paragraphText('end-uses'),
      workability: paragraphText('workability'),
      preservation: paragraphText('preservation'),
      kilnDrying: paragraphText('kiln drying'),
    },
    structured: {
      tree: labelValueStatements(paragraphText('tree') ?? '', TREE_LABELS),
      generalCharacteristics: labelValueStatements(
        paragraphText('general characteristics') ?? '',
        CHARACTERISTIC_LABELS,
      ),
    },
    tables: {
      workabilitySummary: parseFirstTable(paragraphs.get('workability')?.html),
      workability: tables.get('workability - type of action') ?? null,
      treatability: tables.get('treatability of wood') ?? null,
    },
  };
}

function paragraphFields(html) {
  const fields = new Map();
  for (const match of html.matchAll(
    /<p\b[^>]*>\s*<span\b[^>]*class="[^"]*\bfont-weight-bold\b[^"]*"[^>]*>([\s\S]*?)<\/span>([\s\S]*?)<\/p>/giu,
  )) {
    const label = normalizeLabel(htmlToText(match[1]));
    const value = htmlToText(match[2]);
    if (label && value) fields.set(label, { text: value, html: match[2] });
  }
  return fields;
}

function headingTables(html) {
  const tables = new Map();
  for (const heading of html.matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>/giu)) {
    const title = normalizeLabel(htmlToText(heading[1]));
    const afterHeading = html.slice(heading.index + heading[0].length);
    const nextHeadingIndex = afterHeading.search(/<h3\b/iu);
    const section =
      nextHeadingIndex === -1 ? afterHeading : afterHeading.slice(0, nextHeadingIndex);
    const tableMatch = section.match(/<table\b[^>]*>([\s\S]*?)<\/table>/iu);
    if (!title || !tableMatch) continue;
    tables.set(title, parseHtmlTable(tableMatch[1]));
  }
  return tables;
}

function parseHtmlTable(tableHtml) {
  return [...tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/giu)]
    .map((row) =>
      [...row[1].matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/giu)].map((cell) =>
        htmlToText(cell[1]),
      ),
    )
    .filter((row) => row.some(Boolean));
}

function parseFirstTable(html) {
  const match = String(html ?? '').match(/<table\b[^>]*>([\s\S]*?)<\/table>/iu);
  return match ? parseHtmlTable(match[1]) : null;
}

function firstHeading(html, tag) {
  const match = html.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'iu'));
  return match ? htmlToText(match[1]) : null;
}

function labelValueStatements(value, labels) {
  const source = String(value);
  const candidateMatches = labels
    .flatMap((label) =>
      [...source.matchAll(new RegExp(`\\b${escapeRegExp(label)}\\s*:`, 'giu'))].map((match) => ({
        label,
        index: match.index,
        end: match.index + match[0].length,
      })),
    )
    .sort((left, right) => left.index - right.index || right.end - left.end);
  const matches = [];
  for (const match of candidateMatches) {
    if (matches.some((selected) => match.index < selected.end)) continue;
    matches.push(match);
  }
  const statements = {};
  for (const [index, match] of matches.entries()) {
    const next = matches[index + 1];
    const statementValue = source
      .slice(match.end, next?.index ?? source.length)
      .replace(/^[\s;.-]+|[\s;.-]+$/gu, '')
      .trim();
    if (statementValue) statements[normalizeStatementLabel(match.label)] = statementValue;
  }
  return statements;
}

function normalizeStatementLabel(value) {
  const normalized = normalizeLabel(value);
  const aliases = new Map([
    ['commercial height (m)', 'commercial height'],
    ['commercia height', 'commercial height'],
    ['commercial heig ht', 'commercial height'],
    ['ommercial height', 'commercial height'],
    ['diameter (dbh) (cm)', 'diameter (dbh)'],
    ['diameter (dbh)(cm)', 'diameter (dbh)'],
    ['diameter ( dbh)', 'diameter (dbh)'],
    ['diameter', 'diameter (dbh)'],
    ['diameter (dab) (cm)', 'diameter (dab)'],
    ['diameter (dba)', 'diameter (dab)'],
    ['buttresses', 'buttress'],
    ['buttresse', 'buttress'],
    ['butress', 'buttress'],
    ['heartwood /sapwood', 'heartwood/sapwood'],
    ['resistance to manual crosscutting', 'resistance to manual cross-cutting'],
    ['cross-cutting', 'resistance to manual cross-cutting'],
    ['basic especific gravity (g/cm 3 )', 'basic specific gravity (g/cm 3 )'],
    ['green weight ( kg/m 3 )', 'green weight (kg/m 3 )'],
    ['tangenciall figure', 'tangential figure'],
    ['tangenctial figure', 'tangential figure'],
    ['tangencial figure', 'tangential figure'],
    ['figure tangential', 'tangential figure'],
    ['figure radial', 'radial figure'],
    ['textare', 'texture'],
  ]);
  return aliases.get(normalized) ?? normalized;
}

function splitCommaList(value) {
  return [
    ...new Set(
      String(value)
        .split(/\s*,\s*/u)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function normalizeLabel(value) {
  return normalizeText(value).replace(/[:.]$/u, '').trim();
}

function classifyTreatabilityTable(rows) {
  if (!Array.isArray(rows) || rows.length < 2) return null;
  const header = rows.find((row) => row.some((cell) => /\bheartwood\b/iu.test(cell)));
  if (!header) return null;
  const heartwoodIndex = header.findIndex((cell) => /\bheartwood\b/iu.test(cell));
  const headerIndex = rows.indexOf(header);
  const values = rows.slice(headerIndex + 1).find((row) => row[heartwoodIndex]?.trim());
  const code = phraseClass(values?.[heartwoodIndex] ?? '');
  return code === null ? null : String(code);
}

function classifyTreatability(value) {
  const text = normalizeText(value);
  if (
    !text ||
    /(?:nada se sabe|dados? (?:nao|não) dispon|insuficiente).{0,80}(?:preserva|trat)/u.test(text)
  ) {
    return null;
  }

  const heartwoodGroups = [
    ...text.matchAll(
      /(?:cerne\s*[-:]?\s*grupo|heartwood\s*-\s*group)\s*([iv\s]{1,7})(?:\s*\/\s*([iv\s]{1,7}))?/gu,
    ),
  ];
  if (heartwoodGroups.length > 0) {
    return classRange(
      heartwoodGroups.flatMap((match) => [
        romanClass(match[1]?.replace(/\s+/gu, '')),
        romanClass(match[2]?.replace(/\s+/gu, '')),
      ]),
    );
  }
  const genericGroups = [
    ...text.matchAll(
      /(?:facilidade|ease)\s*:\s*(?:sapwood\s*-\s*)?group\s*([iv\s]{1,7})(?:\s*\/\s*([iv\s]{1,7}))?/gu,
    ),
  ];
  if (genericGroups.length > 0) {
    return classRange(
      genericGroups.flatMap((match) => [
        romanClass(match[1]?.replace(/\s+/gu, '')),
        romanClass(match[2]?.replace(/\s+/gu, '')),
      ]),
    );
  }

  const heartwoodSegments = [
    ...text.matchAll(/(?:(?:o\s+)?cerne|(?:the\s+)?heartwood|heart)\s*[:,-]?\s*([^.;]{0,180})/gu),
  ].map((match) => match[1]);
  if (heartwoodSegments.length > 0) {
    const classes = heartwoodSegments.map(phraseClass).filter(Boolean);
    if (classes.length > 0) return String(Math.max(...classes));
  }
  if (/\balburno\b/u.test(text) && !/\bmadeira\b.{0,50}\bpreserva/u.test(text)) return null;

  const genericClass = phraseClass(text);
  return genericClass === null ? null : String(genericClass);
}

function phraseClass(value) {
  const normalized = normalizeText(value);
  if (
    /(?:nao|não)\s+(?:e\s+)?tratavel|extremamente resistente.{0,30}impregna|muito dificil.{0,30}(?:preserva|tratar)|\b(?:impermeable|untreatable|unbeatable|very difficult|very hard)\b/u.test(
      normalized,
    )
  ) {
    return 4;
  }
  if (
    /(?:moderadamente dificil|dificil).{0,40}(?:preserva|tratar)|(?:preserva|tratar).{0,40}(?:moderadamente dificil|dificil)|\b(?:moderately difficult|difficult|hard)\b/u.test(
      normalized,
    )
  ) {
    return 3;
  }
  if (
    /moderadamente facil.{0,40}(?:preserva|tratar)|(?:preserva|tratar).{0,40}moderadamente facil|\bmoderately easy\b/u.test(
      normalized,
    )
  ) {
    return 2;
  }
  if (
    /(?:muito facil|facil).{0,40}(?:preserva|tratar)|(?:preserva|tratar).{0,40}(?:muito facil|facil)|\b(?:very easy|easy)\b/u.test(
      normalized,
    )
  ) {
    return 1;
  }
  return null;
}

function romanClass(value) {
  return (
    {
      i: 1,
      ii: 2,
      iii: 3,
      iv: 4,
    }[value] ?? null
  );
}

function classRange(values) {
  const classes = values.filter(Boolean);
  if (classes.length === 0) return null;
  const minimum = Math.min(...classes);
  const maximum = Math.max(...classes);
  return minimum === maximum ? String(minimum) : `${minimum}-${maximum}`;
}

function scientificNames(value) {
  return [
    ...new Set(
      String(value)
        .split(/\s*=\s*/u)
        .map((name) => name.replace(/\s+/gu, ' ').trim())
        .filter(Boolean),
    ),
  ];
}

function indexProfiles(profiles) {
  const index = new Map();
  for (const profile of profiles) {
    for (const name of profile.scientificNames) {
      const key = nameKey(name);
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(profile);
    }
  }
  return index;
}

function uniqueProfiles(profiles) {
  return [...new Map(profiles.map((profile) => [profile.sourceId, profile])).values()];
}

function combineProfiles(profiles) {
  const combined = {
    commonNames: uniqueText(
      profiles.flatMap((profile) => [
        profile.page.identity.primaryName,
        ...profile.page.identity.commonNames,
      ]),
    ),
    collectionLocations: uniqueText(
      profiles.map((profile) => profile.page.identity.collectionLocation),
    ),
    diameterCm: combineMeasurements(
      profiles.map((profile) =>
        parseMeasurement(
          profile.page.structured.tree['diameter (dbh)'] ??
            profile.page.structured.tree['diameter (dab)'],
        ),
      ),
    ),
    sapwoodThickness: combineText(
      profiles.flatMap((profile) => sapwoodThicknessValues(profile.page)),
    ),
    sapwood: combineCategory(
      profiles.map((profile) =>
        sapwoodCategory(
          profile.page.structured.generalCharacteristics['heartwood/sapwood'] ??
            profile.page.structured.generalCharacteristics.sapwood,
        ),
      ),
    ),
    colour: combineCategory(
      profiles.map((profile) =>
        colourCategory(
          profile.page.structured.generalCharacteristics.color ??
            profile.page.structured.generalCharacteristics['heartwood color'],
        ),
      ),
    ),
    texture: combineCategory(
      profiles.map((profile) =>
        textureCategory(profile.page.structured.generalCharacteristics.texture),
      ),
    ),
    grain: combineCategory(
      profiles.map((profile) =>
        grainCategory(profile.page.structured.generalCharacteristics.grain),
      ),
    ),
    interlockedGrain: combineCategory(
      profiles.map((profile) =>
        interlockedGrainCategory(profile.page.structured.generalCharacteristics.grain),
      ),
    ),
    endUses: uniqueText(
      profiles.flatMap((profile) => canonicalEndUses(profile.page.sections.endUses)),
    ),
    additionalDetails: additionalDetailSections(profiles),
  };
  for (const field of ['treatability', 'fungi', 'termites', 'dryWoodBorers']) {
    const values = [
      ...new Set(
        profiles
          .map((profile) => profile.facts[field])
          .filter(Boolean)
          .map(String),
      ),
    ];
    combined[field] =
      field === 'treatability' || field === 'fungi'
        ? combineClassRanges(values)
        : singleValue(values);
  }
  return combined;
}

function additionalDetailSections(profiles) {
  const sections = [];
  const tree = combinedDetailFields(profiles, [
    ['commercialHeight', (profile) => profile.page.structured.tree['commercial height']],
    ['trunk', (profile) => profile.page.structured.tree.trunk],
    ['bark', (profile) => profile.page.structured.tree.bark],
    ['buttress', (profile) => profile.page.structured.tree.buttress],
  ]);
  if (tree.length > 0)
    sections.push({ id: 'lpf-tree-details', title: 'treeDetails', fields: tree });

  const characteristics = combinedDetailFields(profiles, [
    ['growthRings', (profile) => profile.page.structured.generalCharacteristics['growth rings']],
    [
      'tangentialFigure',
      (profile) => profile.page.structured.generalCharacteristics['tangential figure'],
    ],
    ['radialFigure', (profile) => profile.page.structured.generalCharacteristics['radial figure']],
    ['figure', (profile) => profile.page.structured.generalCharacteristics.figure],
    ['luster', (profile) => profile.page.structured.generalCharacteristics.luster],
    ['odor', (profile) => profile.page.structured.generalCharacteristics.odor],
    [
      'manualCrossCutting',
      (profile) =>
        profile.page.structured.generalCharacteristics['resistance to manual cross-cutting'],
    ],
  ]);
  if (characteristics.length > 0) {
    sections.push({
      id: 'lpf-additional-characteristics',
      title: 'additionalCharacteristics',
      fields: characteristics,
    });
  }

  const workability = combinedWorkabilityFields(profiles);
  if (workability.length > 0) {
    sections.push({ id: 'lpf-workability', title: 'workability', fields: workability });
  }

  const preservation = combinedPreservationFields(profiles);
  if (preservation.length > 0) {
    sections.push({
      id: 'lpf-preservation-details',
      title: 'preservationDetails',
      fields: preservation,
    });
  }
  return sections;
}

function combinedDetailFields(profiles, definitions) {
  return definitions.flatMap(([label, getValue]) => {
    const value = combineText(profiles.map(getValue));
    return value ? [{ label, value }] : [];
  });
}

function combinedWorkabilityFields(profiles) {
  const fields = new Map();
  const add = (label, value) => {
    if (!value || value === '-') return;
    if (!fields.has(label)) fields.set(label, []);
    fields.get(label).push(value);
  };
  for (const profile of profiles) {
    const summary = profile.page.tables.workabilitySummary;
    if (Array.isArray(summary) && summary.length > 1) {
      const headers = summary[0];
      for (let column = 1; column < headers.length; column += 1) {
        const test = normalizeDetailKey(headers[column]);
        if (!test) continue;
        for (const row of summary.slice(1)) {
          const result = normalizeDetailKey(row[0]);
          if (result === 'numberOfSamples' || !result) continue;
          add(`${test}.${result}`, row[column]);
        }
      }
    }

    const actions = profile.page.tables.workability;
    if (Array.isArray(actions) && actions.length > 1) {
      const headers = actions[0];
      for (const row of actions.slice(1)) {
        const result = normalizeDetailKey(row[0]);
        if (!result) continue;
        for (let column = 1; column < headers.length; column += 1) {
          const test = normalizeDetailKey(headers[column]);
          if (!test) continue;
          add(`${test}.${result}`, row[column]);
        }
      }
    }

    if (!summary && profile.page.sections.workability) {
      const statements = labelValueStatements(profile.page.sections.workability, [
        'Sawing',
        'Planing',
        'Sanding',
        'Turning',
        'Boring',
        'Nailing',
      ]);
      for (const [label, value] of Object.entries(statements)) {
        add(normalizeDetailKey(label), value);
      }
    }
  }
  return [...fields].map(([label, values]) => ({ label, value: combineText(values) }));
}

function combinedPreservationFields(profiles) {
  const fields = new Map();
  for (const profile of profiles) {
    const statements = labelValueStatements(profile.page.sections.preservation ?? '', [
      'Ease',
      'Retention (kg/m 3 )',
      'Retention',
      'Penetration',
    ]);
    for (const [label, value] of Object.entries(statements)) {
      const key = normalizeDetailKey(label);
      if (!fields.has(key)) fields.set(key, []);
      fields.get(key).push(value);
    }
  }
  return [...fields].map(([label, values]) => ({ label, value: combineText(values) }));
}

function normalizeDetailKey(value) {
  const normalized = normalizeText(value);
  return (
    new Map([
      ['commercial height', 'commercialHeight'],
      ['growth rings', 'growthRings'],
      ['tangential figure', 'tangentialFigure'],
      ['radial figure', 'radialFigure'],
      ['resistance to manual cross cutting', 'manualCrossCutting'],
      ['surface finishing', 'surfaceFinishing'],
      ['number of samples', 'numberOfSamples'],
      ['nail crack', 'nailCrack'],
      ['sandpaper', 'sanding'],
      ['planer', 'planing'],
      ['vise', 'turning'],
      ['drill', 'boring'],
      ['retention kg m 3', 'retention'],
    ]).get(normalized) ??
    normalized.replace(/\s+(\p{L})/gu, (_, character) => character.toLocaleUpperCase('en'))
  );
}

function combineClassRanges(values) {
  if (values.length === 0) return null;
  const numbers = values.flatMap((value) => value.split('-').map(Number));
  const minimum = Math.min(...numbers);
  const maximum = Math.max(...numbers);
  return minimum === maximum ? String(minimum) : `${minimum}-${maximum}`;
}

function singleValue(values) {
  return values.length === 1 ? values[0] : null;
}

function uniqueText(values) {
  return [
    ...new Map(
      values
        .filter((value) => typeof value === 'string' && value.trim())
        .map((value) => [normalizeText(value), value.trim()]),
    ).values(),
  ];
}

function combineText(values) {
  const uniqueValues = uniqueText(values);
  return uniqueValues.length === 0 ? null : uniqueValues.join(' / ');
}

function combineCategory(values) {
  const counts = new Map();
  for (const value of values.filter(Boolean)) counts.set(value, (counts.get(value) ?? 0) + 1);
  return (
    [...counts.entries()].sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
    )[0]?.[0] ?? null
  );
}

function parseMeasurement(value) {
  if (!value) return null;
  const normalized = String(value).replace(/,/gu, '.');
  const mean = normalized.match(/\bmean\s*([\d.]+)/iu);
  const minimum = normalized.match(/\bmin[.]?\s*([\d.]+)/iu);
  const maximum = normalized.match(/\bmax[.]?\s*([\d.]+)/iu);
  const values = [...normalized.matchAll(/\d+(?:[.]\d+)?/gu)].map((match) => Number(match[0]));
  if (values.length === 0) return null;
  return {
    value: mean ? Number(mean[1]) : values[0],
    min: minimum ? Number(minimum[1]) : values.length > 1 ? Math.min(...values) : null,
    max: maximum ? Number(maximum[1]) : values.length > 1 ? Math.max(...values) : null,
  };
}

function combineMeasurements(measurements) {
  const values = measurements.filter(Boolean);
  if (values.length === 0) return null;
  const observedValues = values.map(({ value }) => value);
  const minimum = Math.min(...values.map(({ value, min }) => min ?? value));
  const maximum = Math.max(...values.map(({ value, max }) => max ?? value));
  return {
    value: round(observedValues.reduce((sum, value) => sum + value, 0) / values.length, 3),
    min: minimum === maximum ? null : minimum,
    max: minimum === maximum ? null : maximum,
    observations: values.length,
  };
}

function round(value, digits) {
  const multiplier = 10 ** digits;
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
}

function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : String(round(value, 3));
}

function localizedMeasure(measurement, label, unit) {
  const range =
    measurement.min === null || measurement.max === null
      ? formatNumber(measurement.value)
      : `${formatNumber(measurement.min)}–${formatNumber(measurement.max)}`;
  return {
    raw: `${label}; ${measurement.observations} observation${measurement.observations === 1 ? '' : 's'}: ${range} ${unit}`,
    value: measurement.value,
    min: measurement.min,
    max: measurement.max,
    unit,
  };
}

function sapwoodThicknessValues(page) {
  const characteristics = page.structured.generalCharacteristics;
  const direct = characteristics['thickness of sapwood'];
  if (direct) return [direct];
  const descriptions = [characteristics.sapwood, characteristics['heartwood/sapwood']].filter(
    Boolean,
  );
  return descriptions.flatMap((value) => {
    const matches = [
      ...String(value).matchAll(
        /(?:up to\s+)?\d+(?:[.,]\d+)?(?:\s*(?:-|to)\s*\d+(?:[.,]\d+)?)?\s*cm(?:\s+thick)?/giu,
      ),
    ];
    return matches.map((match) => match[0]);
  });
}

function sapwoodCategory(value) {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  if (
    /\b(?:indistinct|indisttinct|not sharply demarcated|not clearly demarcated|slightly distinct)\b/u.test(
      normalized,
    )
  ) {
    return 'not clearly demarcated';
  }
  if (/\b(?:sharply demarcated|distinct)\b/u.test(normalized)) return 'clearly demarcated';
  return null;
}

function colourCategory(value) {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  const categories = [
    [/\bblack\b/u, 'black'],
    [/\bpurple\b/u, 'purple'],
    [/\bpinkish white\b/u, 'pinkish white'],
    [/\b(?:creamy white|cream)\b/u, 'creamy white'],
    [/\b(?:grayish|grey|gray)\b/u, 'grey'],
    [/\bwhite\b/u, 'white'],
    [/\bdark reddish brown\b/u, 'red brown'],
    [/\blight reddish brown\b/u, 'light red'],
    [/\breddish brown\b/u, 'reddish brown'],
    [/\bpinkish brown\b/u, 'pinkish brown'],
    [/\borange brown\b/u, 'orange brown'],
    [/\byellowish brown\b/u, 'yellowish brown'],
    [/\byellow brown\b/u, 'yellow brown'],
    [/\bdark brown\b/u, 'dark brown'],
    [/\blight brown\b/u, 'light brown'],
    [/\bolive\b/u, 'olive green'],
    [/\bbrown\b/u, 'brown'],
    [/\blight yellow\b/u, 'light yellow'],
    [/\byellow\b/u, 'yellow'],
    [/\bpink\b/u, 'pink'],
    [/\bred\b/u, 'red'],
  ];
  return categories.find(([pattern]) => pattern.test(normalized))?.[1] ?? null;
}

function textureCategory(value) {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  if (/\bfine\b.{0,20}\bcoarse\b|\bcoarse\b.{0,20}\bfine\b/u.test(normalized)) {
    return 'very variable, fine to coarse';
  }
  if (/\bmedium\b.{0,20}\bcoarse\b|\bcoarse\b.{0,20}\bmedium\b/u.test(normalized)) {
    return 'medium to coarse';
  }
  if (/\bfine\b.{0,20}\bmedium\b|\bmedium\b.{0,20}\bfine\b/u.test(normalized)) {
    return 'fine to medium';
  }
  if (/\bcoarse\b/u.test(normalized)) return 'coarse';
  if (/\bfine\b/u.test(normalized)) return 'fine';
  if (/\bmedium\b/u.test(normalized)) return 'medium';
  return null;
}

function grainCategory(value) {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  if (/\bstraight\b.{0,30}\binterlocked\b/u.test(normalized)) return 'straight or interlocked';
  if (/\bstraight\b.{0,30}\birregular\b/u.test(normalized)) return 'straight to irregular';
  if (/\binterlocked\b/u.test(normalized)) return 'interlocked';
  if (/\b(?:wavy|undulating)\b/u.test(normalized)) return 'undulating';
  if (/\bstraight\b/u.test(normalized)) return 'straight';
  if (/\birregular\b/u.test(normalized)) return 'straight to irregular';
  return null;
}

function interlockedGrainCategory(value) {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  if (/\bstraight\b.{0,30}\binterlocked\b/u.test(normalized)) return 'slight';
  if (/\binterlocked\b|\bcross(?:ed)?\b/u.test(normalized)) return 'marked';
  if (/\bstraight\b/u.test(normalized)) return 'absent';
  return null;
}

function canonicalEndUses(value) {
  const normalized = normalizeText(value)
    .replace(/\bcontruction\b/gu, 'construction')
    .replace(/\bboatas\b/gu, 'boats');
  if (!normalized) return [];
  const uses = [];
  const add = (condition, use) => {
    if (condition) uses.push(use);
  };
  add(normalized.includes('heavy construction'), 'heavy construction');
  add(normalized.includes('light construction'), 'light carpentry');
  add(normalized.includes('boats'), 'open boats');
  add(normalized.includes('furniture and interior trim'), 'furniture');
  add(normalized.includes('furniture and interior trim'), 'interior joinery');
  add(normalized.includes('furniture framework'), 'current furniture or furniture components');
  add(
    /\bfurniture\b/u.test(normalized) &&
      !normalized.includes('furniture and interior trim') &&
      !normalized.includes('furniture framework'),
    'furniture',
  );
  add(/\bframework\b/u.test(normalized), 'current furniture or furniture components');
  add(normalized.includes('turnery'), 'turned goods');
  add(normalized.includes('toys'), 'toys and models');
  add(normalized.includes('household utensils'), 'wood-ware');
  add(normalized.includes('paneling'), 'interior panelling');
  add(normalized.includes('musical instruments'), 'musical instruments');
  add(normalized.includes('boxes and crates'), 'boxes and crates');
  return [...new Set(uses)];
}

function categoryValue(code, language) {
  const french = new Map([
    ['clearly demarcated', 'bien distinct'],
    ['not clearly demarcated', 'peu distinct'],
    ['brown', 'brun'],
    ['red brown', 'brun rouge'],
    ['light brown', 'brun clair'],
    ['yellow brown', 'brun jaune'],
    ['pinkish brown', 'brun rosé'],
    ['yellow', 'jaune'],
    ['creamy white', 'blanc crème'],
    ['dark brown', 'brun foncé'],
    ['light yellow', 'jaune clair'],
    ['white', 'blanc'],
    ['reddish brown', 'brun rougeâtre'],
    ['grey', 'gris'],
    ['olive green', 'vert olive'],
    ['pink', 'rose'],
    ['red', 'rouge'],
    ['pinkish white', 'blanc rosé'],
    ['light red', 'rouge clair'],
    ['orange brown', 'brun orangé'],
    ['yellowish brown', 'brun jaunâtre'],
    ['black', 'noir'],
    ['purple', 'violet'],
    ['very variable, fine to coarse', 'très variable, fin à grossier'],
    ['medium to coarse', 'moyen à grossier'],
    ['fine to medium', 'fin à moyen'],
    ['coarse', 'grossier'],
    ['fine', 'fin'],
    ['medium', 'moyen'],
    ['straight or interlocked', 'droit ou contrefilé'],
    ['straight to irregular', 'droit à irrégulier'],
    ['interlocked', 'contrefil'],
    ['undulating', 'ondulé'],
    ['straight', 'droit'],
    ['slight', 'léger'],
    ['marked', 'accusé'],
    ['absent', 'absent'],
  ]);
  const value = language === 'fr' ? (french.get(code) ?? code) : code;
  return {
    raw:
      language === 'fr'
        ? `Base LPF des bois brésiliens — caractéristique normalisée : ${value}`
        : `LPF Brazilian Woods — normalized characteristic: ${value}`,
    value,
  };
}

function localizedEndUse(value, language) {
  if (language !== 'fr') return value;
  return (
    new Map([
      ['heavy construction', 'construction lourde'],
      ['light carpentry', 'charpente légère'],
      ['open boats', 'embarcations légères'],
      ['furniture', 'meubles'],
      ['interior joinery', 'menuiserie intérieure'],
      ['current furniture or furniture components', 'meuble courant ou éléments meublants'],
      ['turned goods', 'articles tournés'],
      ['toys and models', 'jouets et modèles'],
      ['wood-ware', 'tabletterie'],
      ['interior panelling', 'lambris'],
      ['musical instruments', 'instruments de musique'],
      ['boxes and crates', 'caisses et caissettes'],
    ]).get(value) ?? value
  );
}

function translateSapwoodThickness(value) {
  return String(value)
    .replace(/\bup to\b/giu, 'jusqu’à')
    .replace(/\bto\b/giu, 'à')
    .replace(/\bthick\b/giu, "d'épaisseur");
}

function selectFields(record, facts, previous) {
  const fields = [
    ['durability.fungi', facts.fungi],
    ['durability.dryWoodBorers', facts.dryWoodBorers],
    ['durability.termites', facts.termites],
    ['durability.treatability', facts.treatability],
    ['log.diameterCm', facts.diameterCm],
    ['log.sapwoodThickness', facts.sapwoodThickness],
    ['appearance.sapwood', facts.sapwood],
    ['appearance.colourReference', facts.colour],
    ['appearance.texture', facts.texture],
    ['appearance.grain', facts.grain],
    ['appearance.interlockedGrain', facts.interlockedGrain],
  ]
    .filter(([, value]) => value != null)
    .filter(([field]) => {
      const currentValue = getAtPath(record, `${field}.value`);
      const currentRaw = getAtPath(record, `${field}.raw`);
      return (
        currentValue === null ||
        getAtPath(previous?.locales?.en, `${field}.value`) != null ||
        (field === 'durability.fungi' && /^OSU worldwide checklist\b/u.test(currentRaw ?? ''))
      );
    })
    .map(([field]) => field);
  if (facts.commonNames.length > 0) fields.push('identity.aliases', 'identity.localNames');
  if (facts.endUses.length > 0) fields.push('endUses');
  if (facts.additionalDetails.length > 0) fields.push('additionalDetails');
  return [...new Set(fields)];
}

function buildLocale(base, facts, fields, language) {
  const locale = emptyLocale(base, language);
  const country = language === 'fr' ? 'Brésil' : 'Brazil';
  for (const field of fields) {
    if (field === 'identity.aliases') {
      const existingNames = new Set([
        base.identity.primaryName.toLocaleLowerCase('pt'),
        base.identity.displayName.toLocaleLowerCase('pt'),
        ...base.identity.aliases.map((name) => name.toLocaleLowerCase('pt')),
      ]);
      locale.identity.aliases = facts.commonNames.filter(
        (name) => !existingNames.has(name.toLocaleLowerCase('pt')),
      );
      continue;
    }
    if (field === 'identity.localNames') {
      locale.identity.localNames = facts.commonNames.map((name) => ({ country, name }));
      continue;
    }
    if (field === 'log.diameterCm') {
      locale.log.diameterCm = localizedMeasure(
        facts.diameterCm,
        language === 'fr'
          ? 'Diamètre à hauteur de poitrine relevé par le LPF'
          : 'LPF diameter at breast height',
        'cm',
      );
      continue;
    }
    if (field === 'log.sapwoodThickness') {
      locale.log.sapwoodThickness = {
        raw:
          language === 'fr'
            ? `Base LPF des bois brésiliens — épaisseur de l’aubier : ${translateSapwoodThickness(facts.sapwoodThickness)}`
            : `LPF Brazilian Woods — sapwood thickness: ${facts.sapwoodThickness}`,
        value:
          language === 'fr'
            ? translateSapwoodThickness(facts.sapwoodThickness)
            : facts.sapwoodThickness,
      };
      continue;
    }
    if (field === 'appearance.sapwood') {
      locale.appearance.sapwood = categoryValue(facts.sapwood, language);
      continue;
    }
    if (field === 'appearance.colourReference') {
      locale.appearance.colourReference = categoryValue(facts.colour, language);
      continue;
    }
    if (field === 'appearance.texture') {
      locale.appearance.texture = categoryValue(facts.texture, language);
      continue;
    }
    if (field === 'appearance.grain') {
      locale.appearance.grain = categoryValue(facts.grain, language);
      continue;
    }
    if (field === 'appearance.interlockedGrain') {
      locale.appearance.interlockedGrain = categoryValue(facts.interlockedGrain, language);
      continue;
    }
    if (field === 'endUses') {
      locale.endUses = facts.endUses.map((use) => localizedEndUse(use, language));
      continue;
    }
    if (field === 'additionalDetails') {
      locale.additionalDetails = localizedAdditionalDetails(facts.additionalDetails, language);
      continue;
    }
    const key = field.split('.').at(-1);
    locale.durability[key] =
      key === 'fungi'
        ? fungiValue(facts[key], language)
        : key === 'treatability'
          ? treatabilityValue(facts[key], language)
          : resistanceValue(facts[key], key, language);
  }
  return locale;
}

function localizedAdditionalDetails(sections, language) {
  const titles = {
    treeDetails: ['Tree details', 'Caractéristiques de l’arbre'],
    additionalCharacteristics: ['Additional characteristics', 'Caractéristiques complémentaires'],
    workability: ['Workability', 'Usinage'],
    preservationDetails: ['Preservation details', 'Détails de préservation'],
  };
  const labels = {
    commercialHeight: ['Commercial height', 'Hauteur commerciale'],
    trunk: ['Trunk', 'Tronc'],
    bark: ['Bark', 'Écorce'],
    buttress: ['Buttress', 'Contreforts'],
    growthRings: ['Growth rings', 'Cernes de croissance'],
    tangentialFigure: ['Tangential figure', 'Figure tangentielle'],
    radialFigure: ['Radial figure', 'Figure radiale'],
    figure: ['Figure', 'Figure'],
    luster: ['Luster', 'Lustre'],
    odor: ['Odor', 'Odeur'],
    manualCrossCutting: ['Manual cross-cutting', 'Résistance à la coupe transversale manuelle'],
    sawing: ['Sawing', 'Sciage'],
    planing: ['Planing', 'Rabotage'],
    sanding: ['Sanding', 'Ponçage'],
    turning: ['Turning', 'Tournage'],
    boring: ['Boring', 'Perçage'],
    nailing: ['Nailing', 'Clouage'],
    nailCrack: ['Nail cracking', 'Fendage au clouage'],
    processing: ['Processing', 'Usinage'],
    finishing: ['Finishing', 'Finition'],
    surface: ['Surface', 'Surface'],
    surfaceFinishing: ['Surface finishing', 'État de surface'],
    ease: ['Ease', 'Facilité'],
    retention: ['Retention', 'Rétention'],
    penetration: ['Penetration', 'Pénétration'],
  };
  const index = language === 'fr' ? 1 : 0;
  return sections.map((section) => ({
    id: section.id,
    title: titles[section.title]?.[index] ?? section.title,
    fields: section.fields.map(({ label, value }) => {
      const translatedValue = language === 'fr' ? translateAdditionalDetailValue(value) : value;
      return {
        label: label
          .split('.')
          .map((part) => labels[part]?.[index] ?? part)
          .join(' — '),
        value: translatedValue,
        ...(language === 'fr' && translatedValue === value ? { valueLanguage: 'en' } : {}),
      };
    }),
  }));
}

function translateAdditionalDetailValue(value) {
  const translations = new Map([
    ['straight', 'droit'],
    ['low', 'faibles'],
    ['high', 'importants'],
    ['distinct', 'distincts'],
    ['indistinct', 'indistinct'],
    ['lacking', 'absent'],
    ['absent', 'absent'],
    ['faint', 'faible'],
    ['hard', 'difficile'],
    ['easy', 'facile'],
    ['very easy', 'très facile'],
    ['medium', 'moyen'],
    ['good', 'bon'],
    ['very good', 'très bon'],
    ['excellent', 'excellent'],
    ['poor', 'médiocre'],
    ['rough', 'rugueux'],
  ]);
  return translations.get(normalizeText(value)) ?? value;
}

function fungiValue(code, language) {
  const labels = {
    en: new Map([
      ['1', 'class 1 - very durable'],
      ['1-2', 'class 1-2 - very durable to durable'],
      ['2-3', 'class 2-3 - durable to moderately durable'],
    ]),
    fr: new Map([
      ['1', 'classe 1 - très durable'],
      ['1-2', 'classe 1-2 - très durable à durable'],
      ['2-3', 'classe 2-3 - durable à moyennement durable'],
    ]),
  };
  return {
    raw:
      language === 'fr'
        ? `Base LPF des bois brésiliens — durabilité naturelle : classe ${code}`
        : `LPF Brazilian Woods — natural durability: class ${code}`,
    value: labels[language].get(code),
  };
}

function treatabilityValue(code, language) {
  const labels = {
    en: new Map([
      ['1', 'class 1 - easily permeable'],
      ['1-2', 'class 1-2 - moderately to easily permeable'],
      ['2', 'class 2 - moderately permeable'],
      ['2-3', 'class 2-3 - poorly to moderately permeable'],
      ['3', 'class 3 - poorly permeable'],
      ['3-4', 'class 3-4 - poorly or not permeable'],
      ['4', 'class 4 - not permeable'],
    ]),
    fr: new Map([
      ['1', 'classe 1 - imprégnable'],
      ['1-2', 'classe 1-2 - moyennement imprégnable à imprégnable'],
      ['2', 'classe 2 - moyennement imprégnable'],
      ['2-3', 'classe 2-3 - peu à moyennement imprégnable'],
      ['3', 'classe 3 - peu imprégnable'],
      ['3-4', 'classe 3-4 - peu ou non imprégnable'],
      ['4', 'classe 4 - non imprégnable'],
    ]),
  };
  return {
    raw:
      language === 'fr'
        ? `Base LPF des bois brésiliens — classe d’imprégnabilité du duramen : ${code}`
        : `LPF Brazilian Woods — heartwood treatability class: ${code}`,
    value: labels[language].get(code),
  };
}

function resistanceValue(code, field, language) {
  const labels = {
    en: new Map([
      ['D', 'class d - durable'],
      ['S', 'class s - susceptible'],
    ]),
    fr: new Map([
      ['D', 'classe d - durable'],
      ['S', 'classe s - sensible'],
    ]),
  };
  const subject = field === 'termites' ? 'termites' : 'dry-wood borers';
  return {
    raw:
      language === 'fr'
        ? `Base LPF des bois brésiliens — résistance explicite (${subject}) : ${code}`
        : `LPF Brazilian Woods — explicit ${subject} resistance: ${code}`,
    value: labels[language].get(code),
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

function htmlToText(html) {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/giu, ' ')
      .replace(/<style[\s\S]*?<\/style>/giu, ' ')
      .replace(/<[^>]+>/gu, ' '),
  )
    .replace(/\s+/gu, ' ')
    .trim();
}

function decodeHtml(value) {
  return String(value)
    .replace(/&nbsp;|&#160;/giu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/&quot;/giu, '"')
    .replace(/&#0?39;|&apos;/giu, "'")
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>');
}

function normalizeText(value) {
  return String(value)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('pt')
    .replace(/\s+/gu, ' ')
    .trim();
}

function nameKey(value) {
  return normalizeText(value).replace(/[.,]/gu, '').replace(/\s+/gu, ' ').trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function getAtPath(value, fieldPath) {
  return fieldPath.split('.').reduce((current, key) => current?.[key], value);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
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
