// Apply saved dark mode preference
if (localStorage.getItem('darkMode') !== 'false') {
    document.body.setAttribute('data-theme', 'dark');
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    const errorEl = document.getElementById('loginError');
    const errorMsg = document.getElementById('loginErrorMsg');
    const btn = e.target.querySelector('button[type=submit]');

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing in…';
    errorEl.style.display = 'none';

    try {
        const resp = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await resp.json();
        if (resp.ok && data.success) {
            window.location.href = '/';
        } else {
            errorMsg.textContent = data.error || 'Invalid credentials';
            errorEl.style.display = 'block';
        }
    } catch (err) {
        errorMsg.textContent = 'Network error — please try again';
        errorEl.style.display = 'block';
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign In';
    }
});
