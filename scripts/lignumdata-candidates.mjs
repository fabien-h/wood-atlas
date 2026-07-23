#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const databasePath = path.join(projectRoot, 'public', 'data', 'woods.generated.en.json');
const candidateRoot = path.join(projectRoot, 'tmp', 'wood-image-candidates');
const catalogPath = path.join(projectRoot, 'tmp', 'lignumdata-catalog.json');
const reportPath = path.join(projectRoot, 'tmp', 'lignumdata-candidate-report.json');
const listingUrl = 'https://lignumdata.ch/system/holzarten?locale=en';
const originUrl = 'https://lignumdata.ch/?locale=en';
const imprintUrl = 'https://lignumdata.s3.eu-west-1.amazonaws.com/impressum_pdf/ImEN.pdf';
const requestConcurrency = 10;
const maximumCandidatesPerWood = 10;
const acceptedImageFormats = new Set(['avif', 'gif', 'jpeg', 'jpg', 'png', 'tiff', 'webp']);
const applyChanges = process.argv.includes('--apply');
const refreshCatalog = process.argv.includes('--refresh');

function relativeToProject(filePath) {
  return path.relative(projectRoot, filePath).split(path.sep).join('/');
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function htmlDecode(value) {
  return String(value ?? '')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&#x27;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&nbsp;', ' ');
}

function stripTags(value) {
  return htmlDecode(
    String(value ?? '')
      .replaceAll(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replaceAll(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replaceAll(/<[^>]+>/g, ' ')
      .replaceAll(/\s+/g, ' ')
      .trim(),
  );
}

function normalizedName(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .replaceAll(/[×]/g, ' x ')
    .replaceAll(/[^A-Za-z0-9-]+/g, ' ')
    .trim()
    .replaceAll(/\s+/g, ' ')
    .toLowerCase();
}

function isSearchableBotanicalName(value) {
  const normalized = normalizedName(value);
  return normalized && !/\b(?:sp|spp)\s*$/i.test(normalized);
}

function splitTradeNames(value) {
  return [
    ...new Set(
      String(value ?? '')
        .split(';')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function parseRemoteHtml(responseText) {
  const match = responseText.match(/\.html\(("(?:\\.|[^"\\])*")\);?\s*$/s);
  if (!match) return responseText;
  const encoded = match[1].slice(1, -1);
  return encoded.replace(
    /\\(?:u([0-9a-f]{4})|x([0-9a-f]{2})|([0-7]{1,3})|([\s\S]))/gi,
    (_escape, unicode, hexadecimal, octal, character) => {
      if (unicode) return String.fromCodePoint(Number.parseInt(unicode, 16));
      if (hexadecimal) return String.fromCodePoint(Number.parseInt(hexadecimal, 16));
      if (octal) return String.fromCodePoint(Number.parseInt(octal, 8));
      return (
        {
          b: '\b',
          f: '\f',
          n: '\n',
          r: '\r',
          t: '\t',
          v: '\v',
        }[character] ?? character
      );
    },
  );
}

function imageItemsFromBlock(block) {
  const items = [];
  for (const match of block.matchAll(/<div class="holzartimages-item">([\s\S]*?)<\/div>/gi)) {
    const item = match[1];
    const imageUrl = htmlDecode(item.match(/<img\b[^>]*\bsrc="([^"]+)"/i)?.[1]);
    if (!imageUrl || !imageUrl.includes('/img_files/holzarten/')) continue;
    const captionParts = [...item.matchAll(/<span class="holzart-info">([\s\S]*?)<\/span>/gi)]
      .map((part) => stripTags(part[1]))
      .filter(Boolean);
    items.push({
      imageUrl,
      caption: captionParts.join(', '),
      captionParts,
    });
  }
  return items;
}

function parseListingPage(responseText, pageUrl) {
  const html = parseRemoteHtml(responseText);
  const pageCount = Number(
    html.match(/Page\s*<b>\d+<\/b>\s*of\s*(\d+)/i)?.[1] ??
      html.match(/Page\s+\d+\s+of\s+(\d+)/i)?.[1] ??
      1,
  );
  const totalSpecies = Number(
    html.match(/There were\s*<b>(\d+)<\/b>\s*matching wood species/i)?.[1] ?? 0,
  );
  const table = html.match(/<table\b[^>]*id="searchresult-table"[^>]*>([\s\S]*?)<\/table>/i)?.[1];
  if (!table) return { pageCount, totalSpecies, entries: [] };

  const entries = [];
  const blocks = table.split(/<tr class="row-1">/i).slice(1);
  for (const block of blocks) {
    const scientificName = stripTags(
      block.match(
        /<h[34]\b[^>]*class="[^"]*holzart-scientific-name[^"]*"[^>]*>([\s\S]*?)<\/h[34]>/i,
      )?.[1],
    );
    if (!scientificName) continue;
    const firstCell = block.match(/<td\b[^>]*rowspan="3"[^>]*>([\s\S]*?)<\/td>/i)?.[1] ?? '';
    const tradeNameText = stripTags(
      firstCell.match(/<h3\b[^>]*class="[^"]*max-3-lines[^"]*"[^>]*>([\s\S]*?)<\/h3>/i)?.[1],
    );
    const detailPath = htmlDecode(
      block.match(
        /href="(\/system\/holzarten\/[A-F0-9-]{36}\?locale=en)"[^>]*>[\s\S]*?<span>Detail<\/span>/i,
      )?.[1] ?? block.match(/href="(\/system\/holzarten\/[A-F0-9-]{36}\?locale=en)"/i)?.[1],
    );
    const images = imageItemsFromBlock(block);
    entries.push({
      scientificName,
      normalizedScientificName: normalizedName(scientificName),
      tradeNames: splitTradeNames(tradeNameText),
      detailUrl: detailPath ? new URL(detailPath, originUrl).href : pageUrl,
      images,
    });
  }
  return { pageCount, totalSpecies, entries };
}

async function fetchWithRetries(url, options = {}) {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'User-Agent': 'WoodAtlasCandidateResearch/1.0 (+https://fabien-h.github.io/wood-atlas/)',
          ...options.headers,
        },
        signal: AbortSignal.timeout(45_000),
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
  throw new Error(`${url}: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

async function fetchListingPage(page) {
  const pageUrl = `${listingUrl}&page=${page}`;
  const response = await fetchWithRetries(pageUrl, {
    headers: {
      Accept: 'text/javascript, application/javascript, */*; q=0.01',
      'X-Requested-With': 'XMLHttpRequest',
    },
  });
  return parseListingPage(await response.text(), pageUrl);
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

async function buildCatalog() {
  if (!refreshCatalog && (await pathExists(catalogPath))) {
    const cached = JSON.parse(await readFile(catalogPath, 'utf8'));
    if (Array.isArray(cached.entries) && cached.entries.length > 0) {
      console.log(`Using ${relativeToProject(catalogPath)} (${cached.entries.length} species)`);
      return cached;
    }
  }

  const firstPage = await fetchListingPage(1);
  console.log(
    `Lignumdata reports ${firstPage.totalSpecies} species across ${firstPage.pageCount} pages`,
  );
  const remainingPages = Array.from(
    { length: Math.max(0, firstPage.pageCount - 1) },
    (_, index) => index + 2,
  );
  let finished = 1;
  const remaining = await mapWithConcurrency(remainingPages, requestConcurrency, async (page) => {
    const result = await fetchListingPage(page);
    finished += 1;
    if (finished % 20 === 0 || finished === firstPage.pageCount) {
      console.log(`Indexed ${finished}/${firstPage.pageCount} Lignumdata pages`);
    }
    return result;
  });
  const entries = [firstPage, ...remaining].flatMap((page) => page.entries);
  const catalog = {
    generatedAt: new Date().toISOString(),
    sourceUrl: listingUrl,
    reportedSpecies: firstPage.totalSpecies,
    pageCount: firstPage.pageCount,
    speciesWithWoodImages: entries.filter((entry) => entry.images.length > 0).length,
    woodImageCount: entries.reduce((sum, entry) => sum + entry.images.length, 0),
    entries,
  };
  await mkdir(path.dirname(catalogPath), { recursive: true });
  await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(
    `Wrote ${relativeToProject(catalogPath)}: ${entries.length} species, ` +
      `${catalog.speciesWithWoodImages} with ${catalog.woodImageCount} wood images`,
  );
  return catalog;
}

async function readMissingRecords() {
  const database = JSON.parse(await readFile(databasePath, 'utf8'));
  return database.records
    .filter((record) => (record.images ?? []).length === 0)
    .map((record) => ({
      woodId: record.id,
      displayName: record.identity.displayName,
      botanicalNames: record.identity.botanicalNames ?? [],
      aliases: record.identity.aliases ?? [],
      localNames: record.identity.localNames ?? [],
      region: record.origin?.region ?? null,
      continent: record.origin?.continent ?? null,
    }));
}

async function readCandidateManifest(record) {
  const manifestPath = path.join(candidateRoot, record.woodId, 'candidates.json');
  if (!(await pathExists(manifestPath))) {
    return { manifestPath, manifest: null };
  }
  return {
    manifestPath,
    manifest: JSON.parse(await readFile(manifestPath, 'utf8')),
  };
}

function matchCatalog(catalog, records) {
  const byScientificName = new Map();
  const byTradeName = new Map();
  for (const entry of catalog.entries) {
    if (!byScientificName.has(entry.normalizedScientificName)) {
      byScientificName.set(entry.normalizedScientificName, []);
    }
    byScientificName.get(entry.normalizedScientificName).push(entry);
    for (const tradeName of entry.tradeNames) {
      const key = normalizedName(tradeName);
      if (!key) continue;
      if (!byTradeName.has(key)) byTradeName.set(key, []);
      byTradeName.get(key).push(entry);
    }
  }

  return records.map((record) => {
    const scientificMatches = [];
    for (const botanical of record.botanicalNames) {
      if (!isSearchableBotanicalName(botanical.name)) continue;
      for (const entry of byScientificName.get(normalizedName(botanical.name)) ?? []) {
        scientificMatches.push({
          entry,
          localBotanicalName: botanical.name,
          identityBasis: botanical.isSynonym ? 'documentedSynonym' : 'exactBotanicalName',
        });
      }
    }

    const uniqueScientific = [];
    const seenDetails = new Set();
    for (const match of scientificMatches) {
      if (seenDetails.has(match.entry.detailUrl)) continue;
      seenDetails.add(match.entry.detailUrl);
      uniqueScientific.push(match);
    }

    const commonNames = [
      ...record.aliases,
      ...record.localNames.map((item) => item.name),
      record.displayName,
    ];
    const commonNameMatches = [];
    for (const commonName of commonNames) {
      const key = normalizedName(commonName);
      if (key.length < 4) continue;
      for (const entry of byTradeName.get(key) ?? []) {
        if (seenDetails.has(entry.detailUrl)) continue;
        commonNameMatches.push({
          commonName,
          catalogScientificName: entry.scientificName,
          detailUrl: entry.detailUrl,
          imageCount: entry.images.length,
        });
      }
    }

    return {
      record,
      scientificMatches: uniqueScientific,
      commonNameMatches: commonNameMatches.filter(
        (match, index, all) =>
          all.findIndex(
            (other) => other.commonName === match.commonName && other.detailUrl === match.detailUrl,
          ) === index,
      ),
    };
  });
}

function creatorFromImage(image) {
  const captionCreator = image.captionParts.find((part) => part.includes('©'));
  if (captionCreator) return captionCreator.replace(/^©\s*/, '').trim() || null;
  try {
    const filename = decodeURIComponent(
      new URL(image.imageUrl).pathname.split('/').pop(),
    ).replaceAll('+', ' ');
    const creator = filename.match(/©\s*([^./]+)(?:\.[A-Za-z0-9]+)?$/)?.[1];
    return creator?.trim() || null;
  } catch {
    return null;
  }
}

function intendedViewHint(image) {
  const evidence = normalizedName(`${image.caption} ${image.imageUrl}`);
  if (/\b(?:radial|rift|quarter sawn|quartersawn|radialschnitt)\b/.test(evidence)) {
    return 'radial';
  }
  if (
    /\b(?:tangential|flat sawn|flatsawn|plain sawn|plainsawn|tangentialschnitt)\b/.test(evidence)
  ) {
    return 'tangential';
  }
  return 'unknown';
}

function extensionForFormat(format) {
  if (format === 'jpeg' || format === 'jpg') return 'jpg';
  if (format === 'tiff') return 'tif';
  return format;
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function existingCandidateHashes() {
  const hashes = new Set();
  if (!(await pathExists(candidateRoot))) return hashes;
  const entries = await readdir(candidateRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(candidateRoot, entry.name, 'candidates.json');
    if (!(await pathExists(manifestPath))) continue;
    try {
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      for (const candidate of manifest.candidates ?? []) {
        if (candidate.sha256) hashes.add(candidate.sha256);
      }
    } catch {
      // The regular candidate audit reports malformed manifests.
    }
  }
  return hashes;
}

async function currentLignumdataCandidateState(records) {
  let speciesWithCandidates = 0;
  let candidateCount = 0;
  for (const record of records) {
    const { manifest } = await readCandidateManifest(record);
    const candidates = (manifest?.candidates ?? []).filter(
      (candidate) => candidate.agent === 'root-lignumdata',
    );
    if (candidates.length > 0) speciesWithCandidates += 1;
    candidateCount += candidates.length;
  }
  return { speciesWithCandidates, candidateCount };
}

async function downloadImageCandidate(image) {
  const response = await fetchWithRetries(image.imageUrl);
  const buffer = Buffer.from(await response.arrayBuffer());
  const metadata = await sharp(buffer, { animated: false }).metadata();
  const format = metadata.format === 'jpg' ? 'jpeg' : metadata.format;
  if (!format || !acceptedImageFormats.has(format) || !metadata.width || !metadata.height) {
    throw new Error(`Unsupported or dimensionless image (${format ?? 'unknown'})`);
  }
  return {
    image,
    buffer,
    format,
    width: metadata.width,
    height: metadata.height,
    sha256: sha256(buffer),
  };
}

function candidateScore(candidate) {
  const preferredSize = Math.min(candidate.width, candidate.height) >= 800 ? 1 : 0;
  const viewEvidence = intendedViewHint(candidate.image) === 'unknown' ? 0 : 1;
  return preferredSize * 1e15 + viewEvidence * 1e14 + candidate.width * candidate.height;
}

async function importScientificMatch(matchResult, knownHashes) {
  const { manifestPath, manifest } = await readCandidateManifest(matchResult.record);
  if (!manifest) {
    return { woodId: matchResult.record.woodId, skipped: 'missing candidate manifest' };
  }
  if ((manifest.candidates ?? []).length > 0) {
    return { woodId: matchResult.record.woodId, skipped: 'candidate folder is not empty' };
  }

  const possibleImages = [];
  const failures = [];
  const seenUrls = new Set();
  for (const match of matchResult.scientificMatches) {
    for (const image of match.entry.images) {
      if (seenUrls.has(image.imageUrl)) continue;
      seenUrls.add(image.imageUrl);
      try {
        possibleImages.push({
          ...(await downloadImageCandidate(image)),
          match,
        });
      } catch (error) {
        failures.push({
          sourcePageUrl: match.entry.detailUrl,
          imageUrl: image.imageUrl,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  possibleImages.sort((left, right) => candidateScore(right) - candidateScore(left));
  const selected = [];
  for (const candidate of possibleImages) {
    if (knownHashes.has(candidate.sha256)) {
      failures.push({
        sourcePageUrl: candidate.match.entry.detailUrl,
        imageUrl: candidate.image.imageUrl,
        reason: 'Exact duplicate of an existing research candidate',
      });
      continue;
    }
    knownHashes.add(candidate.sha256);
    selected.push(candidate);
    if (selected.length >= maximumCandidatesPerWood) break;
  }

  if (selected.length === 0) {
    return {
      woodId: matchResult.record.woodId,
      candidates: 0,
      failures,
      skipped: 'no unique downloadable Lignumdata wood images',
    };
  }

  const directory = path.dirname(manifestPath);
  await mkdir(directory, { recursive: true });
  const candidates = [];
  for (const [index, selectedCandidate] of selected.entries()) {
    const filename = `candidate-${String(index + 1).padStart(2, '0')}.${extensionForFormat(
      selectedCandidate.format,
    )}`;
    await writeFile(path.join(directory, filename), selectedCandidate.buffer, { flag: 'wx' });
    const creator = creatorFromImage(selectedCandidate.image);
    candidates.push({
      filename,
      sourcePageUrl: selectedCandidate.match.entry.detailUrl,
      imageUrl: selectedCandidate.image.imageUrl,
      query: `"${selectedCandidate.match.localBotanicalName}" wood site:lignumdata.ch`,
      intendedViewHint: intendedViewHint(selectedCandidate.image),
      identityBasis: selectedCandidate.match.identityBasis,
      identityEvidence:
        `Lignumdata lists this file in the Wood image group for ` +
        `${selectedCandidate.match.entry.scientificName}; the atlas botanical name ` +
        `${selectedCandidate.match.localBotanicalName} matches that catalogue entry exactly.`,
      visualCheckNotes:
        'Lignumdata categorizes this as a wood image. Native-resolution visual review is still required before selection.',
      width: selectedCandidate.width,
      height: selectedCandidate.height,
      format: selectedCandidate.format,
      sha256: selectedCandidate.sha256,
      agent: 'root-lignumdata',
      creator,
      license: 'All-rights-reserved; advance written permission required',
      licenseUrl: null,
      licenseStatus: 'restricted-pending-permission',
      rightsNotes:
        'Lignumdata’s imprint requires advance written permission from the copyright holder to reproduce site images. Keep this as a private review candidate only; do not publish, crop, or redistribute it without permission.',
      sourceRightsUrl: imprintUrl,
      sourceCaption: selectedCandidate.image.caption || null,
    });
  }

  await writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        ...manifest,
        status: 'candidates-found',
        agent: 'root-lignumdata',
        candidates,
        failures: [...(manifest.failures ?? []), ...failures],
        notes:
          'Exact scientific-name matches from Lignumdata’s Wood image group. Candidates remain unapproved and require final visual and rights review.',
      },
      null,
      2,
    )}\n`,
  );
  return {
    woodId: matchResult.record.woodId,
    candidates: candidates.length,
    failures,
  };
}

async function main() {
  const [catalog, records] = await Promise.all([buildCatalog(), readMissingRecords()]);
  const matches = matchCatalog(catalog, records);
  const exactMatches = matches.filter((result) =>
    result.scientificMatches.some((match) => match.entry.images.length),
  );
  const scientificWithoutImages = matches.filter(
    (result) =>
      result.scientificMatches.length > 0 &&
      !result.scientificMatches.some((match) => match.entry.images.length),
  );
  const commonNameOnly = matches.filter(
    (result) => result.scientificMatches.length === 0 && result.commonNameMatches.length > 0,
  );
  const unmatched = matches.filter(
    (result) => result.scientificMatches.length === 0 && result.commonNameMatches.length === 0,
  );
  const report = {
    generatedAt: new Date().toISOString(),
    catalog: relativeToProject(catalogPath),
    missingWoodCount: records.length,
    exactScientificMatchesWithWoodImages: exactMatches.length,
    scientificMatchesWithoutWoodImages: scientificWithoutImages.length,
    commonNameOnlyPotentialMatchCount: commonNameOnly.length,
    unmatched: unmatched.length,
    exactMatches: exactMatches.map((result) => ({
      woodId: result.record.woodId,
      displayName: result.record.displayName,
      localBotanicalNames: result.record.botanicalNames.map((item) => item.name),
      entries: result.scientificMatches.map((match) => ({
        scientificName: match.entry.scientificName,
        detailUrl: match.entry.detailUrl,
        woodImageCount: match.entry.images.length,
        identityBasis: match.identityBasis,
      })),
    })),
    commonNameOnlyPotentialMatches: commonNameOnly.map((result) => ({
      woodId: result.record.woodId,
      displayName: result.record.displayName,
      botanicalNames: result.record.botanicalNames.map((item) => item.name),
      matches: result.commonNameMatches,
    })),
    unmatched: unmatched.map((result) => ({
      woodId: result.record.woodId,
      displayName: result.record.displayName,
      botanicalNames: result.record.botanicalNames.map((item) => item.name),
      aliases: result.record.aliases,
      localNames: result.record.localNames,
      region: result.record.region,
      continent: result.record.continent,
    })),
    currentLignumdataCandidates: await currentLignumdataCandidateState(records),
  };

  console.log(
    `${records.length} zero-image woods: ${exactMatches.length} exact scientific Lignumdata matches with wood images, ` +
      `${scientificWithoutImages.length} exact entries without wood images, ` +
      `${commonNameOnly.length} common-name-only leads, ${unmatched.length} unmatched`,
  );

  if (!applyChanges) {
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Wrote ${relativeToProject(reportPath)}`);
    console.log('Dry run only. Pass --apply to download exact scientific-name candidates.');
    return;
  }

  const hashes = await existingCandidateHashes();
  const imported = [];
  for (const [index, result] of exactMatches.entries()) {
    imported.push(await importScientificMatch(result, hashes));
    if ((index + 1) % 20 === 0 || index + 1 === exactMatches.length) {
      console.log(`Processed ${index + 1}/${exactMatches.length} exact Lignumdata matches`);
    }
  }
  report.import = {
    importedAt: new Date().toISOString(),
    speciesWithNewCandidates: imported.filter((item) => item.candidates > 0).length,
    newCandidateCount: imported.reduce((sum, item) => sum + Number(item.candidates ?? 0), 0),
    results: imported,
  };
  report.currentLignumdataCandidates = await currentLignumdataCandidateState(records);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    `Imported ${report.import.newCandidateCount} candidates for ` +
      `${report.import.speciesWithNewCandidates} woods`,
  );
  console.log(`Wrote ${relativeToProject(reportPath)}`);
}

await main();
