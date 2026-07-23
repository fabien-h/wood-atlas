#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW_DIRECTORY = path.join(ROOT, 'data', 'raw', 'lpf');
const RAW_CSV_PATH = path.join(RAW_DIRECTORY, 'brazilian-woods.csv');
const WOOD_MANIFEST_PATH = path.join(ROOT, 'data', 'manual', 'woods', 'lpf-brazilian-woods.json');
const TRANSLATION_MANIFEST_PATH = path.join(
  ROOT,
  'data',
  'manual',
  'content-translations',
  'lpf-brazilian-woods.json',
);
const ENGLISH_DATABASE_PATH = path.join(ROOT, 'public', 'data', 'woods.generated.en.json');
const BASE_MANUAL_WOOD_MANIFEST_PATH = path.join(ROOT, 'data', 'manual', 'woods.json');
const MANUAL_WOOD_DIRECTORY = path.join(ROOT, 'data', 'manual', 'woods');

const DATASET_PAGE_URL =
  'https://dados.florestal.gov.br/dataset/banco-de-dados-de-madeiras-brasileiras-do-lpf-sfb';
const DATABASE_URL = 'https://lpf.florestal.gov.br/en-us/brazilian-woods';
const CSV_URL =
  'https://dados.florestal.gov.br/dataset/a1c2f38f-f2b9-4b17-81f8-6b57bdefe78c/resource/cb533446-ae2f-4767-a2e5-676273c85852/download/dados_abertos_banco_de_dados_de_madeiras_brasileiras_lpfsfb.csv';
const METADATA_URL =
  'https://dados.florestal.gov.br/dataset/a1c2f38f-f2b9-4b17-81f8-6b57bdefe78c/resource/43b3e3c4-8b89-4c6c-82e9-05776fa14986/download/metadados_banco_de_dados_de_madeiras_brasileiras_lpfsfbb.pdf';
const SOURCE_PROVIDER = 'Brazilian Forest Service — Forest Products Laboratory (LPF/SFB)';
const SOURCE_REFERENCE = {
  title: 'Brazilian Woods Database',
  url: DATASET_PAGE_URL,
  publisher: 'Brazilian Forest Service, Forest Products Laboratory (LPF/SFB)',
  year: 2026,
};
const TROPICAL_TIMBERS_PDF_URL =
  'https://www.gov.br/florestal/pt-br/centrais-de-conteudo/publicacoes/publicacoes-diversas/lpf/madeiras_tropicais_brasileirais.pdf/@@display-file/file';
const NATURAL_DURABILITY_PDF_URL =
  'https://lpf.florestal.gov.br/pt-br/component/phocadownload/category/2-apostilas-curso-basico-madeiras-e-produtos?download=121:durabilidade-natural-de-madeiras-da-amazonia';
const LPF_PUBLISHER = 'Brazilian Forest Service, Forest Products Laboratory (LPF/SFB)';
const SOURCE_EXTRACTION_DATE = '2026-07-23';
const SOURCE_LAST_UPDATE_DATE = '2026-07-02';
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

const REQUIRED_COLUMNS = [
  'id_especie',
  'nome_cientifico',
  'nome_popular_1',
  'familia',
  'densidade_aparente',
  'densidade_basica',
  'contracao_tangencial',
  'contracao_radial',
  'relacao_tangencial_radial',
  'flexao_seca_moe',
  'flexao_seca_mor',
  'compressao_paralela_seca',
  'dureza_janka_transversal_seca',
  'cor_cerne_classificacao',
  'textura',
  'gra',
  'classificacao_tempo_secagem',
];

