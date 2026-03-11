/* ═══════════════════════════════════════════════════════════════
   Gamvora — admin.js
   Full admin panel: games, comments, reports, support messages
   Admin email: psblue909@gmail.com
   ═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const ADMIN_EMAIL = 'psblue909@gmail.com';

  const esc = (str) => {
    const d = document.createElement('div');
    d.textContent = String(str || '');
    return d.innerHTML;
  };

  const sanitize = (str, max = 500) =>
    String(str || '').replace(/<[^>]*>/g, '').trim().slice(0, max);

  const formatDate = (ts) => {
    if (!ts) return '—';
    return new Date(ts).toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  /* ── DOM refs ─────────────────────────────────────────────── */
  const adminRoot   = document.getElementById('adminRoot');
  const adminLogin  = document.getElementById('adminLogin');
  const adminPanel  = document.getElementById('adminPanel');

  /* ── Tab switching ────────────────────────────────────────── */
  const showTab = (tabId) => {
    document.querySelectorAll('.admin-tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
    const content = document.getElementById(`tab-${tabId}`);
    const btn     = document.querySelector(`[data-tab="${tabId}"]`);
    if (content) content.classList.add('active');
    if (btn)     btn.classList.add('active');
    loadTabData(tabId);
  };

  /* ── Stats ────────────────────────────────────────────────── */
  const loadStats = async () => {
    const db = firebase.database();
    try {
      const [gamesSnap, commentsSnap, reportsSnap, supportSnap, adminGamesSnap] = await Promise.all([
        db.ref('admin_games').once('value'),
        db.ref('comments').once('value'),
        db.ref('reports').once('value'),
        db.ref('support').once('value'),
        db.ref('admin_games').once('value')
      ]);

      let totalComments = 0;
      const commentsData = commentsSnap.val() || {};
      Object.values(commentsData).forEach(game => {
        totalComments += Object.keys(game || {}).length;
      });

      const totalReports  = Object.keys(reportsSnap.val()  || {}).length;
      const totalSupport  = Object.keys(supportSnap.val()  || {}).length;
      const totalAdded    = Object.keys(adminGamesSnap.val() || {}).length;

      document.getElementById('stat-comments').textContent = totalComments;
      document.getElementById('stat-reports').textContent  = totalReports;
      document.getElementById('stat-support').textContent  = totalSupport;
      document.getElementById('stat-added').textContent    = totalAdded;
    } catch (e) {
      console.error('Stats error:', e);
    }
  };

  /* ── Load tab data ────────────────────────────────────────── */
  const loadTabData = (tabId) => {
    switch (tabId) {
      case 'games':    loadGamesTab();    break;
      case 'comments': loadCommentsTab(); break;
      case 'reports':  loadReportsTab();  break;
      case 'support':  loadSupportTab();  break;
    }
  };

  /* ══════════════════════════════════════════════════════════
     GAMES TAB
  ══════════════════════════════════════════════════════════ */
  const loadGamesTab = () => {
    const container = document.getElementById('tab-games');
    container.innerHTML = `
      <div class="admin-section">
        <h3>Add New Game</h3>
        <form id="addGameForm" class="admin-form">
          <div class="admin-form-row">
            <input type="text" id="newGameTitle" placeholder="Game Title *" required maxlength="200" />
            <input type="text" id="newGameSize"  placeholder="File Size (e.g. 15 GB) *" required maxlength="30" />
          </div>
          <input type="text" id="newGameUri" placeholder="Magnet Link / Download URI *" required maxlength="2000" />
          <input type="text" id="newGameDate" placeholder="Upload Date (optional, e.g. 2026-01-15)" maxlength="30" />
          <button type="submit" class="btn primary">➕ Add Game</button>
          <p id="addGameMsg" class="admin-msg"></p>
        </form>
      </div>
      <div class="admin-section">
        <h3>Admin-Added Games</h3>
        <div id="adminGamesList" class="admin-list">Loading…</div>
      </div>
      <div class="admin-section">
        <h3>Delete Game from Main List</h3>
        <p class="admin-hint">Enter the exact base title (without version number) to hide it from the site.</p>
        <form id="deleteGameForm" class="admin-form">
          <div class="admin-form-row">
            <input type="text" id="deleteGameTitle" placeholder="Base game title to hide *" required maxlength="200" />
            <button type="submit" class="btn danger">🗑 Hide Game</button>
          </div>
          <p id="deleteGameMsg" class="admin-msg"></p>
        </form>
        <div class="admin-section" style="margin-top:16px;">
          <h4>Currently Hidden Games</h4>
          <div id="hiddenGamesList" class="admin-list">Loading…</div>
        </div>
      </div>`;

    /* Add game form */
    document.getElementById('addGameForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = sanitize(document.getElementById('newGameTitle').value);
      const size  = sanitize(document.getElementById('newGameSize').value);
      const uri   = sanitize(document.getElementById('newGameUri').value, 2000);
      const date  = sanitize(document.getElementById('newGameDate').value);
      const msg   = document.getElementById('addGameMsg');

      if (!title || !size || !uri) { msg.textContent = 'Title, size, and URI are required.'; msg.className = 'admin-msg error'; return; }

      const btn = e.target.querySelector('button[type=submit]');
      btn.disabled = true;
      try {
        await firebase.database().ref('admin_games').push({
          title, fileSize: size, uri,
          uploadDate: date || new Date().toISOString(),
          addedAt: Date.now()
        });
        msg.textContent = `"${title}" added successfully!`;
        msg.className = 'admin-msg success';
        e.target.reset();
        loadAdminGamesList();
        if (window.GV) GV.invalidateGamesCache();
      } catch (err) {
        msg.textContent = 'Failed to add game: ' + err.message;
        msg.className = 'admin-msg error';
      } finally { btn.disabled = false; }
    });

    /* Delete/hide game form */
    document.getElementById('deleteGameForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const title   = sanitize(document.getElementById('deleteGameTitle').value);
      const msg     = document.getElementById('deleteGameMsg');
      if (!title) return;
      const slug = (window.GV ? GV.normalize(title) : title.toLowerCase().trim());
      if (!confirm(`Hide "${title}" from the site?`)) return;
      try {
        await firebase.database().ref(`admin_deleted/${slug}`).set(true);
        msg.textContent = `"${title}" is now hidden.`;
        msg.className = 'admin-msg success';
        e.target.reset();
        loadHiddenGamesList();
        if (window.GV) GV.invalidateGamesCache();
      } catch (err) {
        msg.textContent = 'Error: ' + err.message;
        msg.className = 'admin-msg error';
      }
    });

    loadAdminGamesList();
    loadHiddenGamesList();
  };

  const loadAdminGamesList = async () => {
    const el = document.getElementById('adminGamesList');
    if (!el) return;
    try {
      const snap = await firebase.database().ref('admin_games').once('value');
      const data = snap.val() || {};
      const entries = Object.entries(data);
      if (!entries.length) { el.innerHTML = '<p class="admin-empty">No admin-added games yet.</p>'; return; }
      el.innerHTML = entries.map(([id, g]) => `
        <div class="admin-list-item">
          <div class="admin-item-info">
            <strong>${esc(g.title)}</strong>
            <span>${esc(g.fileSize)} &nbsp;•&nbsp; ${formatDate(g.addedAt)}</span>
          </div>
          <button class="btn danger sm" data-delete-game="${esc(id)}">Remove</button>
        </div>`).join('');
      el.querySelectorAll('[data-delete-game]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('Remove this game?')) return;
          await firebase.database().ref(`admin_games/${btn.dataset.deleteGame}`).remove();
          if (window.GV) GV.invalidateGamesCache();
          loadAdminGamesList();
        });
      });
    } catch (e) { el.innerHTML = '<p class="admin-empty">Error loading games.</p>'; }
  };

  const loadHiddenGamesList = async () => {
    const el = document.getElementById('hiddenGamesList');
    if (!el) return;
    try {
      const snap = await firebase.database().ref('admin_deleted').once('value');
      const data = snap.val() || {};
      const keys = Object.keys(data).filter(k => data[k]);
      if (!keys.length) { el.innerHTML = '<p class="admin-empty">No hidden games.</p>'; return; }
      el.innerHTML = keys.map(slug => `
        <div class="admin-list-item">
          <span>${esc(slug)}</span>
          <button class="btn secondary sm" data-unhide="${esc(slug)}">Restore</button>
        </div>`).join('');
      el.querySelectorAll('[data-unhide]').forEach(btn => {
        btn.addEventListener('click', async () => {
          await firebase.database().ref(`admin_deleted/${btn.dataset.unhide}`).remove();
          if (window.GV) GV.invalidateGamesCache();
          loadHiddenGamesList();
        });
      });
    } catch (e) { el.innerHTML = '<p class="admin-empty">Error.</p>'; }
  };

  /* ══════════════════════════════════════════════════════════
     COMMENTS TAB
  ══════════════════════════════════════════════════════════ */
  const loadCommentsTab = async () => {
    const container = document.getElementById('tab-comments');
    container.innerHTML = '<div class="admin-loading">Loading comments…</div>';
    try {
      const snap = await firebase.database().ref('comments').once('value');
      const data = snap.val() || {};
      let allComments = [];
      Object.entries(data).forEach(([gameSlug, comments]) => {
        Object.entries(comments || {}).forEach(([id, c]) => {
          allComments.push({ id, gameSlug, ...c });
        });
      });
      allComments.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

      if (!allComments.length) {
        container.innerHTML = '<p class="admin-empty">No comments yet.</p>';
        return;
      }

      container.innerHTML = `
        <div class="admin-section">
          <h3>All Comments (${allComments.length})</h3>
          <div id="allCommentsList" class="admin-list"></div>
        </div>`;

      const listEl = document.getElementById('allCommentsList');
      allComments.forEach(c => {
        const div = document.createElement('div');
        div.className = 'admin-list-item comment-admin-item';
        div.innerHTML = `
          <div class="admin-item-info">
            <strong>${esc(c.username || 'Anonymous')}</strong>
            <span class="admin-comment-game">Game: ${esc(c.gameTitle || c.gameSlug)}</span>
            <p class="admin-comment-text">${esc(c.text)}</p>
            <span class="admin-item-date">${formatDate(c.timestamp)}</span>
          </div>
          <button class="btn danger sm" data-slug="${esc(c.gameSlug)}" data-id="${esc(c.id)}">🗑 Delete</button>`;
        div.querySelector('[data-id]').addEventListener('click', async (e) => {
          const slug = e.target.dataset.slug;
          const id   = e.target.dataset.id;
          if (!confirm('Delete this comment?')) return;
          await firebase.database().ref(`comments/${slug}/${id}`).remove();
          div.remove();
        });
        listEl.appendChild(div);
      });
    } catch (e) {
      container.innerHTML = `<p class="admin-empty">Error loading comments: ${esc(e.message)}</p>`;
    }
  };

  /* ══════════════════════════════════════════════════════════
     REPORTS TAB
  ══════════════════════════════════════════════════════════ */
  const loadReportsTab = async () => {
    const container = document.getElementById('tab-reports');
    container.innerHTML = '<div class="admin-loading">Loading reports…</div>';
    try {
      const snap = await firebase.database().ref('reports').orderByChild('timestamp').once('value');
      const data = snap.val() || {};
      const entries = Object.entries(data).sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0));

      if (!entries.length) {
        container.innerHTML = '<p class="admin-empty">No reports yet.</p>';
        return;
      }

      container.innerHTML = `
        <div class="admin-section">
          <h3>Reports (${entries.length})</h3>
          <div id="reportsList" class="admin-list"></div>
        </div>`;

      const listEl = document.getElementById('reportsList');
      entries.forEach(([id, r]) => {
        const div = document.createElement('div');
        div.className = `admin-list-item report-item ${r.status === 'resolved' ? 'resolved' : ''}`;
        div.innerHTML = `
          <div class="admin-item-info">
            <strong>${esc(r.gameTitle || 'Unknown Game')}</strong>
            <span class="report-type-badge">${esc(r.type || 'General')}</span>
            <p class="admin-comment-text">${esc(r.description)}</p>
            <span>From: ${esc(r.email || 'Anonymous')}</span>
            <span class="admin-item-date">${formatDate(r.timestamp)}</span>
            ${r.status === 'resolved' ? '<span class="status-badge resolved">✓ Resolved</span>' : ''}
          </div>
          <div class="admin-item-actions">
            ${r.status !== 'resolved' ? `<button class="btn secondary sm" data-resolve="${esc(id)}">✓ Resolve</button>` : ''}
            <button class="btn danger sm" data-delete-report="${esc(id)}">🗑</button>
          </div>`;

        div.querySelector(`[data-resolve="${id}"]`)?.addEventListener('click', async () => {
          await firebase.database().ref(`reports/${id}/status`).set('resolved');
          div.classList.add('resolved');
          div.querySelector(`[data-resolve]`)?.remove();
          div.querySelector('.admin-item-info').insertAdjacentHTML('beforeend', '<span class="status-badge resolved">✓ Resolved</span>');
        });
        div.querySelector(`[data-delete-report="${id}"]`)?.addEventListener('click', async () => {
          if (!confirm('Delete this report?')) return;
          await firebase.database().ref(`reports/${id}`).remove();
          div.remove();
        });
        listEl.appendChild(div);
      });
    } catch (e) {
      container.innerHTML = `<p class="admin-empty">Error: ${esc(e.message)}</p>`;
    }
  };

  /* ══════════════════════════════════════════════════════════
     SUPPORT TAB
  ══════════════════════════════════════════════════════════ */
  const loadSupportTab = async () => {
    const container = document.getElementById('tab-support');
    container.innerHTML = '<div class="admin-loading">Loading support messages…</div>';
    try {
      const snap = await firebase.database().ref('support').once('value');
      const data = snap.val() || {};
      const entries = Object.entries(data).sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0));

      if (!entries.length) {
        container.innerHTML = '<p class="admin-empty">No support messages yet.</p>';
        return;
      }

      container.innerHTML = `
        <div class="admin-section">
          <h3>Support Messages (${entries.length})</h3>
          <div id="supportList" class="admin-list"></div>
        </div>`;

      const listEl = document.getElementById('supportList');
      entries.forEach(([id, s]) => {
        const div = document.createElement('div');
        div.className = `admin-list-item support-item ${s.status === 'resolved' ? 'resolved' : ''}`;
        div.innerHTML = `
          <div class="admin-item-info">
            <strong>${esc(s.name || 'Anonymous')}</strong>
            <span>${esc(s.email || '')}</span>
            <span class="support-subject">${esc(s.subject || 'No subject')}</span>
            <p class="admin-comment-text">${esc(s.message)}</p>
            <span class="admin-item-date">${formatDate(s.timestamp)}</span>
            ${s.status === 'resolved' ? '<span class="status-badge resolved">✓ Resolved</span>' : ''}
          </div>
          <div class="admin-item-actions">
            ${s.status !== 'resolved' ? `<button class="btn secondary sm" data-resolve-support="${esc(id)}">✓ Resolve</button>` : ''}
            <button class="btn danger sm" data-delete-support="${esc(id)}">🗑</button>
          </div>`;

        div.querySelector(`[data-resolve-support="${id}"]`)?.addEventListener('click', async () => {
          await firebase.database().ref(`support/${id}/status`).set('resolved');
          div.classList.add('resolved');
          div.querySelector(`[data-resolve-support]`)?.remove();
          div.querySelector('.admin-item-info').insertAdjacentHTML('beforeend', '<span class="status-badge resolved">✓ Resolved</span>');
        });
        div.querySelector(`[data-delete-support="${id}"]`)?.addEventListener('click', async () => {
          if (!confirm('Delete this message?')) return;
          await firebase.database().ref(`support/${id}`).remove();
          div.remove();
        });
        listEl.appendChild(div);
      });
    } catch (e) {
      container.innerHTML = `<p class="admin-empty">Error: ${esc(e.message)}</p>`;
    }
  };

  /* ── Init admin panel ─────────────────────────────────────── */
  const initAdmin = () => {
    if (!adminRoot) return;

    if (typeof firebase === 'undefined') {
      adminRoot.innerHTML = '<p class="admin-empty">Firebase not loaded.</p>';
      return;
    }

    firebase.auth().onAuthStateChanged((user) => {
      if (!user || user.email !== ADMIN_EMAIL) {
        if (adminLogin)  adminLogin.style.display  = 'flex';
        if (adminPanel)  adminPanel.style.display  = 'none';

        /* Admin login form */
        const loginForm = document.getElementById('adminLoginForm');
        if (loginForm) {
          loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email    = document.getElementById('adminEmail').value.trim();
            const password = document.getElementById('adminPassword').value.trim();
            const msg      = document.getElementById('adminLoginMsg');
            if (!email || !password) { msg.textContent = 'Fill in all fields.'; msg.className = 'admin-msg error'; return; }
            const btn = loginForm.querySelector('button[type=submit]');
            btn.disabled = true;
            try {
              await firebase.auth().signInWithEmailAndPassword(email, password);
            } catch (err) {
              /* If account doesn't exist yet, create it (first-time setup) */
              if (
                err.code === 'auth/user-not-found' ||
                err.code === 'auth/invalid-credential' ||
                err.code === 'auth/invalid-login-credentials'
              ) {
                if (email === ADMIN_EMAIL) {
                  try {
                    msg.textContent = 'First-time setup: creating admin account…';
                    msg.className = 'admin-msg';
                    await firebase.auth().createUserWithEmailAndPassword(email, password);
                    /* Account created — onAuthStateChanged will fire and show panel */
                  } catch (createErr) {
                    msg.textContent = 'Setup failed: ' + createErr.message;
                    msg.className = 'admin-msg error';
                    btn.disabled = false;
                  }
                } else {
                  msg.textContent = 'Access denied: not an admin email.';
                  msg.className = 'admin-msg error';
                  btn.disabled = false;
                }
              } else {
                msg.textContent = 'Invalid credentials.';
                msg.className = 'admin-msg error';
                btn.disabled = false;
              }
            }
          });
        }
        return;
      }

      /* User is admin */
      if (adminLogin) adminLogin.style.display = 'none';
      if (adminPanel) adminPanel.style.display = 'block';

      /* Update admin name */
      const adminName = document.getElementById('adminName');
      if (adminName) adminName.textContent = user.displayName || user.email;

      /* Logout */
      document.getElementById('adminLogoutBtn')?.addEventListener('click', async () => {
        await firebase.auth().signOut();
        window.location.reload();
      });

      /* Tab buttons */
      document.querySelectorAll('.admin-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => showTab(btn.dataset.tab));
      });

      /* Load stats and default tab */
      loadStats();
      showTab('games');
    });
  };

  document.addEventListener('DOMContentLoaded', initAdmin);

})();
