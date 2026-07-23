# Wood Atlas

A React workbench for exploring, filtering, visualizing, and comparing wood species, primarily from the CIRAD Tropix technical sheets with cited supplemental records.

Source pages:

- French: https://tropix.cirad.fr/fiches-disponibles
- English: https://tropix.cirad.fr/en/fiches-disponibles
- North American hardwoods: https://www.fpl.fs.usda.gov/documnts/fplgtr/fplgtr83.pdf
- North American softwoods: https://www.fpl.fs.usda.gov/documnts/fplgtr/fplgtr102.pdf
- Tropical timbers: https://research.fs.usda.gov/download/treesearch/69634.pdf
- Brazilian woods: https://dados.florestal.gov.br/dataset/banco-de-dados-de-madeiras-brasileiras-do-lpf-sfb
- Brazilian wood durability: https://madeiras.ipt.br/
- Supplemental taxonomy, distribution, physical properties, and durability values: https://lignumdata.ch/system/holzarten?locale=en

## What Is Built

- Downloads all 624 Tropix PDFs: 312 English and 312 French.
- Parses all 312 English and 312 French sheets into localized structured JSON databases.
- Merges manually curated supplemental records with explicit per-record references.
- Extracts first-page flat-sawn and quarter-sawn grain images where the PDF provides them.
- Serves the generated database from `public/data/woods.generated.json`.
- Provides a React app with:
  - searchable and sortable wood table
  - origin, appearance, durability, drying, CITES, end-use, and numeric range filters
  - summary metrics, region bars, density distribution, and hardness/shrinkage scatter plot
  - 2-5 wood comparison table with best values highlighted
  - detail panel with botanical names, local names, end-uses, source references, and grain images
  - normalized botanical lineages and localized country and continent distributions
  - persistent interface language switch for Arabic, Bengali, German, English, Spanish, French, Hindi, Indonesian, Italian, Japanese, Korean, Portuguese, Russian, Turkish, Urdu, Vietnamese, and Simplified Chinese
  - right-to-left layouts for Arabic and Urdu
  - authoritative French CIRAD content for French, authoritative English CIRAD content for English, and complete validated content overlays for the other 15 interface languages

## Commands

```bash
pnpm install
pnpm run data:all
pnpm run dev
```

Then open http://127.0.0.1:5173/.

Useful individual commands:

```bash
pnpm run data:sync      # scrape listings and download PDFs
pnpm run data:extract   # parse cached PDFs/text and regenerate JSON/images
pnpm run data:lpf       # refresh and consolidate the official LPF/SFB Brazilian Woods CSV
pnpm run data:lpf:publish # publish LPF records without rewriting image assets
pnpm run data:ipt       # refresh normalized IPT fungal and termite durability facts
pnpm run data:lignumdata # refresh factual taxonomy, geography, properties, and EN 350 classes
pnpm run data:manual    # merge manual records and rebuild all language overlays
pnpm run data:validate  # audit numeric ranges and bilingual consistency
pnpm run build          # type-check and build production assets
```

The data model is documented in `docs/DATA_MODEL.md` and typed in `src/types/wood.ts`.

## Local Requirements

The extraction script uses Poppler command-line tools:

- `pdftotext`
- `pdfimages`

Image cropping, resizing, and JPEG conversion are handled cross-platform by `sharp`, installed with the project dependencies.

## License

Original software and documentation are licensed under the [Apache License 2.0](LICENSE). See [NOTICE](NOTICE) for the required attribution and third-party notices.

Tropix-derived data, translated or adapted content, photographs, and illustrations—including materials under `public/data` and `public/assets/woods`—are not covered by the Apache License. They remain subject to the rights and [terms of their respective rights holders](https://www.tropix-online.com/legal).
