/* ═══════════════════════════════════════════════════════════════
   Gamvora — main.js  (index page, global scope)
   ═══════════════════════════════════════════════════════════════ */

/* ── DOM refs ─────────────────────────────────────────────── */
const gamesGrid        = document.getElementById('gamesGrid');
const trendingGrid     = document.getElementById('trendingGrid');
const popularGrid      = document.getElementById('popularGrid');
const searchInput      = document.getElementById('searchInput');
const searchDropdown   = document.getElementById('searchDropdown');
const loadMoreBtn      = document.getElementById('loadMoreBtn');
const resultsInfo      = document.getElementById('resultsInfo');
const genreFilter      = document.getElementById('genreFilter');
const sizeFilter       = document.getElementById('sizeFilter');
const sortFilter       = document.getElementById('sortFilter');
const clearFiltersBtn  = document.getElementById('clearFiltersBtn');
const activeFilters    = document.getElementById('activeFilters');
const featuredHeroCard = document.getElementById('featuredHeroCard');
const trendingSection  = document.getElementById('trendingSection');
const popularSection   = document.getElementById('popularSection');
const globalLoader     = document.getElementById('globalLoader');

/* ── State ────────────────────────────────────────────────── */
let allGames      = [];
let filteredGames = [];
let page          = 0;
const PAGE_SIZE   = 24;
const SEARCH_POOL_LIMIT = 12000;
const state       = { q: '', genre: '', size: '', sort: 'relevance' };

/* ── Helpers ──────────────────────────────────────────────── */
const debounce = (fn, delay = 320) => {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
};

const scoreMatch = (title, query) => {
  const t = GV.normalize(title);
  const q = GV.normalize(query);
  if (!q) return 1;
  if (t === q)           return 1200;
  if (t.startsWith(q))  return 900;
  if (t.includes(q))    return 600 - t.indexOf(q);
  const words = q.split(' ').filter(w => w.length > 1);
  let score = 0;
  for (const w of words) if (t.includes(w)) score += 110;
  return score;
};

const sizeMatch = (g, filter) => {
  if (!filter) return true;
  const size = GV.parseFileSizeToGB(g.fileSize);
  if (filter === 'small')  return size < 2;
  if (filter === 'medium') return size >= 2 && size <= 20;
  if (filter === 'large')  return size > 20;
  return true;
};

const applySort = (arr) => {
  const copy = [...arr];
  if (state.sort === 'titleAsc')  copy.sort((a,b) => a.title.localeCompare(b.title));
  if (state.sort === 'titleDesc') copy.sort((a,b) => b.title.localeCompare(a.title));
  if (state.sort === 'sizeAsc')   copy.sort((a,b) => GV.parseFileSizeToGB(a.fileSize) - GV.parseFileSizeToGB(b.fileSize));
  if (state.sort === 'sizeDesc')  copy.sort((a,b) => GV.parseFileSizeToGB(b.fileSize) - GV.parseFileSizeToGB(a.fileSize));
  return copy;
};

/* ── Active filter chips ──────────────────────────────────── */
const renderActiveFilterChips = () => {
  const chips = [];
  if (state.q)                                   chips.push(`Search: "${state.q}"`);
  if (state.genre)                               chips.push(`Genre: ${state.genre}`);
  if (state.size)                                chips.push(`Size: ${state.size}`);
  if (state.sort && state.sort !== 'relevance')  chips.push(`Sort: ${state.sort}`);
  if (activeFilters) activeFilters.innerHTML = chips.map(c => `<span class="filter-chip">${c}</span>`).join('');
};

/* ── Toggle trending/popular when searching ───────────────── */
const toggleTopSections = (searching) => {
  if (trendingSection) trendingSection.style.display = searching ? 'none' : '';
  if (popularSection)  popularSection.style.display  = searching ? 'none' : '';
};

/* ── Search Autocomplete Dropdown ─────────────────────────── */
let dropdownActive = false;

const highlightMatch = (text, query) => {
  if (!query) return text;
  const re = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi');
  return text.replace(re, `<mark>$1</mark>`);
};

