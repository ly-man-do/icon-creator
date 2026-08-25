import { ICONS, LAB_PREFIX, TAGS } from '../data/icons.js';
import { glyphSvg } from './render.js';

export const ICON_NAMES = Object.keys(ICONS);

export const CORE_NAMES = ICON_NAMES.filter((name) => !name.startsWith(LAB_PREFIX));
export const LAB_NAMES = ICON_NAMES.filter((name) => name.startsWith(LAB_PREFIX));

/** Rendering 2,000+ inline SVGs at once is slow, so the grid fills in as you scroll. */
const CHUNK = 180;

/** Lucide Lab icons are stored under a `lab:` key to keep them apart from core. */
export const isLab = (name) => name.startsWith(LAB_PREFIX);

/** The name to show a person: `lab:hot-dog` is just "hot-dog" on screen. */
export const displayName = (name) => (isLab(name) ? name.slice(LAB_PREFIX.length) : name);

const humanize = (name) => displayName(name).replace(/-/g, ' ');

const SOURCES = {
  all: () => ICON_NAMES,
  core: () => CORE_NAMES,
  lab: () => LAB_NAMES,
};

/**
 * How well one search term matches one icon. 0 means no match.
 *
 * Tag position matters: Lucide lists a symbol's most characteristic keyword
 * first, so "home" should surface `house` (whose first tag is "home") ahead of
 * `lamp` (where "home" is third) and well ahead of `book` (which only matches
 * inside the word "homework").
 */
function scoreTerm(key, term) {
  // Match against the visible name — nobody searches for the `lab:` prefix.
  const name = displayName(key);

  if (name === term) return 100;
  if (name.startsWith(term)) return 60;
  // A match on a whole hyphen-separated word beats one buried mid-word.
  if (name.split('-').includes(term)) return 40;
  if (name.includes(term)) return 25;

  // Lucide Lab ships no keyword file, so lab icons match on their name alone.
  const tags = TAGS[key];
  if (!tags) return 0;

  let best = 0;
  for (let i = 0; i < tags.length; i++) {
    const tag = tags[i];
    if (tag === term || tag.split(' ').includes(term)) {
      best = Math.max(best, 20 - Math.min(i, 9) * 1.5);
    } else if (tag.includes(term)) {
      best = Math.max(best, 4);
    }
  }
  return best;
}

/**
 * Ranked search over icon names and Lucide's own keyword tags. Every term has
 * to match something, so "cloud upload" narrows rather than widens.
 *
 * @param {string} query
 * @param {'all'|'core'|'lab'} [source] which collection to search
 * @returns {string[]} matching icon keys, best first
 */
export function searchIcons(query, source = 'all') {
  const pool = (SOURCES[source] || SOURCES.all)();
  const q = query.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!q) return pool;

  const terms = q.split(' ');
  const scored = [];

  for (const key of pool) {
    let total = 0;
    for (const term of terms) {
      const score = scoreTerm(key, term);
      if (!score) {
        total = 0;
        break;
      }
      total += score;
    }
    // Shorter names win ties: `user` should come before `user-round-search`.
    // Core outranks lab on an otherwise exact tie, since it is the maintained set.
    if (total) scored.push([key, total - displayName(key).length * 0.01 - (isLab(key) ? 0.5 : 0)]);
  }

  scored.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return scored.map(([key]) => key);
}

/**
 * Wires up the searchable icon grid.
 *
 * @param {object} opts
 * @param {HTMLElement} opts.grid
 * @param {HTMLInputElement} opts.search
 * @param {HTMLElement} opts.count
 * @param {HTMLElement} [opts.sourceToggle] radiogroup of `data-source` buttons
 * @param {(name: string) => void} opts.onSelect
 */
