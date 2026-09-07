// ==========================================================
// Nexaa Client Application
// High-precision URL Shortener, Analytics & Firebase Auth
// ==========================================================

document.addEventListener('DOMContentLoaded', async () => {
  // DOM Elements - Core Form
  const preloader = document.getElementById('preloader');
  const preloaderBar = document.getElementById('preloader-bar');
  const preloaderCounter = document.getElementById('preloader-counter');
  const preloaderStatus = document.getElementById('preloader-status');

  const shortenForm = document.getElementById('shorten-form');
  const inputUrl = document.getElementById('input-url');
  const inputSlug = document.getElementById('input-slug');
  const btnPaste = document.getElementById('btn-paste');
  const btnClearUrl = document.getElementById('btn-clear-url');
  const btnSubmit = document.getElementById('btn-submit');
  const submitText = document.getElementById('submit-text');
  const submitIcon = document.getElementById('submit-icon');

  const toggleCustomSlug = document.getElementById('toggle-custom-slug');
  const customSlugBody = document.getElementById('custom-slug-body');
  const slugChevron = document.getElementById('slug-chevron');

  const errorBanner = document.getElementById('error-banner');
  const errorMessage = document.getElementById('error-message');

  const resultContainer = document.getElementById('result-container');
  const resultShortUrl = document.getElementById('result-short-url');
  const resultDestUrl = document.getElementById('result-dest-url');
  const resultDate = document.getElementById('result-date');
  const btnCopy = document.getElementById('btn-copy');
  const copyBtnText = document.getElementById('copy-btn-text');
  const btnQr = document.getElementById('btn-qr');
  const btnTestLink = document.getElementById('btn-test-link');

  // DOM Elements - QR Modal
  const qrModal = document.getElementById('qr-modal');
  const btnCloseQr = document.getElementById('btn-close-qr');
  const qrCanvas = document.getElementById('qr-canvas');
  const qrTargetUrl = document.getElementById('qr-target-url');
  const btnDownloadQr = document.getElementById('btn-download-qr');

  // DOM Elements - Auth & User Profile
  const btnGoogleLogin = document.getElementById('btn-google-login');
  const btnBannerLogin = document.getElementById('btn-banner-login');
  const userProfileWidget = document.getElementById('user-profile-widget');
  const userAvatar = document.getElementById('user-avatar');
  const userName = document.getElementById('user-name');
  const btnLogout = document.getElementById('btn-logout');
  const guestAuthBanner = document.getElementById('guest-auth-banner');

  // DOM Elements - Dashboard
  const userDashboardSection = document.getElementById('user-dashboard-section');
  const statTotalLinks = document.getElementById('stat-total-links');
  const statTotalClicks = document.getElementById('stat-total-clicks');
  const btnRefreshDashboard = document.getElementById('btn-refresh-dashboard');
  const userLinksList = document.getElementById('user-links-list');
  const userLinksEmpty = document.getElementById('user-links-empty');

  // DOM Elements - Delete Modal
  const deleteModal = document.getElementById('delete-modal');
  const btnCloseDeleteModal = document.getElementById('btn-close-delete-modal');
  const btnCancelDelete = document.getElementById('btn-cancel-delete');
  const btnConfirmDelete = document.getElementById('btn-confirm-delete');
  const deleteTargetSlug = document.getElementById('delete-target-slug');

  const toast = document.getElementById('toast');
  const toastText = document.getElementById('toast-text');

  let activeShortUrl = '';
  let activeSlug = '';
  let currentUser = null;
  let authInstance = null;
  let pendingDeleteLink = null;

  // =======================================================
  // 1. High-End Loading Screen (Preloader)
  // =======================================================
  let progress = 0;
  const loadingInterval = setInterval(() => {
    progress += Math.floor(Math.random() * 12) + 6;
    if (progress > 100) progress = 100;

    preloaderBar.style.width = `${progress}%`;
    preloaderCounter.textContent = `${progress < 10 ? '0' : ''}${progress}%`;

    if (progress < 40) {
      preloaderStatus.textContent = 'Menginisialisasi modul Nexaa...';
    } else if (progress < 85) {
      preloaderStatus.textContent = 'Menghubungkan ke nexaa.my.id...';
    } else {
      preloaderStatus.textContent = 'Sistem siap digunakan.';
    }

    if (progress >= 100) {
      clearInterval(loadingInterval);
      setTimeout(() => {
        preloader.classList.add('fade-out');
        setTimeout(() => {
          preloader.style.display = 'none';
        }, 500);
      }, 350);
    }
  }, 45);

  // =======================================================
  // 2. Toast Helper
  // =======================================================
  let toastTimer = null;
  function showToast(message, icon = 'fa-circle-check') {
    toastText.textContent = message;
    const iconEl = toast.querySelector('i');
    if (iconEl) iconEl.className = `fa-solid ${icon}`;
    toast.classList.remove('hidden');

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.add('hidden');
    }, 3200);
  }

  // =======================================================
  // 3. Custom Slug Toggle Accordion
  // =======================================================
  toggleCustomSlug.addEventListener('click', () => {
    const isOpen = customSlugBody.classList.contains('open');
    if (isOpen) {
      customSlugBody.classList.remove('open');
      slugChevron.classList.remove('rotated');
    } else {
      customSlugBody.classList.add('open');
      slugChevron.classList.add('rotated');
      inputSlug.focus();
    }
  });

  // Auto sanitize slug input
  inputSlug.addEventListener('input', () => {
    inputSlug.value = inputSlug.value
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9_-]/g, '');
  });

  // =======================================================
  // 4. Input Actions (Paste & Clear)
  // =======================================================
  inputUrl.addEventListener('input', () => {
    if (inputUrl.value.trim().length > 0) {
      btnClearUrl.classList.remove('hidden');
    } else {
      btnClearUrl.classList.add('hidden');
    }
    hideError();
  });

  btnClearUrl.addEventListener('click', () => {
    inputUrl.value = '';
    btnClearUrl.classList.add('hidden');
    hideError();
    inputUrl.focus();
  });

  btnPaste.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) {
        inputUrl.value = text.trim();
        btnClearUrl.classList.remove('hidden');
        hideError();
        showToast('Tautan berhasil ditempel dari clipboard');
      } else {
        showToast('Clipboard kosong atau tidak berisi teks.', 'fa-circle-exclamation');
      }
    } catch {
      inputUrl.focus();
      showToast('Tekan Ctrl+V untuk menempel tautan.', 'fa-circle-info');
    }
  });

  function showError(msg) {
    errorMessage.textContent = msg;
    errorBanner.classList.remove('hidden');
  }

  function hideError() {
    errorBanner.classList.add('hidden');
  }

  // =======================================================
  // 5. Shorten Form Submission
  // =======================================================
  shortenForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError();

    const url = inputUrl.value.trim();
    const customSlug = inputSlug.value.trim();

    if (!url) {
      showError('Harap masukkan URL yang ingin diperpendek.');
      inputUrl.focus();
      return;
    }

    // Set Loading state
    btnSubmit.disabled = true;
    submitText.textContent = 'Memproses...';
    submitIcon.className = 'fa-solid fa-spinner fa-spin';

    const payload = {
      url,
      customSlug,
      userId: currentUser ? currentUser.uid : null,
      userEmail: currentUser ? currentUser.email : null
    };

    try {
      const res = await fetch('/api/shorten', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      let data;
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        console.error('Non-JSON response:', text);
        throw new Error(`Gagal memproses (Status ${res.status}).`);
      }

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Gagal memperpendek tautan.');
      }

      const link = data.link;
      activeShortUrl = link.shortUrl;
      activeSlug = link.slug;

      // Render Result Card
      resultShortUrl.textContent = link.shortUrl;
      resultDestUrl.textContent = `Tujuan: ${link.destination}`;
      resultDate.textContent = 'Masa aktif: 30 hari';
      btnTestLink.href = `/${link.slug}`;
      copyBtnText.textContent = 'Salin Tautan';

      resultContainer.classList.remove('hidden');
      resultContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

      showToast(`Tautan nexaa.my.id/${link.slug} siap digunakan!`);

      // If user is logged in, refresh dashboard to include the new link
      if (currentUser) {
        loadUserLinks(currentUser.uid);
      }

    } catch (err) {
      showError(err.message);
    } finally {
      btnSubmit.disabled = false;
      submitText.textContent = 'Perpendek Tautan';
      submitIcon.className = 'fa-solid fa-arrow-right';
    }
  });

  // =======================================================
  // 6. Copy to Clipboard
  // =======================================================
  btnCopy.addEventListener('click', async () => {
    if (!activeShortUrl) return;
    try {
      await navigator.clipboard.writeText(activeShortUrl);
      copyBtnText.textContent = 'Tersalin!';
      showToast('Tautan berhasil disalin ke clipboard');
      setTimeout(() => {
        copyBtnText.textContent = 'Salin Tautan';
      }, 2500);
    } catch {
      showToast('Gagal menyalin otomatis. Silakan salin manual.', 'fa-circle-exclamation');
    }
  });

  // =======================================================
  // 7. QR Code Modal
  // =======================================================
  function openQrModal(url, slug = '') {
    if (!url) return;
    activeSlug = slug || activeSlug;
    qrTargetUrl.textContent = url;

    if (window.QRCode) {
      const ctx = qrCanvas.getContext('2d');
      ctx.clearRect(0, 0, qrCanvas.width, qrCanvas.height);

      QRCode.toCanvas(qrCanvas, url, {
        width: 200,
        margin: 1,
        color: {
          dark: '#0a0b10',
          light: '#ffffff'
        }
      }, (error) => {
        if (error) console.error(error);
      });
    }

    qrModal.classList.remove('hidden');
  }

  btnQr.addEventListener('click', () => {
    openQrModal(activeShortUrl, activeSlug);
  });

  btnCloseQr.addEventListener('click', () => {
    qrModal.classList.add('hidden');
  });

  qrModal.addEventListener('click', (e) => {
    if (e.target === qrModal) {
      qrModal.classList.add('hidden');
    }
  });

  btnDownloadQr.addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = `nexaa-qr-${activeSlug || 'code'}.png`;
    link.href = qrCanvas.toDataURL('image/png');
    link.click();
    showToast('Gambar QR Code berhasil diunduh');
  });

  // =======================================================
  // 8. Firebase Authentication (Google Sign-In)
  // =======================================================
  async function setupFirebaseAuth() {
    if (typeof firebase === 'undefined') {
      console.warn('[Firebase] Library Firebase tidak dimuat.');
      return;
    }

    const config = typeof getFirebaseConfig === 'function' ? await getFirebaseConfig() : null;

    if (!config || !config.apiKey || !config.projectId) {
      console.info('[Firebase] Menunggu konfigurasi Firebase di .env atau firebase-config.js');
      // Set click listener to notify user if they try to sign in
      const notifyMissingConfig = () => {
        showToast('Konfigurasi Firebase belum diisi di .env. Lihat walkthrough untuk panduan.', 'fa-circle-info');
      };
      if (btnGoogleLogin) btnGoogleLogin.addEventListener('click', notifyMissingConfig);
      if (btnBannerLogin) btnBannerLogin.addEventListener('click', notifyMissingConfig);
      return;
    }

    try {
      if (!firebase.apps.length) {
        firebase.initializeApp(config);
      }
      authInstance = firebase.auth();

      // Auth State Listener
      authInstance.onAuthStateChanged((user) => {
        currentUser = user;
        updateAuthUI(user);
        if (user) {
          loadUserLinks(user.uid);
        }
      });

      // Login handlers
      const handleGoogleLogin = async () => {
        try {
          const provider = new firebase.auth.GoogleAuthProvider();
          await authInstance.signInWithPopup(provider);
          showToast('Berhasil masuk dengan akun Google!');
        } catch (err) {
          console.error('Login error:', err);
          if (err.code === 'auth/popup-closed-by-user') {
            return;
          }
          if (err.code === 'auth/unauthorized-domain') {
            showToast('Domain belum diotorisasi di Firebase Console (Authorized domains).', 'fa-circle-exclamation');
          } else {
            showToast(`Gagal login: ${err.message}`, 'fa-circle-exclamation');
          }
        }
      };

      if (btnGoogleLogin) btnGoogleLogin.addEventListener('click', handleGoogleLogin);
      if (btnBannerLogin) btnBannerLogin.addEventListener('click', handleGoogleLogin);

      // Logout handler
      if (btnLogout) {
        btnLogout.addEventListener('click', async () => {
          try {
            await authInstance.signOut();
            showToast('Berhasil keluar dari akun.');
          } catch (err) {
            console.error('Logout error:', err);
          }
        });
      }

    } catch (err) {
      console.error('[Firebase Setup Error]', err);
    }
  }

  function updateAuthUI(user) {
    if (user) {
      // User is logged in
      btnGoogleLogin.classList.add('hidden');
      userProfileWidget.classList.remove('hidden');
      userAvatar.src = user.photoURL || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="%238e97a8"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/></svg>';
      userName.textContent = user.displayName || user.email.split('@')[0];

      guestAuthBanner.classList.add('hidden');
      userDashboardSection.classList.remove('hidden');
    } else {
      // User is logged out
      btnGoogleLogin.classList.remove('hidden');
      userProfileWidget.classList.add('hidden');
      guestAuthBanner.classList.remove('hidden');
      userDashboardSection.classList.add('hidden');
    }
  }

  // =======================================================
  // 9. User Dashboard & Link Monitoring
  // =======================================================
  async function loadUserLinks(userId) {
    if (!userId) return;

    if (btnRefreshDashboard) {
      btnRefreshDashboard.classList.add('spinning');
    }

    try {
      const res = await fetch(`/api/user/links?userId=${encodeURIComponent(userId)}`);
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Gagal memuat daftar tautan.');
      }

      statTotalLinks.textContent = data.totalLinks || 0;
      statTotalClicks.textContent = data.totalClicks || 0;

      renderUserLinks(data.links || []);
    } catch (err) {
      console.error('Error loading user links:', err);
    } finally {
      if (btnRefreshDashboard) {
        setTimeout(() => {
          btnRefreshDashboard.classList.remove('spinning');
        }, 400);
      }
    }
  }

  function formatDaysRemaining(expiresAt) {
    if (!expiresAt) return 'Aktif';
    const now = new Date();
    const expiry = new Date(expiresAt);
    const diffMs = expiry - now;
    if (diffMs <= 0) return 'Kedaluwarsa';
    const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    return `Sisa ${days} hari`;
  }

  function renderUserLinks(links) {
    userLinksList.innerHTML = '';

    if (!links || links.length === 0) {
      userLinksEmpty.classList.remove('hidden');
      userLinksList.classList.add('hidden');
      return;
    }

    userLinksEmpty.classList.add('hidden');
    userLinksList.classList.remove('hidden');

    links.forEach((link) => {
      const card = document.createElement('div');
      card.className = `user-link-card ${link.isExpired ? 'is-expired' : ''}`;
      card.dataset.id = link.id;

      const remainingText = formatDaysRemaining(link.expiresAt);
      const isExp = link.isExpired || remainingText === 'Kedaluwarsa';

      card.innerHTML = `
        <div class="link-card-left">
          <div class="link-card-top-row">
            <a href="/${link.slug}" target="_blank" class="link-short-url">
              ${link.shortUrl}
            </a>
            <span class="click-badge" title="Jumlah orang yang mengklik tautan ini">
              <i class="fa-solid fa-chart-simple"></i>
              <strong>${link.clicks || 0}</strong> Klik
            </span>
            <span class="expiry-badge ${isExp ? 'expired' : ''}">
              <i class="fa-regular fa-clock"></i>
              ${remainingText}
            </span>
          </div>
          <div class="link-dest-url" title="${link.destination}">
            <i class="fa-solid fa-arrow-turn-down"></i>
            <span>${link.destination}</span>
          </div>
        </div>

        <div class="link-card-actions">
          <button type="button" class="btn-card-action btn-copy-card" title="Salin Tautan">
            <i class="fa-regular fa-clone"></i>
            <span>Salin</span>
          </button>
          <button type="button" class="btn-card-action btn-qr-card" title="Tampilkan QR Code">
            <i class="fa-solid fa-qrcode"></i>
          </button>
          <a href="/${link.slug}" target="_blank" class="btn-card-action" title="Uji Tautan di Tab Baru">
            <i class="fa-solid fa-arrow-up-right-from-square"></i>
          </a>
          <button type="button" class="btn-card-action btn-delete-link" title="Hapus Tautan">
            <i class="fa-regular fa-trash-can"></i>
            <span>Hapus</span>
          </button>
        </div>
      `;

      // Copy Action
      const btnCopyCard = card.querySelector('.btn-copy-card');
      btnCopyCard.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(link.shortUrl);
          btnCopyCard.innerHTML = '<i class="fa-solid fa-check"></i> <span>Tersalin</span>';
          showToast(`Tautan ${link.slug} disalin!`);
          setTimeout(() => {
            btnCopyCard.innerHTML = '<i class="fa-regular fa-clone"></i> <span>Salin</span>';
          }, 2000);
        } catch {
          showToast('Gagal menyalin tautan.', 'fa-circle-exclamation');
        }
      });

      // QR Action
      const btnQrCard = card.querySelector('.btn-qr-card');
      btnQrCard.addEventListener('click', () => {
        openQrModal(link.shortUrl, link.slug);
      });

      // Delete Action
      const btnDelete = card.querySelector('.btn-delete-link');
      btnDelete.addEventListener('click', () => {
        openDeleteModal(link);
      });

      userLinksList.appendChild(card);
    });
  }

  if (btnRefreshDashboard) {
    btnRefreshDashboard.addEventListener('click', () => {
      if (currentUser) {
        loadUserLinks(currentUser.uid);
      }
    });
  }

  // =======================================================
  // 10. Delete Link Modal & Execution
  // =======================================================
  function openDeleteModal(link) {
    pendingDeleteLink = link;
    deleteTargetSlug.textContent = `${link.shortUrl} (Tujuan: ${link.destination})`;
    deleteModal.classList.remove('hidden');
  }

  function closeDeleteModal() {
    pendingDeleteLink = null;
    deleteModal.classList.add('hidden');
  }

  if (btnCloseDeleteModal) btnCloseDeleteModal.addEventListener('click', closeDeleteModal);
  if (btnCancelDelete) btnCancelDelete.addEventListener('click', closeDeleteModal);

  deleteModal.addEventListener('click', (e) => {
    if (e.target === deleteModal) closeDeleteModal();
  });

  btnConfirmDelete.addEventListener('click', async () => {
    if (!pendingDeleteLink || !currentUser) return;

    const linkId = pendingDeleteLink.id;
    const slug = pendingDeleteLink.slug;

    btnConfirmDelete.disabled = true;
    btnConfirmDelete.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menghapus...';

    try {
      const res = await fetch(`/api/links/${encodeURIComponent(linkId)}?userId=${encodeURIComponent(currentUser.uid)}`, {
        method: 'DELETE'
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Gagal menghapus tautan.');
      }

      showToast(`Tautan nexaa.my.id/${slug} berhasil dihapus.`);
      closeDeleteModal();

      // Refresh list
      loadUserLinks(currentUser.uid);

    } catch (err) {
      showToast(err.message, 'fa-circle-exclamation');
    } finally {
      btnConfirmDelete.disabled = false;
      btnConfirmDelete.innerHTML = '<i class="fa-solid fa-trash"></i> <span>Hapus Tautan</span>';
    }
  });

  // Initialize Firebase Auth
  setupFirebaseAuth();

});
