require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3001;
const BRAND_DOMAIN = process.env.BRAND_DOMAIN || 'nexaa.my.id';

// Expiry config: 30 days in milliseconds
const LINK_EXPIRY_DAYS = 30;
const LINK_EXPIRY_MS = LINK_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

// Environment detection
const IS_VERCEL = !!(process.env.VERCEL || process.env.NOW_REGION || process.env.AWS_LAMBDA_FUNCTION_NAME);

// Determine public directory (supports both standard and Vercel structures)
const PUBLIC_DIR = fs.existsSync(path.join(__dirname, 'public'))
  ? path.join(__dirname, 'public')
  : path.join(__dirname, 'api', 'public');

// Data paths for local fallback
const LOCAL_DATA_FILE = path.join(__dirname, 'data', 'links.json');
const VERCEL_DATA_FILE = path.join(os.tmpdir(), 'nexaa_links.json');
const DATA_FILE = IS_VERCEL ? VERCEL_DATA_FILE : LOCAL_DATA_FILE;

// ==========================================================
// Database Setup (Supabase / Cloud Database)
// ==========================================================
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const HAS_SUPABASE = !!(SUPABASE_URL && SUPABASE_KEY);

let supabase = null;
if (HAS_SUPABASE) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false }
    });
    console.log('[Database] Supabase client initialized.');
  } catch (err) {
    console.error('[Database Init Error]', err.message);
  }
}

// Global In-Memory Cache (for fallback local mode)
if (!global.__NEXAA_CACHE__) {
  global.__NEXAA_CACHE__ = {
    links: [],
    initialized: false
  };
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(PUBLIC_DIR));

// Normalize URL for Vercel Serverless Rewrites
app.use((req, res, next) => {
  if (req.url.startsWith('/server.js') || req.url.startsWith('/api/index.js')) {
    const orig = req.headers['x-matched-path'] || req.headers['x-now-route-matches'] || req.headers['x-forwarded-uri'];
    if (orig && !orig.endsWith('/server.js') && !orig.endsWith('/index.js')) {
      req.url = orig;
    } else {
      req.url = req.url.replace(/^\/(?:server\.js|api\/index\.js)/, '') || '/';
    }
  }
  next();
});

// ==========================================================
// Storage Adapter (Supabase with Local File Fallback)
// ==========================================================

// Helper to map Supabase snake_case row to camelCase
function mapDbRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    destination: row.destination,
    shortUrl: row.short_url,
    localTestUrl: `http://localhost:${PORT}/${row.slug}`,
    clicks: row.clicks || 0,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    lastAccessedAt: row.last_accessed_at,
    userId: row.user_id || null,
    userEmail: row.user_email || null
  };
}

// Local Storage Helpers (Fallback)
function initLocalStorage() {
  if (global.__NEXAA_CACHE__.initialized) return;

  let seedLinks = [];
  try {
    if (fs.existsSync(LOCAL_DATA_FILE)) {
      const raw = fs.readFileSync(LOCAL_DATA_FILE, 'utf-8');
      seedLinks = JSON.parse(raw || '[]');
    }
  } catch (e) {
    console.error('Error reading local seed file:', e.message);
  }

  global.__NEXAA_CACHE__.links = seedLinks;
  global.__NEXAA_CACHE__.initialized = true;
}

function readLocalLinks() {
  initLocalStorage();
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(data || '[]');
      global.__NEXAA_CACHE__.links = parsed;
      return parsed;
    }
  } catch (err) {
    console.error('[File Read Error]', err.message);
  }
  return global.__NEXAA_CACHE__.links;
}

