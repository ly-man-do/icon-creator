/**
 * Regenerates data/icons.js from the installed `lucide-static` and
 * `@lucide/lab` packages.
 *
 *   npm run build:icons
 *
 * Output is a plain ES module so the app needs no bundler and no network:
 *   export const ICONS = { "house": [["path", { d: "..." }], ...], ... };
 *   export const TAGS  = { "house": ["home", "living", "building", ...], ... };
 *   export const LUCIDE_HOME = "https://lucide.dev";
 *
 * Lucide Lab keys carry a `lab:` prefix. The two collections are curated
 * separately and do overlap (`broom` exists in both), so the prefix is what
 * keeps keys unique — and it doubles as the flag the UI filters on.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export const LAB_PREFIX = 'lab:';

const coreNodes = require('lucide-static/icon-nodes.json');
const labNodes = require('@lucide/lab/icon-nodes.json');
const tags = require('lucide-static/tags.json');

const manifest = (pkg) =>
  JSON.parse(readFileSync(join(root, 'node_modules', pkg, 'package.json'), 'utf8'));

const version = (pkg) => manifest(pkg).version;

// Attributes every Lucide icon shares live on the <svg> root, not the children,
// so drop them here rather than repeating them 2,000+ times.
const INHERITED = new Set(['stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'fill']);

const strip = (nodes) =>
  nodes.map(([tag, attrs]) => {
    const kept = {};
    for (const [k, v] of Object.entries(attrs)) {
      if (!INHERITED.has(k)) kept[k] = v;
    }
    return [tag, kept];
  });

const icons = {};
for (const name of Object.keys(coreNodes).sort()) {
  icons[name] = strip(coreNodes[name]);
}
for (const name of Object.keys(labNodes).sort()) {
  icons[LAB_PREFIX + name] = strip(labNodes[name]);
}

// Kept as ordered arrays, not a joined string: Lucide lists a symbol's most
// characteristic keyword first, and the search ranking leans on that order.
// Lucide Lab ships no keyword file, so those icons are searched by name alone.
const searchTags = {};
for (const name of Object.keys(coreNodes).sort()) {
  const list = tags[name] || [];
  if (list.length) searchTags[name] = list;
}

const coreVersion = version('lucide-static');
const labVersion = version('@lucide/lab');
// Taken from the package's own metadata so the link cannot go stale or be a guess.
const home = manifest('lucide-static').homepage;
const coreCount = Object.keys(coreNodes).length;
const labCount = Object.keys(labNodes).length;

const out = `// GENERATED FILE — do not edit by hand. Run \`npm run build:icons\`.
// Icon geometry from lucide-static v${coreVersion} and @lucide/lab v${labVersion},
// both ISC licensed. https://lucide.dev
export const LUCIDE_VERSION = ${JSON.stringify(coreVersion)};
export const LAB_VERSION = ${JSON.stringify(labVersion)};
/** The Lucide project's homepage, per the lucide-static package manifest. */
export const LUCIDE_HOME = ${JSON.stringify(home)};
/** Lucide Lab keys are prefixed with this; see tools/build-icons.mjs. */
export const LAB_PREFIX = ${JSON.stringify(LAB_PREFIX)};
export const ICONS = ${JSON.stringify(icons)};
export const TAGS = ${JSON.stringify(searchTags)};
`;

const dest = join(root, 'data/icons.js');
// data/ holds only this generated file, so it is absent from a fresh clone.
mkdirSync(dirname(dest), { recursive: true });
writeFileSync(dest, out);
console.log(
  `Wrote ${dest}: ${coreCount} core + ${labCount} lab = ${coreCount + labCount} icons, ` +
    `${(out.length / 1024).toFixed(0)} KB (lucide v${coreVersion}, lab v${labVersion})`,
);