const showDropdown = (matches) => {
  if (!searchDropdown) return;
  if (!matches.length) { hideDropdown(); return; }
  searchDropdown.innerHTML = matches.slice(0, 8).map((g, i) => `
    <div class="dropdown-item" data-idx="${i}" data-title="${GV.slugify(g.title)}" tabindex="-1">
      <div class="dropdown-thumb">
        <img src="images/default-game.svg" alt="" data-game-title="${g.title}" class="dd-img" />
      </div>
      <div class="dropdown-info">
        <span class="dropdown-name">${highlightMatch(g.baseTitle || g.title, state.q)}</span>
        <span class="dropdown-meta">${g.genre} &nbsp;•&nbsp; ${g.fileSize}</span>
      </div>
    </div>`).join('');
  searchDropdown.style.display = 'block';
  dropdownActive = true;

  /* Performance: keep dropdown thumbnails on fallback to avoid network spikes while typing */

  /* Click on dropdown item */
  searchDropdown.querySelectorAll('.dropdown-item').forEach(item => {
    item.addEventListener('mousedown', (e) => {
      e.preventDefault();
      window.location.href = `game.html?title=${item.dataset.title}`;
    });
  });
};

const hideDropdown = () => {
  if (searchDropdown) searchDropdown.style.display = 'none';
  dropdownActive = false;
};

/* ── Render chunk ─────────────────────────────────────────── */
const renderChunk = (reset = false) => {
  if (reset) { gamesGrid.innerHTML = ''; page = 0; }
  const start = page * PAGE_SIZE;
  const end   = start + PAGE_SIZE;
  const chunk = filteredGames.slice(start, end);

  if (!chunk.length && reset) {
    gamesGrid.innerHTML = `<div class="empty-state">🎮 No games match your search. Try a different title or clear filters.</div>`;
    if (loadMoreBtn) loadMoreBtn.style.display = 'none';
    if (resultsInfo) resultsInfo.textContent = '0 games found';
    return;
  }

  /* Synchronous card creation — images load lazily */
  const fragment = document.createDocumentFragment();
  for (const game of chunk) fragment.appendChild(GV.makeCard(game));
  gamesGrid.appendChild(fragment);

  page++;
  if (loadMoreBtn) loadMoreBtn.style.display = end >= filteredGames.length ? 'none' : 'inline-flex';
  if (resultsInfo) resultsInfo.textContent = `${filteredGames.length.toLocaleString()} games found`;
};

/* ── Build genre dropdown ─────────────────────────────────── */
const buildGenreFilter = () => {
  if (!genreFilter) return;
  const genres = [...new Set(allGames.map(g => g.genre || GV.genreFromTitle(g.title)))].sort();
  genres.forEach(g => {
    const op = document.createElement('option');
    op.value = g; op.textContent = g;
    genreFilter.appendChild(op);
  });
};

/* ── Render trending / popular / hero ─────────────────────── */
const renderTopSections = async () => {
  const trending = allGames.slice(0, 8);
  const popular  = allGames.slice(8, 16);

  if (trendingGrid) {
    trendingGrid.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (const g of trending) frag.appendChild(GV.makeCard(g));
    trendingGrid.appendChild(frag);
  }
  if (popularGrid) {
    popularGrid.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (const g of popular) frag.appendChild(GV.makeCard(g));
    popularGrid.appendChild(frag);
  }
  if (featuredHeroCard && trending[0]) {
    featuredHeroCard.innerHTML = '';
    featuredHeroCard.appendChild(await GV.makeHeroFeatureCard(trending[0]));
  }
};

