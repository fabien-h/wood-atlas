#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANUAL_DIRECTORY = path.join(ROOT, 'data', 'manual', 'woods');
const BASE_MANIFEST_PATH = path.join(ROOT, 'data', 'manual', 'woods.json');
const TRANSLATION_MANIFEST_PATH = path.join(
  ROOT,
  'data',
  'manual',
  'content-translations',
  'institutional-enrichment.json',
);

const WOOD_HANDBOOK_REFERENCE = {
  title: 'Wood Handbook (FPL–GTR–282), Chapter 14 — Biodeterioration of Wood',
  url: 'https://www.fpl.fs.usda.gov/documnts/fplgtr/fplgtr282/chapter_14_fpl_gtr282.pdf',
  publisher: 'USDA Forest Service, Forest Products Laboratory',
  year: 2021,
};
const FCBA_REFERENCE = {
  title: 'Le guide des essences de bois — Chêne rouge d’Amérique',
  url: 'https://www.cndb.org/site/wp-content/uploads/2019/01/Le_Guide_des_Essences_de_Bois_Yves_Benoit_FCBA_Eyrolles.pdf',
  publisher: 'FCBA and Éditions Eyrolles',
  year: 2008,
};
const SERQ_REFERENCE = {
  title: 'Carvalho vermelho — Quercus rubra',
  url: 'https://madeq.serq.pt/pt/especies/carvalho-vermelho-1',
  publisher: 'SerQ — Centro de Inovação e Competências da Floresta',
  year: null,
};
const LIGNUMDATA_RED_OAK_REFERENCE = {
  title: 'Quercus rubra — Lignumdata factual data',
  url: 'https://lignumdata.ch/system/holzarten/3D20FD25-CBAB-387D-9AFB-41EF18A23831?locale=en',
  publisher: 'Lignum – Holzwirtschaft Schweiz',
  year: null,
};
const GROUAZEL_RED_OAK_REFERENCE = {
  title: 'Nouveau à la gamme : le chêne rouge (Quercus rubra)',
  url: 'https://www.grouazel-group.com/fr/news/actu-3-nouveau-a-la-gamme-le-chene-rouge-quercus-rubra.html',
  publisher: 'Grouazel',
  year: 2018,
};
const TERMITE_STUDY_REFERENCE = {
  title:
    'Natural durability of tropical and native woods against termite damage by Reticulitermes flavipes',
  url: 'https://www.fpl.fs.usda.gov/documnts/pdf2006/fpl_2006_arango002.pdf',
  publisher: 'USDA Forest Service, Forest Products Laboratory',
  year: 2006,
};

