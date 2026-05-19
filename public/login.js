const signupForm = document.getElementById('loginForm');
const loginStatus = document.getElementById('loginStatus');

signupForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginStatus.textContent = 'Creating account...';
  try {
    await signup({
      firstName: document.getElementById('firstName').value.trim(),
      lastName: document.getElementById('lastName').value.trim(),
      email: document.getElementById('email').value.trim(),
      password: document.getElementById('password').value,
    });
    window.location.href = '/dashboard.html';
  } catch (error) {
    loginStatus.textContent = error.message;
  }
});
