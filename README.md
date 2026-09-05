# Nexaa (`nexaa.my.id`) — High-Precision Link Infrastructure

Website pemendek tautan (URL Shortener) modern, bersih, dan berkelas dengan domain branding **`nexaa.my.id`**. Dirancang khusus dengan estetika **matte graphite/titanium**, tipografi tajam, micro-interactions halus, dan **bebas dari warna neon AI yang menyilaukan**.

---

## ✨ Fitur Utama

- 💎 **Clean & Elegant Aesthetic (Zero AI Neon)**: Desain minimalis terinspirasi dari platform modern kelas dunia (Linear / Raycast / Apple Pro dark). Nyaman di mata untuk penggunaan berjam-jam.
- ⏳ **High-End Preloader**: Animasi loading screen minimalis dengan monogram Nexaa, status rute, dan counter persentase numerik (00% – 100%) yang halus.
- 🌐 **Branding `nexaa.my.id`**: Semua tautan pendek otomatis diformat dengan domain `https://nexaa.my.id/<slug>`.
- ⚡ **Custom Alias / Slug**: Opsi kustomisasi akhiran link (misal: `nexaa.my.id/portfolio`, `nexaa.my.id/promo-merdeka`).
- 📊 **Real-time Click Analytics**: Melacak berapa kali setiap tautan dikunjungi pengguna.
- 📱 **QR Code Generator Bawaan**: Otomatis menghasilkan kode QR beresolusi tajam yang dapat diunduh dalam format PNG.
- 🚀 **Working Redirection Engine**: Menggunakan database lokal JSON (`data/links.json`). Mengalihkan pengguna secara instan (HTTP 302) ke tautan tujuan saat link dibuka di browser.
- 🚫 **Halaman 404 Custom**: Tampilan elegan jika tautan tidak ditemukan atau sudah dihapus.

---

## 🚀 Cara Menjalankan

1. Masuk ke direktori proyek:
   ```bash
   cd C:\Users\dimas\.gemini\antigravity\scratch\nexaa
   ```

2. Jalankan server:
   ```bash
   npm start
   ```

3. Buka di browser Anda:
   👉 **[http://localhost:3001](http://localhost:3001)**

---

## 📂 Struktur File

```
nexaa/
├── data/
│   └── links.json       # Database penyimpanan link & counter klik
├── public/
│   ├── index.html       # Halaman utama, form, loading screen & modal QR
│   ├── 404.html         # Halaman 404 custom elegan
│   ├── style.css        # Desain dark matte, tipografi & layout responsif
│   └── app.js           # Preloader counter, interaksi API, clipboard & QR
├── package.json         # Dependensi (express, cors)
├── server.js            # Node.js backend, router API, dan 302 redirect engine
└── README.md            # Dokumentasi proyek
```

---

## 📡 Endpoint API

| Method | Endpoint | Deskripsi |
|---|---|---|
| `GET` | `/api/links` | Mengambil seluruh riwayat tautan beserta jumlah klik |
| `GET` | `/api/stats` | Statistik total tautan & total klik |
| `POST` | `/api/shorten` | Memperpendek URL (opsional: custom slug) |
| `DELETE` | `/api/links/:id` | Menghapus tautan |
| `GET` | `/:slug` | Mengalihkan (302 Redirect) ke URL tujuan asli & menambah total klik |

---

Developed with precision by **Dimass**
