#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const candidateRoot = path.join(projectRoot, 'tmp', 'wood-image-candidates');
const houghIndexUrl = 'https://www.lib.ncsu.edu/specialcollections/forestry/hough/toc.html';
const houghRootUrl = 'https://www.lib.ncsu.edu/specialcollections/forestry/hough/';
const gbifMatchUrl = 'https://api.gbif.org/v1/species/match';
const gbifSpeciesUrl = 'https://api.gbif.org/v1/species/';
const applyChanges = process.argv.includes('--apply');

const manualSynonyms = new Map([
  [
    'sassafras sassafras',
    {
      acceptedName: 'Sassafras albidum',
      evidenceUrl: 'https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:2591975-4',
    },
  ],
  [
    'magnolia glauca',
    {
      acceptedName: 'Magnolia virginiana',
      evidenceUrl: 'https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:77170516-1',
    },
  ],
  [
    'pinus inops',
    {
      acceptedName: 'Pinus virginiana',
      evidenceUrl: 'https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:263413-1',
    },
  ],
  [
    'abies nobilis',
    {
      acceptedName: 'Abies procera',
      evidenceUrl: 'https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:1007819-2',
    },
  ],
  [
    'sambucus glauca',
    {
      acceptedName: 'Sambucus cerulea',
      evidenceUrl: 'https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:77225130-1',
    },
  ],
  [
    'larix americana',
    {
      acceptedName: 'Larix laricina',
      evidenceUrl: 'https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:262411-1',
    },
  ],
  [
    'mohrodendron carolinum',
    {
      acceptedName: 'Halesia carolina',
      evidenceUrl: 'https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:319532-2',
    },
  ],
  [
    'quercus densiflora',
    {
      acceptedName: 'Notholithocarpus densiflorus',
      evidenceUrl: 'https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:60451161-2',
    },
  ],
]);

const manualFolderMatches = new Map([
  [
    'sambucus glauca',
    {
      woodId: 'temperate-blue-elder',
      localBotanicalName: 'Sambucus cerulea',
    },
  ],
  [
    'larix americana',
    {
      woodId: 'temperate-tamarack',
      localBotanicalName: 'Larix laricina',
    },
  ],
  [
    'larix occidentalis',
    {
      woodId: 'temperate-western-larch',
      localBotanicalName: 'Larix occidentalis',
    },
  ],
  [
    'mohrodendron carolinum',
    {
      woodId: 'temperate-silverbell',
      localBotanicalName: 'Halesia spp.',
    },
  ],
  [
    'quercus densiflora',
    {
      woodId: 'temperate-tanoak',
      localBotanicalName: 'Lithocarpus densiflorus',
    },
  ],
]);

const referencePlate = {
  width: 1893,
  height: 2680,
  radial: { left: 270, top: 990, width: 1330, height: 510 },
  tangential: { left: 270, top: 1670, width: 1330, height: 510 },
};