const NUMERIC_MAPPINGS = {
  specificGravity: {
    sourceCandidates: [
      {
        source: 'densidade_aparente',
        labels: {
          en: 'LPF apparent density at 12% moisture content',
          fr: 'Masse volumique apparente LPF à 12 % d’humidité',
        },
        sourceUnit: 'g/cm³',
      },
      {
        source: 'densidade_basica',
        labels: {
          en: 'LPF basic specific gravity',
          fr: 'Infradensité LPF',
        },
        sourceUnit: null,
      },
    ],
    unit: undefined,
    multiplier: 1,
  },
  jankaHardness: {
    source: 'dureza_janka_transversal_seca',
    unit: 'N',
    multiplier: 1,
    labels: {
      en: 'LPF dry Janka hardness perpendicular to grain',
      fr: 'Dureté Janka LPF sèche perpendiculaire au fil',
    },
    sourceUnit: 'N',
  },
  totalTangentialShrinkage: {
    source: 'contracao_tangencial',
    unit: '%',
    multiplier: 1,
    labels: {
      en: 'LPF total tangential shrinkage',
      fr: 'Retrait tangentiel total LPF',
    },
    sourceUnit: '%',
  },
  totalRadialShrinkage: {
    source: 'contracao_radial',
    unit: '%',
    multiplier: 1,
    labels: {
      en: 'LPF total radial shrinkage',
      fr: 'Retrait radial total LPF',
    },
    sourceUnit: '%',
  },
  shrinkageRatio: {
    source: 'relacao_tangencial_radial',
    unit: undefined,
    multiplier: 1,
    labels: {
      en: 'LPF tangential/radial shrinkage ratio',
      fr: 'Rapport LPF des retraits tangentiel/radial',
    },
    sourceUnit: undefined,
  },
  crushingStrength: {
    source: 'compressao_paralela_seca',
    unit: 'MPa',
    multiplier: 1,
    labels: {
      en: 'LPF dry compression strength parallel to grain',
      fr: 'Résistance LPF en compression parallèle au fil à l’état sec',
    },
    sourceUnit: 'MPa',
  },
  staticBendingStrength: {
    source: 'flexao_seca_mor',
    unit: 'MPa',
    multiplier: 1,
    labels: {
      en: 'LPF dry static bending strength',
      fr: 'Résistance LPF en flexion statique à l’état sec',
    },
    sourceUnit: 'MPa',
  },
  modulusOfElasticity: {
    source: 'flexao_seca_moe',
    unit: 'MPa',
    multiplier: 1000,
    labels: {
      en: 'LPF dry modulus of elasticity',
      fr: 'Module d’élasticité LPF à l’état sec',
    },
    sourceUnit: 'MPa',
  },
};

const COLOUR_MAP = new Map([
  ['branca', ['white', 'blanc']],
  ['rosa', ['pink', 'rose']],
  ['amarela', ['yellow', 'jaune']],
  ['vermelha', ['red', 'rouge']],
  ['oliva', ['olive green', 'vert olive']],
  ['castanha', ['light brown', 'brun clair']],
  ['marrom', ['brown', 'brun']],
  ['roxa', ['purple', 'violet']],
  ['cinza', ['grey', 'gris']],
  ['preta', ['black', 'noir']],
  ['amarelo-oliva a marrom amarelado-claro', ['yellow brown', 'brun jaune']],
]);

const CATEGORY_TRANSLATIONS = [
  {
    scope: 'appearance.colourReference.value',
    source: 'pink',
    translations: {
      ar: 'وردي',
      bn: 'গোলাপি',
      de: 'rosa',
      es: 'rosa',
      hi: 'गुलाबी',
      id: 'merah muda',
      it: 'rosa',
      ja: 'ピンク',
      ko: '분홍색',
      pt: 'rosa',
      ru: 'розовый',
      tr: 'pembe',
      ur: 'گلابی',
      vi: 'hồng',
      'zh-Hans': '粉红色',
    },
  },
  {
    scope: 'appearance.colourReference.value',
    source: 'grey',
    translations: {
      ar: 'رمادي',
      bn: 'ধূসর',
      de: 'grau',
      es: 'gris',
      hi: 'धूसर',
      id: 'abu-abu',
      it: 'grigio',
      ja: '灰色',
      ko: '회색',
      pt: 'cinzento',
      ru: 'серый',
      tr: 'gri',
      ur: 'سرمئی',
      vi: 'xám',
      'zh-Hans': '灰色',
    },
  },
];

