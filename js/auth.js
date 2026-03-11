/* ═══════════════════════════════════════════════════════════════
   Gamvora — auth.js  (login, register, forgot password, captcha)
   ═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const loginForm    = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const messageBox   = document.getElementById('authMessage');

  /* ── Sanitize ───────────────────────────────────────────────── */
  const sanitize = (str, max = 200) =>
    String(str || '').replace(/<[^>]*>/g, '').trim().slice(0, max);

  /* ── Message helper ─────────────────────────────────────────── */
  const setMessage = (text, type = '') => {
    if (!messageBox) return;
    messageBox.textContent = text;
    messageBox.className   = `auth-message ${type}`;
  };

  /* ── Friendly Firebase errors ───────────────────────────────── */
  const friendlyError = (err) => {
    const code = err?.code || '';
    if (code.includes('auth/operation-not-allowed'))
      return 'Email/Password sign-in is disabled. Enable it in Firebase Console.';
    if (code.includes('auth/email-already-in-use'))
      return 'This email is already registered.';
    if (code.includes('auth/invalid-email'))
      return 'Invalid email format.';
    if (code.includes('auth/weak-password'))
      return 'Password must be at least 6 characters.';
    if (code.includes('auth/invalid-credential') ||
        code.includes('auth/wrong-password') ||
        code.includes('auth/user-not-found'))
      return 'Invalid email or password.';
    if (code.includes('auth/network-request-failed'))
      return 'Network error. Check your internet connection.';
    if (code.includes('auth/too-many-requests'))
      return 'Too many attempts. Please wait a few minutes and try again.';
    return err?.message || 'An unexpected error occurred.';
  };

  /* ── Email format validation ────────────────────────────────── */
  const isValidEmail = (email) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);

  /* ── Username validation ────────────────────────────────────── */
  const isValidUsername = (name) =>
    /^[a-zA-Z0-9_\-. ]{3,30}$/.test(name);

  /* ── hCaptcha token getter ──────────────────────────────────── */
  const getCaptchaToken = () => {
    if (typeof hcaptcha === 'undefined') return 'no-captcha';
    try {
      return hcaptcha.getResponse() || '';
    } catch { return ''; }
  };

  const resetCaptcha = () => {
    if (typeof hcaptcha !== 'undefined') {
      try { hcaptcha.reset(); } catch (_) {}
    }
  };

  /* ── Rate limiting (login attempts) ────────────────────────── */
  const LOGIN_LIMIT_MS = 60000; // 1 minute lockout after 5 fails
  const getLoginAttempts = () => {
    try {
      const d = JSON.parse(localStorage.getItem('gv_login_attempts') || '{"count":0,"ts":0}');
      if (Date.now() - d.ts > LOGIN_LIMIT_MS) return { count: 0, ts: 0 };
      return d;
    } catch { return { count: 0, ts: 0 }; }
  };
  const recordLoginFail = () => {
    const d = getLoginAttempts();
    localStorage.setItem('gv_login_attempts', JSON.stringify({ count: d.count + 1, ts: Date.now() }));
  };
  const clearLoginAttempts = () => localStorage.removeItem('gv_login_attempts');

  /* ══════════════════════════════════════════════════════════════
     LOGIN FORM
  ══════════════════════════════════════════════════════════════ */
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const email    = sanitize(document.getElementById('email').value);
      const password = document.getElementById('password').value.trim();

      /* Empty check */
      if (!email || !password) {
        setMessage('Please fill in all fields.', 'error');
        return;
      }

      /* Email format */
      if (!isValidEmail(email)) {
        setMessage('Please enter a valid email address.', 'error');
        return;
      }

      /* Rate limit */
      const attempts = getLoginAttempts();
      if (attempts.count >= 5) {
        const wait = Math.ceil((LOGIN_LIMIT_MS - (Date.now() - attempts.ts)) / 1000);
        setMessage(`Too many failed attempts. Wait ${wait}s before trying again.`, 'error');
        return;
      }

      /* Captcha */
      const captchaToken = getCaptchaToken();
      if (captchaToken === '') {
        setMessage('Please complete the CAPTCHA verification.', 'error');
        return;
      }

      const btn = loginForm.querySelector('button[type=submit]');
      btn.disabled    = true;
      btn.textContent = 'Logging in…';
      setMessage('', '');

      try {
        await firebase.auth().signInWithEmailAndPassword(email, password);
        clearLoginAttempts();
        setMessage('Login successful! Redirecting…', 'success');
        setTimeout(() => (window.location.href = 'index.html'), 900);
      } catch (err) {
        recordLoginFail();
        resetCaptcha();
        setMessage(friendlyError(err), 'error');
        btn.disabled    = false;
        btn.textContent = 'Login';
      }
    });
  }

  /* ── Forgot password ────────────────────────────────────────── */
  const forgotLink = document.getElementById('forgotPasswordLink');
  if (forgotLink) {
    forgotLink.addEventListener('click', async (e) => {
      e.preventDefault();
      const emailInput = document.getElementById('email');
      const email = sanitize(emailInput?.value || '');
      if (!email || !isValidEmail(email)) {
        setMessage('Enter your email address above, then click "Forgot Password".', 'error');
        emailInput?.focus();
        return;
      }
      try {
        await firebase.auth().sendPasswordResetEmail(email);
        setMessage(`Password reset email sent to ${email}. Check your inbox.`, 'success');
      } catch (err) {
        setMessage(friendlyError(err), 'error');
      }
    });
  }

  /* ══════════════════════════════════════════════════════════════
     REGISTER FORM
  ══════════════════════════════════════════════════════════════ */
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const username        = sanitize(document.getElementById('username').value, 30);
      const email           = sanitize(document.getElementById('email').value);
      const password        = document.getElementById('password').value.trim();
      const confirmPassword = document.getElementById('confirmPassword').value.trim();

      /* Validation */
      if (!username || !email || !password || !confirmPassword) {
        setMessage('Please fill in all fields.', 'error');
        return;
      }
      if (!isValidUsername(username)) {
        setMessage('Username must be 3–30 characters (letters, numbers, _ - . only).', 'error');
        return;
      }
      if (!isValidEmail(email)) {
        setMessage('Please enter a valid email address.', 'error');
        return;
      }
      if (password.length < 6) {
        setMessage('Password must be at least 6 characters.', 'error');
        return;
      }
      if (!/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
        setMessage('Password must contain at least one uppercase letter and one number.', 'error');
        return;
      }
      if (password !== confirmPassword) {
        setMessage('Passwords do not match.', 'error');
        return;
      }

      /* Captcha */
      const captchaToken = getCaptchaToken();
      if (captchaToken === '') {
        setMessage('Please complete the CAPTCHA verification.', 'error');
        return;
      }

      const btn = registerForm.querySelector('button[type=submit]');
      btn.disabled    = true;
      btn.textContent = 'Creating account…';
      setMessage('', '');

      try {
        const cred = await firebase.auth().createUserWithEmailAndPassword(email, password);
        await cred.user.updateProfile({ displayName: username });
        await firebase.database()
          .ref(`users/${cred.user.uid}`)
          .set({
            username,
            email,
            createdAt: new Date().toISOString().slice(0, 10)
          });

        setMessage('Account created! Redirecting…', 'success');
        setTimeout(() => (window.location.href = 'index.html'), 1000);
      } catch (err) {
        resetCaptcha();
        setMessage(friendlyError(err), 'error');
        btn.disabled    = false;
        btn.textContent = 'Create Account';
      }
    });
  }

})();
