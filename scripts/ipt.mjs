#!/usr/bin/env node

import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FACTS_PATH = path.join(ROOT, 'data', 'raw', 'ipt', 'facts.json');
const MANIFEST_PATH = path.join(ROOT, 'data', 'manual', 'woods', 'ipt.json');
const ENGLISH_DATABASE_PATH = path.join(ROOT, 'public', 'data', 'woods.generated.en.json');
const FRENCH_DATABASE_PATH = path.join(ROOT, 'public', 'data', 'woods.generated.fr.json');

const SOURCE_URL = 'https://madeiras.ipt.br/';
const API_URL = 'https://madeiras.ipt.br/wp-json/wp/v2/pages';
const SOURCE_PROVIDER = 'São Paulo Institute for Technological Research (IPT)';
const SOURCE_PUBLISHER = 'Instituto de Pesquisas Tecnológicas do Estado de São Paulo (IPT)';
const EXTRACTION_DATE = '2026-07-23';
const PAGE_SIZE = 20;
const PAGE_DELAY_MS = 500;
const MAX_PAGE_COUNT = 100;
const CURL_MAX_BUFFER = 20 * 1024 * 1024;
const execFileAsync = promisify(execFile);

const command = process.argv[2] ?? 'all';
if (command === 'sync') {
  await sync();
} else if (command === 'generate') {
  await generate();
} else if (command === 'all') {
  await sync();
  await generate();
} else {
  console.error('Usage: node scripts/ipt.mjs <sync|generate|all>');
  process.exitCode = 1;
}

async function sync() {
  const pages = [];
  for (let page = 1; page <= MAX_PAGE_COUNT; page += 1) {
    const url = new URL(API_URL);
    url.searchParams.set('per_page', String(PAGE_SIZE));
    url.searchParams.set('page', String(page));
    url.searchParams.set('_fields', 'id,link,slug,title,content,modified');
    const response = await curlJson(url.href);
    if (response?.code === 'rest_post_invalid_page_number') break;
    if (!Array.isArray(response)) {
      throw new Error(`IPT API page ${page} did not return an array`);
    }
    if (response.length === 0) break;
    pages.push(...response);
    console.log(`Fetched ${pages.length} IPT pages.`);
    if (response.length < PAGE_SIZE) break;
    await delay(PAGE_DELAY_MS);
  }

  if (pages.length < 250) {
    throw new Error(`IPT API returned only ${pages.length} pages`);
  }

  const profiles = pages.map(parseProfile).filter(Boolean);
  if (profiles.length < 70) {
    throw new Error(`Only ${profiles.length} IPT wood profiles were recognized`);
  }

  await writeJson(FACTS_PATH, {
    schemaVersion: 1,
    source: {
      title: 'Informações sobre madeiras',
      provider: SOURCE_PUBLISHER,
      url: SOURCE_URL,
      apiUrl: API_URL,
      extractionPolicy:
        'Scientific names and normalized fungal- and termite-resistance facts are retained. Descriptive prose, photographs, and illustrations are excluded.',
      extractionDate: EXTRACTION_DATE,
    },
    sourcePageCount: pages.length,
    profileCount: profiles.length,
    fungalClassifications: profiles.filter((profile) => profile.facts.fungi !== null).length,
    termiteClassifications: profiles.filter((profile) => profile.facts.termites !== null).length,
    profiles: profiles.sort((left, right) => left.url.localeCompare(right.url)),
  });
  console.log(
    `Stored ${profiles.length} IPT profiles with ` +
      `${profiles.filter((profile) => profile.facts.fungi !== null).length} fungal and ` +
      `${profiles.filter((profile) => profile.facts.termites !== null).length} termite classifications.`,
  );
}

