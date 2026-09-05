const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3001;
const BRAND_DOMAIN = process.env.BRAND_DOMAIN || 'nexaa.my.id';

// Environment detection
const IS_VERCEL = !!(process.env.VERCEL || process.env.NOW_REGION || process.env.AWS_LAMBDA_FUNCTION_NAME);

// Data paths
const LOCAL_DATA_FILE = path.join(__dirname, 'data', 'links.json');
const VERCEL_DATA_FILE = path.join(os.tmpdir(), 'nexaa_links.json');
const DATA_FILE = IS_VERCEL ? VERCEL_DATA_FILE : LOCAL_DATA_FILE;

// KV / Redis Configuration (Vercel KV or Upstash Redis)
const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const HAS_KV = !!(KV_URL && KV_TOKEN);

// Global In-Memory Cache (preserves state across warm lambda requests)
if (!global.__NEXAA_CACHE__) {
  global.__NEXAA_CACHE__ = {
    links: [],
    initialized: false
  };
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================================
// Multi-Tier Storage Engine
// ==========================================================

// KV REST helper
async function kvFetch(command, ...args) {
  if (!HAS_KV) return null;
  try {
    const url = `${KV_URL}/${command}/${args.map(encodeURIComponent).join('/')}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` }
    });
    const data = await res.json();
    return data.result;
  } catch (err) {
    console.error('[KV Error]', err.message);
    return null;
  }
}

// Initialize seed data
function initStorage() {
  if (global.__NEXAA_CACHE__.initialized) return;

  let seedLinks = [];
  try {
    if (fs.existsSync(LOCAL_DATA_FILE)) {
      const raw = fs.readFileSync(LOCAL_DATA_FILE, 'utf-8');
      seedLinks = JSON.parse(raw || '[]');
    }
  } catch (e) {
    console.error('Error reading seed file:', e.message);
  }

  // If on Vercel and /tmp doesn't have the file yet, seed it
  if (IS_VERCEL) {
    try {
      if (!fs.existsSync(VERCEL_DATA_FILE)) {
        fs.writeFileSync(VERCEL_DATA_FILE, JSON.stringify(seedLinks, null, 2));
      } else {
        const tmpRaw = fs.readFileSync(VERCEL_DATA_FILE, 'utf-8');
        const tmpLinks = JSON.parse(tmpRaw || '[]');
        if (tmpLinks.length > 0) {
          seedLinks = tmpLinks;
        }
      }
    } catch (e) {
      console.error('Error seeding /tmp file:', e.message);
    }
  }

  global.__NEXAA_CACHE__.links = seedLinks;
  global.__NEXAA_CACHE__.initialized = true;
}

// Read all links
async function readAllLinks() {
  initStorage();

  // If KV is connected, sync with KV
  if (HAS_KV) {
    try {
      const kvData = await kvFetch('get', 'nexaa:all_links');
      if (kvData) {
        const parsed = typeof kvData === 'string' ? JSON.parse(kvData) : kvData;
        if (Array.isArray(parsed)) {
          global.__NEXAA_CACHE__.links = parsed;
          return parsed;
        }
      }
    } catch (err) {
      console.error('[KV Read Error]', err.message);
    }
  }

  // Otherwise read from file / cache
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

// Save all links
async function saveAllLinks(links) {
  global.__NEXAA_CACHE__.links = links;

  // 1. Save to KV if available
  if (HAS_KV) {
    try {
      const res = await fetch(`${KV_URL}/set/nexaa:all_links`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${KV_TOKEN}` },
        body: JSON.stringify(links)
      });
      const data = await res.json();
      console.log('[KV Saved]', data.result);
    } catch (err) {
      console.error('[KV Save Error]', err.message);
    }
  }

  // 2. Save to file (in /tmp on Vercel, or data/ on local)
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(links, null, 2));
    return true;
  } catch (err) {
    console.error('[File Save Error]', err.message);
    return false;
  }
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
// API Routes
// ==========================================================

// Health / Status endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    domain: BRAND_DOMAIN,
    isVercel: IS_VERCEL,
    storageType: HAS_KV ? 'Vercel KV / Redis' : (IS_VERCEL ? 'Vercel /tmp + Memory' : 'Local File System'),
    hasKvConnected: HAS_KV,
    totalCachedLinks: global.__NEXAA_CACHE__.links.length
  });
});

// Get all links
app.get('/api/links', async (req, res) => {
  const links = await readAllLinks();
  links.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({
    success: true,
    domain: BRAND_DOMAIN,
    storage: HAS_KV ? 'kv' : 'file',
    links
  });
});

// Get overview stats
app.get('/api/stats', async (req, res) => {
  const links = await readAllLinks();
  const totalClicks = links.reduce((acc, curr) => acc + (curr.clicks || 0), 0);
  res.json({
    success: true,
    totalLinks: links.length,
    totalClicks
  });
});

// Shorten URL
app.post('/api/shorten', async (req, res) => {
  const { url, customSlug } = req.body;

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

  const links = await readAllLinks();
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

    const exists = links.some(l => l.slug.toLowerCase() === cleanSlug);
    if (exists) {
      return res.status(409).json({
        success: false,
        error: `Alias '${cleanSlug}' sudah digunakan. Silakan pilih alias yang lain.`
      });
    }

    slug = cleanSlug;
  } else {
    let attempts = 0;
    do {
      slug = generateSlug(6);
      attempts++;
    } while (links.some(l => l.slug.toLowerCase() === slug.toLowerCase()) && attempts < 20);
  }

  const newLink = {
    id: 'lnk_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    slug,
    destination,
    shortUrl: `https://${BRAND_DOMAIN}/${slug}`,
    localTestUrl: `http://localhost:${PORT}/${slug}`,
    clicks: 0,
    createdAt: new Date().toISOString(),
    lastAccessedAt: null
  };

  links.push(newLink);
  await saveAllLinks(links);

  res.status(201).json({
    success: true,
    link: newLink
  });
});

// Delete a link
app.delete('/api/links/:id', async (req, res) => {
  const { id } = req.params;
  let links = await readAllLinks();
  const initialLength = links.length;
  links = links.filter(l => l.id !== id);

  if (links.length === initialLength) {
    return res.status(404).json({
      success: false,
      error: 'Tautan tidak ditemukan.'
    });
  }

  await saveAllLinks(links);
  res.json({
    success: true,
    message: 'Tautan berhasil dihapus.'
  });
});

// Redirect Route: /:slug
app.get('/:slug', async (req, res) => {
  const { slug } = req.params;
  const links = await readAllLinks();

  const link = links.find(l => l.slug.toLowerCase() === slug.toLowerCase());

  if (link) {
    link.clicks = (link.clicks || 0) + 1;
    link.lastAccessedAt = new Date().toISOString();
    
    // Save updated clicks in background
    saveAllLinks(links).catch(e => console.error('Error saving clicks:', e.message));

    return res.redirect(302, link.destination);
  }

  // Not found -> 404 page
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// Export app for Vercel Serverless Function & listen on local
if (process.env.NODE_ENV !== 'production' || !IS_VERCEL) {
  app.listen(PORT, () => {
    console.log(`===========================================`);
    console.log(`✨ Nexaa Link Shortener Server`);
    console.log(`🌐 Branding Domain: https://${BRAND_DOMAIN}`);
    console.log(`🚀 Local Server: http://localhost:${PORT}`);
    console.log(`💾 Storage Mode: ${HAS_KV ? 'Vercel KV' : (IS_VERCEL ? 'Vercel /tmp' : 'Local File')}`);
    console.log(`===========================================`);
  });
}

module.exports = app;
