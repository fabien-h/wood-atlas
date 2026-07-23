#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FACTS_PATH = path.join(ROOT, 'data', 'raw', 'wood-database', 'facts.json');
const MANIFEST_PATH = path.join(ROOT, 'data', 'manual', 'woods', 'wood-database.json');
const ENGLISH_DATABASE_PATH = path.join(ROOT, 'public', 'data', 'woods.generated.en.json');
const FRENCH_DATABASE_PATH = path.join(ROOT, 'public', 'data', 'woods.generated.fr.json');

const SOURCE_URL = 'https://www.wood-database.com/wood-filter/';
const API_URL = 'https://www.wood-database.com/wp-json/wp/v2/posts';
const SOURCE_PROVIDER = 'The Wood Database';
const SOURCE_PUBLISHER = 'Eric Meier — The Wood Database';
const EXTRACTION_DATE = '2026-07-23';
const CRAWL_DELAY_MS = 5_000;
const PAGE_SIZE = 100;
const USER_AGENT = 'Wood Atlas research enrichment (contact: fabien.huet@gmail.com)';
const TAXONOMIC_CROSSWALK = new Map(
  [
    [
      'Hibiscus elatus',
      'Talipariti elatum',
      'https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:121930-2',
    ],
    [
      'Terminalia tomentosa',
      'Terminalia elliptica',
      'https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:20009821-1',
    ],
    [
      'Lithocarpus densiflorus',
      'Notholithocarpus densiflorus',
      'https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:141712-2',
    ],
    [
      'Bulnesia arborea',
      'Plectrocarpa arborea',
      'https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:873128-1',
    ],
    [
      'Piratinera guianensis',
      'Brosimum guianense',
      'https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:855966-1',
    ],
  ].map(([atlasName, sourceName, referenceUrl]) => [
    normalizeScientificName(atlasName),
    { sourceName, referenceUrl },
  ]),
);

const command = process.argv[2] ?? 'all';
if (command === 'sync') {
  await sync();
} else if (command === 'generate') {
  await generate();
} else if (command === 'all') {
  await sync();
  await generate();
} else {
  console.error('Usage: node scripts/wood-database.mjs <sync|generate|all>');
  process.exitCode = 1;
}

async function sync() {
  const profiles = [];
  let fetchedCount = 0;
  let page = 1;
  let totalPages = 1;
  let expectedTotal = null;

  do {
    const requestUrl = new URL(API_URL);
    requestUrl.searchParams.set('per_page', String(PAGE_SIZE));
    requestUrl.searchParams.set('page', String(page));
    requestUrl.searchParams.set('_fields', 'id,link,slug,title,content,modified');
    const response = await fetch(requestUrl, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new Error(`The Wood Database API returned ${response.status} for page ${page}`);
    }

    expectedTotal ??= Number(response.headers.get('x-wp-total'));
    totalPages = Number(response.headers.get('x-wp-totalpages'));
    const posts = await response.json();
    fetchedCount += posts.length;
    profiles.push(...posts.map(parseProfile).filter(Boolean));
    console.log(
      `Fetched ${Math.min(page * PAGE_SIZE, expectedTotal).toLocaleString('en')}/${expectedTotal.toLocaleString('en')} Wood Database profiles.`,
    );
    page += 1;
    if (page <= totalPages) await delay(CRAWL_DELAY_MS);
  } while (page <= totalPages);

  if (fetchedCount !== expectedTotal || profiles.length < 500) {
    throw new Error(
      `Fetched ${fetchedCount} posts and parsed ${profiles.length} profiles, but the source reports ${String(expectedTotal)} posts`,
    );
  }

  await writeJson(FACTS_PATH, {
    schemaVersion: 1,
    source: {
      title: 'The Wood Database',
      provider: SOURCE_PUBLISHER,
      url: SOURCE_URL,
      apiUrl: API_URL,
      copyrightNotice: 'Copyright © 2008–2026 Eric Meier. All Rights Reserved.',
      extractionPolicy:
        'Only short factual measurements and normalized classifications are retained; descriptions and images are excluded.',
      extractionDate: EXTRACTION_DATE,
      crawlDelayMilliseconds: CRAWL_DELAY_MS,
    },
    sourcePostCount: fetchedCount,
    skippedPostsWithoutScientificName: fetchedCount - profiles.length,
    profileCount: profiles.length,
    profiles: profiles.sort((left, right) => left.url.localeCompare(right.url)),
  });
  console.log(`Stored ${profiles.length} minimal factual profiles in ${relative(FACTS_PATH)}.`);
}

