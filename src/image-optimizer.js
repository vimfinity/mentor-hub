'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const IMAGE_UPLOAD_ROOT = path.join(__dirname, '..', 'public', 'uploads', 'images');
const VARIANT_DIRECTORY = 'variants';
const VARIANT_WIDTHS = [160, 320, 480, 640, 960, 1280, 1920, 2560];
const WEBP_QUALITY = 78;

function variantDirectoryPath() {
  return path.join(IMAGE_UPLOAD_ROOT, VARIANT_DIRECTORY);
}

function safeVariantFilename(sourceFilename, width) {
  const basename = path.basename(sourceFilename, path.extname(sourceFilename));
  return `${basename}-${width}.webp`;
}

function toPublicVariantUrl(filename) {
  return `/uploads/images/${VARIANT_DIRECTORY}/${encodeURIComponent(filename)}`;
}

async function createImageVariants({ sourcePath, filename }) {
  const metadata = await sharp(sourcePath).metadata();
  const sourceWidth = Number(metadata.width) || 0;
  const sourceHeight = Number(metadata.height) || 0;
  const widths = VARIANT_WIDTHS.filter((width) => !sourceWidth || width <= sourceWidth);

  if (sourceWidth && !widths.includes(sourceWidth) && sourceWidth < Math.max(...VARIANT_WIDTHS)) {
    widths.push(sourceWidth);
  }

  const variants = [];
  fs.mkdirSync(variantDirectoryPath(), { recursive: true });

  for (const width of Array.from(new Set(widths)).sort((a, b) => a - b)) {
    const variantFilename = safeVariantFilename(filename, width);
    const variantPath = path.join(variantDirectoryPath(), variantFilename);

    await sharp(sourcePath)
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY, effort: 4 })
      .toFile(variantPath);

    const stats = fs.statSync(variantPath);
    const height = sourceWidth && sourceHeight
      ? Math.round((sourceHeight / sourceWidth) * width)
      : null;

    variants.push({
      width,
      height,
      format: 'webp',
      mimeType: 'image/webp',
      sizeBytes: stats.size,
      url: toPublicVariantUrl(variantFilename)
    });
  }

  return {
    width: sourceWidth || null,
    height: sourceHeight || null,
    variants
  };
}

function removeImageVariants(filename) {
  const directory = variantDirectoryPath();
  if (!fs.existsSync(directory)) {
    return;
  }

  const basename = path.basename(filename || '', path.extname(filename || ''));
  if (!basename) {
    return;
  }

  for (const entry of fs.readdirSync(directory)) {
    if (entry.startsWith(`${basename}-`) && entry.endsWith('.webp')) {
      fs.rmSync(path.join(directory, entry), { force: true });
    }
  }
}

module.exports = {
  createImageVariants,
  removeImageVariants
};
