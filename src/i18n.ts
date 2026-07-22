import type { AppLanguage, SourceLanguage } from './types/wood';
import { ar } from './locales/ar';
import { bn } from './locales/bn';
import { de } from './locales/de';
import { es } from './locales/es';
import { hi } from './locales/hi';
import { id } from './locales/id';
import { it } from './locales/it';
import { ja } from './locales/ja';
import { ko } from './locales/ko';
import { pt } from './locales/pt';
import { ru } from './locales/ru';
import { tr } from './locales/tr';
import { ur } from './locales/ur';
import { vi } from './locales/vi';
import { zhHans } from './locales/zh-Hans';

export interface Translation {
  locale: string;
  languageFlag: string;
  languageName: string;
  chooseLanguage: string;
  about: string;
  aboutTitle: string;
  closeAbout: string;
  aboutOpenSource: string;
  aboutDataSourcesTitle: string;
  aboutDataSources: string;
  classLabel: string;
  low: string;
  medium: string;
  high: string;
  veryLight: string;
  light: string;
  heavy: string;
  veryHeavy: string;
  verySoft: string;
  soft: string;
  hard: string;
  veryHard: string;
  atTwelvePercentMoisture: string;
  atlas: string;
  searchPlaceholder: string;
  clearSearch: string;
  filters: string;
  showFilters: string;
  hideFilters: string;
  clearFilters: string;
  generated: string;
  notGenerated: string;
  loadingWoods: string;
  woods: string;
  sheets: string;
  compare: string;
  sortableDatabase: string;
  speciesAndProperties: string;
  dataUnavailable: string;
  activeFilters: string;
  origin: string;
  appearance: string;
  colour: string;
  sapwood: string;
  texture: string;
  grain: string;
  durability: string;
  fungi: string;
  termites: string;
  treatability: string;
  all: string;
  listed: string;
  notListed: string;
  unknown: string;
  performance: string;
  density: string;
  hardness: string;
  radialShrinkageShort: string;
  tangentialShrinkageShort: string;
  elasticity: string;
  elasticityMpa: string;
  useAndDrying: string;
  endUse: string;
  drying: string;
  averageDensity: string;
  averageHardness: string;
  lowShrinkage: string;
  endUses: string;
  materialMap: string;
  hardnessVsRadialShrinkage: string;
  monninHardness: string;
  radialShrinkage: string;
  distribution: string;
  specificGravity: string;
  filteredRegions: string;
  comparison: string;
  clearComparison: string;
  characteristic: string;
  remove: string;
  wood: string;
  radial: string;
  tangential: string;
  uses: string;
  select: string;
  unknownFamily: string;
  closeDetail: string;
  flatSawn: string;
  quarterSawn: string;
  example: string;
  botanicalNamesUnavailable: string;
  identity: string;
  descriptionOfLogs: string;
  descriptionOfWood: string;
  family: string;
  commercialRestrictions: string;
  continent: string;
  localNames: string;
  country: string;
  localName: string;
  diameter: string;
  sapwoodThickness: string;
  floats: string;
  logDurability: string;
  notes: string;
  interlockedGrain: string;
  physicsAndMechanics: string;
  volumetricShrinkage: string;
  tangentialShrinkage: string;
  shrinkageRatio: string;
  fibreSaturationPoint: string;
  thermalConductivity: string;
  lowerHeatingValue: string;
  stability: string;
  standardDeviation: string;
  crushingStrength: string;
  bendingStrength: string;
  dryWoodBorers: string;
  naturalUseClass: string;
  coversUseClass5: string;
  preservativeTreatment: string;
  againstDryWoodBorer: string;
  temporaryHumidification: string;
  permanentHumidification: string;
  casehardening: string;
  collapse: string;
  dryingProgram: string;
  phase: string;
  durationHours: string;
  moistureContent: string;
  temperature: string;
  dryBulbTemperature: string;
  wetBulbTemperature: string;
  relativeHumidity: string;
  equilibriumMoisture: string;
  sawingAndMachining: string;
  dryingRate: string;
  distortion: string;
  checking: string;
  blunting: string;
  sawteeth: string;
  cuttingTools: string;
  peeling: string;
  slicing: string;
  assembling: string;
  nailingAndScrewing: string;
  gluing: string;
  commercialGrading: string;
  appearanceGrading: string;
  structuralGrading: string;
  fireSafety: string;
  frenchGrading: string;
  euroclass: string;
  sourcePdf: string;
  openWoodDetails: string;
  woodTableCaption: string;
  comparisonTableCaption: string;
  sortBy: string;
  minimum: string;
  maximum: string;
  noWoods: string;
  loadError: string;
  regions: Record<string, string>;
}

