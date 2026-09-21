// ==========================================================
// Firebase Client Configuration & Loader
// ==========================================================
// Secara default, konfigurasi ini otomatis diambil dari server backend (/api/firebase-config)
// sehingga Anda cukup mengisinya di file .env atau Environment Variables Vercel.

window.__FIREBASE_CONFIG__ = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

async function getFirebaseConfig() {
  // Coba fetch dari backend serverless
  try {
    const res = await fetch('/api/firebase-config');
    if (res.ok) {
      const serverConfig = await res.json();
      if (serverConfig.configured) {
        return serverConfig;
      }
    }
  } catch (err) {
    console.warn('[Firebase] Gagal fetch config dari API:', err.message);
  }

  // Fallback ke window.__FIREBASE_CONFIG__ jika diisi langsung
  if (window.__FIREBASE_CONFIG__ && window.__FIREBASE_CONFIG__.apiKey) {
    return window.__FIREBASE_CONFIG__;
  }

  return null;
}
