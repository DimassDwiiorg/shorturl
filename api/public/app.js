// ==========================================================
// Nexaa Client Application
// High-precision URL Shortener & Analytics Logic
// ==========================================================

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
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

  const qrModal = document.getElementById('qr-modal');
  const btnCloseQr = document.getElementById('btn-close-qr');
  const qrCanvas = document.getElementById('qr-canvas');
  const qrTargetUrl = document.getElementById('qr-target-url');
  const btnDownloadQr = document.getElementById('btn-download-qr');

  const toast = document.getElementById('toast');
  const toastText = document.getElementById('toast-text');

  let activeShortUrl = '';
  let activeSlug = '';

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

    try {
      const res = await fetch('/api/shorten', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url, customSlug })
      });

      let data;
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        console.error('Non-JSON response:', text);
        throw new Error(`Gagal memproses (Status ${res.status}). Pastikan konfigurasi rute Vercel sudah diperbarui.`);
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
      resultDate.textContent = 'Baru saja';
      btnTestLink.href = `/${link.slug}`;
      copyBtnText.textContent = 'Salin Tautan';

      resultContainer.classList.remove('hidden');
      resultContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

      showToast(`Tautan nexaa.my.id/${link.slug} siap digunakan!`);

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
  function openQrModal(url) {
    if (!url) return;
    qrTargetUrl.textContent = url;

    if (window.QRCode) {
      // Clear previous
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
    openQrModal(activeShortUrl);
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

});