const PROFILE_DURABILITY_FACTS = new Map(
  [
    ['Andira surinamensis', 38, { fungi: '4-5' }],
    ['Castilla ulei', 56, { fungi: '4-5', treatability: '1' }],
    ['Amburana acreana', 62, { fungi: '3', treatability: '2' }],
    ['Ficus insipida', 64, { fungi: '4-5', treatability: '1' }],
    ['Cariniana micrantha', 78, { fungi: '4-5' }],
    ['Hymenaea parvifolia', 80, { fungi: '2', treatability: '4' }],
    ['Dialium guianense', 82, { termites: 'M', treatability: '4' }],
    [
      'Maquira sclerophylla',
      90,
      { fungi: '4-5', termites: 'S', dryWoodBorers: 'S', treatability: '3' },
    ],
    ['Apeiba echinata', 96, { fungi: '5', treatability: '1' }],
    ['Laetia procera', 98, { fungi: '4-5', treatability: '1-2' }],
    ['Terminalia amazonia', 114, { fungi: '1-2', treatability: '3' }],
    ['Allantoma lineata', 116, { fungi: '4-5', treatability: '2' }],
    ['Iryanthera grandis', 120, { fungi: '4-5', treatability: '3' }],
    ['Osteophloeum platyspermum', 122, { fungi: '5' }],
  ].map(([name, page, fields]) => [
    botanicalKey(name),
    {
      fields,
      reference: {
        title: `Brazilian Tropical Timbers — ${name} profile (p. ${page})`,
        url: `${TROPICAL_TIMBERS_PDF_URL}#page=${page}`,
        publisher: LPF_PUBLISHER,
        year: 2013,
      },
    },
  ]),
);

