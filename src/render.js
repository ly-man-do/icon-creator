import { ICONS } from '../data/icons.js';

/**
 * Everything is laid out on a fixed 512x512 design grid and then scaled to the
 * requested output size, so a value like "corner radius: 22%" means the same
 * thing whether the icon is exported at 16px or 1024px.
 */
export const BASE = 512;

/** Lucide draws on a 24x24 grid. */
const ICON_GRID = 24;

export const DEFAULT_STATE = Object.freeze({
  shape: 'square',
  radius: 22, // % of the icon's size
  bgMode: 'solid', // solid | gradient | none
  bgColor: '#4F7CFF',
  bgColor2: '#8B5CF6',
  gradientAngle: 135,
  border: false,
  borderWidth: 3, // % of the icon's size
  borderColor: '#1E293B',
  icon: 'house',
  iconScale: 55, // % of the icon's size
  strokeWidth: 2, // in Lucide's own 24-grid units
  iconColor: '#FFFFFF',
});

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Trim float noise so the exported markup stays readable. */
const n = (v) => Math.round(v * 1000) / 1000;

let uidCounter = 0;

/**
 * CSS-style gradient angle (0deg points up, 90deg points right) expressed as
 * the x1/y1/x2/y2 of an objectBoundingBox linearGradient.
 */
function gradientVector(angleDeg) {
  const a = (((angleDeg % 360) + 360) % 360) * (Math.PI / 180);
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  // Extend the line so it still covers the corners, the way CSS does.
  const reach = (Math.abs(dx) + Math.abs(dy)) / 2;
  return {
    x1: n(0.5 - dx * reach),
    y1: n(0.5 - dy * reach),
    x2: n(0.5 + dx * reach),
    y2: n(0.5 + dy * reach),
  };
}

/** The outer corner radius in design units. A circle is just radius = 50%. */
export function cornerRadius(state) {
  return state.shape === 'circle' ? BASE / 2 : (clamp(state.radius, 0, 50) / 100) * BASE;
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, Number(v) || 0));
}

/** The icon's own markup, scaled and centred on the design grid. */
function iconMarkup(state) {
  const nodes = ICONS[state.icon];
  if (!nodes) return '';

  const scale = (clamp(state.iconScale, 1, 100) / 100 * BASE) / ICON_GRID;
  const offset = (BASE - ICON_GRID * scale) / 2;

  const children = nodes
    .map(([tag, attrs]) => {
      const a = Object.entries(attrs)
        .map(([k, v]) => `${k}="${esc(v)}"`)
        .join(' ');
      return `    <${tag} ${a} />`;
    })
    .join('\n');

  return (
    `  <g transform="translate(${n(offset)} ${n(offset)}) scale(${n(scale)})" ` +
    `fill="none" stroke="${esc(state.iconColor)}" stroke-width="${n(clamp(state.strokeWidth, 0.1, 8))}" ` +
    `stroke-linecap="round" stroke-linejoin="round">\n${children}\n  </g>`
  );
}

/**
 * Builds the icon as standalone SVG markup.
 *
 * @param {object} state
 * @param {number} [size]        pixel width/height to stamp on the root element
 * @param {object} [opts]
 * @param {string} [opts.uid]    suffix for internal ids, so several icons can
 *                               live on one page without their gradients clashing
 * @param {boolean} [opts.flatten] paint an opaque backdrop (for formats like
 *                               JPEG that have no alpha channel)
 * @param {string} [opts.flattenColor]
 */
export function buildSvg(state, size = BASE, opts = {}) {
  const uid = opts.uid ?? `g${++uidCounter}`;
  const parts = [];
  const defs = [];

  const bw = state.border ? (clamp(state.borderWidth, 0, 25) / 100) * BASE : 0;
  const r = cornerRadius(state);

  if (opts.flatten) {
    parts.push(`  <rect width="${BASE}" height="${BASE}" fill="${esc(opts.flattenColor || '#FFFFFF')}" />`);
  }

  // ---- background -------------------------------------------------------
  if (state.bgMode !== 'none') {
    let fill = esc(state.bgColor);
    if (state.bgMode === 'gradient') {
      const v = gradientVector(state.gradientAngle);
      defs.push(
        `    <linearGradient id="bg-${uid}" x1="${v.x1}" y1="${v.y1}" x2="${v.x2}" y2="${v.y2}">\n` +
          `      <stop offset="0" stop-color="${esc(state.bgColor)}" />\n` +
          `      <stop offset="1" stop-color="${esc(state.bgColor2)}" />\n` +
          `    </linearGradient>`,
      );
      fill = `url(#bg-${uid})`;
    }
    parts.push(
      `  <rect x="0" y="0" width="${BASE}" height="${BASE}" rx="${n(r)}" ry="${n(r)}" fill="${fill}" />`,
    );
  }

  // ---- border (drawn inside the edge so it is never clipped) ------------
  if (bw > 0) {
    const inset = bw / 2;
    const innerR = Math.max(0, r - inset);
    parts.push(
      `  <rect x="${n(inset)}" y="${n(inset)}" width="${n(BASE - bw)}" height="${n(BASE - bw)}" ` +
        `rx="${n(innerR)}" ry="${n(innerR)}" fill="none" ` +
        `stroke="${esc(state.borderColor)}" stroke-width="${n(bw)}" />`,
    );
  }

  parts.push(iconMarkup(state));

  const defsBlock = defs.length ? `  <defs>\n${defs.join('\n')}\n  </defs>\n` : '';

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" ` +
    `viewBox="0 0 ${BASE} ${BASE}" fill="none">\n${defsBlock}${parts.filter(Boolean).join('\n')}\n</svg>\n`
  );
}

/** A bare 24x24 Lucide glyph, for the icon picker grid. */
export function glyphSvg(name) {
  const nodes = ICONS[name];
  if (!nodes) return '';
  const children = nodes
    .map(([tag, attrs]) => {
      const a = Object.entries(attrs)
        .map(([k, v]) => `${k}="${esc(v)}"`)
        .join(' ');
      return `<${tag} ${a} />`;
    })
    .join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
    `stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${children}</svg>`
  );
}
