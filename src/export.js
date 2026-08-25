import { buildSvg } from './render.js';
import { createZip } from './zip.js';

export const FORMATS = {
  png: { label: 'PNG', ext: 'png', mime: 'image/png', raster: true },
  svg: { label: 'SVG', ext: 'svg', mime: 'image/svg+xml', raster: false },
  webp: { label: 'WebP', ext: 'webp', mime: 'image/webp', raster: true },
  jpeg: { label: 'JPEG', ext: 'jpg', mime: 'image/jpeg', raster: true, opaque: true },
  ico: { label: 'ICO', ext: 'ico', mime: 'image/x-icon', raster: true },
};

/** Windows' ICO container cannot describe an image larger than 256px. */
export const ICO_MAX = 256;

const JPEG_QUALITY = 0.94;

function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function loadImage(svg) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('The browser could not rasterise this SVG.'));
    // A data URL keeps the canvas untainted in every browser.
    img.src = `data:image/svg+xml;base64,${toBase64(svg)}`;
  });
}

function canvasToBlob(canvas, mime, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error(`This browser cannot write ${mime}.`))),
      mime,
      quality,
    );
  });
}

/** Renders the current design to a raster blob at `size` x `size` pixels. */
export async function rasterize(state, size, format) {
  const spec = FORMATS[format] ?? FORMATS.png;
  const flatten = Boolean(spec.opaque);
  const svg = buildSvg(state, size, {
    uid: `x${size}`,
    flatten,
    // An opaque format still needs something behind a transparent design.
    flattenColor: state.bgMode === 'none' ? '#FFFFFF' : state.bgColor,
  });

  const img = await loadImage(svg);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, size, size);

  const mime = spec.mime === 'image/x-icon' ? 'image/png' : spec.mime;
  const blob = await canvasToBlob(canvas, mime, mime === 'image/jpeg' ? JPEG_QUALITY : undefined);

  // Safari silently falls back to PNG when asked for WebP; say so rather than
  // handing the user a mislabelled file.
  if (spec.raster && blob.type !== mime) {
    throw new Error(`This browser cannot write ${spec.label}. Try PNG.`);
  }
  return blob;
}

/**
 * Packs PNG images into a single Windows .ico file.
 * @param {Array<{size: number, data: Uint8Array}>} images
 */
export function createIco(images) {
  const header = new Uint8Array(6 + images.length * 16);
  const view = new DataView(header.buffer);
  view.setUint16(0, 0, true); // reserved
  view.setUint16(2, 1, true); // type: icon
  view.setUint16(4, images.length, true);

  let offset = header.length;
  images.forEach((img, i) => {
    const at = 6 + i * 16;
    // 0 is how the format spells "256".
    header[at] = img.size >= 256 ? 0 : img.size;
    header[at + 1] = img.size >= 256 ? 0 : img.size;
    header[at + 2] = 0; // palette size
    header[at + 3] = 0; // reserved
    view.setUint16(at + 4, 1, true); // colour planes
    view.setUint16(at + 6, 32, true); // bits per pixel
    view.setUint32(at + 8, img.data.length, true);
    view.setUint32(at + 12, offset, true);
    offset += img.data.length;
  });

  return new Blob([header, ...images.map((i) => i.data)], { type: 'image/x-icon' });
}

export function sanitizeName(name) {
  const cleaned = String(name || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'icon';
}

export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke late — Safari needs the URL to survive the click.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Produces every requested file for the current design.
 *
 * @returns {Promise<Array<{name: string, blob: Blob}>>}
 */
export async function buildExports(state, { format, sizes, basename }) {
  const spec = FORMATS[format] ?? FORMATS.png;
  const base = sanitizeName(basename);
  const ordered = [...new Set(sizes)].sort((a, b) => a - b);

  if (format === 'ico') {
    const usable = ordered.filter((s) => s <= ICO_MAX);
    if (!usable.length) throw new Error(`ICO supports sizes up to ${ICO_MAX}px.`);
    const images = [];
    for (const size of usable) {
      const png = await rasterize(state, size, 'png');
      images.push({ size, data: new Uint8Array(await png.arrayBuffer()) });
    }
    return [{ name: `${base}.ico`, blob: createIco(images) }];
  }

  const files = [];
  for (const size of ordered) {
    const name = ordered.length === 1 ? `${base}.${spec.ext}` : `${base}-${size}.${spec.ext}`;
    if (format === 'svg') {
      const svg = buildSvg(state, size, { uid: `s${size}` });
      files.push({ name, blob: new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }) });
    } else {
      files.push({ name, blob: await rasterize(state, size, format) });
    }
  }
  return files;
}

/** Bundles already-built files into a single .zip. */
export async function zipFiles(files, basename) {
  const entries = [];
  for (const file of files) {
    entries.push({ name: file.name, data: new Uint8Array(await file.blob.arrayBuffer()) });
  }
  return { name: `${sanitizeName(basename)}.zip`, blob: createZip(entries) };
}
