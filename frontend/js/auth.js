// ── Role tabs (sign in / sign up) ─────────────────────────────────────────────
function getSelectedRole(containerId) {
  const active = document.querySelector(`#${containerId} .role-tab.active`);
  return active?.dataset.role || 'ADMIN';
}

function initRoleTabs(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.querySelectorAll('.role-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      container.querySelectorAll('.role-tab').forEach((t) => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
    });
  });
}

// ── Login / Signup Logic ───────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (typeof initPageChrome === 'function') initPageChrome();
  if (localStorage.getItem('token')) {
    window.location.href = '/dashboard';
    return;
  }

  initRoleTabs('login-role-tabs');
  initRoleTabs('signup-role-tabs');

  const loginForm  = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = loginForm.querySelector('button[type=submit]');
      const err = document.getElementById('login-error');
      btn.disabled = true;
      btn.textContent = 'Signing in…';
      err.classList.remove('visible');
      try {
        const data = await API.post('/auth/login', {
          email:        loginForm.email.value.trim(),
          password:     loginForm.password.value,
          account_role: getSelectedRole('login-role-tabs'),
        });
        saveAuth(data);
        window.location.href = '/dashboard';
      } catch (ex) {
        err.textContent = ex.message;
        err.classList.add('visible');
        btn.disabled = false;
        btn.textContent = 'Sign in';
      }
    });
  }

  if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = signupForm.querySelector('button[type=submit]');
      const err = document.getElementById('signup-error');
      btn.disabled = true;
      btn.textContent = 'Creating account…';
      err.classList.remove('visible');

      const password  = signupForm.password.value;
      const password2 = signupForm.password2.value;
      if (password !== password2) {
        err.textContent = 'Passwords do not match';
        err.classList.add('visible');
        btn.disabled = false;
        btn.textContent = 'Create account';
        return;
      }
      try {
        const data = await API.post('/auth/signup', {
          name:         signupForm.name.value.trim(),
          email:        signupForm.email.value.trim(),
          password,
          account_role: getSelectedRole('signup-role-tabs'),
        });
        saveAuth(data);
        window.location.href = '/dashboard';
      } catch (ex) {
        err.textContent = ex.message;
        err.classList.add('visible');
        btn.disabled = false;
        btn.textContent = 'Create account';
      }
    });
  }
});