function saveLocalLinks(links) {
  global.__NEXAA_CACHE__.links = links;
  try {
    const dir = path.dirname(LOCAL_DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(LOCAL_DATA_FILE, JSON.stringify(links, null, 2));
  } catch (err) {
    console.error('[File Save Error]', err.message);
  }
  if (IS_VERCEL) {
    try {
      fs.writeFileSync(VERCEL_DATA_FILE, JSON.stringify(links, null, 2));
    } catch (_) {}
  }
  return true;
}

// Check if a link is expired
function isLinkExpired(expiresAt) {
  if (!expiresAt) return false;
  return new Date() > new Date(expiresAt);
}

// Unified Database Operations
async function getLinkBySlug(slug) {
  const cleanSlug = slug.trim().toLowerCase();

  // 1. If Supabase is connected
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('links')
        .select('*')
        .eq('slug', cleanSlug)
        .maybeSingle();

      if (error) {
        console.error('[Supabase Query Error]', error.message);
      } else if (data) {
        // Check expiry (30 days)
        if (isLinkExpired(data.expires_at)) {
          return null;
        }
        return mapDbRow(data);
      }
    } catch (err) {
      console.warn('[Supabase Fallback to Local]', err.message);
    }
  }

  // 2. Fallback to local storage (checks local file if not found in cloud)
  const links = readLocalLinks();
  const link = links.find(l => l.slug.toLowerCase() === cleanSlug);
  if (link && !isLinkExpired(link.expiresAt)) {
    return link;
  }
  return null;
}

async function isSlugAvailable(slug) {
  const cleanSlug = slug.trim().toLowerCase();

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('links')
        .select('id, expires_at')
        .eq('slug', cleanSlug)
        .maybeSingle();

      if (!error && data) {
        if (isLinkExpired(data.expires_at)) {
          return true;
        }
        return false;
      }
    } catch (err) {
      console.warn('[Supabase Slug Check Fallback]', err.message);
    }
  }

  const links = readLocalLinks();
  return !links.some(l => l.slug.toLowerCase() === cleanSlug && !isLinkExpired(l.expiresAt));
}

async function createLinkRecord({ slug, destination, userId = null, userEmail = null }) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + LINK_EXPIRY_MS);
  const id = 'lnk_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const shortUrl = `https://${BRAND_DOMAIN}/${slug}`;

  // Always prepare fallback local object
  const newLocalLink = {
    id,
    slug,
    destination,
    shortUrl,
    localTestUrl: `http://localhost:${PORT}/${slug}`,
    clicks: 0,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    lastAccessedAt: null,
    userId: userId || null,
    userEmail: userEmail || null
  };

  // 1. Save to Supabase if connected
  if (supabase) {
    try {
      const newRow = {
        id,
        slug,
        destination,
        short_url: shortUrl,
        clicks: 0,
        created_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        last_accessed_at: null,
        user_id: userId || null,
        user_email: userEmail || null
      };

      let { data, error } = await supabase
        .from('links')
        .upsert(newRow, { onConflict: 'slug' })
        .select()
        .single();

      // If user_id column is missing in existing Supabase table, retry without user_id
      if (error && (error.message.includes('user_id') || error.code === 'PGRST204')) {
        console.warn('[Supabase] Kolom user_id belum ada di Supabase. Menyimpan tanpa kolom user_id...');
        delete newRow.user_id;
        delete newRow.user_email;
        const retry = await supabase
          .from('links')
          .upsert(newRow, { onConflict: 'slug' })
          .select()
          .single();
        data = retry.data;
        error = retry.error;
      }

      if (error) {
        throw error;
      }

      console.log(`[Supabase] Created shortlink: ${slug} -> ${destination} (User: ${userId || 'Guest'}, Expires: ${expiresAt.toISOString()})`);
      const mapped = mapDbRow(data);
      if (userId && !mapped.userId) mapped.userId = userId;
      if (userEmail && !mapped.userEmail) mapped.userEmail = userEmail;

      // Keep local in sync for fast local fallback
      const localLinks = readLocalLinks();
      const filtered = localLinks.filter(l => l.slug.toLowerCase() !== slug.toLowerCase());
      filtered.push(mapped);
      saveLocalLinks(filtered);

      return mapped;
    } catch (err) {
      console.error('[Supabase Failed, falling back to local file]', err.message);
    }
  }

  // 2. Fallback to Local Storage
  const links = readLocalLinks();
  const filtered = links.filter(l => l.slug.toLowerCase() !== slug.toLowerCase());
  filtered.push(newLocalLink);
  saveLocalLinks(filtered);

  return newLocalLink;
}

