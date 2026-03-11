/* ═══════════════════════════════════════════════════════════════
   Gamvora — games.js  (global scope, no ES modules)
   ═══════════════════════════════════════════════════════════════ */

const DATA_FILE    = "games1_clean.json";
const RAWG_KEY     = "82b11ae89752474a9c5f2b67534b988a";
const RAWG_BASE    = "https://api.rawg.io/api";
const FALLBACK_IMG = "images/default-game.svg";
const ADMIN_EMAIL  = "psblue909@gmail.com";
const CACHE_TTL    = 24 * 60 * 60 * 1000; // 24 hours
const MAX_ACTIVE_GAMES = 18000; // performance cap for active in-memory/render dataset

/* ── Security: HTML escape ──────────────────────────────────── */
const escapeHtml = (str) => {
  const d = document.createElement('div');
  d.textContent = String(str || '');
  return d.innerHTML;
};

/* ── Input sanitizer ────────────────────────────────────────── */
const sanitize = (str, maxLen = 500) =>
  String(str || '').replace(/<[^>]*>/g, '').replace(/[<>"'`]/g, '').trim().slice(0, maxLen);

/* ── localStorage cache ─────────────────────────────────────── */
const getCached = (key) => {
  try {
    const item = localStorage.getItem(`gv_${key}`);
    if (!item) return null;
    const { data, ts } = JSON.parse(item);
    if (Date.now() - ts > CACHE_TTL) { localStorage.removeItem(`gv_${key}`); return null; }
    return data;
  } catch { return null; }
};

const setCache = (key, data) => {
  try {
    localStorage.setItem(`gv_${key}`, JSON.stringify({ data, ts: Date.now() }));
  } catch {
    try {
      const keys = Object.keys(localStorage).filter(k => k.startsWith('gv_'));
      keys.slice(0, Math.ceil(keys.length / 2)).forEach(k => localStorage.removeItem(k));
      localStorage.setItem(`gv_${key}`, JSON.stringify({ data, ts: Date.now() }));
    } catch { /* ignore */ }
  }
};

/* ── API Request Queue (max 3 concurrent RAWG calls) ────────── */
const _apiQueue = [];
let _activeRequests = 0;
const MAX_CONCURRENT_API = 3;

const enqueueApi = (fn) => new Promise((resolve, reject) => {
  _apiQueue.push({ fn, resolve, reject });
  processApiQueue();
});

const processApiQueue = async () => {
  if (_activeRequests >= MAX_CONCURRENT_API || !_apiQueue.length) return;
  _activeRequests++;
  const { fn, resolve, reject } = _apiQueue.shift();
  try { resolve(await fn()); }
  catch (e) { reject(e); }
  finally { _activeRequests--; processApiQueue(); }
};

/* ── In-memory caches ───────────────────────────────────────── */
const _imageCache   = new Map();
const _detailsCache = new Map();

/* ── Known popular titles (for sorting) ─────────────────────── */
const POPULAR_TITLES = [
  "gta","grand theft auto","cyberpunk","elden ring","red dead","witcher",
  "call of duty","battlefield","assassin","far cry","forza","fifa","nba",
  "minecraft","ark","rust","valheim","halo","doom","resident evil",
  "god of war","spider-man","batman","mortal kombat","street fighter",
  "dark souls","sekiro","bloodborne","horizon","ghost of tsushima",
  "death stranding","last of us","uncharted","tomb raider","hitman",
  "metro","stalker","dying light","days gone","outriders","borderlands",
  "destiny","warframe","apex","pubg","fortnite","overwatch","rainbow six",
  "division","watch dogs","mafia","saints row","just cause","rage",
  "bioshock","dishonored","prey","deus ex","mass effect","dragon age",
  "baldur","divinity","pathfinder","pillars","tyranny","wasteland",
  "civilization","total war","age of empires","starcraft","command",
  "company of heroes","warhammer","xcom","crusader kings","europa",
  "hearts of iron","victoria","stellaris","cities skylines","planet coaster",
  "two point","planet zoo","jurassic world","rollercoaster","tropico",
  "football manager","nhl","madden","f1","motogp","dirt","wreckfest",
  "need for speed","burnout","grid","project cars","assetto corsa",
  "escape simulator","portal","half life","left 4 dead","team fortress",
  "counter strike","dota","league","world of warcraft","final fantasy",
  "persona","yakuza","like a dragon","monster hunter","devil may cry",
  "tekken","soul calibur","guilty gear","dragon ball","naruto","one piece"
];

/* ── Genre map ──────────────────────────────────────────────── */
const GENRE_MAP = [
  { key: "Simulator",  words: ["simulator","manager","tycoon","farming","supermarket","zoo","planet","city","cities"] },
  { key: "Action",     words: ["fight","combat","war","strike","shooter","ninja","battle","assault","doom","halo","call of duty","battlefield"] },
  { key: "RPG",        words: ["rpg","dragon","souls","fantasy","quest","elden","witcher","baldur","diablo","persona","yakuza","final fantasy"] },
  { key: "Strategy",   words: ["strategy","civilization","command","age of","total war","empire","crusader","hearts of iron","stellaris","xcom"] },
  { key: "Horror",     words: ["horror","dead","evil","haunt","fear","resident","outlast","silent","dying","days gone"] },
  { key: "Adventure",  words: ["adventure","journey","story","legend","explore","uncharted","tomb","spider","batman","assassin"] },
  { key: "Racing",     words: ["race","racing","drift","car","motorsport","nascar","forza","rally","f1","motogp","dirt","grid","need for speed"] },
  { key: "Sports",     words: ["football","fifa","nba","wwe","sport","soccer","tennis","golf","nhl","madden"] },
  { key: "Puzzle",     words: ["puzzle","escape","mystery","riddle","portal","two point"] },
  { key: "Survival",   words: ["survival","survive","craft","minecraft","rust","ark","valheim","stalker","metro"] },
  { key: "Shooter",    words: ["fps","shooter","apex","pubg","fortnite","overwatch","rainbow","division","warframe","destiny"] }
];

/* ── Global namespace ───────────────────────────────────────── */
window.GV = window.GV || {};
window.NP = window.GV; // backward compat

GV.ADMIN_EMAIL = ADMIN_EMAIL;

GV.slugify = (text) =>
  encodeURIComponent(
    (text || "").toLowerCase().replace(/[^\w\s-]/g,"").trim().replace(/\s+/g,"-")
  );

GV.normalize = (text = "") =>
  text.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^\w\s]/g," ").replace(/\s+/g," ").trim();