const updatesByFile = new Map([
  [
    'usda-softwoods.json',
    [
      fungus(
        'temperate-jack-pine',
        'very limited resistance to decay',
        'très faible résistance à la pourriture',
        { classification: '5' },
      ),
      fungus(
        'temperate-loblolly-pine',
        'moderate to low resistance to decay',
        'résistance moyenne à faible à la pourriture',
        { classification: '3-4' },
      ),
      fungus(
        'temperate-pitch-pine',
        'moderate to low resistance to decay',
        'résistance moyenne à faible à la pourriture',
        { classification: '3-4' },
      ),
      fungus(
        'temperate-pond-pine',
        'moderate to low resistance to decay',
        'résistance moyenne à faible à la pourriture',
        { classification: '3-4' },
      ),
      fungus(
        'temperate-shortleaf-pine',
        'moderate to low resistance to decay',
        'résistance moyenne à faible à la pourriture',
        { classification: '3-4' },
      ),
      fungus(
        'temperate-spruce-pine',
        'moderate to low resistance to decay',
        'résistance moyenne à faible à la pourriture',
        { classification: '3-4' },
      ),
      fungus(
        'temperate-pacific-yew',
        'exceptionally high resistance to decay',
        'résistance exceptionnellement élevée à la pourriture',
        { classification: '1' },
      ),
      fungus(
        'temperate-southern-redcedar',
        'resistant to decay (USDA juniper group)',
        'résistant à la pourriture (groupe des genévriers USDA)',
        { addReference: WOOD_HANDBOOK_REFERENCE, classification: '2' },
      ),
      fungus(
        'temperate-lodgepole-pine',
        'not durable under decay-favouring conditions',
        'non durable dans des conditions favorisant la pourriture',
        { classification: '5' },
      ),
      fungus(
        'temperate-jeffrey-pine',
        'slightly resistant to nonresistant',
        'légèrement résistant à non résistant',
        { classification: '4-5' },
      ),
      fungus(
        'temperate-ponderosa-pine',
        'slightly resistant to nonresistant',
        'légèrement résistant à non résistant',
        { classification: '4-5' },
      ),
      textField(
        'temperate-eastern-redcedar',
        'durability.termites',
        'Class D - highly resistant to termite attack',
        'Classe D - très résistant aux attaques de termites',
      ),
      textField(
        'temperate-northern-white-cedar',
        'durability.termites',
        'Class D - resistant to subterranean termites',
        'Classe D - résistant aux termites souterrains',
      ),
      textField(
        'temperate-jeffrey-pine',
        'durability.termites',
        'Class S - susceptible to drywood termites',
        'Classe S - sensible aux termites de bois sec',
      ),
      textField(
        'temperate-ponderosa-pine',
        'durability.termites',
        'Class S - susceptible to drywood termites',
        'Classe S - sensible aux termites de bois sec',
      ),
      textField(
        'temperate-balsam-fir',
        'durability.dryWoodBorers',
        'Class S - susceptible to wood-boring beetles',
        'Classe S - sensible aux coléoptères xylophages',
      ),
      textField(
        'temperate-jeffrey-pine',
        'durability.dryWoodBorers',
        'Class S - susceptible to wood-boring beetles',
        'Classe S - sensible aux coléoptères xylophages',
      ),
      textField(
        'temperate-ponderosa-pine',
        'durability.dryWoodBorers',
        'Class S - susceptible to wood-boring beetles',
        'Classe S - sensible aux coléoptères xylophages',
      ),
      textField(
        'temperate-western-hemlock',
        'durability.termites',
        'Class M - moderately resistant to Reticulitermes flavipes in a standard soil-block test',
        'Classe M - moyennement résistant à Reticulitermes flavipes lors d’un essai normalisé en bloc de sol',
        { addReference: TERMITE_STUDY_REFERENCE },
      ),
      textField(
        'temperate-atlantic-white-cedar',
        'durability.termites',
        'Class D - highly resistant to Reticulitermes flavipes in a standard soil-block test',
        'Classe D - très résistant à Reticulitermes flavipes lors d’un essai normalisé en bloc de sol',
        { addReference: TERMITE_STUDY_REFERENCE },
      ),
    ],
  ],
  [
    'usda-d-l.json',
    [
      fungus(
        'temperate-tanoak',
        'slightly resistant or nonresistant',
        'légèrement résistant ou non résistant',
        { addReference: WOOD_HANDBOOK_REFERENCE, classification: '4-5' },
      ),
    ],
  ],
  [
    'usda-a-c.json',
    [
      textField(
        'america-black-mangrove',
        'durability.treatability',
        'variable resistance to preservative impregnation',
        'résistance variable à l’imprégnation par les produits de préservation',
        { value: { en: 'variable', fr: 'variable' }, replaceExisting: true },
      ),
    ],
  ],
  [
    'usda-m-u.json',
    [
      textField(
        'temperate-north-american-elm',
        'durability.treatability',
        'variable by species: slippery elm is permeable; rock elm is resistant',
        'variable selon l’espèce : l’orme rouge est imprégnable ; l’orme liège est résistant',
        { value: { en: 'variable', fr: 'variable' }, replaceExisting: true },
      ),
    ],
  ],
  [
    'usda-tropical-n-z.json',
    [
      textField(
        'america-mastate',
        'durability.termites',
        'Class M - moderately resistant to Reticulitermes flavipes in a standard soil-block test',
        'Classe M - moyennement résistant à Reticulitermes flavipes lors d’un essai normalisé en bloc de sol',
        { addReference: TERMITE_STUDY_REFERENCE },
      ),
    ],
  ],
]);