async function generate() {
  const [facts, englishDatabase, frenchDatabase, previousManifest] = await Promise.all([
    readJson(FACTS_PATH),
    readJson(ENGLISH_DATABASE_PATH),
    readJson(FRENCH_DATABASE_PATH),
    readOptionalJson(MANIFEST_PATH),
  ]);
  const profilesByScientificName = indexProfiles(facts.profiles);
  const frenchById = new Map(frenchDatabase.records.map((record) => [record.id, record]));
  const previousById = new Map(
    (previousManifest?.dataset?.generatorVersion === 2 ? previousManifest.supplements : []).map(
      (supplement) => [supplement.id, supplement],
    ),
  );
  const fieldCounts = new Map();
  let exactMatchCount = 0;
  let unpairedMatchCount = 0;
  const supplements = [];

  for (const english of englishDatabase.records) {
    const profiles = uniqueProfiles(
      english.identity.botanicalNames.flatMap(
        ({ name }) => profilesByScientificName.get(scientificNameKey(name)) ?? [],
      ),
    );
    if (profiles.length === 0) continue;
    exactMatchCount += 1;
    const french = frenchById.get(english.id);
    if (!french) {
      unpairedMatchCount += 1;
      continue;
    }

    const factsForRecord = {
      fungi: combineFungiClasses(profiles.map((profile) => profile.facts.fungi).filter(Boolean)),
      termites: combineTermiteClasses(
        profiles.map((profile) => profile.facts.termites).filter(Boolean),
      ),
    };
    const previous = previousById.get(english.id);
    const fields = [
      ['durability.fungi', factsForRecord.fungi],
      ['durability.termites', factsForRecord.termites],
    ]
      .filter(([, value]) => value !== null)
      .filter(
        ([field]) =>
          getAtPath(english, `${field}.value`) === null ||
          getAtPath(previous?.locales?.en, `${field}.value`) != null,
      )
      .map(([field]) => field);
    if (fields.length === 0) continue;

    for (const field of fields) fieldCounts.set(field, (fieldCounts.get(field) ?? 0) + 1);
    supplements.push({
      id: english.id,
      source: {
        provider: SOURCE_PROVIDER,
        kind: 'manual',
        references: profiles.map((profile) => ({
          title: `${profile.title} — Informações sobre madeiras`,
          url: profile.url,
          publisher: SOURCE_PUBLISHER,
          year: Number(profile.modified.slice(0, 4)),
        })),
        lastUpdateDate: profiles
          .map((profile) => profile.modified.slice(0, 10))
          .sort()
          .at(-1),
        extractionDate: EXTRACTION_DATE,
      },
      locales: {
        en: buildLocale(english, factsForRecord, fields, 'en'),
        fr: buildLocale(french, factsForRecord, fields, 'fr'),
      },
    });
  }

  await writeJson(MANIFEST_PATH, {
    schemaVersion: 1,
    dataset: {
      generatorVersion: 2,
      title: facts.source.title,
      provider: SOURCE_PUBLISHER,
      url: SOURCE_URL,
      sourcePageCount: facts.sourcePageCount,
      profileCount: facts.profileCount,
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
    `Generated ${supplements.length} IPT supplements from ${exactMatchCount} exact matches: ` +
      JSON.stringify(Object.fromEntries(fieldCounts)),
  );
}

async function curlJson(url) {
  const { stdout } = await execFileAsync(
    'curl',
    [
      '--http1.1',
      '--compressed',
      '--retry',
      '3',
      '--retry-all-errors',
      '--location',
      '--max-time',
      '60',
      '--silent',
      '--show-error',
      url,
    ],
    { encoding: 'utf8', maxBuffer: CURL_MAX_BUFFER },
  );
  return JSON.parse(stdout);
}

function parseProfile(page) {
  const text = htmlToText(page.content.rendered);
  const scientificSection = section(
    text,
    'Nome científico:',
    /Observa(?:ção|cao):|Outros nomes populares:|Nomes internacionais:|Ocorrência:|CARACTERÍSTICAS GERAIS/iu,
  );
  const scientificNames = extractScientificNames(scientificSection);
  if (scientificNames.length === 0) return null;
  const durability = section(
    text,
    'Durabilidade natural:',
    /Tratabilidade:|CARACTERÍSTICAS DE PROCESSAMENTO|PROPRIEDADES FÍSICAS|USOS/iu,
  );
  return {
    sourceId: page.id,
    title: htmlToText(page.title.rendered),
    url: page.link,
    modified: page.modified,
    scientificNames,
    facts: {
      fungi: classifyFungi(durability),
      termites: classifyTermites(durability),
    },
  };
}

function section(text, startLabel, endPattern) {
  const start = text.search(new RegExp(escapeRegExp(startLabel), 'iu'));
  if (start === -1) return '';
  const value = text.slice(start + startLabel.length);
  const end = value.search(endPattern);
  return (end === -1 ? value : value.slice(0, end)).trim();
}

function extractScientificNames(value) {
  return [
    ...new Set(
      [...String(value).matchAll(/\b([A-ZÀ-Ý][\p{L}-]+)\s+([a-zà-ÿ][\p{L}-]+|spp?[.])\b/gu)]
        .map((match) => `${match[1]} ${match[2].replace(/[.]$/u, '')}`)
        .filter((name) => !/\b(?:et|ex|fil|jun|var|subsp)\b/iu.test(name)),
    ),
  ];
}

function classifyFungi(value) {
  if (!value || /informa(?:c|ç)oes nao disponiveis/iu.test(normalizeText(value))) return null;
  const classes = relevantSentences(value, /fung|apodrec|xilofag/iu)
    .map((sentence) => {
      let normalized = normalizeText(sentence);
      if (
        (/fungos? manchadores/u.test(normalized) &&
          !/apodrec|podridao|xilofag/u.test(normalized)) ||
        /(?:muito variavel|tanto alta como baixa|alta como baixa)/u.test(normalized)
      ) {
        return null;
      }
      if (/marinh/u.test(normalized) && !/fung|apodrec|podridao/u.test(normalized)) return null;
      if (/fung/u.test(normalized) && /(?:porem|mas).{0,100}marinh/u.test(normalized)) {
        normalized = normalized.split(/\b(?:porem|mas)\b/u)[0];
      }
      if (/(?:duravel|resistente)\s+(?:a|e)\s+muito\s+(?:duravel|resistente)/u.test(normalized)) {
        return '1-2';
      }
      if (/moderad[ao].{0,45}muito baixa/u.test(normalized)) return null;
      if (
        /moderad[ao].{0,45}(?:baixa|pouco resistente)|(?:baixa|pouco resistente).{0,45}moderad/u.test(
          normalized,
        )
      ) {
        return '3-4';
      }
      if (/nao duravel|perecivel|muito baixa|muito suscetivel/u.test(normalized)) return '5';
      if (/baixa (?:durabilidade|resistencia)|susceptivel|suscetivel/u.test(normalized)) {
        return '4';
      }
      if (/moderad|media resistencia/u.test(normalized)) return '3';
      if (
        /muito duravel|altamente (?:duravel|resistente)|alta (?:durabilidade|resistencia)|muito resistente/u.test(
          normalized,
        )
      ) {
        return '1';
      }
      if (/boa resistencia|resistente|duravel/u.test(normalized)) return '2';
      return null;
    })
    .filter(Boolean);
  return combineFungiClasses(classes);
}

function classifyTermites(value) {
  if (!value) return null;
  const classes = relevantSentences(value, /cupins?|termit/iu)
    .map((sentence) => {
      const normalized = normalizeText(sentence);
      if (/muito variavel|baixa a media|alta como baixa/u.test(normalized)) return null;
      if (/moderad.{0,35}(?:cupins?|termit)|(?:cupins?|termit).{0,35}moderad/u.test(normalized)) {
        return 'M';
      }
      if (
        /(?:muito )?suscetivel.{0,30}(?:cupins?|termit)|(?:cupins?|termit).{0,30}(?:muito )?suscetivel|baixa resistencia.{0,30}(?:cupins?|termit)|pouco resistente.{0,30}(?:cupins?|termit)|nao resistente.{0,30}(?:cupins?|termit)/u.test(
          normalized,
        )
      ) {
        return 'S';
      }
      if (/resistente (?:a|ao|aos) (?:cupins?|termit)/u.test(normalized)) return 'D';
      if (
        /nao (?:sendo )?atacad.{0,80}(?:cupins?|termit)|alta resistencia.{0,140}(?:cupins?|termit)|altamente resistente.{0,80}(?:cupins?|termit)|muito resistente.{0,80}(?:cupins?|termit)/u.test(
          normalized,
        )
      ) {
        return 'D';
      }
      if (/moderad.{0,120}(?:cupins?|termit)|(?:cupins?|termit).{0,120}moderad/u.test(normalized)) {
        return 'M';
      }
      return null;
    })
    .filter(Boolean);
  return combineTermiteClasses(classes);
}

function relevantSentences(value, pattern) {
  return String(value)
    .split(/(?<=[.!?])\s+/gu)
    .filter((sentence) => pattern.test(sentence));
}

function combineFungiClasses(values) {
  if (values.length === 0) return null;
  const numbers = [...new Set(values.flatMap((value) => value.split('-').map(Number)))];
  const minimum = Math.min(...numbers);
  const maximum = Math.max(...numbers);
  if (maximum - minimum > 1) return null;
  return minimum === maximum ? String(minimum) : `${minimum}-${maximum}`;
}

function combineTermiteClasses(values) {
  const unique = [...new Set(values)];
  return unique.length === 1 ? unique[0] : null;
}

function indexProfiles(profiles) {
  const index = new Map();
  for (const profile of profiles) {
    for (const name of profile.scientificNames) {
      const key = scientificNameKey(name);
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(profile);
    }
  }
  return index;
}

function uniqueProfiles(profiles) {
  return [...new Map(profiles.map((profile) => [profile.url, profile])).values()];
}

function buildLocale(base, facts, fields, language) {
  const locale = emptyLocale(base, language);
  if (fields.includes('durability.fungi')) {
    locale.durability.fungi = fungiValue(facts.fungi, language);
  }
  if (fields.includes('durability.termites')) {
    locale.durability.termites = termiteValue(facts.termites, language);
  }
  return locale;
}

function fungiValue(durabilityClass, language) {
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
        ? `IPT — classe normalisée de résistance aux champignons : ${durabilityClass}`
        : `IPT — normalized fungal-resistance class: ${durabilityClass}`,
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
        ? `IPT — résistance explicite aux termites : classe ${termiteClass}`
        : `IPT — explicit termite resistance: class ${termiteClass}`,
    value: labels[language].get(termiteClass),
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

function scientificNameKey(value) {
  return normalizeText(value)
    .replace(/\b(?:var|subsp|ssp)\b.*$/u, '')
    .replace(/[^a-z]+/gu, ' ')
    .trim();
}

function normalizeText(value) {
  return String(value)
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('en')
    .replace(/[‐‑‒–—-]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function htmlToText(value) {
  return decodeHtml(
    String(value)
      .replace(/<style\b[\s\S]*?<\/style>/giu, ' ')
      .replace(/<script\b[\s\S]*?<\/script>/giu, ' ')
      .replace(/<\/(?:p|li|div|h\d)>/giu, '. ')
      .replace(/<br\s*\/?\s*>/giu, '. ')
      .replace(/<[^>]+>/gu, ' '),
  )
    .replace(/\s+([,.;:])/gu, '$1')
    .replace(/(?:[.]\s*){2,}/gu, '. ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function decodeHtml(value) {
  return String(value)
    .replace(/&nbsp;|&#160;/giu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/&quot;|&#34;/giu, '"')
    .replace(/&apos;|&#39;|&#039;|&#8217;|&rsquo;/giu, "'")
    .replace(/&#8211;|&#x2013;|&ndash;/giu, '–')
    .replace(/&#8212;|&#x2014;|&mdash;/giu, '—')
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>');
}

function getAtPath(value, pathValue) {
  return pathValue.split('.').reduce((current, key) => current?.[key], value);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
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

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
