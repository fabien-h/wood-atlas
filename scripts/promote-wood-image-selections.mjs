#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { access, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const candidateRoot = path.join(projectRoot, 'tmp', 'wood-image-candidates');
const manualImageRoot = path.join(projectRoot, 'data', 'manual', 'wood-images');
const manualImageManifestPath = path.join(projectRoot, 'data', 'manual', 'wood-images.json');
const databasePath = path.join(projectRoot, 'public', 'data', 'woods.generated.en.json');

const maximumSide = 800;
const jpegQuality = 90;
const applyChanges = process.argv.includes('--apply');
const selectionPattern = /^([12])\.(?:jpe?g|png)$/i;

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

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function orientedDimensions(metadata) {
  const swapsSides = [5, 6, 7, 8].includes(metadata.orientation ?? 1);
  return {
    width: swapsSides ? metadata.height : metadata.width,
    height: swapsSides ? metadata.width : metadata.height,
  };
}

function selectionKind(filename) {
  return filename.startsWith('1.') ? 'quarterSawn' : 'flatSawn';
}

function destinationFilename(kind) {
  return kind === 'quarterSawn' ? 'radial.jpg' : 'tangential.jpg';
}

function completeCredit(candidate) {
  const values = {
    sourceUrl: candidate?.sourcePageUrl,
    creator: candidate?.creator,
    license: candidate?.license,
    licenseUrl: candidate?.licenseUrl,
  };
  return Object.values(values).every((value) => typeof value === 'string' && value.trim())
    ? values
    : {};
}

async function discoverSelections(currentWoodIds, registeredKeys) {
  const entries = await readdir(candidateRoot, { withFileTypes: true });
  const folders = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const directory = path.join(candidateRoot, entry.name);
    const filenames = await readdir(directory);
    const selectedFilenames = filenames
      .filter((filename) => selectionPattern.test(filename))
      .sort();
    if (selectedFilenames.length === 0) continue;
    if (!currentWoodIds.has(entry.name)) {
      throw new Error(`Selected images target an unknown current wood: ${entry.name}`);
    }

    const byKind = new Map();
    for (const filename of selectedFilenames) {
      const kind = selectionKind(filename);
      if (byKind.has(kind)) {
        throw new Error(`${entry.name} contains multiple selected ${kind} images`);
      }
      if (registeredKeys.has(`${entry.name}|${kind}`)) {
        throw new Error(`${entry.name} already has a registered manual ${kind} image`);
      }
      byKind.set(kind, filename);
    }

    const candidateManifestPath = path.join(directory, 'candidates.json');
    const candidateManifest = (await pathExists(candidateManifestPath))
      ? JSON.parse(await readFile(candidateManifestPath, 'utf8'))
      : null;
    const destinationDirectory = path.join(manualImageRoot, entry.name);
    const selections = [];

    for (const [kind, filename] of byKind) {
      const sourcePath = path.join(directory, filename);
      const sourceBuffer = await readFile(sourcePath);
      const metadata = await sharp(sourceBuffer).metadata();
      const dimensions = orientedDimensions(metadata);
      if (!dimensions.width || !dimensions.height) {
        throw new Error(`${relativeToProject(sourcePath)} is not a readable image`);
      }
      const sourceHash = sha256(sourceBuffer);
      const matchedCandidate = (candidateManifest?.candidates ?? []).find(
        (candidate) => candidate.sha256 === sourceHash,
      );
      const outputPath = path.join(destinationDirectory, destinationFilename(kind));
      if (await pathExists(outputPath)) {
        throw new Error(
          `Manual image destination already exists: ${relativeToProject(outputPath)}`,
        );
      }
      selections.push({
        kind,
        filename,
        sourcePath,
        sourceHash,
        sourceWidth: dimensions.width,
        sourceHeight: dimensions.height,
        matchedCandidate,
        outputPath,
      });
    }

    folders.push({
      woodId: entry.name,
      directory,
      destinationDirectory,
      candidateManifest,
      selections,
    });
  }

  return folders.sort((left, right) => left.woodId.localeCompare(right.woodId));
}

