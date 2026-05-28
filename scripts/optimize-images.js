'use strict';

const fs = require('fs');
const path = require('path');
const media = require('../src/data/media');
const { createImageVariants } = require('../src/image-optimizer');

const imageRoot = path.join(__dirname, '..', 'public', 'uploads', 'images');

async function main() {
  const images = media.getAll().filter((item) => item.kind === 'image');
  let optimized = 0;
  let skipped = 0;

  for (const image of images) {
    const sourcePath = path.join(imageRoot, image.filename || '');
    if (!image.filename || !fs.existsSync(sourcePath)) {
      skipped += 1;
      continue;
    }

    const result = await createImageVariants({
      sourcePath,
      filename: image.filename
    });

    media.updateImageMetadata(image.id, {
      width: result.width,
      height: result.height,
      variants: result.variants
    });

    optimized += 1;
  }

  console.log(`Optimized ${optimized} image(s), skipped ${skipped}.`);
}

main().catch((error) => {
  if (error.message && error.message.includes('Image optimization is disabled')) {
    console.warn(error.message);
    process.exitCode = 0;
    return;
  }

  console.error(error);
  process.exitCode = 1;
});
