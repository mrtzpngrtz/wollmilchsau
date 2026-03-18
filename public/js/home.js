/* === WOLLMILCHSAU — Home Page === */
const Home = {
  async init() {
    await this.loadCurrentUser();
    Storage.initDashboard();
    Storage.refreshDashboard();
    this.initDarkMode();
    this.initLogout();
    this.initProfile();

    const brand = document.querySelector('.brand-name');
    if (brand) {
      brand.style.cursor = 'pointer';
      brand.addEventListener('click', () => Storage.refreshDashboard());
    }
  },

  async loadCurrentUser() {
    try {
      const res = await fetch('/api/auth/me');
      if (res.status === 401) { window.location.href = '/login'; return; }
      const data = await res.json();
      const nameBtn = document.getElementById('btn-profile');
      if (nameBtn) nameBtn.textContent = data.user.displayName || data.user.username;
      if (data.user.role === 'admin') {
        const adminBtn = document.getElementById('btn-admin');
        if (adminBtn) adminBtn.classList.remove('hidden');
      }
    } catch (err) {
      console.error('Auth check failed:', err);
    }
  },

  initDarkMode() {
    if (localStorage.getItem('wms-darkmode') === 'true') document.body.classList.add('dark');
    const btn = document.getElementById('btn-darkmode');
    if (btn) btn.addEventListener('click', () => {
      document.body.classList.toggle('dark');
      localStorage.setItem('wms-darkmode', document.body.classList.contains('dark'));
    });
  },

  initLogout() {
    const btn = document.getElementById('btn-logout');
    if (btn) btn.addEventListener('click', async () => {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/login';
    });
  },

  initProfile() {
    const modal = document.getElementById('profile-modal');
    if (!modal) return;

    const openModal = async () => {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      const u = data.user;
      document.getElementById('profile-username').textContent = u.username;
      document.getElementById('profile-display-name').value = u.displayName || '';
      document.getElementById('profile-email').value = u.email || '';
      document.getElementById('profile-cur-pw').value = '';
      document.getElementById('profile-new-pw').value = '';
      document.getElementById('profile-new-pw2').value = '';
      modal.classList.remove('hidden');
    };

    document.getElementById('btn-profile').addEventListener('click', openModal);
    const closeModal = () => modal.classList.add('hidden');
    document.getElementById('profile-close').addEventListener('click', closeModal);
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

    document.getElementById('profile-save').addEventListener('click', async () => {
      const displayName = document.getElementById('profile-display-name').value.trim();
      const email = document.getElementById('profile-email').value.trim();
      const res = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName, email }),
      });
      const data = await res.json();
      if (!res.ok) { await Dialog.alert(data.error || 'Save failed', 'ERROR'); return; }
      document.getElementById('btn-profile').textContent = data.displayName;
      await Dialog.alert('Profile saved.', 'SAVED');
    });

    document.getElementById('profile-pw-save').addEventListener('click', async () => {
      const currentPassword = document.getElementById('profile-cur-pw').value;
      const newPassword = document.getElementById('profile-new-pw').value;
      const confirm = document.getElementById('profile-new-pw2').value;
      if (!currentPassword || !newPassword) { await Dialog.alert('Fill in current and new password.', 'ERROR'); return; }
      if (newPassword !== confirm) { await Dialog.alert('New passwords do not match.', 'ERROR'); return; }
      const res = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) { await Dialog.alert(data.error || 'Password update failed', 'ERROR'); return; }
      document.getElementById('profile-cur-pw').value = '';
      document.getElementById('profile-new-pw').value = '';
      document.getElementById('profile-new-pw2').value = '';
      await Dialog.alert('Password updated.', 'SAVED');
    });
  },
};

document.addEventListener('DOMContentLoaded', () => Home.init());
