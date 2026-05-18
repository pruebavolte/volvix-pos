// ============================================================
// IMAGE SEARCH SERVICE
// ============================================================
// searchImage(query, { orientation }) → { url, alt, attribution }
//
// Fuentes:
// 1. Unsplash (requiere UNSPLASH_ACCESS_KEY)
// 2. Pexels (requiere PEXELS_API_KEY) — fallback
// 3. Placeholder con gradient — último recurso
//
// Cachea por (query, orientation) en memoria + filesystem.
// ============================================================

const fs   = require('fs').promises;
const path = require('path');

const CACHE_FILE = path.join(__dirname, '..', 'cache', '_image-cache.json');

let cache = {};
let cacheLoaded = false;

async function loadCache() {
  if (cacheLoaded) return;
  try {
    cache = JSON.parse(await fs.readFile(CACHE_FILE, 'utf-8'));
  } catch { cache = {}; }
  cacheLoaded = true;
}

async function saveCache() {
  await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
  await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2));
}

// ============================================================
// UNSPLASH
// ============================================================
async function searchUnsplash(query, orientation = 'landscape') {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return null;

  const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&orientation=${orientation}&per_page=5`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Client-ID ${key}` },
  });
  if (!res.ok) {
    console.warn(`Unsplash ${res.status} for "${query}"`);
    return null;
  }
  const data = await res.json();
  if (!data.results || data.results.length === 0) return null;

  // Take the first relevant result. Skip if marked unsafe.
  const photo = data.results.find(p => !p.unsafe) || data.results[0];

  // Use w=1200 (good quality, reasonable size) and crop
  const heightMap = { landscape: 900, portrait: 1600, squarish: 1200 };
  const h = heightMap[orientation] || 900;

  return {
    url: `${photo.urls.raw}&w=1200&h=${h}&fit=crop&q=85`,
    alt: photo.alt_description || query,
    attribution: `Photo by ${photo.user.name} on Unsplash`,
    source: 'unsplash',
  };
}

// ============================================================
// PEXELS (fallback)
// ============================================================
async function searchPexels(query, orientation = 'landscape') {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return null;

  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&orientation=${orientation}&per_page=5`;
  const res = await fetch(url, {
    headers: { 'Authorization': key },
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.photos || data.photos.length === 0) return null;

  const photo = data.photos[0];
  return {
    url: orientation === 'portrait' ? photo.src.portrait : photo.src.large,
    alt: photo.alt || query,
    attribution: `Photo by ${photo.photographer} on Pexels`,
    source: 'pexels',
  };
}

// ============================================================
// PLACEHOLDER (always works, last resort)
// ============================================================
function placeholder(query, orientation = 'landscape') {
  const h = orientation === 'portrait' ? 1600 : (orientation === 'squarish' ? 1200 : 900);
  // Use placehold.co or similar (transparent fallback)
  const text = encodeURIComponent(query.slice(0, 40));
  return {
    url: `https://placehold.co/1200x${h}/EEEEEE/999999/png?text=${text}`,
    alt: query,
    attribution: 'placeholder',
    source: 'placeholder',
  };
}

// ============================================================
// MAIN
// ============================================================
async function searchImage(query, opts = {}) {
  await loadCache();
  const orientation = opts.orientation || 'landscape';
  const key = `${query}|${orientation}`;

  if (cache[key]) return cache[key];

  // Try Unsplash → Pexels → Placeholder
  let result = await searchUnsplash(query, orientation).catch(() => null);
  if (!result) result = await searchPexels(query, orientation).catch(() => null);
  if (!result) result = placeholder(query, orientation);

  cache[key] = result;
  await saveCache().catch(() => {}); // best effort

  return result;
}

module.exports = { searchImage };