async function recordClick(linkId, currentClicks) {
  const now = new Date().toISOString();

  if (supabase) {
    try {
      await supabase
        .from('links')
        .update({
          clicks: (currentClicks || 0) + 1,
          last_accessed_at: now
        })
        .eq('id', linkId);
    } catch (err) {
      console.error('[Supabase Click Record Error]', err.message);
    }
  }

  // Fallback / sync to local file
  const links = readLocalLinks();
  const item = links.find(l => l.id === linkId);
  if (item) {
    item.clicks = (item.clicks || 0) + 1;
    item.lastAccessedAt = now;
    saveLocalLinks(links);
  }
}

async function getUserLinks(userId) {
  if (!userId) return [];
  let userLinks = [];

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('links')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (!error && Array.isArray(data)) {
        userLinks = data.map(mapDbRow);
      }
    } catch (err) {
      console.warn('[Supabase getUserLinks Fallback]', err.message);
    }
  }

  // Also include/merge any links stored locally for this userId
  const localList = readLocalLinks().filter(l => l.userId === userId);
  for (const item of localList) {
    if (!userLinks.some(u => u.id === item.id || u.slug === item.slug)) {
      userLinks.push(item);
    }
  }

  return userLinks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function deleteLink(linkId, userId) {
  if (!linkId) return { success: false, error: 'Link ID diperlukan.' };

  let deletedFromSupabase = false;
  if (supabase) {
    try {
      const { data: existing, error: fetchErr } = await supabase
        .from('links')
        .select('*')
        .eq('id', linkId)
        .maybeSingle();

      if (!fetchErr && existing) {
        if (existing.user_id && userId && existing.user_id !== userId) {
          return { success: false, status: 403, error: 'Anda tidak memiliki izin untuk menghapus tautan ini.' };
        }
        await supabase.from('links').delete().eq('id', linkId);
        deletedFromSupabase = true;
        console.log(`[Supabase] Deleted link: ${linkId}`);
      }
    } catch (err) {
      console.warn('[Supabase delete check fallback]', err.message);
    }
  }

  // Also remove from local storage
  const links = readLocalLinks();
  const index = links.findIndex(l => l.id === linkId);
  if (index !== -1) {
    if (links[index].userId && userId && links[index].userId !== userId) {
      return { success: false, status: 403, error: 'Anda tidak memiliki izin untuk menghapus tautan ini.' };
    }
    links.splice(index, 1);
    saveLocalLinks(links);
    return { success: true, message: 'Tautan berhasil dihapus.' };
  }

  if (deletedFromSupabase) {
    return { success: true, message: 'Tautan berhasil dihapus.' };
  }

  return { success: false, status: 404, error: 'Tautan tidak ditemukan.' };
}

async function getSystemStats() {
  const now = new Date().toISOString();

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('links')
        .select('clicks, expires_at')
        .gt('expires_at', now);

      if (!error && Array.isArray(data)) {
        const totalClicks = data.reduce((acc, curr) => acc + (curr.clicks || 0), 0);
        return {
          totalLinks: data.length,
          totalClicks
        };
      }
    } catch (err) {
      console.warn('[Supabase Stats Fallback]', err.message);
    }
  }

  const links = readLocalLinks();
  const active = links.filter(l => !isLinkExpired(l.expiresAt));
  const totalClicks = active.reduce((acc, curr) => acc + (curr.clicks || 0), 0);
  return {
    totalLinks: active.length,
    totalClicks
  };
}

