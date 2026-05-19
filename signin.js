const signinForm = document.getElementById('signinForm');
const portalRoleInput = document.getElementById('portalRole');
const signinStatus = document.getElementById('signinStatus');
const roleButtons = Array.from(document.querySelectorAll('[data-role-option]'));

function setRole(role) {
  portalRoleInput.value = role;
  roleButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.roleOption === role);
  });
}

roleButtons.forEach((button) => {
  button.addEventListener('click', () => setRole(button.dataset.roleOption));
});

signinForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  signinStatus.textContent = 'Signing in...';

  try {
    const session = await signin({
      email: document.getElementById('email').value.trim(),
      password: document.getElementById('password').value,
      role: portalRoleInput.value,
    });
    window.location.href = session.user.role === 'admin' ? '/admin.html' : '/dashboard.html';
  } catch (error) {
    signinStatus.textContent = error.message;
  }
});