async function generate() {
  const [facts, englishDatabase, frenchDatabase, previousManifest] = await Promise.all([
    readJson(FACTS_PATH),
    readJson(ENGLISH_DATABASE_PATH),
    readJson(FRENCH_DATABASE_PATH),
    readOptionalJson(MANIFEST_PATH),
  ]);
  const frenchById = new Map(frenchDatabase.records.map((record) => [record.id, record]));
  const profilesByScientificName = indexProfiles(facts.profiles);
  const previousById = new Map(
    (previousManifest?.dataset?.generatorVersion === 1 ? previousManifest.supplements : []).map(
      (supplement) => [supplement.id, supplement],
    ),
  );
  const fieldCounts = new Map();
  let exactMatchCount = 0;
  let taxonomicCrosswalkMatchCount = 0;
  let ambiguousMatchCount = 0;

  const supplements = [];
  for (const english of englishDatabase.records) {
    const directProfiles = uniqueProfiles(
      english.identity.botanicalNames.flatMap(
        ({ name }) => profilesByScientificName.get(normalizeScientificName(name)) ?? [],
      ),
    );
    const crosswalks = english.identity.botanicalNames
      .map(({ name }) => TAXONOMIC_CROSSWALK.get(normalizeScientificName(name)))
      .filter(Boolean);
    const crosswalkProfiles = uniqueProfiles(
      crosswalks.flatMap(
        ({ sourceName }) => profilesByScientificName.get(normalizeScientificName(sourceName)) ?? [],
      ),
    );
    const profiles = uniqueProfiles([...directProfiles, ...crosswalkProfiles]);
    if (profiles.length > 1) {
      ambiguousMatchCount += 1;
      continue;
    }
    if (profiles.length === 0) continue;
    if (directProfiles.length > 0) exactMatchCount += 1;
    else taxonomicCrosswalkMatchCount += 1;

    const french = frenchById.get(english.id);
    if (!french) throw new Error(`French record ${english.id} was not found`);
    const profile = profiles[0];
    const taxonomicReferences = crosswalks
      .filter(
        ({ sourceName }) =>
          normalizeScientificName(sourceName) === normalizeScientificName(profile.scientificName),
      )
      .map(({ sourceName, referenceUrl }) => ({
        title: `Plants of the World Online — ${sourceName}`,
        url: referenceUrl,
        publisher: 'Royal Botanic Gardens, Kew',
        year: 2026,
      }));
    const previous = previousById.get(english.id);
    const fields = selectFields(english, profile, previous);
    if (fields.length === 0) continue;
    for (const field of fields) fieldCounts.set(field, (fieldCounts.get(field) ?? 0) + 1);

    supplements.push({
      id: english.id,
      source: {
        provider: SOURCE_PROVIDER,
        kind: 'manual',
        references: [
          {
            title: `${profile.title} (${profile.scientificName})`,
            url: profile.url,
            publisher: SOURCE_PUBLISHER,
            year: Number(profile.modified.slice(0, 4)),
          },
          ...uniqueReferences(taxonomicReferences),
        ],
        lastUpdateDate: profile.modified.slice(0, 10),
        extractionDate: EXTRACTION_DATE,
      },
      locales: {
        en: buildLocale(english, profile, fields, 'en'),
        fr: buildLocale(french, profile, fields, 'fr'),
      },
    });
  }

  await writeJson(MANIFEST_PATH, {
    schemaVersion: 1,
    dataset: {
      generatorVersion: 1,
      title: 'The Wood Database',
      provider: SOURCE_PUBLISHER,
      url: SOURCE_URL,
      copyrightNotice: facts.source.copyrightNotice,
      extractionPolicy: facts.source.extractionPolicy,
      profileCount: facts.profileCount,
      exactAtlasMatches: exactMatchCount,
      taxonomicCrosswalkMatches: taxonomicCrosswalkMatchCount,
      ambiguousAtlasMatchesSkipped: ambiguousMatchCount,
      supplementedRecords: supplements.length,
      supplementedFields: Object.fromEntries(
        [...fieldCounts].sort(([left], [right]) => left.localeCompare(right)),
      ),
    },
    records: [],
    supplements: supplements.sort((left, right) => left.id.localeCompare(right.id)),
  });
  console.log(
    `Generated ${supplements.length} supplements from ${exactMatchCount} exact scientific-name matches and ${taxonomicCrosswalkMatchCount} verified taxonomic crosswalks.`,
  );
  console.log(
    `Added ${[...fieldCounts.values()].reduce((sum, count) => sum + count, 0)} missing fields: ${JSON.stringify(Object.fromEntries(fieldCounts))}`,
  );
}