// Generate friendly random slug
function generateSlug(length = 6) {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let slug = '';
  for (let i = 0; i < length; i++) {
    slug += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return slug;
}

// Reserved words
const RESERVED_SLUGS = new Set([
  'api', 'public', 'assets', 'favicon.ico', 'robots.txt',
  'sitemap.xml', 'sitemap',
  'admin', 'dashboard', 'settings', 'login', 'register',
  '404', 'index', 'style.css', 'app.js'
]);

// Normalize URL
function normalizeUrl(url) {
  let trimmed = (url || '').trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = 'https://' + trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
}

// ==========================================================
// API & SEO Routes
// ==========================================================

// SEO: robots.txt
app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.sendFile(path.join(PUBLIC_DIR, 'robots.txt'));
});

// SEO: sitemap.xml
app.get('/sitemap.xml', (req, res) => {
  res.type('application/xml');
  res.sendFile(path.join(PUBLIC_DIR, 'sitemap.xml'));
});

// Firebase public config endpoint for frontend SDK
app.get('/api/firebase-config', (req, res) => {
  const apiKey = (process.env.FIREBASE_API_KEY || '').trim();
  const authDomain = (process.env.FIREBASE_AUTH_DOMAIN || '').trim();
  const projectId = (process.env.FIREBASE_PROJECT_ID || '').trim();
  const storageBucket = (process.env.FIREBASE_STORAGE_BUCKET || '').trim();
  const messagingSenderId = (process.env.FIREBASE_MESSAGING_SENDER_ID || '').trim();
  const appId = (process.env.FIREBASE_APP_ID || '').trim();

  res.json({
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId,
    configured: !!(apiKey && projectId)
  });
});

// Health / Status endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    domain: BRAND_DOMAIN,
    isVercel: IS_VERCEL,
    database: supabase ? 'Supabase (PostgreSQL Cloud)' : 'Local File Storage (Fallback)',
    isSupabaseConnected: !!supabase,
    linkExpiryDays: LINK_EXPIRY_DAYS,
    firebaseConfigured: !!(process.env.FIREBASE_API_KEY && process.env.FIREBASE_PROJECT_ID)
  });
});

// Get overview stats (Global)
app.get('/api/stats', async (req, res) => {
  const stats = await getSystemStats();
  res.json({
    success: true,
    ...stats
  });
});

// Get user specific links & monitoring
app.get('/api/user/links', async (req, res) => {
  const userId = (req.query.userId || '').trim();
  if (!userId) {
    return res.status(400).json({
      success: false,
      error: 'Parameter userId wajib disertakan.'
    });
  }

  try {
    const userLinks = await getUserLinks(userId);
    const totalClicks = userLinks.reduce((acc, curr) => acc + (curr.clicks || 0), 0);

    const mapped = userLinks.map(l => ({
      ...l,
      isExpired: isLinkExpired(l.expiresAt)
    }));

    res.json({
      success: true,
      links: mapped,
      totalLinks: mapped.length,
      totalClicks
    });
  } catch (err) {
    console.error('Error fetching user links:', err);
    res.status(500).json({
      success: false,
      error: 'Gagal mengambil riwayat tautan.'
    });
  }
});

// Delete a link
app.delete('/api/links/:id', async (req, res) => {
  const { id } = req.params;
  const userId = req.query.userId || req.body?.userId || null;

  if (!id) {
    return res.status(400).json({
      success: false,
      error: 'ID tautan tidak valid.'
    });
  }

  const result = await deleteLink(id, userId);
  if (!result.success) {
    return res.status(result.status || 400).json({
      success: false,
      error: result.error
    });
  }

  res.json({
    success: true,
    message: result.message
  });
});