async function normalizeSelection(selection) {
  const squareSide = Math.min(selection.sourceWidth, selection.sourceHeight);
  const outputSide = Math.min(squareSide, maximumSide);
  const temporaryPath = `${selection.outputPath}.promote-${process.pid}`;

  await sharp(selection.sourcePath)
    .autoOrient()
    .extract({
      left: Math.floor((selection.sourceWidth - squareSide) / 2),
      top: Math.floor((selection.sourceHeight - squareSide) / 2),
      width: squareSide,
      height: squareSide,
    })
    .resize(outputSide, outputSide, { fit: 'fill', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: jpegQuality, mozjpeg: true })
    .toFile(temporaryPath);
  await rename(temporaryPath, selection.outputPath);

  const metadata = await sharp(selection.outputPath).metadata();
  if (
    metadata.format !== 'jpeg' ||
    metadata.width !== outputSide ||
    metadata.height !== outputSide ||
    metadata.width > maximumSide
  ) {
    throw new Error(`Invalid promoted image: ${relativeToProject(selection.outputPath)}`);
  }
  return { width: metadata.width, height: metadata.height };
}

async function main() {
  const [database, manualImageManifest] = await Promise.all([
    readFile(databasePath, 'utf8').then(JSON.parse),
    readFile(manualImageManifestPath, 'utf8').then(JSON.parse),
  ]);
  const currentWoodIds = new Set(database.records.map((record) => record.id));
  const registeredKeys = new Set(
    manualImageManifest.images.map((image) => `${image.woodId}|${image.kind}`),
  );
  const folders = await discoverSelections(currentWoodIds, registeredKeys);
  const selectionCount = folders.reduce((total, folder) => total + folder.selections.length, 0);

  console.log(
    `${folders.length} selected wood folders with ${selectionCount} images ready for promotion.`,
  );
  if (folders.length === 0) return;
  if (!applyChanges) {
    for (const folder of folders) {
      console.log(
        `${folder.woodId}: ${folder.selections
          .map((selection) => `${selection.filename} -> ${destinationFilename(selection.kind)}`)
          .join(', ')}`,
      );
    }
    console.log('Dry run only. Pass --apply to promote the selected images.');
    return;
  }

  const newManifestEntries = [];
  for (const folder of folders) {
    await mkdir(folder.destinationDirectory, { recursive: true });
    const provenanceSelections = [];
    for (const selection of folder.selections) {
      const output = await normalizeSelection(selection);
      const sourceFile = `${folder.woodId}/${destinationFilename(selection.kind)}`;
      newManifestEntries.push({
        woodId: folder.woodId,
        kind: selection.kind,
        sourceFile,
        ...completeCredit(selection.matchedCandidate),
      });
      provenanceSelections.push({
        kind: selection.kind,
        selectedFilename: selection.filename,
        sourceSha256: selection.sourceHash,
        sourceWidth: selection.sourceWidth,
        sourceHeight: selection.sourceHeight,
        outputFile: destinationFilename(selection.kind),
        outputWidth: output.width,
        outputHeight: output.height,
        matchedCandidate: selection.matchedCandidate ?? null,
      });
    }
    await writeFile(
      path.join(folder.destinationDirectory, 'selection-provenance.json'),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          woodId: folder.woodId,
          selections: provenanceSelections,
        },
        null,
        2,
      )}\n`,
    );
  }

  manualImageManifest.images.push(...newManifestEntries);
  manualImageManifest.images.sort(
    (left, right) =>
      left.woodId.localeCompare(right.woodId) ||
      (left.kind === 'flatSawn' ? -1 : 1) - (right.kind === 'flatSawn' ? -1 : 1),
  );
  await writeFile(manualImageManifestPath, `${JSON.stringify(manualImageManifest, null, 2)}\n`);

  for (const folder of folders) {
    await rm(folder.directory, { recursive: true });
  }

  console.log(
    `Promoted ${selectionCount} images for ${folders.length} woods into ${relativeToProject(
      manualImageRoot,
    )}.`,
  );
}

await main();
