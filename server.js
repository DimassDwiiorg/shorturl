const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const BRAND_DOMAIN = process.env.BRAND_DOMAIN || 'nexaa.my.id';

const DATA_FILE = path.join(__dirname, 'data', 'links.json');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Database helper
function readLinks() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2));
      return [];
    }
    const data = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(data || '[]');
  } catch (err) {
    console.error('Error reading links file:', err);
    return [];
  }
}

function saveLinks(links) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(links, null, 2));
    return true;
  } catch (err) {
    console.error('Error saving links file:', err);
    return false;
  }
}

// Generate friendly random slug (avoiding ambiguous characters)
function generateSlug(length = 6) {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let slug = '';
  for (let i = 0; i < length; i++) {
    slug += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return slug;
}

// Reserved words that cannot be used as custom slugs
const RESERVED_SLUGS = new Set([
  'api', 'public', 'assets', 'favicon.ico', 'robots.txt',
  'admin', 'dashboard', 'settings', 'login', 'register',
  '404', 'index', 'style.css', 'app.js'
]);

// Normalize URL (ensure http:// or https:// prefix)
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

// API: Get all links
app.get('/api/links', (req, res) => {
  const links = readLinks();
  // Sort by createdAt descending
  links.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({
    success: true,
    domain: BRAND_DOMAIN,
    links
  });
});

// API: Get overview stats
app.get('/api/stats', (req, res) => {
  const links = readLinks();
  const totalClicks = links.reduce((acc, curr) => acc + (curr.clicks || 0), 0);
  res.json({
    success: true,
    totalLinks: links.length,
    totalClicks
  });
});

// API: Shorten URL
app.post('/api/shorten', (req, res) => {
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

  const links = readLinks();
  let slug = '';

  if (customSlug && typeof customSlug === 'string' && customSlug.trim()) {
    const cleanSlug = customSlug.trim().toLowerCase();

    // Validate format: 3 - 30 alphanumeric with dash / underscore
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

    // Check if alias already taken
    const exists = links.some(l => l.slug.toLowerCase() === cleanSlug);
    if (exists) {
      return res.status(409).json({
        success: false,
        error: `Alias '${cleanSlug}' sudah digunakan. Silakan pilih alias yang lain.`
      });
    }

    slug = cleanSlug;
  } else {
    // Generate unique random slug
    let attempts = 0;
    do {
      slug = generateSlug(6);
      attempts++;
    } while (links.some(l => l.slug === slug) && attempts < 20);
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
  saveLinks(links);

  res.status(201).json({
    success: true,
    link: newLink
  });
});

// API: Delete a link
app.delete('/api/links/:id', (req, res) => {
  const { id } = req.params;
  let links = readLinks();
  const initialLength = links.length;
  links = links.filter(l => l.id !== id);

  if (links.length === initialLength) {
    return res.status(404).json({
      success: false,
      error: 'Tautan tidak ditemukan.'
    });
  }

  saveLinks(links);
  res.json({
    success: true,
    message: 'Tautan berhasil dihapus.'
  });
});

// Redirect Route: /:slug
app.get('/:slug', (req, res) => {
  const { slug } = req.params;
  const links = readLinks();

  const link = links.find(l => l.slug.toLowerCase() === slug.toLowerCase());

  if (link) {
    // Update clicks and lastAccessedAt
    link.clicks = (link.clicks || 0) + 1;
    link.lastAccessedAt = new Date().toISOString();
    saveLinks(links);

    // Redirect to destination
    return res.redirect(302, link.destination);
  }

  // Not found -> Show elegant 404 page
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`===========================================`);
  console.log(`✨ Nexaa Link Shortener Server`);
  console.log(`🌐 Branding Domain: https://${BRAND_DOMAIN}`);
  console.log(`🚀 Local Server: http://localhost:${PORT}`);
  console.log(`===========================================`);
});
