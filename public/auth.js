// ── Orbit Auth helpers ───────────────────────────────────────────────────────

function saveSession(session) {
  localStorage.setItem('orbit_token', session.token);
  localStorage.setItem('orbit_user', JSON.stringify(session.user));
}

function readSession() {
  try {
    const token = localStorage.getItem('orbit_token');
    const user = JSON.parse(localStorage.getItem('orbit_user') || 'null');
    if (!token || !user) return null;
    return { token, user };
  } catch {
    return null;
  }
}

function clearSession() {
  localStorage.removeItem('orbit_token');
  localStorage.removeItem('orbit_user');
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
    } catch {
      throw new Error('The server returned an invalid response. Please try again.');
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
    } catch {
      // keep local signout resilient
    }
  }
  clearSession();
}

function roleHomePage(role) {
  if (role === 'super_admin' || role === 'admin') return '/admin.html';
  return '/dashboard.html';
}

function requireSession(allowedRoles) {
  const session = readSession();
  if (!session?.token || !session?.user) {
    window.location.href = '/signin.html';
    return null;
  }
  const role = session.user.role;
  // If allowedRoles is a string, convert to array for uniform check
  if (allowedRoles) {
    const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
    if (!roles.includes(role)) {
      window.location.href = roleHomePage(role);
      return null;
    }
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
