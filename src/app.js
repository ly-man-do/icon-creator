import { LAB_VERSION, LUCIDE_HOME, LUCIDE_VERSION, ICONS } from '../data/icons.js';
import { BASE, DEFAULT_STATE, buildSvg, glyphSvg } from './render.js';
import { CORE_NAMES, LAB_NAMES, createPicker, displayName, isLab, ICON_NAMES } from './picker.js';
import { FORMATS, ICO_MAX, buildExports, download, sanitizeName, zipFiles } from './export.js';

const STORAGE_KEY = 'icon-creator:v1';

const COMMON_SIZES = [16, 32, 48, 64, 128, 256, 512, 1024];

const SIZE_PRESETS = {
  favicon: [16, 32, 48, 180, 192, 512],
  ios: [40, 60, 58, 87, 80, 120, 180, 1024],
  android: [48, 72, 96, 144, 192, 512],
};

const BG_SWATCHES = [
  '#0F172A', '#334155', '#64748B', '#4F7CFF', '#0EA5E9', '#06B6D4',
  '#10B981', '#84CC16', '#F59E0B', '#F97316', '#EF4444', '#EC4899',
  '#8B5CF6', '#6366F1', '#FFFFFF', '#000000',
];

const ICON_SWATCHES = ['#FFFFFF', '#F8FAFC', '#0F172A', '#000000', '#4F7CFF', '#F59E0B', '#10B981', '#EF4444'];

const HEX = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/**
 * Corner radii taken from each platform's published icon geometry, expressed as
 * a share of the icon's width so they hold at every export size.
 *
 * iOS and macOS share one entry: Big Sur brought the Mac icon shape in line with
 * iOS, and the two specs land a tenth of a percent apart. The Mac figure is the
 * exact one — a 185.4px radius on the 824px icon body — so it stands for both.
 */
const RADIUS_PRESETS = [
  {
    label: 'iOS / macOS',
    shape: 'square',
    radius: 22.5,
    note:
      'Apple app icons — 22.5% of the icon width (a 185.4px radius on the 824px ' +
      'macOS icon body; iOS matches to within a tenth of a percent). Apple masks with ' +
      'a continuous “squircle” curve; a circular-arc corner is a close approximation. ' +
      'Mac icons also sit inside a transparent margin, which this app does not add.',
  },
  {
    label: 'Android',
    shape: 'circle',
    radius: 50,
    note:
      'Android adaptive icons are masked by the launcher; Pixel uses a circle. ' +
      'Other makers apply a squircle or rounded square to the same artwork.',
  },
];

/** The app's own logo. The tab icon is drawn from this too, so they stay identical. */
const BRAND_STATE = { ...DEFAULT_STATE, icon: 'shapes', radius: 26 };

// "system" carries no data-theme attribute, which is what the stylesheet's
// prefers-color-scheme block keys off; the other two stamp the root element.
const THEMES = ['system', 'light', 'dark'];
const THEME_GLYPH = { system: 'monitor', light: 'sun', dark: 'moon' };
const THEME_LABEL = {
  system: 'Theme: matching your system',
  light: 'Theme: light',
  dark: 'Theme: dark',
};

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- state ---

let state = { ...DEFAULT_STATE };

let exportPrefs = {
  format: 'png',
  sizes: [512],
  custom: [],
  // null means "follow the icon name"; a string is a name the person chose.
  basename: null,
  zip: true,
};

let ui = { theme: 'system' };

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!saved) return;
    if (saved.state) state = { ...DEFAULT_STATE, ...saved.state };
    if (saved.exportPrefs) exportPrefs = { ...exportPrefs, ...saved.exportPrefs };
    if (saved.ui) ui = { ...ui, ...saved.ui };
    // Earlier builds stored the literal default; read it as "follow the icon".
    if (exportPrefs.basename === 'icon') exportPrefs.basename = null;
    // Icon names occasionally change between Lucide releases.
    if (!ICONS[state.icon]) state.icon = DEFAULT_STATE.icon;
  } catch {
    /* a corrupt entry just means we start fresh */
  }
}

let saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ state, exportPrefs, ui }));
    } catch {
      /* private browsing, quota — not worth interrupting the user over */
    }
  }, 250);
}

// --------------------------------------------------------------- helpers ---

/** Accepts `abc`, `#abc`, `aabbcc`, `#AABBCCDD`; returns `#AABBCC` style or null. */
function normalizeHex(value) {
  const raw = String(value).trim();
  if (!HEX.test(raw)) return null;
  return `#${raw.replace('#', '').toUpperCase()}`;
}

/** <input type="color"> only understands 6-digit hex. */
function toPickerHex(hex) {
  const body = hex.replace('#', '');
  if (body.length === 3 || body.length === 4) {
    return `#${body.slice(0, 3).split('').map((c) => c + c).join('')}`;
  }
  return `#${body.slice(0, 6)}`;
}

const clampSize = (v, min, max) => Math.min(max, Math.max(min, v));

// -------------------------------------------------------------- rendering ---

const preview = $('preview');
const previewCaption = $('previewCaption');
const thumbs = [...document.querySelectorAll('.thumb-box')];

let frame = null;
function scheduleRender() {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = null;
    renderAll();
  });
}

function renderAll() {
  preview.innerHTML = buildSvg(state, BASE, { uid: 'preview' });
  thumbs.forEach((box, i) => {
    box.innerHTML = buildSvg(state, BASE, { uid: `thumb${i}` });
  });
  previewCaption.textContent = displayName(state.icon) + (isLab(state.icon) ? '  ·  lab' : '');
  $('iconBadge').textContent = displayName(state.icon);
  $('borderBadge').textContent = state.border ? `${state.borderWidth}%` : 'off';
  syncRadiusPresets();
  syncFilenameField();
  save();
}

