# Icon Creator

A browser app for designing app icons from the [Lucide](https://lucide.dev) icon set and
exporting them as PNG, SVG, WebP, JPEG or ICO.

No framework, no bundler, no network calls — plain HTML, CSS and ES modules, with all
2,132 icons compiled into a local data file: 1,776 from Lucide core plus 356 from
[Lucide Lab](https://github.com/lucide-icons/lucide-lab), the project's collection of
nicely drawn icons without an established use case.

## Run it

Three ways, depending on what you want.

### On your NAS (ZimaOS / CasaOS)

1. Push this repo to GitHub. The included workflow builds and publishes a
   multi-architecture image to GitHub Container Registry on every push to `main`.
2. `docker-compose.zimaos.yml` already points at `ghcr.io/ly-man-do/icon-creator`.
   If you forked this repo, swap in your own GitHub name:

   ```bash
   sed -i '' 's/ly-man-do/your-github-name/g' docker-compose.zimaos.yml
   ```

3. In ZimaOS: **App Store → ⋮ → Install a customized app**, switch to the
   YAML/import view, and paste the file in.

The tile appears with the app's icon and opens on port **5173**. There are no
volumes to configure — the app is entirely client-side and keeps designs in the
browser's `localStorage`, so the container holds no state.

If your GHCR package is private, make it public (**Package settings →
Change visibility**) or `docker login ghcr.io` on the NAS first, otherwise the
pull fails with `denied`.

### With Docker, anywhere

```bash
docker compose up -d --build
```

Serves on <http://localhost:5173>. Override the port with
`ICON_CREATOR_PORT=8080 docker compose up -d`.

### From source

```bash
npm install && npm start
```

Then open <http://localhost:5173>. `data/icons.js` is generated on the way in,
so there is no separate build step to remember.

Or build the standalone version and just open the file — it needs no server at all:

```bash
npm run build
```

That writes `dist/icon-creator.html` (~703 KB), a single self-contained page with the
stylesheet, the icon data and every module inlined. Alongside it, `dist/icon-creator.artifact.html`
holds the same app as page content only, for hosts that supply their own `<html>` shell.

## What you can adjust

**Background** — square or circle; corner radius from 0–50% of the icon's size, with
one-click **iOS / macOS** and **Android** presets; a solid colour, a two-stop gradient at any
angle, or no background at all. Colours come from a picker, a swatch row, or a hex field
that accepts `#4F7CFF`, `4f7cff`, `#0f0` and 8-digit values with alpha. **Swap with icon
colour** trades the background and icon colours — click it twice to get back where you
started. In gradient mode it trades with the first stop and leaves the second alone; with
no background fill the button hides along with the colour field, since there is nothing to
trade.

**Border** — on or off, 0.5–15% thickness, any colour. It is drawn *inside* the edge, so
it is never clipped at any export size.

**Icon** — search all 2,132 icons by name or by Lucide's own keyword tags ("cart" finds
`shopping-cart`), then set its size, stroke weight and colour. Filter to **Core**, **Lab**
or **All**; lab icons carry a small corner dot in the grid. Arrow keys navigate the grid.

**Export** — pick one or many sizes (common sizes are one click; favicon, iOS and Android
presets fill the whole set; custom sizes up to 4096 px). One size downloads a single file;
several download as a `.zip`, or individually if you turn the bundle off.

The file name follows the icon you picked, so choosing `rocket` exports `rocket.png`
without you typing anything. Type your own name to override it; clear the field to go
back to following the icon.

**Theme** — the button in the header cycles System → Light → Dark. System follows your OS;
the other two override it in both directions.

Your design, theme and export settings are saved in `localStorage`, so a reload picks up
where you left off.

### Format notes

| Format | Notes |
| --- | --- |
| PNG | Lossless, transparent. |
| SVG | Vector; the chosen size only sets the `width`/`height` attributes. |
| WebP | Smaller than PNG, still transparent. |
| JPEG | No alpha — an opaque backdrop is painted behind the icon. |
| ICO | One `.ico` containing every selected size up to 256 px (the format's ceiling). |

## Layout

```
index.html            markup and the control panel
src/styles.css        all styling; follows the OS light/dark setting
src/render.js         builds the icon as SVG markup on a 512x512 design grid
src/picker.js         the searchable icon grid
src/export.js         rasterising, the ICO container, downloads
src/zip.js            a small store-only ZIP writer
data/icons.js         GENERATED — core + lab icon geometry, search tags, credit URL
tools/build-icons.mjs regenerates data/icons.js from lucide-static and @lucide/lab
tools/build-single.mjs bundles everything into dist/icon-creator.html
server.mjs            dependency-free static server for local development
Dockerfile            two-stage build: Node generates the data, nginx serves it
docker/nginx.conf     gzip, cache and health-check config for the image
docker-compose.yml            builds and runs the image locally
docker-compose.zimaos.yml     the file you paste into ZimaOS / CasaOS
docs/icon.png         the app tile icon — exported from the app itself
```

Everything is laid out on a fixed 512×512 grid and scaled to the requested output size,
so "corner radius: 22%" means the same thing at 16 px and at 1024 px.

The app's own logo and its browser-tab icon come from a single `BRAND_STATE` passed
through the same `buildSvg()` the editor uses, so the two cannot drift apart — there is
no hand-authored favicon to keep in sync.

Theme tokens are defined three times over: bare `:root` carries the dark palette, a
`prefers-color-scheme: light` block guarded by `:not([data-theme="dark"])` handles viewers
on the system setting, and `:root[data-theme="light"]` handles an explicit choice. Every
component reads the tokens and never the media query, so a forced theme wins in both
directions.

## Platform corner radii

| Preset | Shape | Source |
| --- | --- | --- |
| iOS / macOS | 22.5% radius | Big Sur+: a 185.4px radius on the 824px icon body |
| Android | circle | Pixel launchers mask adaptive icons to a circle |

Apple gets a single entry because Big Sur brought the Mac icon shape in line with iOS —
the two specs land a tenth of a percent apart. The Mac figure is the exact one, so it
stands for both.

Two caveats the preset cannot express. Apple masks with a *continuous* curve — a
"squircle" — while this app draws circular-arc corners; at icon sizes the two are very
close but not identical. And Mac icons sit inside a transparent margin (an 824px body on a
1024px canvas) that this app does not add, since it draws the shape edge to edge.

Android is the loosest of the three: adaptive icons are authored full-bleed and masked by
whichever launcher is installed, so a circle is what Pixel shows, not what every device
shows.

## The two collections

Lucide core and Lucide Lab are curated separately and their names overlap — `broom`
exists in both. Lab icons are therefore stored under a `lab:` key prefix, which keeps
keys unique, survives in saved settings, and doubles as the flag the source filter and
the grid marker read. The prefix never reaches the person using the app: search matches
the bare name, and the UI shows `avocado`, not `lab:avocado`.

Lucide Lab ships no keyword file, so lab icons are searched by name alone. On an
otherwise exact scoring tie, core wins — it is the maintained set.

## Container notes

The image is two stages. Node runs `build-icons` and `build-single`, then the runtime
stage copies the static output into `nginx:alpine` — no Node, npm or `node_modules` ship
in the final image.

A few decisions worth knowing about if you change it:

- **`data/icons.js` is not in git.** It is derived entirely from the installed Lucide
  packages, so it is regenerated by `npm start`, `npm run build`, and the image build.
  Nothing tracked in the repo depends on it existing beforehand.
- **`Cache-Control: no-cache`, not a long max-age.** Filenames carry no content hash, so
  aggressive caching would strand people on a stale app after an update. nginx still sends
  ETags, so revalidation is a cheap 304 rather than a re-download.
- **No `Content-Security-Policy`.** Exports are built as `blob:` URLs and the bundled
  `standalone.html` carries an inline module script, so a strict policy has to be written
  around both. If you add one, check that downloads still work before shipping it.
- **`/healthz`** returns 200 and backs the container health check.
- **`/standalone.html`** is the single-file build, served from your own instance if you
  ever want to grab a portable copy.

The published image is `ghcr.io/ly-man-do/icon-creator`, tagged `latest` from `main` plus
semver tags when you push a `v*` tag. The workflow needs no secrets — the built-in
`GITHUB_TOKEN` covers it, as long as **Settings → Actions → Workflow permissions** allows
package writes.

## Updating the icon set

```bash
npm install lucide-static@latest @lucide/lab@latest
npm run build:icons
```

The app reads `data/icons.js` only, so nothing else needs to change. Icon geometry from
both packages is ISC-licensed by the Lucide project.

The credit in the header links out to the Lucide site. That URL is not hardcoded in the
app — the generator copies it from `lucide-static`'s own `homepage` field into
`LUCIDE_HOME`, so it stays correct if the project ever moves. Lucide Lab declares the same
homepage, so it is credited alongside without a second identical link.

## Licence

MIT — see [LICENSE](LICENSE). **Put your name in the copyright line before you
publish**; it currently reads `<YOUR NAME OR ORGANISATION>`. Swap the whole file if
you'd rather use a different licence, and update the `license` field in `package.json`
to match.

Icon geometry from `lucide-static` and `@lucide/lab` is ISC-licensed by the Lucide
project; that notice is reproduced in `LICENSE` as the ISC terms require, since the
container image redistributes it.