for (const [fileName, updates] of updatesByFile) {
  const filePath = path.join(MANUAL_DIRECTORY, fileName);
  const manifest = await readJson(filePath);
  const recordsById = new Map(manifest.records.map((record) => [record.id, record]));
  for (const update of updates) {
    const record = recordsById.get(update.id);
    if (!record) throw new Error(`${fileName} does not contain ${update.id}`);
    update.apply(record);
  }
  await writeJson(filePath, manifest);
  console.log(`Updated ${updates.length} curated fields in ${fileName}.`);
}

const baseManifest = await readJson(BASE_MANIFEST_PATH);
const northernRedOak = baseManifest.records.find(
  (record) => record.id === 'temperate-northern-red-oak',
);
if (!northernRedOak) throw new Error('temperate-northern-red-oak was not found');

setNumericMeasure(
  northernRedOak,
  'physics.monninHardness',
  {
    en: 'FCBA Monnin hardness at 12% moisture content: 4.0',
    fr: 'Dureté Monnin FCBA à 12 % d’humidité : 4,0',
  },
  4,
);
setNumericMeasure(
  northernRedOak,
  'physics.volumetricShrinkageCoefficient',
  {
    en: 'SerQ volumetric shrinkage coefficient: 0.52% per %',
    fr: 'Coefficient de retrait volumique SerQ : 0,52 % par %',
  },
  0.52,
);
setLocalizedTextMeasure(
  northernRedOak,
  'durability.fungi',
  {
    en: 'Lignumdata — EN 350 fungal durability from field testing: DC 3–4',
    fr: 'Lignumdata — durabilité aux champignons selon EN 350, essai en plein air : DC 3–4',
  },
  {
    en: 'class 3-4 - moderately to poorly durable',
    fr: 'classe 3-4 - moyennement à faiblement durable',
  },
);
setLocalizedTextMeasure(
  northernRedOak,
  'durability.termites',
  {
    en: 'Lignumdata — EN 350 termite resistance: S',
    fr: 'Lignumdata — résistance aux termites selon EN 350 : S',
  },
  {
    en: 'class s - susceptible',
    fr: 'classe s - sensible',
  },
);
setLocalizedTextMeasure(
  northernRedOak,
  'durability.treatability',
  {
    en: 'Lignumdata — EN 350 heartwood impregnability: 2–3',
    fr: 'Lignumdata — imprégnabilité du duramen selon EN 350 : 2–3',
  },
  {
    en: 'class 2-3 - moderately to poorly permeable',
    fr: 'classe 2-3 - moyennement à faiblement imprégnable',
  },
);
for (const language of ['en', 'fr']) {
  northernRedOak.locales[language].durability.sapwoodTreatability ??= {
    raw: '',
    value: null,
  };
}
setLocalizedTextMeasure(
  northernRedOak,
  'durability.sapwoodTreatability',
  {
    en: 'Lignumdata — EN 350 sapwood impregnability: 1',
    fr: 'Lignumdata — imprégnabilité de l’aubier selon EN 350 : 1',
  },
  {
    en: 'class 1 - easily permeable',
    fr: 'classe 1 - facilement imprégnable',
  },
);
setLocalizedTextMeasure(
  northernRedOak,
  'durability.naturalUseClass',
  {
    en: 'Grouazel, citing FCBA-supported studies: use class 2; unsuitable for exterior use without appropriate protection',
    fr: 'Grouazel, d’après des études soutenues par le FCBA : classe d’emploi 2 ; inadapté à un usage extérieur sans protection appropriée',
  },
  {
    en: 'class 2 - inside or under cover (dampness possible)',
    fr: "classe 2 - à l'intérieur ou sous abri (risque d'humidification)",
  },
);
for (const reference of [
  FCBA_REFERENCE,
  SERQ_REFERENCE,
  LIGNUMDATA_RED_OAK_REFERENCE,
  GROUAZEL_RED_OAK_REFERENCE,
]) {
  addReference(northernRedOak, reference);
}
northernRedOak.source.provider =
  'USDA Forest Products Laboratory · FCBA · SerQ — Forest Innovation and Competence Centre · Lignumdata · Grouazel';
