export type OriginRegion = 'Africa' | 'America' | 'Asia' | 'Temperate' | 'Unknown';

export type SourceLanguage = 'en' | 'fr';

export type AppLanguage =
  | 'ar'
  | 'bn'
  | 'de'
  | 'en'
  | 'es'
  | 'fr'
  | 'hi'
  | 'id'
  | 'it'
  | 'ja'
  | 'ko'
  | 'pt'
  | 'ru'
  | 'tr'
  | 'ur'
  | 'vi'
  | 'zh-Hans';

export interface NumericMeasure {
  raw: string;
  value: number | null;
  min?: number | null;
  max?: number | null;
  unit?: string;
  standardDeviation?: number | null;
}

export interface TextValue {
  raw: string;
  value: string | null;
}

export interface BotanicalName {
  name: string;
  isSynonym: boolean;
}

export interface LocalName {
  country: string;
  name: string;
}

export interface WoodImage {
  kind: 'flatSawn' | 'quarterSawn' | 'example';
  src: string;
  alt: string;
  width?: number;
  height?: number;
  credit?: {
    creator: string;
    sourceUrl: string;
    license: string;
    licenseUrl: string;
  };
}

export interface WoodThumbnail {
  src: string;
  width: number;
  height: number;
}

export interface SourcePdf {
  language: SourceLanguage;
  region: string;
  url: string;
  fileName: string;
  localPath: string;
  year: number | null;
}

export interface SourceReference {
  title: string;
  url: string;
  publisher: string;
  year: number | null;
}

export interface WoodSource {
  provider: string;
  kind: 'tropix' | 'manual';
  listingUrls?: Partial<Record<SourceLanguage, string>>;
  pdfs?: Partial<Record<SourceLanguage, SourcePdf>>;
  references?: SourceReference[];
  lastUpdateDate: string | null;
  extractionDate: string;
}

export interface Identity {
  primaryName: string;
  displayName: string;
  slug: string;
  family: string | null;
  botanicalNames: BotanicalName[];
  aliases: string[];
  localNames: LocalName[];
  commercialRestrictions: TextValue;
  notes: string[];
}

export interface Origin {
  region: OriginRegion;
  continent: string | null;
  countries: string[];
}

export interface CitesStatus {
  raw: string | null;
  listed: boolean | null;
}

export interface LogDescription {
  diameterCm: NumericMeasure;
  sapwoodThickness: TextValue;
  floats: TextValue;
  durability: TextValue;
  notes: string[];
}

export interface WoodAppearance {
  colourReference: TextValue;
  sapwood: TextValue;
  texture: TextValue;
  grain: TextValue;
  interlockedGrain: TextValue;
  notes: string[];
}

export interface PhysicsMechanics {
  specificGravity: NumericMeasure;
  monninHardness: NumericMeasure;
  jankaHardness: NumericMeasure;
  volumetricShrinkageCoefficient: NumericMeasure;
  totalTangentialShrinkage: NumericMeasure;
  totalRadialShrinkage: NumericMeasure;
  shrinkageRatio: NumericMeasure;
  fibreSaturationPoint: NumericMeasure;
  thermalConductivity: NumericMeasure;
  lowerHeatingValue: NumericMeasure;
  crushingStrength: NumericMeasure;
  staticBendingStrength: NumericMeasure;
  modulusOfElasticity: NumericMeasure;
  stability: TextValue;
  notes: string[];
}

export interface NaturalDurability {
  fungi: TextValue;
  dryWoodBorers: TextValue;
  termites: TextValue;
  treatability: TextValue;
  naturalUseClass: TextValue;
  coversUseClass5: TextValue;
  preservativeTreatment: {
    dryWoodBorer: TextValue;
    temporaryHumidification: TextValue;
    permanentHumidification: TextValue;
    notes: string[];
  };
  notes: string[];
}

export interface DryingScheduleRow {
  phase: string;
  durationHours: string | null;
  moistureContent: string | null;
  temperatureC: string | null;
  wetBulbTemperatureC?: string | null;
  relativeHumidityPercent: string | null;
  uglPercent: string | null;
}

export interface Drying {
  rate: TextValue;
  distortionRisk: TextValue;
  casehardeningRisk: TextValue;
  checkingRisk: TextValue;
  collapseRisk: TextValue;
  notes: string[];
  schedule: DryingScheduleRow[];
  scheduleNotes: string[];
}

export interface SawingMachining {
  bluntingEffect: TextValue;
  sawteethRecommended: TextValue;
  cuttingTools: TextValue;
  peeling: TextValue;
  slicing: TextValue;
  notes: string[];
}

export interface CommercialGrading {
  appearance: string | null;
  structural: string | null;
}

export interface FireSafety {
  frenchGrading: string | null;
  euroclass: TextValue;
  notes: string | null;
}

export interface ExtractionQuality {
  parsedFields: number;
  missingImportantFields: string[];
  warnings: string[];
}

export interface AdditionalDetailSection {
  id: string;
  title: string;
  fields: Array<{
    label: string;
    value: string;
    valueLanguage?: SourceLanguage;
  }>;
}

export interface WoodRecord {
  id: string;
  identity: Identity;
  origin: Origin;
  cites: CitesStatus;
  log: LogDescription;
  appearance: WoodAppearance;
  physics: PhysicsMechanics;
  durability: NaturalDurability;
  drying: Drying;
  machining: SawingMachining;
  assembly: {
    nailingAndScrewing: TextValue;
    gluing: TextValue;
    notes: string[];
  };
  grading: CommercialGrading;
  fireSafety: FireSafety;
  endUses: string[];
  endUseNotes: string[];
  additionalDetails?: AdditionalDetailSection[];
  images: WoodImage[];
  thumbnail: WoodThumbnail | null;
  source: WoodSource;
  rawSections: Record<string, string>;
  extraction: ExtractionQuality;
  searchText: string;
}

export interface WoodDatabase {
  language: SourceLanguage;
  generatedAt: string;
  source: {
    name: 'CIRAD Tropix';
    englishListing: string;
    frenchListing: string;
    englishSheets: number;
    frenchSheets: number;
    manualRecords?: number;
    supplementalRecords?: number;
  };
  records: WoodRecord[];
}