function stripTags(value) {
  return String(value ?? '')
    .replaceAll(/<[^>]+>/g, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim();
}

function normalizedBinomial(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .replaceAll(/[^A-Za-z×.-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join(' ')
    .toLowerCase();
}

function hasInfraspecificRank(value) {
  return /\b(?:subsp|ssp|var|forma|f)\.?\s+/i.test(String(value ?? ''));
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function fetchResponse(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response;
}

async function fetchText(url) {
  return (await fetchResponse(url)).text();
}

async function fetchBuffer(url) {
  return Buffer.from(await (await fetchResponse(url)).arrayBuffer());
}

function parseHoughPlates(html) {
  const plates = [];
  for (const row of html.matchAll(/<tr>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((match) =>
      stripTags(match[1]),
    );
    const imageMatch = row[1].match(/href="(vlgimage\/[^"]+)"/i);
    if (cells.length < 5 || !imageMatch) continue;
    plates.push({
      plate: cells[0].replace('.', ''),
      printedName: cells[1],
      printedBinomial: normalizedBinomial(cells[1]),
      imageUrl: new URL(imageMatch[1], houghRootUrl).href,
    });
  }
  return plates;
}

async function readEmptyFolders() {
  const entries = await readdir(candidateRoot, { withFileTypes: true });
  const folders = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(candidateRoot, entry.name, 'candidates.json');
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    if ((manifest.candidates ?? []).length > 0) continue;
    folders.push({
      woodId: entry.name,
      manifestPath,
      manifest,
      botanicalNames: manifest.botanicalNames ?? [],
    });
  }
  return folders;
}

async function mapWithConcurrency(items, concurrency, callback) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await callback(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

async function resolvePlateTaxonomy(plate) {
  const manualSynonym = manualSynonyms.get(plate.printedBinomial);
  if (manualSynonym) {
    return {
      ...plate,
      acceptedName: manualSynonym.acceptedName,
      manualEvidenceUrl: manualSynonym.evidenceUrl,
      gbifMatch: {},
    };
  }
  const matchUrl = `${gbifMatchUrl}?name=${encodeURIComponent(plate.printedBinomial)}`;
  try {
    const gbifMatch = await (await fetchResponse(matchUrl)).json();
    let accepted = null;
    if (gbifMatch.acceptedUsageKey) {
      accepted = await (
        await fetchResponse(`${gbifSpeciesUrl}${gbifMatch.acceptedUsageKey}`)
      ).json();
    }
    const acceptedName =
      accepted?.canonicalName ?? (gbifMatch.status === 'ACCEPTED' ? gbifMatch.canonicalName : null);
    const sameGenus =
      normalizedBinomial(acceptedName).split(' ')[0] === plate.printedBinomial.split(' ')[0];
    const trustworthyMatch =
      ['EXACT', 'FUZZY'].includes(gbifMatch.matchType) &&
      Number(gbifMatch.confidence ?? 0) >= 92 &&
      sameGenus;
    return {
      ...plate,
      matchUrl,
      gbifMatch,
      accepted,
      acceptedName: trustworthyMatch ? acceptedName : null,
    };
  } catch (error) {
    return { ...plate, taxonomyError: String(error) };
  }
}

function matchPlatesToFolders(plates, folders) {
  const foldersByBinomial = new Map();
  const foldersById = new Map(folders.map((folder) => [folder.woodId, folder]));
  for (const folder of folders) {
    for (const botanicalName of folder.botanicalNames) {
      if (hasInfraspecificRank(botanicalName)) continue;
      const key = normalizedBinomial(botanicalName);
      if (!key) continue;
      if (!foldersByBinomial.has(key)) foldersByBinomial.set(key, []);
      foldersByBinomial.get(key).push({ folder, botanicalName });
    }
  }

  const matchesByFolder = new Map();
  for (const plate of plates) {
    const possibleNames = [
      {
        binomial: plate.printedBinomial,
        type: 'exactBotanicalName',
        matchedName: plate.printedName,
      },
    ];
    if (plate.acceptedName && normalizedBinomial(plate.acceptedName) !== plate.printedBinomial) {
      possibleNames.push({
        binomial: normalizedBinomial(plate.acceptedName),
        type: 'documentedSynonym',
        matchedName: plate.acceptedName,
      });
    }
    for (const possible of possibleNames) {
      for (const local of foldersByBinomial.get(possible.binomial) ?? []) {
        const match = {
          ...plate,
          identityBasis: possible.type,
          localBotanicalName: local.botanicalName,
          matchedName: possible.matchedName,
        };
        if (!matchesByFolder.has(local.folder.woodId)) {
          matchesByFolder.set(local.folder.woodId, {
            folder: local.folder,
            matches: [],
          });
        }
        const target = matchesByFolder.get(local.folder.woodId).matches;
        if (!target.some((item) => item.plate === plate.plate)) target.push(match);
      }
    }

    const manualTarget = manualFolderMatches.get(plate.printedBinomial);
    const manualFolder = manualTarget ? foldersById.get(manualTarget.woodId) : null;
    if (manualFolder) {
      if (!matchesByFolder.has(manualFolder.woodId)) {
        matchesByFolder.set(manualFolder.woodId, {
          folder: manualFolder,
          matches: [],
        });
      }
      const target = matchesByFolder.get(manualFolder.woodId).matches;
      if (!target.some((item) => item.plate === plate.plate)) {
        target.push({
          ...plate,
          identityBasis: 'documentedSynonym',
          localBotanicalName: manualTarget.localBotanicalName,
          matchedName: plate.acceptedName ?? plate.printedName,
        });
      }
    }
  }

  for (const result of matchesByFolder.values()) {
    result.matches.sort((a, b) => {
      if (a.identityBasis !== b.identityBasis) {
        return a.identityBasis === 'exactBotanicalName' ? -1 : 1;
      }
      return a.plate.localeCompare(b.plate, undefined, { numeric: true });
    });
    result.matches = result.matches.slice(0, 2);
  }
  return [...matchesByFolder.values()].sort((a, b) =>
    a.folder.woodId.localeCompare(b.folder.woodId),
  );
}

function scaleCrop(crop, width, height) {
  const left = Math.round((crop.left / referencePlate.width) * width);
  const top = Math.round((crop.top / referencePlate.height) * height);
  const scaledWidth = Math.round((crop.width / referencePlate.width) * width);
  const scaledHeight = Math.round((crop.height / referencePlate.height) * height);
  return {
    left: Math.max(0, Math.min(left, width - 1)),
    top: Math.max(0, Math.min(top, height - 1)),
    width: Math.max(1, Math.min(scaledWidth, width - left)),
    height: Math.max(1, Math.min(scaledHeight, height - top)),
  };
}

function identityEvidence(match, view) {
  const authority = match.manualEvidenceUrl ? 'Kew POWO documents' : 'GBIF maps';
  const synonym =
    match.identityBasis === 'documentedSynonym'
      ? ` ${authority} the historical name as ${match.acceptedName}, matching the atlas name ${match.localBotanicalName}.`
      : ` The printed binomial matches the atlas name ${match.localBotanicalName}.`;
  return `NCSU Hough plate ${match.plate} prints ${match.printedName} and labels its ${view} wood section.${synonym}`;
}

async function writeCandidate(filePath, buffer) {
  await writeFile(filePath, buffer, { flag: 'wx' });
  const metadata = await sharp(buffer).metadata();
  return {
    width: metadata.width,
    height: metadata.height,
    format: metadata.format === 'jpg' ? 'jpeg' : metadata.format,
    sha256: sha256(buffer),
  };
}

async function importFolder(result) {
  const currentManifest = JSON.parse(await readFile(result.folder.manifestPath, 'utf8'));
  if ((currentManifest.candidates ?? []).length > 0) {
    return { woodId: result.folder.woodId, skipped: 'manifest became nonempty' };
  }

  const directory = path.dirname(result.folder.manifestPath);
  const candidates = [];
  let candidateNumber = 1;
  for (const match of result.matches) {
    const plateBuffer = await fetchBuffer(match.imageUrl);
    const plateMetadata = await sharp(plateBuffer).metadata();
    if (!plateMetadata.width || !plateMetadata.height) {
      throw new Error(`Missing dimensions for Hough plate ${match.plate}`);
    }
    const crops = [
      ['radial', scaleCrop(referencePlate.radial, plateMetadata.width, plateMetadata.height)],
      [
        'tangential',
        scaleCrop(referencePlate.tangential, plateMetadata.width, plateMetadata.height),
      ],
    ];
    for (const [view, crop] of crops) {
      const buffer = await sharp(plateBuffer)
        .extract(crop)
        .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
        .toBuffer();
      const filename = `candidate-${String(candidateNumber).padStart(2, '0')}.jpg`;
      const metadata = await writeCandidate(path.join(directory, filename), buffer);
      candidates.push({
        filename,
        sourcePageUrl: houghIndexUrl,
        imageUrl: match.imageUrl,
        query: `"${result.folder.botanicalNames.join('" OR "')}" Hough radial tangential wood`,
        intendedViewHint: view,
        identityBasis: match.identityBasis,
        identityEvidence: identityEvidence(match, view),
        visualCheckNotes:
          `Native-resolution crop of the plate's explicitly labeled ${view} physical wood face. ` +
          'Pending final contact-sheet review; no upscaling was applied.',
        derivedCrop: crop,
        ...metadata,
        agent: 'root-hough',
        creator: 'Romeyn B. Hough; digitized by NCSU Libraries',
        license: 'Public-domain source publication (1888–1910)',
        licenseUrl: 'https://creativecommons.org/publicdomain/mark/1.0/',
        licenseStatus: 'verified-open',
        rightsNotes:
          'NCSU provides the reproduction for research access and asks users to credit the source and assess publication rights.',
        sourceRightsUrl: 'https://www.lib.ncsu.edu/scrc/copyright',
        taxonomicEvidenceUrl:
          match.identityBasis === 'documentedSynonym'
            ? (match.manualEvidenceUrl ?? `${gbifSpeciesUrl}${match.gbifMatch.usageKey}`)
            : null,
      });
      candidateNumber += 1;
    }

    const filename = `candidate-${String(candidateNumber).padStart(2, '0')}.jpg`;
    const metadata = await writeCandidate(path.join(directory, filename), plateBuffer);
    candidates.push({
      filename,
      sourcePageUrl: houghIndexUrl,
      imageUrl: match.imageUrl,
      query: `"${result.folder.botanicalNames.join('" OR "')}" Hough 600 dpi plate`,
      intendedViewHint: 'composite',
      identityBasis: match.identityBasis,
      identityEvidence:
        `NCSU Hough plate ${match.plate} prints ${match.printedName} and labels transverse, radial, and tangential physical wood sections.` +
        (match.identityBasis === 'documentedSynonym'
          ? ` ${match.manualEvidenceUrl ? 'Kew POWO documents' : 'GBIF maps'} the historical name as ${match.acceptedName}, matching ${match.localBotanicalName}.`
          : ''),
      visualCheckNotes:
        'Original 600-dpi NCSU plate retained for identity and crop verification. Pending final contact-sheet review.',
      ...metadata,
      agent: 'root-hough',
      creator: 'Romeyn B. Hough; digitized by NCSU Libraries',
      license: 'Public-domain source publication (1888–1910)',
      licenseUrl: 'https://creativecommons.org/publicdomain/mark/1.0/',
      licenseStatus: 'verified-open',
      rightsNotes:
        'NCSU provides the reproduction for research access and asks users to credit the source and assess publication rights.',
      sourceRightsUrl: 'https://www.lib.ncsu.edu/scrc/copyright',
      taxonomicEvidenceUrl:
        match.identityBasis === 'documentedSynonym'
          ? (match.manualEvidenceUrl ?? `${gbifSpeciesUrl}${match.gbifMatch.usageKey}`)
          : null,
    });
    candidateNumber += 1;
  }

  const manifest = {
    ...currentManifest,
    status: 'candidates-found',
    agent: 'root-hough',
    candidates,
    notes:
      'Hough candidates use the original 600-dpi plate plus native-resolution radial and tangential crops. Final visual contact-sheet review is required before selection.',
  };
  await writeFile(result.folder.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { woodId: result.folder.woodId, candidates: candidates.length };
}

async function main() {
  const [plates, folders] = await Promise.all([
    fetchText(houghIndexUrl).then(parseHoughPlates),
    readEmptyFolders(),
  ]);
  const resolved = await mapWithConcurrency(plates, 12, resolvePlateTaxonomy);
  const matches = matchPlatesToFolders(resolved, folders);

  console.log(
    `${plates.length} Hough plates; ${folders.length} empty folders; ${matches.length} matches`,
  );
  for (const result of matches) {
    console.log(
      `${result.folder.woodId}: ${result.matches
        .map((match) => `${match.plate} ${match.printedName} [${match.identityBasis}]`)
        .join('; ')}`,
    );
  }
  if (!applyChanges) {
    console.log('Dry run only. Pass --apply to download and write candidates.');
    return;
  }

  const imported = [];
  for (const result of matches) {
    imported.push(await importFolder(result));
  }
  const candidateCount = imported.reduce((sum, item) => sum + Number(item.candidates ?? 0), 0);
  console.log(
    `Imported ${candidateCount} candidates into ${
      imported.filter((item) => item.candidates).length
    } folders`,
  );
}

await main();
