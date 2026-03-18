const { LRUCache } = require("lru-cache");

// Lightweight in-memory cache to reduce repeated AI calls.
// TTL is short by default to avoid serving stale answers indefinitely.
const cache = new LRUCache({
  max: parseInt(process.env.CACHE_MAX_ITEMS || "1000", 10),
  ttl: parseInt(process.env.CACHE_TTL_MS || String(5 * 60 * 1000), 10),
});

function getCachedValue(key) {
  return cache.get(key);
}

function setCachedValue(key, value) {
  cache.set(key, value);
}

module.exports = { getCachedValue, setCachedValue, cache };

