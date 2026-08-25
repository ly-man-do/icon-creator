/**
 * Bundles the app into one self-contained HTML file.
 *
 *   npm run build
 *
 * The result works straight off the filesystem (double-click it) and on any
 * static host, because everything — CSS, the icon data and all five modules —
 * ends up inline. The modules are concatenated in dependency order and their
 * import/export statements are stripped, so the bundle is one inline
 * `<script type="module">` with no network requests at all.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

// Dependency order: each file may only reference the ones above it.
const MODULES = ['data/icons.js', 'src/render.js', 'src/zip.js', 'src/export.js', 'src/picker.js', 'src/app.js'];

/** Removes ES module syntax so the files can simply be concatenated. */
function flatten(source) {
  return source
    .replace(/^import\s[\s\S]*?from\s*['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^export\s+(const|let|var|function|async function|class)\s/gm, '$1 ')
    .replace(/^export\s*\{[^}]*\};?\s*$/gm, '');
}

/** Catches the one real hazard of concatenation: two modules using one name. */
function assertNoDuplicateTopLevelNames(sources) {
  const seen = new Map();
  const declaration = /^(?:const|let|var|function|async function|class)\s+([A-Za-z_$][\w$]*)/gm;

  for (const [name, code] of sources) {
    for (const [, id] of code.matchAll(declaration)) {
      if (seen.has(id)) {
        throw new Error(
          `Top-level name "${id}" is declared in both ${seen.get(id)} and ${name}. ` +
            `Rename one of them — the single-file bundle puts them in the same scope.`,
        );
      }
      seen.set(id, name);
    }
  }
}

const sources = MODULES.map((path) => [path, flatten(read(path))]);
assertNoDuplicateTopLevelNames(sources);

const script = sources.map(([path, code]) => `/* ===== ${path} ===== */\n${code.trim()}\n`).join('\n');

// Verify the concatenation is valid JavaScript before shipping it.
const check = join(root, 'dist/.bundle-check.mjs');
mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(check, script);
try {
  execFileSync(process.execPath, ['--check', check], { stdio: 'pipe' });
} catch (error) {
  throw new Error(`Bundled script failed to parse:\n${error.stderr?.toString() || error.message}`);
} finally {
  rmSync(check, { force: true });
}

const styles = read('src/styles.css');
const source = read('index.html');

const html = source
  .replace('<link rel="stylesheet" href="src/styles.css" />', `<style>\n${styles}\n</style>`)
  .replace(
    '<script type="module" src="src/app.js"></script>',
    `<script type="module">\n${script}\n</script>`,
  );

const dest = join(root, 'dist/icon-creator.html');
writeFileSync(dest, html);
console.log(`Wrote ${dest} — ${(html.length / 1024).toFixed(0)} KB, no external requests.`);

// A second variant for hosts that supply their own document shell (such as
// Claude Artifacts): page content only, no <html>/<head>/<body> of our own.
const body = source
  .match(/<body>([\s\S]*)<\/body>/)[1]
  .replace('<script type="module" src="src/app.js"></script>', '')
  .trim();

const favicon = source.match(/<link rel="icon"[^>]*>/)[0];

const fragment = `<title>Icon Creator</title>
${favicon}
<style>
${styles}
</style>
${body}
<script type="module">
${script}
</script>
`;

const fragmentDest = join(root, 'dist/icon-creator.artifact.html');
writeFileSync(fragmentDest, fragment);
console.log(`Wrote ${fragmentDest} — ${(fragment.length / 1024).toFixed(0)} KB, embeddable variant.`);