northernRedOak.source.extractionDate = '2026-07-24';
await writeJson(BASE_MANIFEST_PATH, baseManifest);
await writeJson(TRANSLATION_MANIFEST_PATH, {
  schemaVersion: 1,
  units: [
    {
      scope: 'durability.treatability.value',
      source: 'variable',
      translations: {
        ar: 'متغير',
        bn: 'পরিবর্তনশীল',
        de: 'variabel',
        es: 'variable',
        hi: 'परिवर्तनशील',
        id: 'bervariasi',
        it: 'variabile',
        ja: '変動する',
        ko: '가변적',
        pt: 'variável',
        ru: 'переменная',
        tr: 'değişken',
        ur: 'متغیر',
        vi: 'thay đổi',
        'zh-Hans': '不定',
      },
    },
  ],
});
console.log('Added Monnin hardness and volumetric shrinkage to Northern red oak.');

function fungus(id, english, french, options = {}) {
  const englishLabels = new Map([
    ['1', 'class 1 - very durable'],
    ['2', 'class 2 - durable'],
    ['3-4', 'class 3-4 - moderately to poorly durable'],
    ['4-5', 'class 4-5 - poorly to not durable'],
    ['5', 'class 5 - not durable'],
  ]);
  const frenchLabels = new Map([
    ['1', 'classe 1 - très durable'],
    ['2', 'classe 2 - durable'],
    ['3-4', 'classe 3-4 - moyennement à faiblement durable'],
    ['4-5', 'classe 4-5 - faiblement à non durable'],
    ['5', 'classe 5 - non durable'],
  ]);
  const classification = options.classification;
  if (!englishLabels.has(classification) || !frenchLabels.has(classification)) {
    throw new Error(`${id} has an invalid fungus classification`);
  }
  return textField(id, 'durability.fungi', english, french, {
    ...options,
    replaceExisting: true,
    value: {
      en: englishLabels.get(classification),
      fr: frenchLabels.get(classification),
    },
  });
}

function textField(id, fieldPath, english, french, options = {}) {
  return {
    id,
    apply(record) {
      for (const [language, value] of [
        ['en', english],
        ['fr', french],
      ]) {
        const target = getAtPath(record.locales[language], fieldPath);
        if (!target || typeof target !== 'object') {
          throw new Error(`${id} is missing locales.${language}.${fieldPath}`);
        }
        const expected = options.replace ?? null;
        const desiredValue = options.value?.[language] ?? value.toLocaleLowerCase(language);
        if (target.value !== null && target.value !== expected && !options.replaceExisting) {
          if (target.value === desiredValue) continue;
          throw new Error(
            `${id} locales.${language}.${fieldPath} is ${JSON.stringify(target.value)}, expected ${JSON.stringify(expected)}`,
          );
        }
        target.raw = value;
        target.value = desiredValue;
      }
      if (options.addReference) addReference(record, options.addReference);
    },
  };
}

function setNumericMeasure(record, fieldPath, rawByLanguage, value) {
  for (const language of ['en', 'fr']) {
    const target = getAtPath(record.locales[language], fieldPath);
    if (!target || typeof target !== 'object') {
      throw new Error(`${record.id} is missing locales.${language}.${fieldPath}`);
    }
    if (target.value !== null && target.value !== value) {
      throw new Error(`${record.id} locales.${language}.${fieldPath} is already populated`);
    }
    target.raw = rawByLanguage[language];
    target.value = value;
    target.min = null;
    target.max = null;
  }
}

function setLocalizedTextMeasure(record, fieldPath, rawByLanguage, valueByLanguage) {
  for (const language of ['en', 'fr']) {
    const target = getAtPath(record.locales[language], fieldPath);
    if (!target || typeof target !== 'object') {
      throw new Error(`${record.id} is missing locales.${language}.${fieldPath}`);
    }
    target.raw = rawByLanguage[language];
    target.value = valueByLanguage[language];
  }
}

function addReference(record, reference) {
  if (!record.source.references.some((existing) => existing.url === reference.url)) {
    record.source.references.push(reference);
  }
}

function getAtPath(value, fieldPath) {
  return fieldPath.split('.').reduce((current, key) => current?.[key], value);
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function writeJson(filePath, value) {
  const json = await format(`${JSON.stringify(value)}\n`, { parser: 'json' });
  await fs.writeFile(filePath, json);
}