const FIELD_DURABILITY_FACTS = new Map(
  [
    ['Chamaecrista scleroxylon', 36],
    ['Trichilia lecointei', 31],
    ['Zollernia paraensis', 30],
    ['Myrocarpus frondosus', 29],
    ['Eschweilera coriacea', 29],
    ['Peltogyne paniculata', 28],
    ['Aniba canelilla', 27],
    ['Astronium lecointei', 27],
    ['Aspidosperma macrocarpon', 27],
    ['Caryocar glabrum', 27],
    ['Dipteryx odorata', 27],
    ['Manilkara elata', 27],
    ['Lecythis pisonis', 20],
  ].map(([name, serviceLifeYears]) => [
    botanicalKey(name),
    {
      fields: { fungi: serviceLifeYears > 25 ? '1' : '2' },
      serviceLifeYears,
      reference: {
        title: `Natural Durability of Amazonian Woods — classification table (${name})`,
        url: `${NATURAL_DURABILITY_PDF_URL}#page=11`,
        publisher: LPF_PUBLISHER,
        year: 2021,
      },
    },
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
  console.error('Usage: node scripts/lpf.mjs <sync|generate|all>');
  process.exitCode = 1;
}

async function sync() {
  const response = await fetch(CSV_URL);
  if (!response.ok) throw new Error(`LPF CSV download failed with HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength < 100_000) {
    throw new Error(`LPF CSV download is unexpectedly small (${bytes.byteLength} bytes)`);
  }
  await fs.mkdir(RAW_DIRECTORY, { recursive: true });
  await fs.writeFile(RAW_CSV_PATH, bytes);
  console.log(
    `Downloaded ${bytes.byteLength.toLocaleString('en')} bytes to ${relative(RAW_CSV_PATH)}.`,
  );
}

async function generate() {
  const [csvBytes, databaseText, existingManualRecords] = await Promise.all([
    fs.readFile(RAW_CSV_PATH),
    fs.readFile(ENGLISH_DATABASE_PATH, 'utf8'),
    readExistingManualRecords(),
  ]);
  const rows = parseCsv(csvBytes);
  const database = JSON.parse(databaseText);
  const existingById = new Map(
    [...database.records, ...existingManualRecords].map((record) => [record.id, record]),
  );
  const existingRecords = [...existingById.values()];
  const existingNames = indexExistingBotanicalNames(existingRecords);
  const taxonGroups = groupRows(rows);
  const newGroups = [];
  const supplementGroups = new Map();
  const ambiguousMatches = [];

  for (const group of taxonGroups) {
    let targetIds = matchExistingIds(group, existingNames);
    if (targetIds.size > 1) {
      const americanTargets = new Set(
        [...targetIds].filter((id) => existingById.get(id)?.origin?.region === 'America'),
      );
      if (americanTargets.size > 0) targetIds = americanTargets;
    }
    if (targetIds.size === 0) {
      newGroups.push(group);
      continue;
    }
    if (targetIds.size > 1) {
      ambiguousMatches.push({
        scientificName: group[0].nome_cientifico,
        targetIds: [...targetIds].sort(),
      });
      continue;
    }
    const targetId = [...targetIds][0];
    const matches = supplementGroups.get(targetId) ?? [];
    matches.push(...group);
    supplementGroups.set(targetId, matches);
  }

  if (ambiguousMatches.length > 0) {
    throw new Error(
      `LPF taxa match multiple atlas records: ${JSON.stringify(ambiguousMatches, null, 2)}`,
    );
  }

  const records = newGroups
    .map((group) => buildManifestEntry(newWoodId(group), group, null))
    .sort((left, right) => left.id.localeCompare(right.id));
  const supplements = [...supplementGroups.entries()]
    .map(([id, group]) => buildManifestEntry(id, group, existingById.get(id)))
    .sort((left, right) => left.id.localeCompare(right.id));
  const manifest = {
    schemaVersion: 1,
    dataset: {
      title: 'Banco de Dados de Madeiras Brasileiras do LPF/SFB',
      provider: SOURCE_PROVIDER,
      datasetPageUrl: DATASET_PAGE_URL,
      databaseUrl: DATABASE_URL,
      csvUrl: CSV_URL,
      metadataUrl: METADATA_URL,
      license: 'CC BY 4.0',
      lastUpdated: SOURCE_LAST_UPDATE_DATE,
      rawObservations: rows.length,
      taxonGroups: taxonGroups.length,
      newRecords: records.length,
      supplementedRecords: supplements.length,
    },
    records,
    supplements,
  };

  const translationUnits = buildTranslationUnits(records);
  await Promise.all([
    writeJson(WOOD_MANIFEST_PATH, manifest),
    writeJson(TRANSLATION_MANIFEST_PATH, {
      schemaVersion: 1,
      units: [...translationUnits, ...CATEGORY_TRANSLATIONS].sort(
        (left, right) =>
          left.scope.localeCompare(right.scope) || left.source.localeCompare(right.source),
      ),
    }),
  ]);
  console.log(
    `Generated ${records.length} new LPF records and ${supplements.length} supplements from ` +
      `${rows.length} observations consolidated into ${taxonGroups.length} taxon groups.`,
  );
}

async function readExistingManualRecords() {
  const entries = await fs.readdir(MANUAL_WOOD_DIRECTORY, { withFileTypes: true });
  const manifestPaths = [
    BASE_MANUAL_WOOD_MANIFEST_PATH,
    ...entries
      .filter(
        (entry) =>
          entry.isFile() &&
          entry.name.endsWith('.json') &&
          entry.name !== path.basename(WOOD_MANIFEST_PATH),
      )
      .map((entry) => path.join(MANUAL_WOOD_DIRECTORY, entry.name))
      .sort(),
  ];
  const records = [];
  for (const manifestPath of manifestPaths) {
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    for (const entry of manifest.records ?? []) {
      records.push({
        id: entry.id,
        source: entry.source,
        identity: entry.locales?.en?.identity,
        origin: entry.locales?.en?.origin,
      });
    }
  }
  return records;
}

function parseCsv(bytes) {
  const text = new TextDecoder('windows-1252').decode(bytes).replace(/\r/g, '').trim();
  const lines = text.split('\n');
  const columns = lines.shift()?.split(';') ?? [];
  for (const required of REQUIRED_COLUMNS) {
    if (!columns.includes(required)) throw new Error(`LPF CSV is missing ${required}`);
  }
  const rows = lines.map((line, index) => {
    const values = line.split(';');
    if (values.length !== columns.length) {
      throw new Error(
        `LPF CSV row ${index + 2} has ${values.length} values; expected ${columns.length}`,
      );
    }
    return Object.fromEntries(
      values.map((value, valueIndex) => [columns[valueIndex], value.trim()]),
    );
  });
  if (rows.length < 200) throw new Error(`LPF CSV has only ${rows.length} data rows`);
  const ids = rows.map((row) => row.id_especie);
  if (new Set(ids).size !== ids.length) throw new Error('LPF CSV contains duplicate record ids');
  return rows;
}

function groupRows(rows) {
  const groups = new Map();
  for (const row of rows) {
    const scientificName = scientificNames(row.nome_cientifico)[0];
    if (!scientificName) throw new Error(`LPF row ${row.id_especie} has no scientific name`);
    const key = botanicalKey(scientificName);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  return [...groups.values()].sort((left, right) =>
    botanicalKey(left[0].nome_cientifico).localeCompare(botanicalKey(right[0].nome_cientifico)),
  );
}

function indexExistingBotanicalNames(records) {
  const names = new Map();
  for (const record of records) {
    if (record.source?.kind === 'manual' && record.source?.provider?.includes(SOURCE_PROVIDER)) {
      continue;
    }
    for (const entry of record.identity?.botanicalNames ?? []) {
      for (const name of scientificNames(entry.name)) {
        const key = botanicalKey(name);
        if (!key) continue;
        const ids = names.get(key) ?? new Set();
        ids.add(record.id);
        names.set(key, ids);
      }
    }
  }
  return names;
}

function matchExistingIds(group, existingNames) {
  const ids = new Set();
  for (const row of group) {
    for (const name of scientificNames(row.nome_cientifico)) {
      for (const id of existingNames.get(botanicalKey(name)) ?? []) ids.add(id);
    }
  }
  return ids;
}

function buildManifestEntry(id, rows, targetRecord) {
  const names = unique(rows.flatMap((row) => scientificNames(row.nome_cientifico)));
  const commonNames = unique(
    rows.map((row) => titleCasePortuguese(row.nome_popular_1)).filter(Boolean),
  );
  const primaryName = commonNames[0] ?? names[0];
  const families = unique(rows.map((row) => row.familia).filter(Boolean));
  const durability = durabilityFacts(names, targetRecord);
  const source = {
    provider: SOURCE_PROVIDER,
    kind: 'manual',
    references: [
      SOURCE_REFERENCE,
      ...durability.map((fact) => fact.reference).filter(uniqueReference),
    ],
    lastUpdateDate: SOURCE_LAST_UPDATE_DATE,
    extractionDate: SOURCE_EXTRACTION_DATE,
  };

  return {
    id,
    source,
    locales: {
      en: buildLocale({
        id,
        rows,
        names,
        commonNames,
        primaryName,
        family: families[0] ?? null,
        language: 'en',
        durability,
      }),
      fr: buildLocale({
        id,
        rows,
        names,
        commonNames,
        primaryName,
        family: families[0] ?? null,
        language: 'fr',
        durability,
      }),
    },
  };
}

function buildLocale({ id, rows, names, commonNames, primaryName, family, language, durability }) {
  const colour = mappedCategory(rows, 'cor_cerne_classificacao', mapColour, language);
  const texture = mappedCategory(rows, 'textura', mapTexture, language);
  const grain = mappedCategory(rows, 'gra', mapGrain, language);
  const dryingRate = mappedCategory(rows, 'classificacao_tempo_secagem', mapDryingRate, language);
  const physics = Object.fromEntries(
    Object.entries(NUMERIC_MAPPINGS).map(([target, mapping]) => [
      target,
      aggregateMeasure(rows, mapping, language),
    ]),
  );
  const aliases = commonNames.filter((name) => name !== primaryName);
  const country = language === 'fr' ? 'Brésil' : 'Brazil';
  const continent = language === 'fr' ? 'Amérique du Sud' : 'South America';

  return {
    identity: {
      primaryName,
      displayName: primaryName,
      slug: slugify(primaryName),
      family,
      botanicalNames: names.map((name, index) => ({ name, isSynonym: index > 0 })),
      aliases,
      localNames: commonNames.map((name) => ({ country, name })),
      commercialRestrictions: textValue(),
      notes: [],
    },
    origin: {
      region: 'America',
      continent,
      countries: [country],
    },
    cites: {
      raw: null,
      listed: null,
    },
    log: {
      diameterCm: measure(undefined, 'cm'),
      sapwoodThickness: textValue(),
      floats: textValue(),
      durability: textValue(),
      notes: [],
    },
    appearance: {
      colourReference: textValue(colour),
      sapwood: textValue(),
      texture: textValue(texture),
      grain: textValue(grain),
      interlockedGrain: textValue(),
      notes: [],
    },
    physics: {
      specificGravity: physics.specificGravity,
      monninHardness: measure(),
      jankaHardness: physics.jankaHardness,
      volumetricShrinkageCoefficient: measure(undefined, language === 'fr' ? '% par %' : '% per %'),
      totalTangentialShrinkage: physics.totalTangentialShrinkage,
      totalRadialShrinkage: physics.totalRadialShrinkage,
      shrinkageRatio: physics.shrinkageRatio,
      fibreSaturationPoint: measure(undefined, '%'),
      thermalConductivity: measure(undefined, 'W/(m.K)'),
      lowerHeatingValue: measure(undefined, 'kJ/kg'),
      crushingStrength: physics.crushingStrength,
      staticBendingStrength: physics.staticBendingStrength,
      modulusOfElasticity: physics.modulusOfElasticity,
      stability: textValue(),
      notes: [],
    },
    durability: {
      fungi: durabilityTextValue(durability, 'fungi', language),
      dryWoodBorers: durabilityTextValue(durability, 'dryWoodBorers', language),
      termites: durabilityTextValue(durability, 'termites', language),
      treatability: durabilityTextValue(durability, 'treatability', language),
      naturalUseClass: textValue(),
      coversUseClass5: textValue(),
      preservativeTreatment: {
        dryWoodBorer: textValue(),
        temporaryHumidification: textValue(),
        permanentHumidification: textValue(),
        notes: [],
      },
      notes: [],
    },
    drying: {
      rate: textValue(dryingRate),
      distortionRisk: textValue(),
      casehardeningRisk: textValue(),
      checkingRisk: textValue(),
      collapseRisk: textValue(),
      notes: [],
      schedule: [],
      scheduleNotes: [],
    },
    machining: {
      bluntingEffect: textValue(),
      sawteethRecommended: textValue(),
      cuttingTools: textValue(),
      peeling: textValue(),
      slicing: textValue(),
      notes: [],
    },
    assembly: {
      nailingAndScrewing: textValue(),
      gluing: textValue(),
      notes: [],
    },
    grading: {
      appearance: null,
      structural: null,
    },
    fireSafety: {
      frenchGrading: null,
      euroclass: textValue(),
      notes: null,
    },
    endUses: [],
    endUseNotes: [],
  };
}

function durabilityFacts(names, targetRecord) {
  const selectedByField = new Map();
  const candidates = names.flatMap((name) => {
    const key = botanicalKey(name);
    return [PROFILE_DURABILITY_FACTS.get(key), FIELD_DURABILITY_FACTS.get(key)].filter(Boolean);
  });
  for (const fact of candidates) {
    for (const [field, value] of Object.entries(fact.fields)) {
      if (targetRecord?.durability?.[field]?.value != null) continue;
      selectedByField.set(field, { ...fact, value });
    }
  }

  const factsByReference = new Map();
  for (const [field, fact] of selectedByField) {
    const existing = factsByReference.get(fact.reference.url) ?? {
      reference: fact.reference,
      fields: {},
      serviceLifeYears: fact.serviceLifeYears,
    };
    existing.fields[field] = fact.value;
    factsByReference.set(fact.reference.url, existing);
  }
  return [...factsByReference.values()];
}

function durabilityTextValue(facts, field, language) {
  const fact = facts.find((candidate) => candidate.fields[field] != null);
  if (!fact) return textValue();
  const code = fact.fields[field];
  const labels = {
    en: {
      fungi: new Map([
        ['1', 'class 1 - very durable'],
        ['1-2', 'class 1-2 - very durable to durable'],
        ['2', 'class 2 - durable'],
        ['3', 'class 3 - moderately durable'],
        ['4-5', 'class 4-5 - poorly to not durable'],
        ['5', 'class 5 - not durable'],
      ]),
      termites: new Map([
        ['D', 'class d - durable'],
        ['M', 'class m - moderately durable'],
        ['S', 'class s - susceptible'],
      ]),
      dryWoodBorers: new Map([
        ['D', 'class d - durable'],
        ['S', 'class s - susceptible'],
      ]),
      treatability: new Map([
        ['1', 'class 1 - easily permeable'],
        ['1-2', 'class 1-2 - moderately to easily permeable'],
        ['2', 'class 2 - moderately permeable'],
        ['3', 'class 3 - poorly permeable'],
        ['4', 'class 4 - not permeable'],
      ]),
    },
    fr: {
      fungi: new Map([
        ['1', 'classe 1 - très durable'],
        ['1-2', 'classe 1-2 - très durable à durable'],
        ['2', 'classe 2 - durable'],
        ['3', 'classe 3 - moyennement durable'],
        ['4-5', 'classe 4-5 - faiblement à non durable'],
        ['5', 'classe 5 - non durable'],
      ]),
      termites: new Map([
        ['D', 'classe d - durable'],
        ['M', 'classe m - moyennement durable'],
        ['S', 'classe s - sensible'],
      ]),
      dryWoodBorers: new Map([
        ['D', 'classe d - durable'],
        ['S', 'classe s - sensible'],
      ]),
      treatability: new Map([
        ['1', 'classe 1 - imprégnable'],
        ['1-2', 'classe 1-2 - moyennement imprégnable à imprégnable'],
        ['2', 'classe 2 - moyennement imprégnable'],
        ['3', 'classe 3 - peu imprégnable'],
        ['4', 'classe 4 - non imprégnable'],
      ]),
    },
  };
  const fieldLabels = {
    en: {
      fungi: 'natural decay durability',
      termites: 'termite resistance',
      dryWoodBorers: 'dry-wood insect resistance',
      treatability: 'heartwood treatability',
    },
    fr: {
      fungi: 'durabilité naturelle aux champignons',
      termites: 'résistance aux termites',
      dryWoodBorers: 'résistance aux insectes de bois sec',
      treatability: 'imprégnabilité du duramen',
    },
  };
  const serviceLife =
    fact.serviceLifeYears == null
      ? ''
      : language === 'fr'
        ? `; durée de vie en essai de champ : ${fact.serviceLifeYears} ans`
        : `; field-test service life: ${fact.serviceLifeYears} years`;
  return {
    raw: `LPF/SFB — ${fieldLabels[language][field]}: ${code}${serviceLife}`,
    value: labels[language][field].get(code),
  };
}

function uniqueReference(reference, index, references) {
  return references.findIndex((candidate) => candidate.url === reference.url) === index;
}

function aggregateMeasure(rows, mapping, language) {
  const source = (mapping.sourceCandidates ?? [mapping]).find((candidate) =>
    rows.some((row) => parsePortugueseNumber(row[candidate.source]) !== null),
  );
  if (!source) return measure(undefined, mapping.unit);
  const values = rows
    .map((row) => parsePortugueseNumber(row[source.source]))
    .filter((value) => value !== null)
    .map((value) => round(value * mapping.multiplier, mapping.multiplier === 1000 ? 0 : 3));
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const average = round(values.reduce((total, value) => total + value, 0) / values.length, 3);
  const observationLabel =
    language === 'fr'
      ? `${values.length} observation${values.length === 1 ? '' : 's'}`
      : `${values.length} observation${values.length === 1 ? '' : 's'}`;
  const range =
    minimum === maximum
      ? formatNumber(minimum)
      : `${formatNumber(minimum)}–${formatNumber(maximum)}`;
  const unit = source.sourceUnit ? ` ${source.sourceUnit}` : '';
  return {
    raw: `${source.labels[language]}; ${observationLabel}: ${range}${unit}`,
    value: average,
    min: values.length > 1 ? minimum : null,
    max: values.length > 1 ? maximum : null,
    ...(mapping.unit ? { unit: mapping.unit } : {}),
  };
}

function mappedCategory(rows, sourceField, mapper, language) {
  const mapped = rows
    .map((row) => mapper(row[sourceField]))
    .filter(Boolean)
    .map((pair) => pair[language === 'fr' ? 1 : 0]);
  if (mapped.length === 0) return undefined;
  const counts = new Map();
  for (const value of mapped) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort(
    (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
  )[0][0];
}

function mapColour(value) {
  return COLOUR_MAP.get(categoryKey(value));
}

function mapTexture(value) {
  const normalized = categoryKey(value);
  if (!normalized) return undefined;
  const hasFine = /\bfina?\b/u.test(normalized);
  const hasMedium = /\bmedia?\b/u.test(normalized);
  const hasCoarse = /\bgrossa?\b/u.test(normalized);
  if (hasFine && hasCoarse)
    return ['very variable, fine to coarse', 'très variable, fin à grossier'];
  if (hasMedium && hasCoarse) return ['medium to coarse', 'moyen à grossier'];
  if (hasFine && hasMedium) return ['fine to medium', 'fin à moyen'];
  if (hasCoarse) return ['coarse', 'grossier'];
  if (hasFine) return ['fine', 'fin'];
  if (hasMedium) return ['medium', 'moyen'];
  return undefined;
}

function mapGrain(value) {
  const normalized = categoryKey(value).replace(/\bdireira\b/gu, 'direita');
  if (!normalized) return undefined;
  const straight = /\bdireita\b/u.test(normalized);
  const interlocked = /\b(?:revessa|reversa|cruzada|entrecruzada)\b/u.test(normalized);
  const wavy = /\bondulada\b/u.test(normalized);
  const irregular = /\birregular(?:es)?\b/u.test(normalized);
  if (straight && interlocked) return ['straight or interlocked', 'droit ou contrefilé'];
  if (straight && irregular) return ['straight to irregular', 'droit à irrégulier'];
  if (interlocked) return ['interlocked', 'contrefil'];
  if (wavy) return ['undulating', 'ondulé'];
  if (straight) return ['straight', 'droit'];
  return undefined;
}

function mapDryingRate(value) {
  const normalized = categoryKey(value);
  if (!normalized) return undefined;
  if (normalized.includes('moderadamente lenta')) return ['normal to slow', 'normale à lente'];
  if (normalized.includes('moderadamente rapida')) return ['rapid to normal', 'rapide à normale'];
  if (normalized.includes('lenta')) return ['slow', 'lente'];
  if (normalized.includes('rapida')) return ['rapid', 'rapide'];
  return undefined;
}

function buildTranslationUnits(records) {
  const units = new Map();
  for (const entry of records) {
    const name = entry.locales.en.identity.primaryName;
    for (const scope of ['identity.primaryName', 'identity.displayName']) {
      const key = `${scope}\u0000${name}`;
      if (!units.has(key)) {
        units.set(key, {
          scope,
          source: name,
          translations: Object.fromEntries(CONTENT_LOCALES.map((locale) => [locale, name])),
        });
      }
    }
  }
  return [...units.values()];
}

function newWoodId(group) {
  const name = scientificNames(group[0].nome_cientifico)[0];
  return `america-lpf-${slugify(name)}`;
}

function scientificNames(value) {
  return unique(
    String(value ?? '')
      .split(/\s*=\s*/u)
      .map((name) => name.replace(/\s+/g, ' ').trim())
      .filter(Boolean),
  );
}

function botanicalKey(value) {
  return categoryKey(value)
    .replace(/\([^)]*\)/gu, '')
    .replace(/\b(sp|cf|aff)\./gu, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function categoryKey(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('pt');
}

function titleCasePortuguese(value) {
  const smallWords = new Set(['a', 'as', 'da', 'das', 'de', 'do', 'dos', 'e']);
  let wordIndex = 0;
  return String(value ?? '')
    .normalize('NFC')
    .toLocaleLowerCase('pt')
    .replace(/\p{L}+/gu, (word) => {
      const keepLowercase = wordIndex > 0 && smallWords.has(word);
      wordIndex += 1;
      return keepLowercase ? word : `${word[0].toLocaleUpperCase('pt')}${word.slice(1)}`;
    })
    .trim();
}

function slugify(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parsePortugueseNumber(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) return null;
  const parsed = Number(normalized.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function measure(value, unit) {
  return {
    raw: '',
    value: value ?? null,
    min: null,
    max: null,
    ...(unit ? { unit } : {}),
  };
}

function textValue(value) {
  return {
    raw: value ?? '',
    value: value ?? null,
  };
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function formatNumber(value) {
  return new Intl.NumberFormat('en', {
    maximumFractionDigits: 3,
    useGrouping: false,
  }).format(value);
}

function unique(values) {
  return [...new Set(values)];
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(
    filePath,
    await format(JSON.stringify(value), { parser: 'json', printWidth: 100 }),
  );
}

function relative(filePath) {
  return path.relative(ROOT, filePath);
}
