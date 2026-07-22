import { access, readdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const CROP_SIZE = 400;
const JPEG_QUALITY = 70;
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
    extension === '.png'
      ? path.join(path.dirname(sourcePath), `${path.basename(sourcePath, extension)}.jpg`)
      : sourcePath;
  const metadata = await sharp(sourcePath).metadata();
  const { width, height } = getOrientedDimensions(metadata);

  if (!width || !height || width < CROP_SIZE || height < CROP_SIZE) {
    skipped.push({ sourcePath, width, height });
    continue;
  }

  if (outputPath !== sourcePath && (await pathExists(outputPath))) {
    throw new Error(
      `Cannot convert ${path.relative(projectRoot, sourcePath)}: ${path.relative(projectRoot, outputPath)} already exists.`,
    );
  }

  jobs.push({ sourcePath, outputPath, width, height });
}

for (const { sourcePath, outputPath, width, height } of jobs) {
  const temporaryPath = `${outputPath}.crop-${process.pid}.jpg`;

  try {
    await sharp(sourcePath)
      .autoOrient()
      .extract({
        left: Math.floor((width - CROP_SIZE) / 2),
        top: Math.floor((height - CROP_SIZE) / 2),
        width: CROP_SIZE,
        height: CROP_SIZE,
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

for (const { sourcePath, width, height } of skipped) {
  console.warn(
    `Skipped ${path.relative(projectRoot, sourcePath)} (${width ?? '?'}x${height ?? '?'}): source is smaller than ${CROP_SIZE}x${CROP_SIZE}.`,
  );
}

console.log(
  `Finished: ${jobs.length} cropped, ${skipped.length} skipped, ${sourceFiles.length} total.`,
);
