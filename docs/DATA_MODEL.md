# Wood Data Model

The localized databases are generated primarily from the English and French CIRAD Tropix PDF sheets. Manually curated supplemental records are merged afterward and retain explicit source references. Both languages use the same normalized shape, while textual values retain the source language.

## Top-Level Shape

```ts
interface WoodDatabase {
  language: 'en' | 'fr';
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
  taxonomy: TaxonomyNode[];
  records: WoodRecord[];
}
```

`taxonomy` is a parent-linked dictionary of canonical botanical nodes. Each node has a deterministic
numeric `id`, `parentId`, rank, and name. Records store only `identity.taxonomyId`; their kingdom,
phylum, clade, class, order, family, genus, and species are resolved by walking the parent chain.

## Record Identity

Each `WoodRecord` represents one source sheet or manually curated species in one source region. Names such as Teak can appear in several regions, so ids are region-scoped slugs like `africa-teak`.

Important fields:

- `identity.primaryName`, `identity.displayName`, `identity.slug`
- `identity.taxonomyId`
- `identity.botanicalNames[]` with `isSynonym`
- `identity.aliases[]`
- `identity.localNames[]` as `{ country, name }`
- `origin.region`: `Africa`, `America`, `Asia`, `Temperate`, or `Unknown`
- `origin.continentCodes[]`: normalized continent codes, including multiple continents
- `origin.countryCodes[]`: ISO 3166-1 alpha-2 distribution codes
- `cites.raw` and `cites.listed`

Country and continent names are localized at runtime rather than repeated in every translated
database.

## Normalized Characteristics

Numerical values use:

```ts
interface NumericMeasure {
  raw: string;
  value: number | null;
  min?: number | null;
  max?: number | null;
  unit?: string;
}
```

The raw string is always kept because source PDFs mix exact values, ranges, empty cells, and prose.

Core physical/mechanical fields:

- `specificGravity`
- `monninHardness`
- `jankaHardness`
- `volumetricShrinkageCoefficient`
- `totalTangentialShrinkage`
- `totalRadialShrinkage`
- `shrinkageRatio`
- `fibreSaturationPoint`
- `thermalConductivity`
- `lowerHeatingValue`
- `crushingStrength`
- `staticBendingStrength`
- `modulusOfElasticity`

`physics.specificGravity.value` is the dimensionless relative density at approximately 12% moisture content. When a source reports only air-dry density at approximately 12%, the normalized value is derived as `kg/m³ / 1000` (or `lb/ft³ × 16.018463 / 1000`) and the derivation remains explicit in `raw` or the accompanying notes. Basic, green-volume, and ovendry specific gravities are never substituted for the 12% value.

Core qualitative fields:

- log diameter, sapwood thickness, floatability, log durability
- colour reference, sapwood demarcation, texture, grain, interlocked grain
- fungi, dry wood borer, termite resistance, heartwood and sapwood impregnability, natural use class
- preservative treatment requirements
- drying risks and drying schedule
- machining, assembly, commercial grading, fire grading
- end-uses

## Media

`images[]` contains shared assets extracted from the paired source PDFs. Grain images are published
as 800×800 JPEGs:

- `flatSawn`
- `quarterSawn`
- `example` for larger later-page application photos, when present

`thumbnail` is a derived 100×100 image used by the main table and available for other compact
representations. It is a centered square crop of `quarterSawn`, falling back to `flatSawn` when no
quarter-sawn image is available.

The generated app reads these from `/assets/woods/{woodId}/`.

## Traceability

Every Tropix record includes:

- the current-language PDF and, when the sheet can be paired, both `source.pdfs.en` and `source.pdfs.fr`
- `source.lastUpdateDate`
- `rawSections`: section text keyed by Tropix section title
- `extraction`: parser warnings and missing high-value fields

This lets the first data pass be useful while making future corrections easy to audit.

Manual records live in `data/manual/woods.json` and the partitioned manifests under `data/manual/woods/`. Each record includes one or more bibliographic `source.references` and is merged by `pnpm run data:manual`. New translatable content is paired with its language values in `data/manual/content-translations.json` or a partitioned manifest under `data/manual/content-translations/`.

Partitioned manifests may also contain `supplements`. A supplement targets an existing record by id, fills only fields that are currently unavailable, merges aliases and local names, and appends its source references. The LPF/SFB importer uses this mechanism so repeated Brazilian laboratory observations enrich an existing species rather than creating a duplicate card.

The Brazilian Forest Service LPF source is synchronized and regenerated with `pnpm run data:lpf`. Its observation-level CSV is decoded from Windows-1252 and consolidated by scientific taxon. `pnpm run data:lpf:publish` applies the generated records and supplements without rewriting image assets, then rebuilds the content overlays.

Lignumdata factual values are synchronized with `pnpm run data:lignumdata`. The importer retains
only scientific classification, geographic codes, standardized durability and impregnability
classes, and numeric physical or mechanical measurements. It excludes descriptions, remarks,
application prose, illustrations, and photographs. Every supplement links to the exact species
page used.
