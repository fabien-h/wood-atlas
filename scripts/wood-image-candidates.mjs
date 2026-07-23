import { createHash } from 'node:crypto';
import { access, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const databasePath = path.join(projectRoot, 'public', 'data', 'woods.generated.en.json');
const candidateRoot = path.join(projectRoot, 'tmp', 'wood-image-candidates');
const inventoryPath = path.join(candidateRoot, 'inventory.json');
const auditPath = path.join(candidateRoot, 'audit.json');
const reviewPath = path.join(candidateRoot, 'review.html');
const instructionsPath = path.join(candidateRoot, 'README.md');
const imageExtensions = new Set([
  '.avif',
  '.gif',
  '.jpeg',
  '.jpg',
  '.png',
  '.tif',
  '.tiff',
  '.webp',
]);
const minimumSide = 250;
const preferredSide = 800;

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

function imageKinds(record) {
  return new Set((record.images ?? []).map((image) => image.kind));
}

function missingKinds(record) {
  const kinds = imageKinds(record);
  return [
    ...(kinds.has('quarterSawn') ? [] : ['radial']),
    ...(kinds.has('flatSawn') ? [] : ['tangential']),
  ];
}

function botanicalNames(record) {
  return (record.identity?.botanicalNames ?? []).map((item) => item.name?.trim()).filter(Boolean);
}

function searchQueries(record, missing) {
  const botanical = botanicalNames(record)[0] ?? record.identity.displayName;
  const queries = [
    `site:commons.wikimedia.org "${botanical}" wood`,
    `site:commons.wikimedia.org "${botanical}" timber`,
    `site:commons.wikimedia.org "${botanical}" Holz`,
    `site:commons.wikimedia.org/wiki/Category "${botanical}" "(wood)"`,
    `site:commons.wikimedia.org/wiki/File "${botanical}" sections wood`,
    `site:commons.wikimedia.org/wiki/File "${botanical}" "The American Woods"`,
    `site:wikipedia.org "${botanical}" wood`,
    `site:lib.ncsu.edu/specialcollections/forestry/hough "${botanical}"`,
    `"${botanical}" wood grain`,
    `"${botanical}" "wood specimen"`,
    `"${botanical}" xylarium`,
    `"${botanical}" timber board`,
    `"${botanical}" wood macroscopic`,
  ];

  if (missing.includes('radial')) {
    queries.push(
      `"${botanical}" wood radial section`,
      `"${botanical}" "radial longitudinal section" wood`,
      `"${botanical}" RLS wood anatomy`,
      `"${botanical}" quarter sawn wood`,
      `"${botanical}" rift sawn wood`,
      `"${botanical}" madeira "seção longitudinal radial"`,
      `"${botanical}" madeira "corte radial"`,
      `"${botanical}" bois "section longitudinale radiale"`,
      `"${botanical}" bois "débit sur quartier"`,
    );
  }
  if (missing.includes('tangential')) {
    queries.push(
      `"${botanical}" wood tangential section`,
      `"${botanical}" "tangential longitudinal section" wood`,
      `"${botanical}" TLS wood anatomy`,
      `"${botanical}" flat sawn wood`,
      `"${botanical}" plain sawn wood`,
      `"${botanical}" madeira "seção longitudinal tangencial"`,
      `"${botanical}" madeira "corte tangencial"`,
      `"${botanical}" bois "section longitudinale tangentielle"`,
      `"${botanical}" bois "débit sur dosse"`,
    );
  }

  return queries;
}

async function loadDatabase() {
  const database = JSON.parse(await readFile(databasePath, 'utf8'));
  if (!database || !Array.isArray(database.records)) {
    throw new Error(`${relativeToProject(databasePath)} must contain a records array`);
  }
  return database;
}

async function buildInventory() {
  const database = await loadDatabase();
  const records = database.records
    .map((record) => {
      if ((record.images ?? []).length > 0) return null;
      const missing = missingKinds(record);
      return {
        woodId: record.id,
        displayName: record.identity.displayName,
        primaryName: record.identity.primaryName,
        botanicalNames: botanicalNames(record),
        aliases: record.identity.aliases ?? [],
        family: record.identity.family ?? null,
        region: record.origin?.region ?? null,
        continent: record.origin?.continent ?? null,
        countries: record.origin?.countries ?? [],
        sourceKind: record.source?.kind ?? null,
        missingKinds: missing,
        searchQueries: searchQueries(record, missing),
      };
    })
    .filter(Boolean);

  const inventory = {
    generatedAt: new Date().toISOString(),
    database: relativeToProject(databasePath),
    candidateRoot: relativeToProject(candidateRoot),
    totalWoodRecords: database.records.length,
    missingAtLeastOneView: records.length,
    missingBothViews: records.filter((record) => record.missingKinds.length === 2).length,
    missingRadialOnly: records.filter(
      (record) => record.missingKinds.length === 1 && record.missingKinds[0] === 'radial',
    ).length,
    missingTangentialOnly: records.filter(
      (record) => record.missingKinds.length === 1 && record.missingKinds[0] === 'tangential',
    ).length,
    candidatePolicy: {
      eligibility:
        'Create a candidate folder only when the wood has no published images of any kind.',
      requiredSubject:
        'An exposed sawn wood face, wood specimen, veneer sheet, or anatomical longitudinal wood surface with visible grain.',
      reject:
        'Trees, leaves, flowers, fruit, bark-only images, external log surfaces, furniture, flooring, generic textures, diagrams, and microscopic slides.',
      visualVerification:
        'Every downloaded file must be opened and inspected; filenames, alt text, and search snippets are not sufficient.',
      identityVerification:
        'The source page or caption must explicitly associate the wood image with the requested botanical name or a documented synonym; visual similarity alone is not species identification.',
      viewClassification:
        'Use radial or tangential only when the source caption or visible section evidence supports it. Use composite for a labeled plate containing multiple views; otherwise use unknown.',
      publicationRights:
        'A search result does not grant reuse rights. Record the source and license, and verify rights before publication.',
      resolution:
        'Prefer the original full-resolution file with at least 800 pixels on both axes. Smaller exact specimens are acceptable when no better source exists.',
      sourcePriority: [
        'Wikimedia Commons or Wikipedia file pages with structured attribution',
        'NCSU Libraries 600-dpi plates from Romeyn B. Hough’s public-domain The American Woods',
        'Institutional xylaria, universities, museums, and forestry agencies with explicit reuse terms',
        'Other visually valid sources, retained only as review candidates with licenseStatus unknown',
      ],
    },
    records,
  };

  await mkdir(candidateRoot, { recursive: true });
  await writeFile(inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`);
  await writeFile(instructionsPath, renderInstructions());
  const removedManifestCount = await removeIneligibleCandidateDirectories(
    new Set(records.map((record) => record.woodId)),
  );
  const initializedManifestCount = await initializeEmptyManifests(records);
  console.log(
    `Inventory: ${records.length} woods (${inventory.missingBothViews} both, ` +
      `${inventory.missingRadialOnly} radial only, ${inventory.missingTangentialOnly} tangential only)`,
  );
  console.log(`Wrote ${relativeToProject(inventoryPath)}`);
  console.log(`Wrote ${relativeToProject(instructionsPath)}`);
  console.log(`Removed ${removedManifestCount} ineligible candidate folder(s)`);
  console.log(`Initialized ${initializedManifestCount} empty candidate manifest(s)`);
}

async function removeIneligibleCandidateDirectories(eligibleWoodIds) {
  const entries = await readdir(candidateRoot, { withFileTypes: true });
  let removedCount = 0;

  for (const entry of entries) {
    if (!entry.isDirectory() || eligibleWoodIds.has(entry.name)) continue;
    const directory = path.join(candidateRoot, entry.name);
    if (path.dirname(directory) !== candidateRoot) {
      throw new Error(`Unsafe candidate directory: ${directory}`);
    }
    await rm(directory, { recursive: true });
    removedCount += 1;
  }

  return removedCount;
}

async function initializeEmptyManifests(records) {
  let initializedCount = 0;

  for (const record of records) {
    const speciesDirectory = path.join(candidateRoot, record.woodId);
    const manifestPath = path.join(speciesDirectory, 'candidates.json');
    await mkdir(speciesDirectory, { recursive: true });
    if (await pathExists(manifestPath)) continue;

    const manifest = {
      woodId: record.woodId,
      displayName: record.displayName,
      botanicalNames: record.botanicalNames,
      missingKinds: record.missingKinds,
      status: 'unsearched',
      agent: null,
      candidates: [],
      failures: [],
      notes: 'No candidate search has been completed for this wood yet.',
    };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    initializedCount += 1;
  }

  return initializedCount;
}

function renderInstructions() {
  return `# Wood image candidate review

This directory contains research candidates only. Nothing here is automatically published.
Candidate folders exist only for woods that currently have no published image of any kind.

1. Open \`review.html\` for a gallery with species identity evidence, visual-check notes, source links, view hints, dimensions, and license status.
2. Open any promising file at 100% before choosing it. Prefer files at least 800×800, but a smaller exact specimen can be kept when no better original exists.
3. Delete rejected files from the species folder.
4. Rename the one selected radial image to \`radial.<extension>\` and the one selected tangential image to \`tangential.<extension>\`. Keep at most one of each per folder.
5. Leave \`candidates.json\` in place. Its hashes let the later import script recover provenance after a candidate is renamed.
6. A candidate with \`licenseStatus: "unknown"\` still needs permission or a verified reuse license before it can be published.

When review is complete, the import step will crop, resize, compress, register attribution, and generate the atlas assets. It must not enlarge a source silently; undersized selections will be reported for a processing decision.
`;
}

async function sha256(filePath) {
  return createHash('sha256')
    .update(await readFile(filePath))
    .digest('hex');
}

function htmlEscape(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function fileUrlPath(value) {
  return value
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function isHttpUrl(value) {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

async function readCandidateManifests() {
  if (!(await pathExists(candidateRoot))) return [];
  const entries = await readdir(candidateRoot, { withFileTypes: true });
  const manifests = [];

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(candidateRoot, entry.name, 'candidates.json');
    if (!(await pathExists(manifestPath))) continue;
    try {
      manifests.push({
        directoryName: entry.name,
        manifestPath,
        manifest: JSON.parse(await readFile(manifestPath, 'utf8')),
      });
    } catch (error) {
      manifests.push({
        directoryName: entry.name,
        manifestPath,
        manifest: null,
        parseError: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return manifests;
}

async function auditCandidates() {
  if (!(await pathExists(inventoryPath))) await buildInventory();
  const inventory = JSON.parse(await readFile(inventoryPath, 'utf8'));
  const inventoryById = new Map(inventory.records.map((record) => [record.woodId, record]));
  const manifestEntries = await readCandidateManifests();
  const issues = [];
  const candidates = [];
  const hashes = new Map();

  for (const entry of manifestEntries) {
    const manifestLabel = relativeToProject(entry.manifestPath);
    if (entry.parseError) {
      issues.push({ level: 'error', manifest: manifestLabel, message: entry.parseError });
      continue;
    }
    const manifest = entry.manifest;
    if (!manifest || typeof manifest !== 'object') {
      issues.push({
        level: 'error',
        manifest: manifestLabel,
        message: 'Manifest is not an object',
      });
      continue;
    }
    if (manifest.woodId !== entry.directoryName) {
      issues.push({
        level: 'error',
        manifest: manifestLabel,
        message: `woodId must match directory name ${entry.directoryName}`,
      });
    }
    if (!inventoryById.has(manifest.woodId)) {
      issues.push({
        level: 'error',
        manifest: manifestLabel,
        message: `${manifest.woodId ?? '(missing woodId)'} is not in the missing-image inventory`,
      });
    }
    if (!Array.isArray(manifest.candidates)) {
      issues.push({
        level: 'error',
        manifest: manifestLabel,
        message: 'Manifest must contain a candidates array',
      });
      continue;
    }

    for (const [index, candidate] of manifest.candidates.entries()) {
      const label = `${manifest.woodId ?? entry.directoryName} candidate ${index + 1}`;
      if (!candidate || typeof candidate !== 'object') {
        issues.push({ level: 'error', manifest: manifestLabel, message: `${label} is invalid` });
        continue;
      }
      if (typeof candidate.filename !== 'string' || !candidate.filename.trim()) {
        issues.push({
          level: 'error',
          manifest: manifestLabel,
          message: `${label} is missing filename`,
        });
        continue;
      }
      if (path.basename(candidate.filename) !== candidate.filename) {
        issues.push({
          level: 'error',
          manifest: manifestLabel,
          message: `${label} filename must not contain a path`,
        });
        continue;
      }
      if (!imageExtensions.has(path.extname(candidate.filename).toLowerCase())) {
        issues.push({
          level: 'error',
          manifest: manifestLabel,
          message: `${label} has an unsupported extension`,
        });
      }
      if (!isHttpUrl(candidate.sourcePageUrl)) {
        issues.push({
          level: 'error',
          manifest: manifestLabel,
          message: `${label} is missing a valid HTTP(S) sourcePageUrl`,
        });
      }
      if (!isHttpUrl(candidate.imageUrl)) {
        issues.push({
          level: 'error',
          manifest: manifestLabel,
          message: `${label} is missing a valid HTTP(S) imageUrl`,
        });
      }
      if (candidate.licenseUrl != null && !isHttpUrl(candidate.licenseUrl)) {
        issues.push({
          level: 'error',
          manifest: manifestLabel,
          message: `${label} has an invalid licenseUrl`,
        });
      }
      if (typeof candidate.query !== 'string' || !candidate.query.trim()) {
        issues.push({
          level: 'error',
          manifest: manifestLabel,
          message: `${label} is missing the exact search query`,
        });
      }
      if (!['radial', 'tangential', 'composite', 'unknown'].includes(candidate.intendedViewHint)) {
        issues.push({
          level: 'error',
          manifest: manifestLabel,
          message: `${label} has an invalid intendedViewHint`,
        });
      }
      if (
        typeof candidate.visualCheckNotes !== 'string' ||
        candidate.visualCheckNotes.trim().length < 12
      ) {
        issues.push({
          level: 'error',
          manifest: manifestLabel,
          message: `${label} needs a concrete visualCheckNotes value`,
        });
      }
      if (
        !['exactBotanicalName', 'documentedSynonym', 'genusOnly', 'commonNameOnly'].includes(
          candidate.identityBasis,
        )
      ) {
        issues.push({
          level: 'error',
          manifest: manifestLabel,
          message: `${label} has an invalid identityBasis`,
        });
      }
      if (
        typeof candidate.identityEvidence !== 'string' ||
        candidate.identityEvidence.trim().length < 12
      ) {
        issues.push({
          level: 'error',
          manifest: manifestLabel,
          message: `${label} needs concrete identityEvidence from its source page or caption`,
        });
      }
      const inventoryRecord = inventoryById.get(manifest.woodId);
      const isGenusRecord = (inventoryRecord?.botanicalNames ?? []).some((name) =>
        /\bsp(?:p)?\.?$/i.test(name),
      );
      if (candidate.identityBasis === 'commonNameOnly') {
        issues.push({
          level: 'warning',
          manifest: manifestLabel,
          message: `${label} is supported only by a common name and needs extra identity review`,
        });
      } else if (candidate.identityBasis === 'genusOnly' && !isGenusRecord) {
        issues.push({
          level: 'warning',
          manifest: manifestLabel,
          message: `${label} has only genus-level evidence for a species-level atlas record`,
        });
      }

      const filePath = path.join(candidateRoot, entry.directoryName, candidate.filename);
      if (!(await pathExists(filePath))) {
        issues.push({
          level: 'error',
          manifest: manifestLabel,
          message: `${label} file does not exist`,
        });
        continue;
      }

      try {
        const metadata = await sharp(filePath, { animated: false }).metadata();
        const width = metadata.width ?? 0;
        const height = metadata.height ?? 0;
        if (width < minimumSide || height < minimumSide) {
          issues.push({
            level: 'warning',
            manifest: manifestLabel,
            message: `${label} is only ${width}×${height}; prefer at least ${minimumSide}px on both sides`,
          });
        } else if (width < preferredSide || height < preferredSide) {
          issues.push({
            level: 'notice',
            manifest: manifestLabel,
            message: `${label} is ${width}×${height}, below the preferred ${preferredSide}×${preferredSide} source size`,
          });
        }
        const hash = await sha256(filePath);
        if (candidate.sha256 !== hash) {
          issues.push({
            level: 'error',
            manifest: manifestLabel,
            message: `${label} recorded SHA-256 does not match the file`,
          });
        }
        if (candidate.width !== width || candidate.height !== height) {
          issues.push({
            level: 'error',
            manifest: manifestLabel,
            message: `${label} recorded dimensions do not match ${width}×${height}`,
          });
        }
        if (
          typeof candidate.format !== 'string' ||
          ![metadata.format, metadata.format === 'jpeg' ? 'jpg' : metadata.format].includes(
            candidate.format.toLowerCase(),
          )
        ) {
          issues.push({
            level: 'error',
            manifest: manifestLabel,
            message: `${label} recorded format does not match ${metadata.format ?? 'unknown'}`,
          });
        }
        const duplicate = hashes.get(hash);
        if (duplicate) {
          issues.push({
            level: 'error',
            manifest: manifestLabel,
            message: `${label} exactly duplicates ${duplicate}`,
          });
        } else {
          hashes.set(hash, label);
        }
        candidates.push({
          woodId: manifest.woodId,
          displayName: manifest.displayName ?? inventoryById.get(manifest.woodId)?.displayName,
          botanicalNames:
            manifest.botanicalNames ?? inventoryById.get(manifest.woodId)?.botanicalNames ?? [],
          manifest: manifestLabel,
          filename: candidate.filename,
          file: relativeToProject(filePath),
          width,
          height,
          format: metadata.format ?? null,
          sha256: hash,
          intendedViewHint: candidate.intendedViewHint,
          visualCheckNotes: candidate.visualCheckNotes,
          identityBasis: candidate.identityBasis,
          identityEvidence: candidate.identityEvidence,
          sourcePageUrl: candidate.sourcePageUrl,
          imageUrl: candidate.imageUrl,
          query: candidate.query,
          creator: candidate.creator ?? null,
          license: candidate.license ?? null,
          licenseUrl: candidate.licenseUrl ?? null,
          licenseStatus: candidate.licenseStatus ?? 'unknown',
          agent: candidate.agent ?? manifest.agent ?? null,
        });
      } catch (error) {
        issues.push({
          level: 'error',
          manifest: manifestLabel,
          message: `${label} is unreadable: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }
  }

  const auditedAt = new Date().toISOString();
  const result = {
    auditedAt,
    inventory: relativeToProject(inventoryPath),
    manifestCount: manifestEntries.length,
    speciesWithCandidates: new Set(candidates.map((candidate) => candidate.woodId)).size,
    candidateCount: candidates.length,
    errorCount: issues.filter((issue) => issue.level === 'error').length,
    warningCount: issues.filter((issue) => issue.level === 'warning').length,
    noticeCount: issues.filter((issue) => issue.level === 'notice').length,
    issues,
    candidates,
  };

  await writeFile(auditPath, `${JSON.stringify(result, null, 2)}\n`);
  await writeFile(reviewPath, renderReviewPage(result, inventoryById));
  console.log(
    `Audit: ${result.candidateCount} candidates for ${result.speciesWithCandidates} woods; ` +
      `${result.errorCount} errors, ${result.warningCount} warnings, ${result.noticeCount} notices`,
  );
  console.log(`Wrote ${relativeToProject(auditPath)}`);
  console.log(`Wrote ${relativeToProject(reviewPath)}`);
  if (result.errorCount > 0) process.exitCode = 1;
}

function renderReviewPage(result, inventoryById) {
  const byWood = new Map();
  for (const candidate of result.candidates) {
    const group = byWood.get(candidate.woodId) ?? [];
    group.push(candidate);
    byWood.set(candidate.woodId, group);
  }

  const species = [...byWood.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([woodId, candidates]) => {
      const inventory = inventoryById.get(woodId);
      const cards = candidates
        .map(
          (candidate) => `
            <article class="candidate">
              <a class="image-link" href="${fileUrlPath(
                path.relative(candidateRoot, path.join(projectRoot, candidate.file)),
              )}" target="_blank">
                <img src="${fileUrlPath(
                  path.relative(candidateRoot, path.join(projectRoot, candidate.file)),
                )}" alt="${htmlEscape(`${candidate.displayName} ${candidate.intendedViewHint} candidate`)}">
              </a>
              <div class="candidate-body">
                <p><strong>${htmlEscape(candidate.filename)}</strong> · ${htmlEscape(
                  candidate.intendedViewHint,
                )} · ${candidate.width}×${candidate.height}</p>
                <p>${htmlEscape(candidate.visualCheckNotes)}</p>
                <p class="metadata">Identity (${htmlEscape(
                  candidate.identityBasis,
                )}): ${htmlEscape(candidate.identityEvidence)}</p>
                <p class="metadata">Query: ${htmlEscape(candidate.query)}</p>
                <p class="metadata">License: ${htmlEscape(
                  candidate.license ?? candidate.licenseStatus,
                )}</p>
                <p><a href="${htmlEscape(candidate.sourcePageUrl)}" target="_blank" rel="noreferrer">Source page</a> ·
                  <a href="${htmlEscape(candidate.imageUrl)}" target="_blank" rel="noreferrer">Direct image</a></p>
              </div>
            </article>`,
        )
        .join('');
      return `
        <section>
          <h2>${htmlEscape(candidates[0]?.displayName ?? woodId)}</h2>
          <p class="species-meta"><code>${htmlEscape(woodId)}</code> · ${htmlEscape(
            (candidates[0]?.botanicalNames ?? []).join(', '),
          )} · missing ${htmlEscape((inventory?.missingKinds ?? []).join(' + '))}</p>
          <div class="grid">${cards}</div>
        </section>`;
    })
    .join('');

  const issues = result.issues.length
    ? `<details><summary>${result.issues.length} audit issue(s)</summary><pre>${htmlEscape(
        JSON.stringify(result.issues, null, 2),
      )}</pre></details>`
    : '<p class="ok">No structural audit issues.</p>';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Wood image candidate review</title>
    <style>
      :root { color-scheme: light dark; font: 15px/1.45 system-ui, sans-serif; }
      body { max-width: 1500px; margin: 0 auto; padding: 24px; }
      h1 { margin-bottom: 4px; }
      section { border-top: 1px solid #8886; margin-top: 32px; padding-top: 16px; }
      h2 { margin-bottom: 2px; }
      .species-meta, .metadata { color: #777; }
      .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 18px; }
      .candidate { border: 1px solid #8886; border-radius: 8px; overflow: hidden; }
      .image-link { display: grid; place-items: center; height: 290px; background: #8882; }
      img { display: block; width: 100%; height: 100%; object-fit: contain; }
      .candidate-body { padding: 12px; }
      .candidate-body p { margin: 0 0 8px; }
      .ok { color: #198754; }
      pre { white-space: pre-wrap; overflow-wrap: anywhere; }
    </style>
  </head>
  <body>
    <h1>Wood image candidate review</h1>
    <p>${result.candidateCount} visually checked candidate(s) for ${result.speciesWithCandidates} wood(s). Generated ${htmlEscape(
      result.auditedAt,
    )}.</p>
    <p>These are research candidates, not approved publication assets. A search result does not grant reuse rights; check the recorded source and license before import.</p>
    ${issues}
    ${species || '<p>No candidate manifests found yet.</p>'}
  </body>
</html>
`;
}

const command = process.argv[2] ?? 'audit';
if (command === 'inventory') {
  await buildInventory();
} else if (command === 'audit') {
  await auditCandidates();
} else {
  console.error('Usage: node scripts/wood-image-candidates.mjs [inventory|audit]');
  process.exitCode = 1;
}
