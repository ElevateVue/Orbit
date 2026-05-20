const signinForm = document.getElementById('signinForm');
const signinStatus = document.getElementById('signinStatus');

// If already logged in, redirect
const existing = readSession();
if (existing?.user) {
  window.location.href = roleHomePage(existing.user.role);
}

signinForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  signinStatus.textContent = 'Signing in…';

  try {
    const session = await signin({
      email: document.getElementById('email').value.trim(),
      password: document.getElementById('password').value,
    });
    window.location.href = roleHomePage(session.user.role);
  } catch (error) {
    signinStatus.textContent = error.message;
  }
});
