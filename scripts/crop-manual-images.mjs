import { access, readdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const MAXIMUM_SIZE = 800;
const JPEG_QUALITY = 90;
const SUPPORTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png']);

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const imageRoot = path.join(projectRoot, 'data', 'manual', 'wood-images');

async function collectImages(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        return collectImages(entryPath);
      }

      return SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase()) ? [entryPath] : [];
    }),
  );

  return files.flat();
}

function getOrientedDimensions(metadata) {
  const swapsSides = [5, 6, 7, 8].includes(metadata.orientation ?? 1);

  return {
    width: swapsSides ? metadata.height : metadata.width,
    height: swapsSides ? metadata.width : metadata.height,
  };
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

const sourceFiles = (await collectImages(imageRoot)).sort();
const jobs = [];
const skipped = [];

for (const sourcePath of sourceFiles) {
  const extension = path.extname(sourcePath).toLowerCase();
  const outputPath =
    extension === '.png' || extension === '.jpeg'
      ? path.join(path.dirname(sourcePath), `${path.basename(sourcePath, extension)}.jpg`)
      : sourcePath;
  const metadata = await sharp(sourcePath).metadata();
  const { width, height } = getOrientedDimensions(metadata);

  if (!width || !height) {
    skipped.push({ sourcePath, width, height });
    continue;
  }

  const isAlreadyNormalized =
    outputPath === sourcePath &&
    width === height &&
    width <= MAXIMUM_SIZE &&
    ![5, 6, 7, 8].includes(metadata.orientation ?? 1);
  if (isAlreadyNormalized) {
    skipped.push({ sourcePath, width, height, normalized: true });
    continue;
  }

  if (outputPath !== sourcePath && (await pathExists(outputPath))) {
    throw new Error(
      `Cannot convert ${path.relative(projectRoot, sourcePath)}: ${path.relative(projectRoot, outputPath)} already exists.`,
    );
  }

  jobs.push({
    sourcePath,
    outputPath,
    width,
    height,
    squareSide: Math.min(width, height),
  });
}

for (const { sourcePath, outputPath, width, height, squareSide } of jobs) {
  const temporaryPath = `${outputPath}.crop-${process.pid}.jpg`;

  try {
    await sharp(sourcePath)
      .autoOrient()
      .extract({
        left: Math.floor((width - squareSide) / 2),
        top: Math.floor((height - squareSide) / 2),
        width: squareSide,
        height: squareSide,
      })
      .resize(Math.min(squareSide, MAXIMUM_SIZE), Math.min(squareSide, MAXIMUM_SIZE), {
        fit: 'fill',
        withoutEnlargement: true,
      })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toFile(temporaryPath);

    await rename(temporaryPath, outputPath);

    if (outputPath !== sourcePath) {
      await rm(sourcePath);
    }

    console.log(`Cropped ${path.relative(projectRoot, outputPath)}`);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

for (const { sourcePath, width, height, normalized } of skipped) {
  const reason = normalized ? 'already normalized' : 'unreadable dimensions';
  console.log(
    `Skipped ${path.relative(projectRoot, sourcePath)} (${width ?? '?'}x${height ?? '?'}): ${reason}.`,
  );
}

console.log(
  `Finished: ${jobs.length} normalized, ${skipped.length} skipped, ${sourceFiles.length} total.`,
);
