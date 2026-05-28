import { escapeHtml } from './modal.js';

const DEFAULT_SIZES = '100vw';
const EXTERNAL_VARIANT_WIDTHS = [160, 320, 480, 640, 960, 1280, 1920, 2560];

function renderResponsiveImage({
  image,
  src,
  className = '',
  alt = '',
  sizes = DEFAULT_SIZES,
  loading = 'lazy',
  fetchPriority = 'auto',
  includeDimensions = true,
  width,
  height
}) {
  const imageData = image && image.url ? image : null;
  const fallbackSrc = src || imageData?.url || '';
  if (!fallbackSrc) {
    return '';
  }

  const variants = Array.isArray(imageData?.variants) && imageData.variants.length > 0
    ? imageData.variants
        .filter((variant) => variant.url && variant.width)
        .sort((a, b) => a.width - b.width)
    : buildExternalWidthVariants(fallbackSrc);
  const sourceWidth = width || imageData?.width || variants[variants.length - 1]?.width || null;
  const sourceHeight = height || imageData?.height || variants[variants.length - 1]?.height || null;
  const attributes = [
    `class="${escapeHtml(className)}"`,
    `src="${escapeHtml(fallbackSrc)}"`,
    `alt="${escapeHtml(alt)}"`,
    `loading="${escapeHtml(loading)}"`,
    'decoding="async"',
    `sizes="${escapeHtml(sizes)}"`
  ];

  if (variants.length > 0) {
    attributes.push(`srcset="${escapeHtml(variants.map((variant) => `${variant.url} ${variant.width}w`).join(', '))}"`);
  }
  if (includeDimensions && sourceWidth) {
    attributes.push(`width="${escapeHtml(String(sourceWidth))}"`);
  }
  if (includeDimensions && sourceHeight) {
    attributes.push(`height="${escapeHtml(String(sourceHeight))}"`);
  }
  if (fetchPriority && fetchPriority !== 'auto') {
    attributes.push(`fetchpriority="${escapeHtml(fetchPriority)}"`);
  }

  return `<img ${attributes.join(' ')}>`;
}

function buildExternalWidthVariants(src) {
  if (!/^https?:\/\//i.test(src || '')) {
    return [];
  }

  try {
    const url = new URL(src);
    if (!url.searchParams.has('w')) {
      return [];
    }

    return EXTERNAL_VARIANT_WIDTHS.map((width) => {
      const variantUrl = new URL(url.href);
      variantUrl.searchParams.set('w', String(width));
      return {
        width,
        url: variantUrl.href
      };
    });
  } catch {
    return [];
  }
}

export { renderResponsiveImage };