function parseProfile(post) {
  const fields = extractProfileFields(post.content.rendered);
  const scientificName = mainScientificName(fields.get('scientific name'));
  if (!scientificName) return null;
  return {
    id: post.id,
    title: decodeHtml(post.title.rendered),
    scientificName,
    url: post.link,
    modified: post.modified,
    facts: {
      specificGravity12: parseSpecificGravity(fields.get('specific gravity (basic, 12% mc)')),
      jankaHardnessN: parseMetricNumber(fields.get('janka hardness'), 'N'),
      staticBendingStrengthMpa: parseMetricNumber(fields.get('modulus of rupture'), 'MPa'),
      modulusOfElasticityMpa: parseElasticity(fields.get('elastic modulus')),
      crushingStrengthMpa: parseMetricNumber(fields.get('crushing strength'), 'MPa'),
      radialShrinkagePercent: parseShrinkage(fields.get('shrinkage'), 'radial'),
      tangentialShrinkagePercent: parseShrinkage(fields.get('shrinkage'), 'tangential'),
      shrinkageRatio: parseShrinkage(fields.get('shrinkage'), 't/r ratio'),
      decayClass: classifyDecay(fields.get('rot resistance')),
      termiteClass: classifyTermites(fields.get('rot resistance')),
    },
  };
}

function extractProfileFields(html) {
  const fields = new Map();
  const labels = [
    'Scientific Name',
    'Specific Gravity (Basic, 12% MC)',
    'Janka Hardness',
    'Modulus of Rupture',
    'Elastic Modulus',
    'Crushing Strength',
    'Shrinkage',
    'Rot Resistance',
  ];

  for (const label of labels) {
    const fieldMatch = html.match(
      new RegExp(`<strong>\\s*${escapeRegExp(label)}\\s*:\\s*</strong>([\\s\\S]*?)</p>`, 'iu'),
    );
    if (!fieldMatch) continue;

    const valueAfterLabel = fieldMatch[1];
    const anchorEnd = valueAfterLabel.indexOf('</a>');
    const valueHtml =
      anchorEnd === -1 ? valueAfterLabel : valueAfterLabel.slice(anchorEnd + '</a>'.length);
    const value = htmlToLines(valueHtml).join(' ');
    if (value) fields.set(label.toLocaleLowerCase('en'), value);
  }

  const lines = htmlToLines(html);
  for (const line of lines) {
    for (const label of labels) {
      if (fields.has(label.toLocaleLowerCase('en'))) continue;
      const match = line.match(new RegExp(`(?:^|\\s)${escapeRegExp(label)}\\s*:\\s*(.+)$`, 'iu'));
      if (match) fields.set(label.toLocaleLowerCase('en'), match[1].trim());
    }
  }
  return fields;
}

function htmlToLines(html) {
  return decodeHtml(
    html
      .replace(/<\/(?:p|tr|li|div|h\d)>/giu, '\n')
      .replace(/<br\s*\/?\s*>/giu, '\n')
      .replace(/<[^>]+>/gu, ' '),
  )
    .split(/\r?\n/u)
    .map((line) => line.replace(/[ \t]+/gu, ' ').trim())
    .filter(Boolean);
}

