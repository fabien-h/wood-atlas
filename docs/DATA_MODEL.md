# Tropix Wood Data Model

The localized databases are generated from the English and French CIRAD Tropix PDF sheets. Both languages are parsed into the same normalized shape, while textual values retain the source language.

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
  };
  records: WoodRecord[];
}
```

## Record Identity

Each `WoodRecord` represents one Tropix sheet in one source region. Names such as Teak can appear in several regions, so ids are region-scoped slugs like `africa-teak`.

Important fields:

- `identity.primaryName`, `identity.displayName`, `identity.slug`
- `identity.family`
- `identity.botanicalNames[]` with `isSynonym`
- `identity.aliases[]`
- `identity.localNames[]` as `{ country, name }`
- `origin.region`: `Africa`, `America`, `Asia`, `Temperate`, or `Unknown`
- `origin.continent`
- `cites.raw` and `cites.listed`

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

Core qualitative fields:

- log diameter, sapwood thickness, floatability, log durability
- colour reference, sapwood demarcation, texture, grain, interlocked grain
- fungi, dry wood borer, termite resistance, treatability, natural use class
- preservative treatment requirements
- drying risks and drying schedule
- machining, assembly, commercial grading, fire grading
- end-uses

## Media

`images[]` contains shared assets extracted from the paired source PDFs:

- `flatSawn`
- `quarterSawn`
- `example` for larger later-page application photos, when present

The generated app reads these from `/assets/woods/{woodId}/`.

## Traceability

Every record includes:

- the current-language PDF and, when the sheet can be paired, both `source.pdfs.en` and `source.pdfs.fr`
- `source.lastUpdateDate`
- `rawSections`: section text keyed by Tropix section title
- `extraction`: parser warnings and missing high-value fields

This lets the first data pass be useful while making future corrections easy to audit.
