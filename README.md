# Tropix Wood Atlas

A React workbench for exploring, filtering, visualizing, and comparing wood species from the CIRAD Tropix technical sheets.

Source pages:

- French: https://tropix.cirad.fr/fiches-disponibles
- English: https://tropix.cirad.fr/en/fiches-disponibles

## What Is Built

- Downloads all 624 Tropix PDFs: 312 English and 312 French.
- Parses all 312 English and 312 French sheets into localized structured JSON databases.
- Extracts first-page flat-sawn and quarter-sawn grain images where the PDF provides them.
- Serves the generated database from `public/data/woods.generated.json`.
- Provides a React app with:
  - searchable and sortable wood table
  - origin, appearance, durability, drying, CITES, end-use, and numeric range filters
  - summary metrics, region bars, density distribution, and hardness/shrinkage scatter plot
  - 2-5 wood comparison table with best values highlighted
  - detail panel with botanical names, local names, end-uses, source PDF, and grain images
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
pnpm run data:validate  # audit numeric ranges and bilingual consistency
pnpm run build          # type-check and build production assets
```

The data model is documented in `docs/DATA_MODEL.md` and typed in `src/types/wood.ts`.

## Local Requirements

The extraction script uses Poppler command-line tools:

- `pdftotext`
- `pdfimages`

On macOS it also uses `sips` to normalize the extracted grain images. If `sips` is unavailable, the script falls back to copying the extracted image output.