/* ── Apply all filters + sort ─────────────────────────────── */
const applyFilters = () => {
  const isSearching = !!(state.q || state.genre || state.size || state.sort !== 'relevance');
  let base = [...allGames];
  const searchPool = base.length > SEARCH_POOL_LIMIT ? base.slice(0, SEARCH_POOL_LIMIT) : base;

  if (state.q) {
    base = searchPool
      .map(g => ({ game: g, score: scoreMatch(g.title, state.q) }))
      .filter(x => x.score > 0)
      .sort((a,b) => b.score - a.score)
      .map(x => x.game);
  }

  base = base
    .filter(g => !state.genre || g.genre === state.genre)
    .filter(g => sizeMatch(g, state.size));

  filteredGames = applySort(base);
  renderActiveFilterChips();
  toggleTopSections(isSearching);
  renderChunk(true);

  if (state.q) {
    const allGamesSection = document.getElementById('allGamesSection');
    if (allGamesSection) allGamesSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
};

/* ── Debounced search ─────────────────────────────────────── */
const debouncedSearch = debounce((value) => {
  state.q = value.trim();

  if (state.q.length >= 2) {
    const pool = allGames.length > SEARCH_POOL_LIMIT ? allGames.slice(0, SEARCH_POOL_LIMIT) : allGames;
    const matches = pool
      .map(g => ({ game: g, score: scoreMatch(g.title, state.q) }))
      .filter(x => x.score > 0)
      .sort((a,b) => b.score - a.score)
      .slice(0, 8)
      .map(x => x.game);
    showDropdown(matches);
  } else {
    hideDropdown();
  }

  applyFilters();
}, 320);

/* ── Init ─────────────────────────────────────────────────── */
const initMain = async () => {
  try {
    if (globalLoader) globalLoader.classList.add('show');
    GV.renderAuthArea();
    allGames = await GV.loadGames();
    buildGenreFilter();
    filteredGames = [...allGames];

    /* Render top sections async (hero needs RAWG), grid is sync */
    renderTopSections();
    renderChunk(true);

    /* Search */
    if (searchInput) {
      searchInput.addEventListener('input', e => debouncedSearch(e.target.value));
      searchInput.addEventListener('focus', () => {
        if (state.q.length >= 2 && dropdownActive && searchDropdown)
          searchDropdown.style.display = 'block';
      });
      searchInput.addEventListener('blur', () => setTimeout(hideDropdown, 150));
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { hideDropdown(); searchInput.blur(); }
        if (e.key === 'Enter' && state.q) {
          hideDropdown();
          document.getElementById('allGamesSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    }

    if (genreFilter)     genreFilter.addEventListener('change',     e => { state.genre = e.target.value; applyFilters(); });
    if (sizeFilter)      sizeFilter.addEventListener('change',      e => { state.size  = e.target.value; applyFilters(); });
    if (sortFilter)      sortFilter.addEventListener('change',      e => { state.sort  = e.target.value; applyFilters(); });
    if (clearFiltersBtn) clearFiltersBtn.addEventListener('click', () => {
      state.q = ''; state.genre = ''; state.size = ''; state.sort = 'relevance';
      if (searchInput) searchInput.value = '';
      if (genreFilter) genreFilter.value = '';
      if (sizeFilter)  sizeFilter.value  = '';
      if (sortFilter)  sortFilter.value  = 'relevance';
      hideDropdown();
      toggleTopSections(false);
      applyFilters();
    });
    if (loadMoreBtn) loadMoreBtn.addEventListener('click', () => renderChunk(false));

    /* Support button */
    document.getElementById('supportBtn')?.addEventListener('click', () => {
      document.getElementById('supportModal')?.classList.add('open');
    });
    document.getElementById('supportModalClose')?.addEventListener('click', () => {
      document.getElementById('supportModal')?.classList.remove('open');
    });
    document.getElementById('supportModal')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) e.currentTarget.classList.remove('open');
    });

    /* Support form */
    document.getElementById('supportForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name    = String(document.getElementById('supportName').value || '').replace(/<[^>]*>/g,'').trim().slice(0,100);
      const email   = String(document.getElementById('supportEmail').value || '').replace(/<[^>]*>/g,'').trim().slice(0,200);
      const subject = String(document.getElementById('supportSubject').value || '').replace(/<[^>]*>/g,'').trim().slice(0,200);
      const message = String(document.getElementById('supportMessage').value || '').replace(/<[^>]*>/g,'').trim().slice(0,2000);
      const msg     = document.getElementById('supportMsg');

      if (!name || !email || !message) {
        msg.textContent = 'Name, email, and message are required.';
        msg.className = 'admin-msg error';
        return;
      }
      const btn = e.target.querySelector('button[type=submit]');
      btn.disabled = true;
      try {
        await firebase.database().ref('support').push({
          name, email, subject, message,
          timestamp: Date.now(),
          status: 'open'
        });
        msg.textContent = 'Message sent! We\'ll get back to you soon.';
        msg.className = 'admin-msg success';
        e.target.reset();
        setTimeout(() => document.getElementById('supportModal')?.classList.remove('open'), 2500);
      } catch (err) {
        msg.textContent = 'Failed to send. Try again.';
        msg.className = 'admin-msg error';
      } finally { btn.disabled = false; }
    });

    if (globalLoader) globalLoader.classList.remove('show');

  } catch (err) {
    if (gamesGrid) gamesGrid.innerHTML = `<div class="empty-state">⚠️ ${err.message}</div>`;
    if (resultsInfo) resultsInfo.textContent = 'Error loading games';
    if (loadMoreBtn) loadMoreBtn.style.display = 'none';
    if (globalLoader) globalLoader.classList.remove('show');
  }
};

initMain();
