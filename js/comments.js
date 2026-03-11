/* ═══════════════════════════════════════════════════════════════
   Gamvora — comments.js
   Handles per-game comments stored in Firebase Realtime DB
   /comments/{gameSlug}/{commentId}
   ═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const RATE_LIMIT_MS = 30000; // 30 seconds between comments

  /* ── HTML escape ────────────────────────────────────────────── */
  const esc = (str) => {
    const d = document.createElement('div');
    d.textContent = String(str || '');
    return d.innerHTML;
  };

  /* ── Sanitize user text ─────────────────────────────────────── */
  const sanitizeText = (str, max = 1000) =>
    String(str || '').replace(/<[^>]*>/g, '').trim().slice(0, max);

  /* ── Format timestamp ───────────────────────────────────────── */
  const formatDate = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
      + ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  /* ── Rate limit check ───────────────────────────────────────── */
  const canPostComment = (uid) => {
    const key  = `gv_last_comment_${uid}`;
    const last = parseInt(localStorage.getItem(key) || '0', 10);
    if (Date.now() - last < RATE_LIMIT_MS) {
      const wait = Math.ceil((RATE_LIMIT_MS - (Date.now() - last)) / 1000);
      return { ok: false, wait };
    }
    return { ok: true };
  };

  const markCommentPosted = (uid) => {
    localStorage.setItem(`gv_last_comment_${uid}`, Date.now().toString());
  };

  /* ── Render single comment ──────────────────────────────────── */
  const renderComment = (id, data, isAdmin) => {
    const div = document.createElement('div');
    div.className = 'comment-item';
    div.dataset.commentId = id;
    div.innerHTML = `
      <div class="comment-header">
        <span class="comment-avatar">${esc((data.username || 'User')[0].toUpperCase())}</span>
        <div class="comment-meta">
          <span class="comment-username">${esc(data.username || 'Anonymous')}</span>
          <span class="comment-date">${formatDate(data.timestamp)}</span>
        </div>
        ${isAdmin ? `<button class="comment-delete-btn" data-id="${esc(id)}" title="Delete comment">🗑</button>` : ''}
      </div>
      <p class="comment-text">${esc(data.text)}</p>`;
    return div;
  };

  /* ── Init comments for a game ───────────────────────────────── */
  window.GV = window.GV || {};

  GV.initComments = (gameTitle, gameSlug) => {
    const formWrap    = document.getElementById('commentFormWrap');
    const commentsList = document.getElementById('commentsList');
    if (!formWrap || !commentsList) return;

    if (typeof firebase === 'undefined') {
      formWrap.innerHTML = '<p class="comment-notice">Comments unavailable.</p>';
      return;
    }

    const dbRef = firebase.database().ref(`comments/${gameSlug}`);

    /* ── Render comment form ──────────────────────────────────── */
    const renderForm = (user) => {
      if (!user) {
        formWrap.innerHTML = `
          <div class="comment-login-prompt">
            <p>💬 <a href="login.html">Login</a> to leave a comment.</p>
          </div>`;
        return;
      }
      formWrap.innerHTML = `
        <form id="commentForm" class="comment-form" novalidate>
          <textarea id="commentText" placeholder="Write a comment…" maxlength="1000" rows="3"></textarea>
          <div class="comment-form-footer">
            <span class="comment-char-count"><span id="charCount">0</span>/1000</span>
            <button type="submit" class="btn primary">Post Comment</button>
          </div>
          <p id="commentMsg" class="comment-msg"></p>
        </form>`;

      const textarea  = document.getElementById('commentText');
      const charCount = document.getElementById('charCount');
      const msgEl     = document.getElementById('commentMsg');

      textarea.addEventListener('input', () => {
        charCount.textContent = textarea.value.length;
      });

      document.getElementById('commentForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = sanitizeText(textarea.value);
        if (!text) { msgEl.textContent = 'Comment cannot be empty.'; msgEl.className = 'comment-msg error'; return; }
        if (text.length < 2) { msgEl.textContent = 'Comment too short.'; msgEl.className = 'comment-msg error'; return; }

        const rateCheck = canPostComment(user.uid);
        if (!rateCheck.ok) {
          msgEl.textContent = `Please wait ${rateCheck.wait}s before posting again.`;
          msgEl.className = 'comment-msg error';
          return;
        }

        const btn = e.target.querySelector('button[type=submit]');
        btn.disabled = true;
        btn.textContent = 'Posting…';

        try {
          await dbRef.push({
            uid:       user.uid,
            username:  sanitizeText(user.displayName || user.email.split('@')[0], 50),
            text,
            timestamp: Date.now(),
            gameSlug,
            gameTitle: sanitizeText(gameTitle, 200)
          });
          markCommentPosted(user.uid);
          textarea.value = '';
          charCount.textContent = '0';
          msgEl.textContent = 'Comment posted!';
          msgEl.className = 'comment-msg success';
          setTimeout(() => { msgEl.textContent = ''; msgEl.className = 'comment-msg'; }, 3000);
        } catch (err) {
          msgEl.textContent = 'Failed to post comment. Try again.';
          msgEl.className = 'comment-msg error';
        } finally {
          btn.disabled = false;
          btn.textContent = 'Post Comment';
        }
      });
    };

    /* ── Load & listen to comments ────────────────────────────── */
    const loadComments = (isAdmin) => {
      commentsList.innerHTML = '<div class="comment-loading">Loading comments…</div>';

      dbRef.orderByChild('timestamp').on('value', (snap) => {
        const data = snap.val();
        commentsList.innerHTML = '';

        if (!data) {
          commentsList.innerHTML = '<p class="comment-empty">No comments yet. Be the first!</p>';
          return;
        }

        const entries = Object.entries(data).reverse();
        entries.forEach(([id, comment]) => {
          const el = renderComment(id, comment, isAdmin);
          commentsList.appendChild(el);

          /* Admin delete */
          el.querySelector('.comment-delete-btn')?.addEventListener('click', async () => {
            if (!confirm('Delete this comment?')) return;
            try {
              await dbRef.child(id).remove();
            } catch (err) {
              alert('Failed to delete comment.');
            }
          });
        });
      }, (err) => {
        commentsList.innerHTML = '<p class="comment-empty">Failed to load comments.</p>';
      });
    };

    /* ── Auth state ───────────────────────────────────────────── */
    firebase.auth().onAuthStateChanged((user) => {
      const isAdmin = user && user.email === (window.GV?.ADMIN_EMAIL || 'psblue909@gmail.com');
      renderForm(user);
      loadComments(isAdmin);
    });
  };

})();