function decodeHtml(value) {
  return String(value)
    .replace(/&nbsp;|&#160;/giu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/&quot;|&#34;/giu, '"')
    .replace(/&apos;|&#39;|&#039;|&#8217;|&rsquo;/giu, "'")
    .replace(/&#8211;|&#x2013;/giu, '–')
    .replace(/&#8212;|&#x2014;/giu, '—')
    .replace(/&#215;|&times;/giu, '×')
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>');
}

function mainScientificName(value) {
  if (!value) return null;
  return (
    value
      .split(/\s*(?:\(|;|\/)\s*/u)[0]
      .replace(/\s+/gu, ' ')
      .trim() || null
  );
}

function parseSpecificGravity(value) {
  if (!hasData(value)) return null;
  const values = [...value.matchAll(/(?:^|[\s,])(\d?\.\d+)(?=$|[\s,])/gu)].map((match) =>
    Number(match[1]),
  );
  return values.length >= 2 ? values[1] : null;
}

function parseMetricNumber(value, unit) {
  if (!hasData(value)) return null;
  const match = value.match(new RegExp(`([\\d,.]+)\\s*${escapeRegExp(unit)}\\b`, 'iu'));
  if (!match) return null;
  const number = match[1];
  const normalized =
    unit === 'GPa' && /^\d{1,2},\d{1,3}$/u.test(number)
      ? number.replace(',', '.')
      : number.replaceAll(',', '');
  return Number(normalized);
}

function parseElasticity(value) {
  if (!hasData(value)) return null;
  const mpa = parseMetricNumber(value, 'MPa');
  if (mpa !== null) return mpa < 100 ? Math.round(mpa * 1_000) : mpa;
  const gpa = parseMetricNumber(value, 'GPa');
  return gpa === null ? null : Math.round(gpa * 1_000);
}

function parseShrinkage(value, label) {
  if (!hasData(value)) return null;
  const match = value.match(new RegExp(`${escapeRegExp(label)}\\s*:\\s*([\\d.]+)\\s*%?`, 'iu'));
  return match ? Number(match[1]) : null;
}

function classifyDecay(value) {
  if (!hasData(value)) return null;
  const normalized = normalizeProse(value);
  const ranges = [
    [/\b(?:very durable to durable|durable to very durable)\b/u, '1-2'],
    [/\b(?:durable to moderately durable|moderately durable to durable)\b/u, '2-3'],
    [/\b(?:moderately durable to non durable|non durable to moderately durable)\b/u, '3-4'],
    [/\b(?:non durable to perishable|perishable to non durable)\b/u, '4-5'],
  ];
  for (const [pattern, durabilityClass] of ranges) {
    if (pattern.test(normalized)) return durabilityClass;
  }
  if (/\bvery durable\b/u.test(normalized)) return '1';
  if (/\bmoderately durable\b/u.test(normalized)) return '3';
  if (/\bnon durable\b/u.test(normalized)) return '4';
  if (/\bperishable\b/u.test(normalized)) return '5';
  if (/\bdurable\b/u.test(normalized)) return '2';
  return null;
}

function classifyTermites(value) {
  if (!hasData(value)) return null;
  const normalized = normalizeProse(value);
  if (!/\btermites?\b/u.test(normalized)) return null;
  if (/\b(?:mixed|variable|varies|unknown)\b.{0,40}\btermites?\b/u.test(normalized)) return null;
  if (
    /\b(?:not resistant|no resistance|poor resistance|susceptible)\b.{0,40}\btermites?\b/u.test(
      normalized,
    ) ||
    /\btermites?\b.{0,40}\b(?:not resistant|poor resistance|susceptible)\b/u.test(normalized)
  ) {
    return 'S';
  }
  if (
    /\bmoderate(?:ly)? resistant\b.{0,40}\btermites?\b/u.test(normalized) ||
    /\bmoderate resistance\b.{0,40}\btermites?\b/u.test(normalized)
  ) {
    return 'M';
  }
  if (
    /\b(?:excellent|good|high|highly|very)\b.{0,25}\bresistance\b.{0,40}\btermites?\b/u.test(
      normalized,
    ) ||
    /\b(?:immune|resistant)\b.{0,20}\bto\b.{0,20}\btermites?\b/u.test(normalized) ||
    /\btermite resistant\b/u.test(normalized)
  ) {
    return 'D';
  }
  return null;
}

function normalizeProse(value) {
  return value
    .toLocaleLowerCase('en')
    .replace(/[‐‑‒–—-]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function hasData(value) {
  return Boolean(value && !/\bno data available\b/iu.test(value));
}

function indexProfiles(profiles) {
  const index = new Map();
  for (const profile of profiles) {
    const key = normalizeScientificName(profile.scientificName);
    if (!key) continue;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(profile);
  }
  return index;
}

function normalizeScientificName(value) {
  return String(value)
    .normalize('NFKD')
    .replace(/×/gu, 'x')
    .replace(/[.,]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLocaleLowerCase('en');
}

function uniqueProfiles(profiles) {
  return [...new Map(profiles.map((profile) => [profile.url, profile])).values()];
}

function uniqueReferences(references) {
  return [...new Map(references.map((reference) => [reference.url, reference])).values()];
}

function selectFields(record, profile, previous) {
  const candidates = [
    ['physics.specificGravity', profile.facts.specificGravity12],
    ['physics.jankaHardness', profile.facts.jankaHardnessN],
    ['physics.staticBendingStrength', profile.facts.staticBendingStrengthMpa],
    ['physics.modulusOfElasticity', profile.facts.modulusOfElasticityMpa],
    ['physics.crushingStrength', profile.facts.crushingStrengthMpa],
    ['physics.totalRadialShrinkage', profile.facts.radialShrinkagePercent],
    ['physics.totalTangentialShrinkage', profile.facts.tangentialShrinkagePercent],
    ['physics.shrinkageRatio', profile.facts.shrinkageRatio],
    ['durability.fungi', profile.facts.decayClass],
    ['durability.termites', profile.facts.termiteClass],
  ];
  return candidates
    .filter(([, sourceValue]) => sourceValue !== null)
    .filter(
      ([fieldPath]) =>
        getAtPath(record, `${fieldPath}.value`) === null ||
        getAtPath(previous?.locales?.en, `${fieldPath}.value`) != null,
    )
    .map(([fieldPath]) => fieldPath);
}

function buildLocale(base, profile, fields, language) {
  const locale = emptyLocale(base, language);
  for (const field of fields) {
    if (field === 'physics.specificGravity') {
      locale.physics.specificGravity = measure(
        sourceMeasureRaw(
          language,
          'specific gravity at 12% moisture content',
          profile.facts.specificGravity12,
        ),
        profile.facts.specificGravity12,
      );
    }
    if (field === 'physics.jankaHardness') {
      locale.physics.jankaHardness = measure(
        sourceMeasureRaw(language, 'Janka hardness', profile.facts.jankaHardnessN, 'N'),
        profile.facts.jankaHardnessN,
        'N',
      );
    }
    if (field === 'physics.staticBendingStrength') {
      locale.physics.staticBendingStrength = measure(
        sourceMeasureRaw(
          language,
          'modulus of rupture',
          profile.facts.staticBendingStrengthMpa,
          'MPa',
        ),
        profile.facts.staticBendingStrengthMpa,
        'MPa',
      );
    }
    if (field === 'physics.modulusOfElasticity') {
      locale.physics.modulusOfElasticity = measure(
        sourceMeasureRaw(
          language,
          'modulus of elasticity',
          profile.facts.modulusOfElasticityMpa,
          'MPa',
        ),
        profile.facts.modulusOfElasticityMpa,
        'MPa',
      );
    }
    if (field === 'physics.crushingStrength') {
      locale.physics.crushingStrength = measure(
        sourceMeasureRaw(
          language,
          'crushing strength parallel to grain',
          profile.facts.crushingStrengthMpa,
          'MPa',
        ),
        profile.facts.crushingStrengthMpa,
        'MPa',
      );
    }
    if (field === 'physics.totalRadialShrinkage') {
      locale.physics.totalRadialShrinkage = measure(
        sourceMeasureRaw(
          language,
          'total radial shrinkage',
          profile.facts.radialShrinkagePercent,
          '%',
        ),
        profile.facts.radialShrinkagePercent,
        '%',
      );
    }
    if (field === 'physics.totalTangentialShrinkage') {
      locale.physics.totalTangentialShrinkage = measure(
        sourceMeasureRaw(
          language,
          'total tangential shrinkage',
          profile.facts.tangentialShrinkagePercent,
          '%',
        ),
        profile.facts.tangentialShrinkagePercent,
        '%',
      );
    }
    if (field === 'physics.shrinkageRatio') {
      locale.physics.shrinkageRatio = measure(
        sourceMeasureRaw(
          language,
          'tangential/radial shrinkage ratio',
          profile.facts.shrinkageRatio,
        ),
        profile.facts.shrinkageRatio,
      );
    }
    if (field === 'durability.fungi') {
      locale.durability.fungi = decayValue(profile.facts.decayClass, language);
    }
    if (field === 'durability.termites') {
      locale.durability.termites = termiteValue(profile.facts.termiteClass, language);
    }
  }
  return locale;
}

function sourceMeasureRaw(language, label, value, unit = '') {
  const frenchLabels = {
    'specific gravity at 12% moisture content': 'densité à 12 % d’humidité',
    'Janka hardness': 'dureté Janka',
    'modulus of rupture': 'résistance à la flexion statique',
    'modulus of elasticity': 'module d’élasticité',
    'crushing strength parallel to grain': 'résistance à la compression axiale',
    'total radial shrinkage': 'retrait radial total',
    'total tangential shrinkage': 'retrait tangentiel total',
    'tangential/radial shrinkage ratio': 'rapport de retrait tangentiel/radial',
  };
  const localizedLabel = language === 'fr' ? frenchLabels[label] : label;
  return `The Wood Database — ${localizedLabel}: ${value}${unit ? ` ${unit}` : ''}`;
}

function decayValue(durabilityClass, language) {
  const labels = {
    en: new Map([
      ['1', 'class 1 - very durable'],
      ['1-2', 'class 1-2 - very durable to durable'],
      ['2', 'class 2 - durable'],
      ['2-3', 'class 2-3 - durable to moderately durable'],
      ['3', 'class 3 - moderately durable'],
      ['3-4', 'class 3-4 - moderately to poorly durable'],
      ['4', 'class 4 - poorly durable'],
      ['4-5', 'class 4-5 - poorly to not durable'],
      ['5', 'class 5 - not durable'],
    ]),
    fr: new Map([
      ['1', 'classe 1 - très durable'],
      ['1-2', 'classe 1-2 - très durable à durable'],
      ['2', 'classe 2 - durable'],
      ['2-3', 'classe 2-3 - durable à moyennement durable'],
      ['3', 'classe 3 - moyennement durable'],
      ['3-4', 'classe 3-4 - moyennement à faiblement durable'],
      ['4', 'classe 4 - faiblement durable'],
      ['4-5', 'classe 4-5 - faiblement à non durable'],
      ['5', 'classe 5 - non durable'],
    ]),
  };
  return {
    raw:
      language === 'fr'
        ? `The Wood Database — classe de résistance à la pourriture du duramen : ${durabilityClass}`
        : `The Wood Database — heartwood decay-resistance class: ${durabilityClass}`,
    value: labels[language].get(durabilityClass),
  };
}

function termiteValue(termiteClass, language) {
  const labels = {
    en: new Map([
      ['D', 'class d - durable'],
      ['M', 'class m - moderately durable'],
      ['S', 'class s - susceptible'],
    ]),
    fr: new Map([
      ['D', 'classe d - durable'],
      ['M', 'classe m - moyennement durable'],
      ['S', 'classe s - sensible'],
    ]),
  };
  return {
    raw:
      language === 'fr'
        ? `The Wood Database — résistance explicite aux termites : classe ${termiteClass}`
        : `The Wood Database — explicit termite resistance: class ${termiteClass}`,
    value: labels[language].get(termiteClass),
  };
}

function measure(raw, value, unit) {
  return { raw, value, min: null, max: null, ...(unit ? { unit } : {}) };
}

function emptyLocale(base, language) {
  const text = () => ({ raw: '', value: null });
  const emptyMeasure = (unit) => ({
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
      diameterCm: emptyMeasure('cm'),
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
      specificGravity: emptyMeasure(),
      monninHardness: emptyMeasure(),
      jankaHardness: emptyMeasure('N'),
      volumetricShrinkageCoefficient: emptyMeasure(language === 'fr' ? '% par %' : '% per %'),
      totalTangentialShrinkage: emptyMeasure('%'),
      totalRadialShrinkage: emptyMeasure('%'),
      shrinkageRatio: emptyMeasure(),
      fibreSaturationPoint: emptyMeasure('%'),
      thermalConductivity: emptyMeasure('W/(m.K)'),
      lowerHeatingValue: emptyMeasure('kJ/kg'),
      crushingStrength: emptyMeasure('MPa'),
      staticBendingStrength: emptyMeasure('MPa'),
      modulusOfElasticity: emptyMeasure('MPa'),
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

function getAtPath(value, fieldPath) {
  return fieldPath.split('.').reduce((current, key) => current?.[key], value);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
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

function relative(filePath) {
  return path.relative(ROOT, filePath);
}