export const appLanguages: AppLanguage[] = [
  'ar',
  'bn',
  'de',
  'en',
  'es',
  'fr',
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

export function sourceLanguageFor(language: AppLanguage): SourceLanguage {
  return language === 'fr' ? 'fr' : 'en';
}

export function isRtlLanguage(language: AppLanguage) {
  return language === 'ar' || language === 'ur';
}

export const baseTranslations: Record<SourceLanguage, Translation> = {
  en: {
    locale: 'en-GB',
    languageFlag: '🇬🇧',
    languageName: 'English',
    chooseLanguage: 'Application language',
    about: 'About',
    aboutTitle: 'About this atlas',
    closeAbout: 'Close About',
    aboutOpenSource: 'This wood atlas is open source. Its source code is available on GitHub.',
    aboutDataSourcesTitle: 'Data sources',
    aboutDataSources:
      'All wood data in this atlas comes from the Tropix database and the CIRAD BioWooEB research unit.',
    classLabel: 'Class',
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    veryLight: 'Very light',
    light: 'Light',
    heavy: 'Heavy',
    veryHeavy: 'Very heavy',
    verySoft: 'Very soft',
    soft: 'Soft',
    hard: 'Hard',
    veryHard: 'Very hard',
    atTwelvePercentMoisture: '*: at 12% moisture content',
    atlas: 'Wood Atlas',
    searchPlaceholder: 'Search names, uses, countries…',
    clearSearch: 'Clear search',
    filters: 'Filters',
    showFilters: 'Show filters',
    hideFilters: 'Hide filters',
    clearFilters: 'Clear filters',
    generated: 'Generated',
    notGenerated: 'not generated',
    loadingWoods: 'Loading woods',
    woods: 'woods',
    sheets: 'sheets',
    compare: 'compare',
    sortableDatabase: 'Sortable database',
    speciesAndProperties: 'Species and properties',
    dataUnavailable: 'data unavailable',
    activeFilters: 'active filters',
    origin: 'Origin',
    appearance: 'Appearance',
    colour: 'Colour',
    sapwood: 'Sapwood',
    texture: 'Texture',
    grain: 'Grain',
    durability: 'Durability',
    fungi: 'Fungi',
    termites: 'Termites',
    treatability: 'Treatability',
    all: 'All',
    listed: 'Listed',
    notListed: 'Not listed',
    unknown: 'Unknown',
    performance: 'Performance',
    density: 'Density',
    hardness: 'Hardness',
    radialShrinkageShort: 'Radial shrink. %',
    tangentialShrinkageShort: 'Tang. shrink. %',
    elasticity: 'Elasticity',
    elasticityMpa: 'Elasticity (MPA)',
    useAndDrying: 'Use and drying',
    endUse: 'End-use',
    drying: 'Drying',
    averageDensity: 'Avg density',
    averageHardness: 'Avg hardness',
    lowShrinkage: 'Low shrinkage',
    endUses: 'End-uses',
    materialMap: 'Material map',
    hardnessVsRadialShrinkage: 'Hardness vs radial shrinkage',
    monninHardness: 'Monnin hardness',
    radialShrinkage: 'Radial shrinkage',
    distribution: 'Distribution',
    specificGravity: 'Specific gravity',
    filteredRegions: 'Filtered regions',
    comparison: 'Comparison',
    clearComparison: 'Clear',
    characteristic: 'Characteristic',
    remove: 'Remove',
    wood: 'Wood',
    radial: 'Radial',
    tangential: 'Tangential',
    uses: 'Uses',
    select: 'Select',
    unknownFamily: 'Unknown family',
    closeDetail: 'Close detail',
    flatSawn: 'Flat sawn',
    quarterSawn: 'Quarter sawn',
    example: 'Example',
    botanicalNamesUnavailable: 'Botanical names unavailable',
    identity: 'Identity',
    descriptionOfLogs: 'Description of logs',
    descriptionOfWood: 'Description of wood',
    family: 'Family',
    commercialRestrictions: 'Commercial restrictions',
    continent: 'Continent',
    localNames: 'Local names',
    country: 'Country',
    localName: 'Local name',
    diameter: 'Diameter',
    sapwoodThickness: 'Thickness of sapwood',
    floats: 'Floats',
    logDurability: 'Log durability',
    notes: 'Notes',
    interlockedGrain: 'Interlocked grain',
    physicsAndMechanics: 'Physics and mechanics',
    volumetricShrinkage: 'Volumetric shrinkage',
    tangentialShrinkage: 'Tangential shrinkage',
    shrinkageRatio: 'Shrinkage ratio',
    fibreSaturationPoint: 'Fibre saturation point',
    thermalConductivity: 'Thermal conductivity',
    lowerHeatingValue: 'Lower heating value',
    stability: 'Stability',
    standardDeviation: 'SD',
    crushingStrength: 'Crushing strength',
    bendingStrength: 'Bending strength',
    dryWoodBorers: 'Dry wood borers',
    naturalUseClass: 'Natural use class',
    coversUseClass5: 'Species covering use class 5',
    preservativeTreatment: 'Requirement of a preservative treatment',
    againstDryWoodBorer: 'Against dry wood borer',
    temporaryHumidification: 'Temporary humidification',
    permanentHumidification: 'Permanent humidification',
    casehardening: 'Casehardening',
    collapse: 'Collapse',
    dryingProgram: 'Suggested drying program',
    phase: 'Phase',
    durationHours: 'Duration (h)',
    moistureContent: 'Moisture content',
    temperature: 'Temperature (°C)',
    dryBulbTemperature: 'Dry bulb (°C)',
    wetBulbTemperature: 'Wet bulb (°C)',
    relativeHumidity: 'RH (%)',
    equilibriumMoisture: 'UGL (%)',
    sawingAndMachining: 'Sawing and machining',
    dryingRate: 'Drying rate',
    distortion: 'Distortion',
    checking: 'Checking',
    blunting: 'Blunting',
    sawteeth: 'Sawteeth recommended',
    cuttingTools: 'Cutting tools',
    peeling: 'Peeling',
    slicing: 'Slicing',
    assembling: 'Assembling',
    nailingAndScrewing: 'Nailing and screwing',
    gluing: 'Gluing',
    commercialGrading: 'Commercial grading',
    appearanceGrading: 'Appearance grading',
    structuralGrading: 'Structural grading',
    fireSafety: 'Fire safety',
    frenchGrading: 'Conventional French grading',
    euroclass: 'Euroclasses grading',
    sourcePdf: 'Source PDF',
    openWoodDetails: 'Open details for',
    woodTableCaption: 'Wood species and their physical and durability properties',
    comparisonTableCaption: 'Comparison of selected wood species',
    sortBy: 'Sort by',
    minimum: 'Minimum',
    maximum: 'Maximum',
    noWoods: 'No woods match these criteria.',
    loadError: 'The wood database could not be loaded.',
    regions: {
      Africa: 'Africa',
      America: 'America',
      Asia: 'Asia',
      Temperate: 'Temperate',
      Unknown: 'Unknown',
    },
  },
  fr: {
    locale: 'fr-FR',
    languageFlag: '🇫🇷',
    languageName: 'Français',
    chooseLanguage: "Langue de l'application",
    about: 'À propos',
    aboutTitle: 'À propos de cet atlas',
    closeAbout: 'Fermer la fenêtre À propos',
    aboutOpenSource:
      'Cet atlas des bois est open source. Son code source est disponible sur GitHub.',
    aboutDataSourcesTitle: 'Sources des données',
    aboutDataSources:
      'Toutes les données sur les bois de cet atlas proviennent de la base Tropix et de l’unité de recherche BioWooEB du CIRAD.',
    classLabel: 'Classe',
    low: 'Faible',
    medium: 'Moyen',
    high: 'Élevé',
    veryLight: 'Très léger',
    light: 'Léger',
    heavy: 'Lourd',
    veryHeavy: 'Très lourd',
    verySoft: 'Très tendre',
    soft: 'Tendre',
    hard: 'Dur',
    veryHard: 'Très dur',
    atTwelvePercentMoisture: '* : à 12 % d’humidité',
    atlas: 'Atlas des bois',
    searchPlaceholder: 'Rechercher un nom, un usage, un pays…',
    clearSearch: 'Effacer la recherche',
    filters: 'Filtres',
    showFilters: 'Afficher les filtres',
    hideFilters: 'Masquer les filtres',
    clearFilters: 'Effacer les filtres',
    generated: 'Généré le',
    notGenerated: 'non généré',
    loadingWoods: 'Chargement des essences',
    woods: 'essences',
    sheets: 'fiches',
    compare: 'à comparer',
    sortableDatabase: 'Base de données triable',
    speciesAndProperties: 'Essences et propriétés',
    dataUnavailable: 'données indisponibles',
    activeFilters: 'filtres actifs',
    origin: 'Origine',
    appearance: 'Aspect',
    colour: 'Couleur',
    sapwood: 'Aubier',
    texture: 'Grain',
    grain: 'Fil',
    durability: 'Durabilité',
    fungi: 'Champignons',
    termites: 'Termites',
    treatability: 'Imprégnabilité',
    all: 'Tous',
    listed: 'Inscrite',
    notListed: 'Non inscrite',
    unknown: 'Inconnu',
    performance: 'Performances',
    density: 'Densité',
    hardness: 'Dureté',
    radialShrinkageShort: 'Retrait radial %',
    tangentialShrinkageShort: 'Retrait tang. %',
    elasticity: 'Élasticité',
    elasticityMpa: 'Élasticité (MPA)',
    useAndDrying: 'Usage et séchage',
    endUse: 'Utilisation',
    drying: 'Séchage',
    averageDensity: 'Densité moy.',
    averageHardness: 'Dureté moy.',
    lowShrinkage: 'Faible retrait',
    endUses: 'Utilisations',
    materialMap: 'Carte des matériaux',
    hardnessVsRadialShrinkage: 'Dureté et retrait radial',
    monninHardness: 'Dureté Monnin',
    radialShrinkage: 'Retrait radial',
    distribution: 'Distribution',
    specificGravity: 'Densité',
    filteredRegions: 'Régions filtrées',
    comparison: 'Comparaison',
    clearComparison: 'Effacer',
    characteristic: 'Caractéristique',
    remove: 'Retirer',
    wood: 'Essence',
    radial: 'Radial',
    tangential: 'Tangentiel',
    uses: 'Usages',
    select: 'Sélectionner',
    unknownFamily: 'Famille inconnue',
    closeDetail: 'Fermer la fiche',
    flatSawn: 'Débit sur dosse',
    quarterSawn: 'Débit sur quartier',
    example: 'Exemple',
    botanicalNamesUnavailable: 'Noms botaniques indisponibles',
    identity: 'Identité',
    descriptionOfLogs: 'Description de la grume',
    descriptionOfWood: 'Description du bois',
    family: 'Famille',
    commercialRestrictions: 'Restrictions commerciales',
    continent: 'Continent',
    localNames: 'Noms vernaculaires',
    country: 'Pays',
    localName: 'Appellation',
    diameter: 'Diamètre',
    sapwoodThickness: "Épaisseur de l'aubier",
    floats: 'Flottabilité',
    logDurability: 'Conservation en forêt',
    notes: 'Notes',
    interlockedGrain: 'Contrefil',
    physicsAndMechanics: 'Propriétés physiques et mécaniques',
    volumetricShrinkage: 'Retrait volumique',
    tangentialShrinkage: 'Retrait tangentiel',
    shrinkageRatio: 'Ratio des retraits',
    fibreSaturationPoint: 'Point de saturation des fibres',
    thermalConductivity: 'Conductivité thermique',
    lowerHeatingValue: 'Pouvoir calorifique inférieur',
    stability: 'Stabilité en service',
    standardDeviation: 'Écart-type',
    crushingStrength: 'Compression de rupture',
    bendingStrength: 'Flexion statique',
    dryWoodBorers: 'Insectes de bois sec',
    naturalUseClass: "Classe d'emploi naturelle",
    coversUseClass5: 'Essence couvrant la classe 5',
    preservativeTreatment: 'Traitement de préservation',
    againstDryWoodBorer: 'Contre les insectes de bois sec',
    temporaryHumidification: 'Humidification temporaire',
    permanentHumidification: 'Humidification permanente',
    casehardening: 'Cémentation',
    collapse: 'Collapse',
    dryingProgram: 'Programme de séchage proposé',
    phase: 'Phase',
    durationHours: 'Durée (h)',
    moistureContent: 'Humidité du bois',
    temperature: 'Température (°C)',
    dryBulbTemperature: 'Sèche (°C)',
    wetBulbTemperature: 'Humide (°C)',
    relativeHumidity: 'HR (%)',
    equilibriumMoisture: 'UGL (%)',
    sawingAndMachining: 'Sciage et usinage',
    dryingRate: 'Vitesse de séchage',
    distortion: 'Déformation',
    checking: 'Fentes',
    blunting: 'Effet désaffûtant',
    sawteeth: 'Denture pour le sciage',
    cuttingTools: "Outils d'usinage",
    peeling: 'Aptitude au déroulage',
    slicing: 'Aptitude au tranchage',
    assembling: 'Assemblage',
    nailingAndScrewing: 'Clouage et vissage',
    gluing: 'Collage',
    commercialGrading: 'Classements commerciaux',
    appearanceGrading: "Classement d'aspect",
    structuralGrading: 'Classement de structure',
    fireSafety: 'Réaction au feu',
    frenchGrading: 'Classement conventionnel français',
    euroclass: 'Classement selon euroclasses',
    sourcePdf: 'Fiche PDF source',
    openWoodDetails: 'Ouvrir la fiche de',
    woodTableCaption: 'Essences de bois et leurs propriétés physiques et de durabilité',
    comparisonTableCaption: 'Comparaison des essences sélectionnées',
    sortBy: 'Trier par',
    minimum: 'Minimum',
    maximum: 'Maximum',
    noWoods: 'Aucune essence ne correspond à ces critères.',
    loadError: "Impossible de charger la base d'essences.",
    regions: {
      Africa: 'Afrique',
      America: 'Amérique',
      Asia: 'Asie',
      Temperate: 'Tempéré',
      Unknown: 'Inconnu',
    },
  },
};

export const translations: Record<AppLanguage, Translation> = {
  ar,
  bn,
  de,
  en: baseTranslations.en,
  es,
  fr: baseTranslations.fr,
  hi,
  id,
  it,
  ja,
  ko,
  pt,
  ru,
  tr,
  ur,
  vi,
  'zh-Hans': zhHans,
};
