const STORAGE_KEY = 'orbitSession';

function saveSession(session) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

function readSession() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch (error) {
    return null;
  }
}

function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });
  const raw = await response.text();
  let data = {};
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch (error) {
      throw new Error('The server returned an invalid response. Please restart it and try again.');
    }
  }
  if (!response.ok) {
    throw new Error(data.error || 'Request failed.');
  }
  return data;
}

async function signup(payload) {
  const session = await requestJson('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  saveSession(session);
  return session;
}

async function signin(payload) {
  const session = await requestJson('/api/auth/signin', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  saveSession(session);
  return session;
}

async function signout() {
  const session = readSession();
  if (session?.token) {
    try {
      await requestJson('/api/auth/signout', {
        method: 'POST',
        body: JSON.stringify({ token: session.token }),
      });
    } catch (error) {
      // keep local signout resilient
    }
  }
  clearSession();
}

function requireSession(role) {
  const session = readSession();
  if (!session?.token || !session?.user) {
    window.location.href = '/signin.html';
    return null;
  }
  if (role && session.user.role !== role) {
    window.location.href = session.user.role === 'admin' ? '/admin.html' : '/dashboard.html';
    return null;
  }
  return session;
}

function formatDateTime(value) {
  if (!value) return 'Never';
  return new Date(value).toLocaleString();
}

function formatDateOnly(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString();
}

function shortNumber(value) {
  return Number(value || 0).toLocaleString();
}

function initPasswordToggles() {
  document.querySelectorAll('[data-password-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const field = button.closest('.password-field');
      const input = field?.querySelector('input');
      if (!input) return;

      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      button.textContent = showing ? '👁' : '🙈';
      button.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
    });
  });
}

initPasswordToggles();