export function createPicker({ grid, search, count, sourceToggle, onSelect }) {
  let source = 'all';
  let results = ICON_NAMES;
  let rendered = 0;
  let selected = null;
  let observer = null;

  function cellFor(name) {
    const label = humanize(name);
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'icon-cell';
    cell.dataset.name = name;
    cell.title = isLab(name) ? `${label} — Lucide Lab` : label;
    cell.setAttribute('role', 'option');
    cell.setAttribute('aria-label', cell.title);
    cell.setAttribute('aria-selected', String(name === selected));
    if (isLab(name)) cell.dataset.lab = 'true';
    cell.innerHTML = glyphSvg(name);
    cell.tabIndex = -1;
    return cell;
  }

  function renderChunk() {
    const slice = results.slice(rendered, rendered + CHUNK);
    if (!slice.length) return;
    const frag = document.createDocumentFragment();
    for (const name of slice) frag.appendChild(cellFor(name));
    grid.insertBefore(frag, grid.querySelector('.grid-sentinel'));
    rendered += slice.length;
    if (rendered >= results.length) observer?.disconnect();
  }

  function rebuild() {
    observer?.disconnect();
    grid.innerHTML = '';
    rendered = 0;
    grid.scrollTop = 0;

    const labCount = results.reduce((sum, name) => sum + (isLab(name) ? 1 : 0), 0);
    count.textContent = results.length
      ? `${results.length.toLocaleString()} icon${results.length === 1 ? '' : 's'}` +
        (labCount && source === 'all' ? ` · ${labCount.toLocaleString()} from Lab` : '')
      : '';

    if (!results.length) {
      const empty = document.createElement('p');
      empty.className = 'grid-empty';
      const term = search.value.trim();
      empty.textContent = term
        ? `No ${source === 'all' ? '' : source + ' '}icons match “${term}”.`.replace('  ', ' ')
        : 'No icons in this collection.';
      grid.appendChild(empty);
      return;
    }

    const sentinel = document.createElement('div');
    sentinel.className = 'grid-sentinel';
    grid.appendChild(sentinel);

    renderChunk();

    observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) renderChunk();
      },
      { root: grid, rootMargin: '200px' },
    );
    observer.observe(sentinel);
  }

  /** Ensures a selected icon is present in the DOM even if far down the list. */
  function revealSelected() {
    let cell = grid.querySelector(`[data-name="${CSS.escape(selected)}"]`);
    while (!cell && rendered < results.length) {
      renderChunk();
      cell = grid.querySelector(`[data-name="${CSS.escape(selected)}"]`);
    }
    if (!cell) return;

    // Scroll the grid itself rather than calling scrollIntoView, which would
    // drag the whole page along with it.
    const top = cell.offsetTop; // .icon-grid is position:relative, so this is grid-relative
    const bottom = top + cell.offsetHeight;
    if (top < grid.scrollTop) grid.scrollTop = top - 6;
    else if (bottom > grid.scrollTop + grid.clientHeight) {
      grid.scrollTop = bottom - grid.clientHeight + 6;
    }
  }

  function setSelected(name, { reveal = false } = {}) {
    selected = name;
    for (const cell of grid.querySelectorAll('.icon-cell')) {
      cell.setAttribute('aria-selected', String(cell.dataset.name === name));
    }
    if (reveal && selected) revealSelected();
  }

  grid.addEventListener('click', (event) => {
    const cell = event.target.closest('.icon-cell');
    if (!cell) return;
    setSelected(cell.dataset.name);
    onSelect(cell.dataset.name);
  });

  grid.addEventListener('keydown', (event) => {
    const keys = ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'];
    if (!keys.includes(event.key) || !results.length) return;
    event.preventDefault();

    // Column count is whatever the responsive grid settled on.
    const cells = [...grid.querySelectorAll('.icon-cell')];
    const perRow = Math.max(1, Math.round(grid.clientWidth / (cells[0]?.offsetWidth || 44)));
    const current = Math.max(0, results.indexOf(selected));
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: perRow, ArrowUp: -perRow }[event.key];

    let next = current;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = results.length - 1;
    else next = current + step;

    next = Math.min(results.length - 1, Math.max(0, next));
    setSelected(results[next], { reveal: true });
    onSelect(results[next]);
  });

  function refresh() {
    results = searchIcons(search.value, source);
    rebuild();
    if (selected) setSelected(selected);
  }

  let searchTimer;
  search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(refresh, 120);
  });

  sourceToggle?.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    source = button.dataset.source;
    for (const b of sourceToggle.querySelectorAll('button')) {
      b.setAttribute('aria-checked', String(b.dataset.source === source));
    }
    refresh();
  });

  rebuild();

  return {
    setSelected,
    reveal: () => selected && revealSelected(),
    results: () => results,
    /** Switches collection so a programmatic pick is actually visible. */
    ensureVisible(name) {
      if (source !== 'all' && isLab(name) !== (source === 'lab')) {
        source = 'all';
        for (const b of sourceToggle?.querySelectorAll('button') || []) {
          b.setAttribute('aria-checked', String(b.dataset.source === 'all'));
        }
      }
      if (search.value.trim()) {
        search.value = '';
      }
      refresh();
    },
  };
}