GV.cleanTitle = (title = "") =>
  GV.normalize(title)
    .replace(/\b(build|v|version|update|patch|hotfix|repack|onlinefix|fitgirl|codex|skidrow|plaza|gog|multi\d*)\b.*$/i,"")
    .replace(/\b\d+(\.\d+)+[a-z]?\b/gi,"")
    .replace(/\b\d{5,}\b/g,"")
    .replace(/\s+/g," ").trim();

GV.baseTitle = (title = "") => {
  const cleaned = String(title || "")
    .replace(/[\[\]{}()]/g, " ")
    .replace(/[|]/g, " ")
    .replace(/\b(repack|portable|multi\d*|onlinefix|fitgirl|codex|skidrow|plaza|gog|steamrip|elamigos|dodi|razor1911)\b/gi, " ")
    .replace(/\b(build|version|ver|patch|update|hotfix)\b[\s:._-]*[\w.\-]*/gi, " ")
    .replace(/\bv[\s._-]?\d+(\.\d+)*[a-z]?\b/gi, " ")
    .replace(/\b\d+(\.\d+){1,}[a-z]?\b/gi, " ")
    .replace(/\b\d{4,}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || String(title || "").trim();
};

GV.parseFileSizeToGB = (sizeText = "0 GB") => {
  const val = parseFloat(sizeText) || 0;
  const low = (sizeText || "").toLowerCase();
  if (low.includes("mb")) return val / 1024;
  if (low.includes("kb")) return val / (1024 * 1024);
  return val;
};

GV.genreFromTitle = (title = "") => {
  const n = GV.normalize(title);
  for (const g of GENRE_MAP) {
    if (g.words.some(w => n.includes(w))) return g.key;
  }
  return "Adventure";
};

GV.popularityScore = (title = "", sizeGB = 0) => {
  const n = GV.normalize(title);
  let score = 0;
  for (const kw of POPULAR_TITLES) {
    if (n.includes(kw)) { score += 1000; break; }
  }
  score += Math.min(sizeGB * 3, 300);
  return score;
};

GV.isAdmin = () => {
  if (typeof firebase === 'undefined') return false;
  const user = firebase.auth().currentUser;
  return !!(user && user.email === ADMIN_EMAIL);
};

const mockSpecs = (sizeGB) => ({
  ram:     sizeGB > 30 ? "16 GB" : sizeGB > 10 ? "12 GB" : "8 GB",
  cpu:     sizeGB > 30 ? "Intel i7 / Ryzen 7" : "Intel i5 / Ryzen 5",
  gpu:     sizeGB > 30 ? "RTX 3060 / RX 6700" : "GTX 1060 / RX 580",
  storage: `${Math.ceil(sizeGB)} GB`
});

const safeImage = (img) => {
  if (!img) return;
  img.loading = "lazy";
  img.decoding = "async";
  img.onerror = () => { img.onerror = null; img.src = FALLBACK_IMG; };
};

/* ── RAWG API ───────────────────────────────────────────────── */
const rawgFetch = async (path) => {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${RAWG_BASE}${path}${sep}key=${RAWG_KEY}`);
  if (!res.ok) throw new Error(`RAWG ${res.status}`);
  return res.json();
};

const pickBestResult = (title, results) => {
  const target = GV.normalize(GV.cleanTitle(title));
  let best = null, bestScore = -Infinity;
  for (const r of results) {
    const name = GV.normalize(r?.name || "");
    if (!name) continue;
    let score = 0;
    if (name === target)              score += 1000;
    else if (name.startsWith(target)) score += 700;
    else if (name.includes(target))   score += 400;
    const words = target.split(" ").filter(w => w.length > 2);
    for (const w of words) if (name.includes(w)) score += 60;
    if ((r?.rating || 0) > 0) score += r.rating * 3;
    if (score > bestScore) { bestScore = score; best = r; }
  }
  return best || results[0] || null;
};

GV.fetchRawgDetails = async (title) => {
  const key = GV.normalize(title);
  if (_detailsCache.has(key)) return _detailsCache.get(key);
  const lsKey = `detail_${key.slice(0,40)}`;
  const cached = getCached(lsKey);
  if (cached !== null) { _detailsCache.set(key, cached); return cached; }
  try {
    const q = encodeURIComponent(GV.cleanTitle(title) || title);
    const searchData = await rawgFetch(`/games?search=${q}&page_size=8&search_precise=true`);
    const results = searchData?.results || [];
    if (!results.length) { _detailsCache.set(key, null); return null; }
    const best = pickBestResult(title, results);
    if (!best) { _detailsCache.set(key, null); return null; }
    let detail = best;
    try { detail = await rawgFetch(`/games/${best.id}`); } catch (_) {}
    const obj = {
      id:          detail.id,
      name:        detail.name,
      cover:       detail.background_image || null,
      rating:      detail.rating || null,
      released:    detail.released || null,
      description: detail.description_raw || detail.description || null,
      genres:      (detail.genres || []).map(g => g.name),
      platforms:   (detail.platforms || []).map(p => p.platform.name),
      screenshots: []
    };
    try {
      const shots = await rawgFetch(`/games/${best.id}/screenshots?page_size=6`);
      obj.screenshots = (shots?.results || []).map(s => s.image);
    } catch (_) {}
    _detailsCache.set(key, obj);
    setCache(lsKey, obj);
    return obj;
  } catch (e) {
    _detailsCache.set(key, null);
    return null;
  }
};

GV.getCoverUrl = async (title) => {
  const key = GV.normalize(title);
  if (_imageCache.has(key)) return _imageCache.get(key);
  const lsKey = `img_${key.slice(0,40)}`;
  const cached = getCached(lsKey);
  if (cached) { _imageCache.set(key, cached); return cached; }
  try {
    const details = await GV.fetchRawgDetails(title);
    if (details?.cover) {
      _imageCache.set(key, details.cover);
      setCache(lsKey, details.cover);
      return details.cover;
    }
  } catch (_) {}
  _imageCache.set(key, FALLBACK_IMG);
  return FALLBACK_IMG;
};

/* ── IntersectionObserver — lazy image loading ──────────────── */
const _imageObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    const card = entry.target;
    const title = card.dataset.gameTitle;
    if (title) {
      _imageObserver.unobserve(card);
      _loadCardImage(card, title);
    }
  });
}, { rootMargin: '400px 0px' });

const _loadCardImage = async (card, title) => {
  const imgEl    = card.querySelector('.card-img');
  const skeleton = card.querySelector('.img-skeleton');
  if (!imgEl) return;
  try {
    const url = await enqueueApi(() => GV.getCoverUrl(title));
    imgEl.src = url || FALLBACK_IMG;
  } catch {
    imgEl.src = FALLBACK_IMG;
  } finally {
    if (skeleton) { skeleton.style.opacity = '0'; setTimeout(() => skeleton.remove(), 300); }
  }
};

/* ── Load & deduplicate games ───────────────────────────────── */
let _gamesCache = null;

GV.loadGames = async () => {
  if (_gamesCache) return _gamesCache;

  /* Fast path: cached final list */
  const finalCacheKey = 'games_final_v2';
  const finalCached = getCached(finalCacheKey);
  if (Array.isArray(finalCached) && finalCached.length) {
    _gamesCache = finalCached;
    return finalCached;
  }

  const res = await fetch(DATA_FILE);
  if (!res.ok) throw new Error("Failed to load game data.");

  const text = await res.text();

  const parseLenientJson = (input) => {
    const cleaned = input
      .replace(/^\uFEFF/, "")
      .replace(/,\s*([}\]])/g, "$1");
    return JSON.parse(cleaned);
  };

  let rawData;
  try {
    rawData = parseLenientJson(text);
  } catch {
    try {
      const firstObjStart = text.indexOf("{");
      const firstObjEnd = text.lastIndexOf("}");
      if (firstObjStart === -1 || firstObjEnd === -1 || firstObjEnd <= firstObjStart) {
        throw new Error("No JSON object found.");
      }
      const slice = text.slice(firstObjStart, firstObjEnd + 1);
      rawData = parseLenientJson(slice);
    } catch {
      throw new Error("Invalid games source format.");
    }
  }

  let raw = [];
  if (Array.isArray(rawData)) {
    raw = rawData.map(item => ({
      title: item?.title || "Unknown Title",
      fileSize: item?.fileSize || item?.filesize || "Unknown",
      uri: item?.uri || (Array.isArray(item?.uris) ? (item.uris[0] || "") : ""),
      uploadDate: item?.uploadDate || ""
    }));
  } else if (rawData && Array.isArray(rawData.downloads)) {
    raw = rawData.downloads.map(item => ({
      title: item?.title || item?.name || "Unknown Title",
      fileSize: item?.fileSize || item?.filesize || "Unknown",
      uri: Array.isArray(item?.uris) ? (item.uris[0] || "") : (item?.uri || ""),
      uploadDate: item?.uploadDate || ""
    }));
  } else {
    throw new Error("Unsupported games source format.");
  }

  raw = raw.filter(g => g && g.title && g.fileSize);

  /* Load admin-added / admin-deleted from Firebase */
  let adminGames   = [];
  let adminDeleted = new Set();
  if (typeof firebase !== 'undefined') {
    try {
      const [addedSnap, deletedSnap] = await Promise.all([
        firebase.database().ref('admin_games').once('value'),
        firebase.database().ref('admin_deleted').once('value')
      ]);
      const addedData   = addedSnap.val()   || {};
      const deletedData = deletedSnap.val() || {};
      adminGames   = Object.values(addedData);
      adminDeleted = new Set(Object.keys(deletedData).filter(k => deletedData[k]));
    } catch (_) {}
  }

  const allRaw = [...raw, ...adminGames];

  const parseVersionScore = (text = "") => {
    const t = String(text || "").toLowerCase();
    let score = 0;

    const semverMatches = t.match(/\d+(?:\.\d+){1,4}[a-z]?/g) || [];
    for (const m of semverMatches) {
      const parts = m.replace(/[^\d.]/g, "").split(".").map(n => parseInt(n || "0", 10));
      let local = 0;
      for (let i = 0; i < Math.min(parts.length, 5); i++) {
        local += (parts[i] || 0) * Math.pow(1000, 4 - i);
      }
      score = Math.max(score, local);
    }

    const buildMatch = t.match(/\bbuild\s*([0-9]{2,})\b/i);
    if (buildMatch) score = Math.max(score, parseInt(buildMatch[1], 10));

    return score;
  };

  const isBetterVersion = (a, b) => {
    const da = Date.parse(a?.uploadDate || "") || 0;
    const db = Date.parse(b?.uploadDate || "") || 0;
    if (da !== db) return da > db;

    const va = parseVersionScore(a?.title || "");
    const vb = parseVersionScore(b?.title || "");
    if (va !== vb) return va > vb;

    return String(a?.title || "").length >= String(b?.title || "").length;
  };

  /* Group by stricter normalized base title to avoid duplicate cards for versions */
  const groups = new Map();
  for (const g of allRaw) {
    const baseRaw = GV.baseTitle(g.title || "Unknown");
    const baseKey = GV.normalize(baseRaw)
      .replace(/\b(pc|x64|x86|win(?:dows)?|edition|complete|ultimate|deluxe|remastered|definitive)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!baseKey || adminDeleted.has(baseKey)) continue;
    if (!groups.has(baseKey)) groups.set(baseKey, { base: baseRaw, versions: [], latest: null });
    const group = groups.get(baseKey);
    group.versions.push(g);
    if (!group.latest || isBetterVersion(g, group.latest)) group.latest = g;
  }

  const deduped = [];
  let idx = 0;
  for (const [, group] of groups) {
    group.versions.sort((a, b) => {
      if (isBetterVersion(a, b)) return -1;
      if (isBetterVersion(b, a)) return 1;
      return 0;
    });

    const uniqueVersionsMap = new Map();
    for (const v of group.versions) {
      const vKey = `${GV.normalize(v.title || "")}__${v.fileSize || ""}__${(v.uri || "").slice(0, 120)}`;
      if (!uniqueVersionsMap.has(vKey)) uniqueVersionsMap.set(vKey, v);
    }
    const versionsUnique = [...uniqueVersionsMap.values()];

    const primary = group.latest || versionsUnique[0];
    const sizeGB  = GV.parseFileSizeToGB(primary.fileSize);
    deduped.push({
      ...primary,
      id:             ++idx,
      title:          (primary.title || "Unknown Title").trim(),
      baseTitle:      group.base,
      fileSize:       (primary.fileSize || "Unknown").trim(),
      uri:            primary.uri || "",
      genre:          GV.genreFromTitle(primary.title),
      platform:       "PC",
      rating:         (Math.min(9.8, 6 + (primary.title.length % 4) + (sizeGB % 1))).toFixed(1),
      downloadsCount: Math.floor(1500 + (primary.title.length * 29) + (sizeGB * 40)),
      specs:          mockSpecs(sizeGB),
      allVersions:    versionsUnique
    });
  }

  deduped.sort((a, b) => {
    const pa = GV.popularityScore(a.title, GV.parseFileSizeToGB(a.fileSize));
    const pb = GV.popularityScore(b.title, GV.parseFileSizeToGB(b.fileSize));
    if (pb !== pa) return pb - pa;
    return GV.parseFileSizeToGB(b.fileSize) - GV.parseFileSizeToGB(a.fileSize);
  });

  /* Hard cap to keep UI responsive with very huge sources */
  const finalGames = deduped.slice(0, MAX_ACTIVE_GAMES);

  _gamesCache = finalGames;
  setCache(finalCacheKey, finalGames);
  return finalGames;
};

GV.invalidateGamesCache = () => { _gamesCache = null; };

/* ── Inline numeric captcha for download buttons ───────────── */
GV.makeInlineCaptchaHtml = (rowId) => `
  <div class="dl-captcha-wrap" data-captcha-row="${rowId}">
    <div class="dl-captcha-line">
      <span class="dl-captcha-label">Captcha</span>
      <span class="dl-captcha-code" data-captcha-code></span>
      <button type="button" class="btn secondary sm" data-captcha-refresh>↻</button>
    </div>
    <div class="dl-captcha-input-row">
      <input type="text" inputmode="numeric" maxlength="6" placeholder="Enter code" data-captcha-input />
      <button type="button" class="btn secondary sm" data-captcha-check>Unlock</button>
    </div>
    <p class="admin-msg" data-captcha-msg></p>
  </div>
`;

GV._generateInlineCaptchaCode = () => String(Math.floor(100000 + Math.random() * 900000));

GV._setupInlineCaptcha = (container, downloadBtn) => {
  if (!container || !downloadBtn) return;

  const codeEl = container.querySelector("[data-captcha-code]");
  const inputEl = container.querySelector("[data-captcha-input]");
  const msgEl = container.querySelector("[data-captcha-msg]");
  const refreshBtn = container.querySelector("[data-captcha-refresh]");
  const checkBtn = container.querySelector("[data-captcha-check]");

  const resetCode = () => {
    container.dataset.code = GV._generateInlineCaptchaCode();
    if (codeEl) codeEl.textContent = container.dataset.code;
    if (inputEl) inputEl.value = "";
    if (msgEl) { msgEl.textContent = ""; msgEl.className = "admin-msg"; }
    downloadBtn.disabled = true;
    downloadBtn.classList.add("is-locked");
  };

  const unlockIfValid = () => {
    const entered = String(inputEl?.value || "").trim();
    if (!entered) {
      if (msgEl) { msgEl.textContent = "Enter captcha code first."; msgEl.className = "admin-msg error"; }
      return;
    }
    if (entered !== container.dataset.code) {
      if (msgEl) { msgEl.textContent = "Wrong code. Try again."; msgEl.className = "admin-msg error"; }
      resetCode();
      return;
    }
    if (msgEl) { msgEl.textContent = "Verified. Download unlocked."; msgEl.className = "admin-msg success"; }
    downloadBtn.disabled = false;
    downloadBtn.classList.remove("is-locked");
  };

  refreshBtn?.addEventListener("click", resetCode);
  checkBtn?.addEventListener("click", unlockIfValid);
  inputEl?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") unlockIfValid();
  });

  resetCode();
};

GV.activateDownload = (uri) => {
  if (!uri) return;
  window.location.href = uri;
};

/* ── Auth area ──────────────────────────────────────────────── */
GV.renderAuthArea = () => {
  const authArea = document.getElementById("authArea");
  if (!authArea || typeof firebase === "undefined") {
    if (authArea) authArea.innerHTML = `
      <a href="login.html" class="btn secondary">Login</a>
      <a href="register.html" class="btn primary">Register</a>`;
    return;
  }
  firebase.auth().onAuthStateChanged((user) => {
    if (user) {
      const isAdmin = user.email === ADMIN_EMAIL;
      authArea.innerHTML = `
        ${isAdmin ? `<a href="admin.html" class="btn admin-btn">⚙ Admin</a>` : ''}
        <span class="user-pill">👤 ${escapeHtml(user.displayName || user.email)}</span>
        <button id="logoutBtn" class="btn secondary">Logout</button>`;
      document.getElementById("logoutBtn")?.addEventListener("click", async () => {
        await firebase.auth().signOut();
        window.location.reload();
      });
    } else {
      authArea.innerHTML = `
        <a href="login.html" class="btn secondary">Login</a>
        <a href="register.html" class="btn primary">Register</a>`;
    }
  });
};

/* ── Card builder (synchronous — images load via IntersectionObserver) ── */
GV.makeCard = (game) => {
  const card = document.createElement("article");
  card.className = "card";
  card.dataset.gameTitle = game.title;
  card.setAttribute("role", "button");
  card.setAttribute("tabindex", "0");
  card.setAttribute("aria-label", escapeHtml(game.title));

  card.innerHTML = `
    <div class="card-img-wrap">
      <div class="img-skeleton"></div>
      <img class="card-img" src="${FALLBACK_IMG}" alt="${escapeHtml(game.title)}" loading="lazy" />
      <div class="card-overlay"><span class="overlay-label">View Details</span></div>
    </div>
    <div class="card-body">
      <div class="badge-row">
        <span class="badge genre-badge">${escapeHtml(game.genre)}</span>
        <span class="badge muted">⭐ ${game.rating}</span>
      </div>
      <h3 class="card-title">${escapeHtml(game.baseTitle || game.title)}</h3>
      <div class="meta">📦 ${escapeHtml(game.fileSize)} &nbsp;•&nbsp; 🖥 PC</div>
    </div>`;

  safeImage(card.querySelector('.card-img'));
  _imageObserver.observe(card);

  const goToDetail = () => {
    window.location.href = `game.html?title=${GV.slugify(game.title)}`;
  };
  card.addEventListener("click", goToDetail);
  card.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") goToDetail(); });
  return card;
};

/* ── Hero feature card ──────────────────────────────────────── */
GV.makeHeroFeatureCard = async (game) => {
  const wrap = document.createElement("article");
  wrap.className = "hero-feature";
  wrap.style.cursor = "pointer";
  const cover = await GV.getCoverUrl(game.title);
  wrap.innerHTML = `
    <img src="${cover}" alt="${escapeHtml(game.title)}" />
    <div class="hero-feature-info">
      <p class="kicker">🔥 FEATURED</p>
      <h3>${escapeHtml(game.baseTitle || game.title)}</h3>
      <p>${escapeHtml(game.genre)} &nbsp;•&nbsp; ${escapeHtml(game.fileSize)} &nbsp;•&nbsp; ⭐ ${game.rating}</p>
      <span class="btn secondary">View Details →</span>
    </div>`;
  safeImage(wrap.querySelector("img"));
  wrap.addEventListener("click", () => {
    window.location.href = `game.html?title=${GV.slugify(game.title)}`;
  });
  return wrap;
};

/* ── Game details page ──────────────────────────────────────── */
GV.renderGameDetailsPage = async () => {
  const detailRoot = document.getElementById("gameDetailCard");
  if (!detailRoot) return false;

  GV.renderAuthArea();
  const params     = new URLSearchParams(window.location.search);
  const titleParam = params.get("title") || "";
  const games      = await GV.loadGames();
  const game       = games.find(g => GV.slugify(g.title) === titleParam);

  if (!game) {
    detailRoot.innerHTML = `
      <div class="not-found">
        <h1>Game Not Found</h1>
        <p>This game may have been removed or the URL is incorrect.</p>
        <a href="index.html" class="btn primary">← Back to Home</a>
      </div>`;
    return true;
  }

  document.title = `${escapeHtml(game.baseTitle || game.title)} | Gamvora`;

  detailRoot.innerHTML = `<div class="detail-loading"><div class="spinner"></div><p>Loading game details…</p></div>`;

  const [rawg, cover] = await Promise.all([
    GV.fetchRawgDetails(game.title),
    GV.getCoverUrl(game.title)
  ]);

  const realRating  = rawg?.rating   ? rawg.rating.toFixed(1) : game.rating;
  const realRelease = rawg?.released || game.releaseDate || "—";
  const realGenres  = rawg?.genres?.length ? rawg.genres.join(", ") : game.genre;
  const description = rawg?.description
    ? rawg.description.replace(/<[^>]+>/g,"").slice(0,700) + "…"
    : "An optimized PC release with stable performance and one-click magnet activation.";

  const versions    = game.allVersions || [{ title: game.title, fileSize: game.fileSize, uri: game.uri }];
  const versionsHTML = versions.map((v, i) => `
    <div class="version-row ${i === 0 ? "version-latest" : ""}">
      <div class="version-info">
        <span class="version-name">${escapeHtml(v.title)}</span>
        <span class="version-size">📦 ${escapeHtml(v.fileSize)}</span>
        ${i === 0 ? '<span class="version-badge">Latest</span>' : ""}
      </div>
      ${GV.makeInlineCaptchaHtml(`ver-${i}`)}
      <button class="btn primary version-dl-btn is-locked" data-uri="${encodeURIComponent(v.uri || "")}" disabled>
        ⬇ Download Torrent
      </button>
    </div>`).join("");

  detailRoot.innerHTML = `
    <section class="detail-hero">
      <div class="detail-cover-wrap">
        <img src="${cover}" alt="${escapeHtml(game.baseTitle || game.title)}" class="detail-cover" />
      </div>
      <div class="detail-panel">
        <div class="badge-row">
          <span class="badge">${escapeHtml(realGenres)}</span>
          <span class="badge muted">🖥 PC</span>
          <span class="badge muted">⭐ ${realRating}</span>
        </div>
        <h1>${escapeHtml(game.baseTitle || game.title)}</h1>
        <p class="detail-sub">${escapeHtml(description)}</p>
        <div class="detail-meta-grid">
          <div><strong>File Size</strong><span>${escapeHtml(game.fileSize)}</span></div>
          <div><strong>Released</strong><span>${escapeHtml(realRelease)}</span></div>
          <div><strong>Downloads</strong><span>${game.downloadsCount.toLocaleString()}</span></div>
          <div><strong>Platform</strong><span>PC</span></div>
        </div>
        <div class="versions-section">
          <h3 class="versions-title">Available Versions</h3>
          <div class="versions-list">${versionsHTML}</div>
        </div>
        <div class="detail-actions-row">
          <a href="report.html?title=${GV.slugify(game.title)}" class="btn secondary report-btn">🚩 Report Issue</a>
        </div>
      </div>
    </section>

    ${rawg?.screenshots?.length ? `
    <section class="screenshots-section">
      <div class="section-head"><h2>Screenshots</h2></div>
      <div class="screenshots-grid">
        ${rawg.screenshots.slice(0,6).map(s => `<img src="${s}" alt="screenshot" class="shot" loading="lazy" />`).join("")}
      </div>
    </section>` : ""}

    <section class="detail-tabs">
      <div class="tab-content">
        <h3>System Requirements</h3>
        <ul class="spec-list">
          <li><strong>CPU:</strong> ${escapeHtml(game.specs.cpu)}</li>
          <li><strong>GPU:</strong> ${escapeHtml(game.specs.gpu)}</li>
          <li><strong>RAM:</strong> ${escapeHtml(game.specs.ram)}</li>
          <li><strong>Storage:</strong> ${escapeHtml(game.specs.storage)}</li>
        </ul>
      </div>
      <div class="tab-content">
        <h3>About This Game</h3>
        <p>${escapeHtml(description)}</p>
      </div>
    </section>

    <section class="comments-section" id="commentsSection">
      <div class="section-head"><h2>💬 Comments</h2></div>
      <div id="commentFormWrap"></div>
      <div id="commentsList" class="comments-list"></div>
    </section>`;

  safeImage(detailRoot.querySelector(".detail-cover"));
  detailRoot.querySelectorAll(".shot").forEach(safeImage);

  /* Wire download buttons */
  const versionRows = detailRoot.querySelectorAll(".version-row");
  versionRows.forEach((row) => {
    const btn = row.querySelector(".version-dl-btn");
    const captcha = row.querySelector(".dl-captcha-wrap");
    GV._setupInlineCaptcha(captcha, btn);

    btn?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (btn.disabled) return;
      const uri = decodeURIComponent(btn.dataset.uri || "");
      GV.activateDownload(uri);
    });
  });

  /* Related games */
  const relatedRoot = document.getElementById("relatedGrid");
  if (relatedRoot) {
    const related = games
      .filter(g => g.title !== game.title && g.genre === game.genre)
      .slice(0, 8);
    relatedRoot.innerHTML = "";
    for (const item of related) relatedRoot.appendChild(GV.makeCard(item));
  }

  /* Load comments */
  if (typeof GV.initComments === 'function') {
    GV.initComments(game.baseTitle || game.title, GV.slugify(game.title));
  }

  return true;
};