// Shorten URL
app.post('/api/shorten', async (req, res) => {
  const { url, customSlug, userId, userEmail } = req.body;

  if (!url || typeof url !== 'string' || !url.trim()) {
    return res.status(400).json({
      success: false,
      error: 'Harap masukkan tautan (URL) tujuan yang ingin diperpendek.'
    });
  }

  const destination = normalizeUrl(url);
  if (!destination) {
    return res.status(400).json({
      success: false,
      error: 'Format tautan tidak valid. Masukkan alamat web yang benar (contoh: https://google.com).'
    });
  }

  let slug = '';

  if (customSlug && typeof customSlug === 'string' && customSlug.trim()) {
    const cleanSlug = customSlug.trim().toLowerCase();

    if (!/^[a-z0-9_-]{3,30}$/.test(cleanSlug)) {
      return res.status(400).json({
        success: false,
        error: 'Custom alias hanya boleh terdiri dari 3-30 huruf, angka, tanda hubung (-), atau garis bawah (_).'
      });
    }

    if (RESERVED_SLUGS.has(cleanSlug)) {
      return res.status(400).json({
        success: false,
        error: `Alias '${cleanSlug}' tidak dapat digunakan karena merupakan kata sistem yang dilindungi.`
      });
    }

    const available = await isSlugAvailable(cleanSlug);
    if (!available) {
      return res.status(409).json({
        success: false,
        error: `Alias '${cleanSlug}' sudah digunakan. Silakan pilih alias yang lain.`
      });
    }

    slug = cleanSlug;
  } else {
    let attempts = 0;
    let foundUnique = false;
    do {
      slug = generateSlug(6);
      const available = await isSlugAvailable(slug);
      if (available) {
        foundUnique = true;
        break;
      }
      attempts++;
    } while (attempts < 10);

    if (!foundUnique) {
      slug = generateSlug(8);
    }
  }

  try {
    const newLink = await createLinkRecord({
      slug,
      destination,
      userId: userId || null,
      userEmail: userEmail || null
    });

    res.status(201).json({
      success: true,
      link: newLink
    });
  } catch (err) {
    console.error('Error creating link:', err);
    res.status(500).json({
      success: false,
      error: 'Terjadi kesalahan sistem saat menyimpan tautan. Coba lagi nanti.'
    });
  }
});

// Redirect Route: /:slug
app.get('/:slug', async (req, res) => {
  const { slug } = req.params;

  try {
    const link = await getLinkBySlug(slug);

    if (link) {
      // Record click asynchronously (non-blocking)
      recordClick(link.id, link.clicks).catch(e => console.error('Click error:', e.message));

      // 302 Redirect to destination
      return res.redirect(302, link.destination);
    }
  } catch (err) {
    console.error('Redirect error:', err.message);
  }

  // Not found or expired -> 404 page
  const notFoundFile = path.join(PUBLIC_DIR, '404.html');
  if (fs.existsSync(notFoundFile)) {
    res.status(404).sendFile(notFoundFile);
  } else {
    res.status(404).send('404 Not Found');
  }
});

// ==========================================================
// Startup
// ==========================================================

if (process.env.NODE_ENV !== 'production' || !IS_VERCEL) {
  app.listen(PORT, () => {
    console.log(`===========================================`);
    console.log(`✨ Nexaa Link Shortener Server`);
    console.log(`🌐 Branding Domain: https://${BRAND_DOMAIN}`);
    console.log(`🚀 Local Server: http://localhost:${PORT}`);
    console.log(`💾 Storage: ${supabase ? '☁️ Supabase Cloud (PostgreSQL)' : '📁 Local JSON (Set SUPABASE_URL in .env for Cloud)'}`);
    console.log(`⏳ Link Expiry: ${LINK_EXPIRY_DAYS} Hari`);
    console.log(`🔐 Firebase Auth: ${process.env.FIREBASE_API_KEY ? 'Siap' : 'Menunggu konfigurasi di .env'}`);
    console.log(`===========================================`);
  });
}

module.exports = app;