function renderBrandMark() {
  $('brandMark').innerHTML = buildSvg(BRAND_STATE, 28, { uid: 'brand' });

  // Same source as the logo above, so the tab can never show a different mark.
  // encodeURIComponent matters here: a raw "#" would truncate the data URL.
  const svg = buildSvg(BRAND_STATE, 64, { uid: 'favicon' });
  document.querySelector('link[rel="icon"]').href =
    `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// ------------------------------------------------------------------ theme ---

function applyTheme() {
  const root = document.documentElement;
  if (ui.theme === 'system') root.removeAttribute('data-theme');
  else root.dataset.theme = ui.theme;

  const button = $('btnTheme');
  button.innerHTML = glyphSvg(THEME_GLYPH[ui.theme]);
  button.title = `${THEME_LABEL[ui.theme]} — click to change`;
  button.setAttribute('aria-label', THEME_LABEL[ui.theme]);
}

// --------------------------------------------------------------- file name ---

/** The name exports actually use: the person's own, or the icon's. */
function effectiveBasename() {
  return sanitizeName(exportPrefs.basename ?? displayName(state.icon));
}

function syncFilenameHint() {
  $('filenameHint').textContent =
    exportPrefs.basename === null
      ? 'Follows the icon name. Type your own to override it.'
      : 'Custom name. Clear the field to follow the icon name again.';
}

/** Mirrors the effective name into the field, without fighting live typing. */
function syncFilenameField() {
  const field = $('filename');
  if (document.activeElement !== field) field.value = effectiveBasename();
  syncFilenameHint();
}

// --------------------------------------------------------------- controls ---

/** Binds a slider to a state key and mirrors its value into the <output>. */
function bindRange(id, key, format = (v) => `${v}%`) {
  const input = $(id);
  const out = $(`${id}Out`);
  const sync = () => {
    out.textContent = format(Number(input.value));
  };
  input.value = state[key];
  sync();
  input.addEventListener('input', () => {
    state[key] = Number(input.value);
    sync();
    scheduleRender();
  });
  return { input, sync: () => { input.value = state[key]; sync(); } };
}

/** Keeps a colour swatch, a hex field and a state key in step. */
function bindColor(pickerId, textId, key, swatchId, swatches) {
  const picker = $(pickerId);
  const text = $(textId);

  const apply = (hex) => {
    state[key] = hex;
    picker.value = toPickerHex(hex);
    text.value = hex;
    text.setAttribute('aria-invalid', 'false');
    scheduleRender();
  };

  picker.addEventListener('input', () => apply(picker.value.toUpperCase()));

  text.addEventListener('input', () => {
    const hex = normalizeHex(text.value);
    if (!hex) {
      text.setAttribute('aria-invalid', 'true');
      return;
    }
    state[key] = hex;
    picker.value = toPickerHex(hex);
    text.setAttribute('aria-invalid', 'false');
    scheduleRender();
  });

  // Snap the field back to something valid once the user moves on.
  text.addEventListener('blur', () => {
    const hex = normalizeHex(text.value);
    apply(hex || state[key]);
  });

  if (swatchId) {
    const holder = $(swatchId);
    for (const hex of swatches) {
      const button = document.createElement('button');
      button.type = 'button';
      button.style.background = hex;
      button.title = hex;
      button.setAttribute('aria-label', `Use ${hex}`);
      button.addEventListener('click', () => apply(hex));
      holder.appendChild(button);
    }
  }

  return { sync: () => apply(state[key]) };
}

/** Segmented radio group backed by a `data-*` attribute. */
function bindSegmented(id, attr, onChange) {
  const group = $(id);
  const buttons = [...group.querySelectorAll('button')];
  const select = (value, notify = true) => {
    for (const b of buttons) b.setAttribute('aria-checked', String(b.dataset[attr] === value));
    if (notify) onChange(value);
  };
  group.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (button) select(button.dataset[attr]);
  });
  return { select };
}

// ------------------------------------------------------------ size chips ---

const sizeChips = $('sizeChips');

function allSizes() {
  return [...new Set([...COMMON_SIZES, ...exportPrefs.custom])].sort((a, b) => a - b);
}

function renderSizeChips() {
  sizeChips.innerHTML = '';
  const selected = new Set(exportPrefs.sizes);

  for (const size of allSizes()) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.setAttribute('aria-pressed', String(selected.has(size)));
    chip.append(`${size}`);

    const isCustom = exportPrefs.custom.includes(size);
    const unusable = exportPrefs.format === 'ico' && size > ICO_MAX;
    if (unusable) {
      chip.disabled = true;
      chip.title = `ICO cannot hold images larger than ${ICO_MAX}px`;
      chip.style.opacity = '0.4';
    }

    chip.addEventListener('click', () => {
      const next = new Set(exportPrefs.sizes);
      next.has(size) ? next.delete(size) : next.add(size);
      exportPrefs.sizes = [...next].sort((a, b) => a - b);
      renderSizeChips();
      save();
    });

    if (isCustom) {
      const remove = document.createElement('span');
      remove.className = 'x';
      remove.textContent = '×';
      remove.title = 'Remove this size';
      remove.addEventListener('click', (event) => {
        event.stopPropagation();
        exportPrefs.custom = exportPrefs.custom.filter((s) => s !== size);
        exportPrefs.sizes = exportPrefs.sizes.filter((s) => s !== size);
        renderSizeChips();
        save();
      });
      chip.appendChild(remove);
    }

    sizeChips.appendChild(chip);
  }

  updateExportSummary();
}

function effectiveSizes() {
  const sizes = [...exportPrefs.sizes].sort((a, b) => a - b);
  return exportPrefs.format === 'ico' ? sizes.filter((s) => s <= ICO_MAX) : sizes;
}

function updateExportSummary() {
  const sizes = effectiveSizes();
  const spec = FORMATS[exportPrefs.format];
  const fileCount = exportPrefs.format === 'ico' ? (sizes.length ? 1 : 0) : sizes.length;

  $('sizesOut').textContent = sizes.length ? `${sizes.length} selected` : 'none';
  $('zipField').classList.toggle('hidden', fileCount < 2);
  $('btnExport').disabled = fileCount === 0;

  const hints = {
    png: 'Lossless, keeps transparency.',
    svg: 'Vector. Scales to any size; the pixel value only sets the width and height attributes.',
    webp: 'Smaller files than PNG, keeps transparency.',
    jpeg: 'No transparency — a solid backdrop is painted behind the icon.',
    ico: `A single .ico holding every selected size up to ${ICO_MAX}px.`,
  };

  let label;
  if (fileCount === 0) label = 'Select at least one size.';
  else if (exportPrefs.format === 'ico') label = `1 file · ${sizes.join(', ')} px`;
  else if (fileCount === 1) label = `1 file · ${spec.label}`;
  else label = `${fileCount} files · ${spec.label}${exportPrefs.zip ? ' · zipped' : ''}`;

  $('formatHint').textContent = `${hints[exportPrefs.format]} ${label}`;
}

// --------------------------------------------------------------- exporting ---

const status = $('exportStatus');
let statusTimer;

function setStatus(message, tone = 'info') {
  clearTimeout(statusTimer);
  status.textContent = message;
  status.style.color = tone === 'error' ? 'var(--danger)' : 'var(--text-dim)';
  if (message) statusTimer = setTimeout(() => (status.textContent = ''), 6000);
}

async function runExport() {
  const sizes = effectiveSizes();
  if (!sizes.length) return setStatus('Select at least one size.', 'error');

  const button = $('btnExport');
  button.disabled = true;
  setStatus('Rendering…');

  try {
    const files = await buildExports(state, {
      format: exportPrefs.format,
      sizes,
      basename: effectiveBasename(),
    });

    if (files.length > 1 && exportPrefs.zip) {
      const bundle = await zipFiles(files, effectiveBasename());
      download(bundle.blob, bundle.name);
      setStatus(`Downloaded ${bundle.name} (${files.length} files).`);
    } else {
      for (const file of files) {
        download(file.blob, file.name);
        // Browsers drop rapid-fire downloads; give each one a beat.
        if (files.length > 1) await new Promise((r) => setTimeout(r, 220));
      }
      setStatus(`Downloaded ${files.length} file${files.length === 1 ? '' : 's'}.`);
    }
  } catch (error) {
    setStatus(error.message || 'Export failed.', 'error');
  } finally {
    button.disabled = false;
    updateExportSummary();
  }
}

// ------------------------------------------------------------------- init ---

load();

const controls = {
  radius: bindRange('radius', 'radius', (v) => `${v}% · ${Math.round((v / 100) * BASE)}px @512`),
  borderWidth: bindRange('borderWidth', 'borderWidth', (v) => `${v}% · ${Math.round((v / 100) * BASE)}px @512`),
  iconScale: bindRange('iconScale', 'iconScale', (v) => `${v}% · ${Math.round((v / 100) * BASE)}px @512`),
  strokeWidth: bindRange('strokeWidth', 'strokeWidth', (v) => v.toFixed(2)),
  gradientAngle: bindRange('gradientAngle', 'gradientAngle', (v) => `${v}°`),
  bgColor: bindColor('bgColor', 'bgColorText', 'bgColor', 'bgSwatches', BG_SWATCHES),
  bgColor2: bindColor('bgColor2', 'bgColor2Text', 'bgColor2'),
  borderColor: bindColor('borderColor', 'borderColorText', 'borderColor'),
  iconColor: bindColor('iconColor', 'iconColorText', 'iconColor', 'iconSwatches', ICON_SWATCHES),
};

const shapeToggle = bindSegmented('shapeToggle', 'shape', (value) => {
  state.shape = value;
  syncShapeVisibility();
  scheduleRender();
});

const bgModeToggle = bindSegmented('bgModeToggle', 'bgmode', (value) => {
  state.bgMode = value;
  syncBgVisibility();
  scheduleRender();
});

const formatToggle = bindSegmented('formatToggle', 'format', (value) => {
  exportPrefs.format = value;
  renderSizeChips();
  save();
});

// --------------------------------------------------------- radius presets ---

const radiusPresetRow = $('radiusPresets');

/** A circle preset only cares about the shape; a square one also pins the radius. */
function matchesRadiusPreset(preset) {
  if (preset.shape === 'circle') return state.shape === 'circle';
  return state.shape === 'square' && Math.abs(state.radius - preset.radius) < 0.05;
}

function syncRadiusPresets() {
  for (const chip of radiusPresetRow.children) {
    chip.setAttribute('aria-pressed', String(matchesRadiusPreset(RADIUS_PRESETS[chip.dataset.index])));
  }
}

function buildRadiusPresets() {
  radiusPresetRow.innerHTML = '';
  RADIUS_PRESETS.forEach((preset, index) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.dataset.index = String(index);
    chip.textContent = preset.label;
    chip.title = preset.note;
    chip.addEventListener('click', () => {
      state.shape = preset.shape;
      if (preset.shape === 'square') state.radius = preset.radius;
      shapeToggle.select(state.shape, false);
      controls.radius.sync();
      syncShapeVisibility();
      scheduleRender();
    });
    radiusPresetRow.appendChild(chip);
  });
  syncRadiusPresets();
}

function syncShapeVisibility() {
  // A circle is a 50% radius, so the slider has nothing left to say.
  $('radiusField').classList.toggle('hidden', state.shape === 'circle');
}

function syncBgVisibility() {
  // The swap button lives inside bgColorField, so a "None" fill hides it too —
  // which is exactly right, since there is no background color to trade.
  $('bgColorField').classList.toggle('hidden', state.bgMode === 'none');
  $('bgColor2Field').classList.toggle('hidden', state.bgMode !== 'gradient');
  $('btnSwapColors').title =
    state.bgMode === 'gradient'
      ? 'Trades the icon color with the gradient’s first stop'
      : 'Trades the background and icon colors';
}

$('btnSwapColors').addEventListener('click', () => {
  // A straight swap, so clicking twice puts everything back.
  const previousBackground = state.bgColor;
  state.bgColor = state.iconColor;
  state.iconColor = previousBackground;
  controls.bgColor.sync();
  controls.iconColor.sync();
  scheduleRender();
  setStatus('Swapped the background and icon colors.');
});

function syncBorderVisibility() {
  $('borderWidthField').classList.toggle('hidden', !state.border);
  $('borderColorField').classList.toggle('hidden', !state.border);
}

$('borderOn').addEventListener('change', (event) => {
  state.border = event.target.checked;
  syncBorderVisibility();
  scheduleRender();
});

$('asZip').addEventListener('change', (event) => {
  exportPrefs.zip = event.target.checked;
  updateExportSummary();
  save();
});

$('filename').addEventListener('input', (event) => {
  // An empty field is the way back to following the icon name.
  exportPrefs.basename = event.target.value.trim() ? event.target.value : null;
  syncFilenameHint();
  save();
});

$('filename').addEventListener('blur', () => {
  if (exportPrefs.basename !== null) exportPrefs.basename = sanitizeName(exportPrefs.basename);
  syncFilenameField();
  save();
});

$('btnAddSize').addEventListener('click', () => {
  const input = $('customSize');
  const value = Math.round(Number(input.value));
  if (!value || value < 1) return setStatus('Enter a size between 1 and 4096 px.', 'error');

  const size = clampSize(value, 1, 4096);
  if (!COMMON_SIZES.includes(size) && !exportPrefs.custom.includes(size)) {
    exportPrefs.custom.push(size);
  }
  if (!exportPrefs.sizes.includes(size)) exportPrefs.sizes.push(size);
  exportPrefs.sizes.sort((a, b) => a - b);
  input.value = '';
  renderSizeChips();
  save();
});

$('customSize').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    $('btnAddSize').click();
  }
});

for (const button of document.querySelectorAll('[data-preset]')) {
  button.addEventListener('click', () => {
    const preset = button.dataset.preset;
    if (preset === 'clear') {
      exportPrefs.sizes = [];
    } else {
      const sizes = SIZE_PRESETS[preset];
      exportPrefs.custom = [...new Set([...exportPrefs.custom, ...sizes.filter((s) => !COMMON_SIZES.includes(s))])];
      exportPrefs.sizes = [...sizes].sort((a, b) => a - b);
    }
    renderSizeChips();
    save();
  });
}

$('btnTheme').addEventListener('click', () => {
  ui.theme = THEMES[(THEMES.indexOf(ui.theme) + 1) % THEMES.length];
  applyTheme();
  setStatus(THEME_LABEL[ui.theme].replace('Theme: ', 'Theme set to '));
  save();
});

$('btnExport').addEventListener('click', runExport);

$('btnQuickPng').addEventListener('click', async () => {
  const size = Math.max(...(exportPrefs.sizes.length ? exportPrefs.sizes : [512]));
  try {
    const [file] = await buildExports(state, {
      format: 'png',
      sizes: [size],
      basename: effectiveBasename(),
    });
    download(file.blob, file.name);
    setStatus(`Downloaded ${file.name}.`);
  } catch (error) {
    setStatus(error.message || 'Export failed.', 'error');
  }
});

$('btnCopySvg').addEventListener('click', async () => {
  const svg = buildSvg(state, BASE, { uid: 'copy' });
  try {
    await navigator.clipboard.writeText(svg);
    setStatus('SVG markup copied to the clipboard.');
  } catch {
    setStatus('The browser blocked clipboard access.', 'error');
  }
});

$('btnReset').addEventListener('click', () => {
  state = { ...DEFAULT_STATE };
  syncControls();
  picker.ensureVisible(state.icon);
  picker.setSelected(state.icon, { reveal: true });
  scheduleRender();
  setStatus('Reset to the defaults.');
});

$('btnRandomIcon').addEventListener('click', () => {
  const pool = picker.results();
  // Stay inside whatever the person is currently browsing.
  state.icon = pool[Math.floor(Math.random() * pool.length)] ?? state.icon;
  picker.setSelected(state.icon, { reveal: true });
  scheduleRender();
});

$('btnToggleChecker').addEventListener('click', (event) => {
  const frameEl = $('previewFrame');
  const on = frameEl.dataset.checker !== 'true';
  frameEl.dataset.checker = String(on);
  event.target.textContent = on ? 'Hide transparency grid' : 'Show transparency grid';
});

const picker = createPicker({
  grid: $('iconGrid'),
  search: $('iconSearch'),
  count: $('searchCount'),
  sourceToggle: $('sourceToggle'),
  onSelect: (name) => {
    state.icon = name;
    scheduleRender();
  },
});

/** Pushes the whole of `state` back into the form controls. */
function syncControls() {
  for (const control of Object.values(controls)) control.sync();
  shapeToggle.select(state.shape, false);
  bgModeToggle.select(state.bgMode, false);
  $('borderOn').checked = state.border;
  syncShapeVisibility();
  syncBgVisibility();
  syncBorderVisibility();
}

formatToggle.select(exportPrefs.format, false);
$('asZip').checked = exportPrefs.zip;
$('iconSearch').placeholder = `Search ${ICON_NAMES.length.toLocaleString()} icons…`;
/** Credits the icon set and links out to it. Built as nodes, not innerHTML. */
function renderCredit() {
  const link = document.createElement('a');
  link.href = LUCIDE_HOME;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = `Lucide v${LUCIDE_VERSION}`;
  link.title = `Browse the icon library at ${LUCIDE_HOME.replace(/^https?:\/\//, '')}`;

  $('lucideVersion').replaceChildren(
    link,
    ` + Lab v${LAB_VERSION} · ` +
      `${CORE_NAMES.length.toLocaleString()} core, ${LAB_NAMES.length.toLocaleString()} lab`,
  );
}

renderCredit();

applyTheme();
syncControls();
buildRadiusPresets();
renderSizeChips();
renderBrandMark();
picker.setSelected(state.icon, { reveal: true });
renderAll();
