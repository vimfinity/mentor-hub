const DEFAULT_TTL_MS = 5 * 60 * 1000;
const queryCache = new Map();

function normalizeKey(key) {
  if (Array.isArray(key)) {
    return JSON.stringify(key);
  }

  return String(key);
}

function isCacheable(data) {
  if (!data || typeof data !== 'object' || !('ok' in data)) {
    return true;
  }

  return data.ok;
}

async function fetchQuery({ key, fetchFunction, ttlMs = DEFAULT_TTL_MS }) {
  const normalizedKey = normalizeKey(key);
  const now = Date.now();
  const existingEntry = queryCache.get(normalizedKey);

  if (existingEntry) {
    if (existingEntry.status === 'running') {
      return existingEntry.promise;
    }

    if (existingEntry.status === 'success' && existingEntry.validUntil > now) {
      return existingEntry.data;
    }
  }

  const promise = Promise.resolve()
    .then(() => fetchFunction())
    .then((data) => {
      if (!isCacheable(data)) {
        queryCache.delete(normalizedKey);
        return data;
      }

      queryCache.set(normalizedKey, {
        status: 'success',
        data,
        validUntil: Date.now() + ttlMs
      });

      return data;
    })
    .catch((error) => {
      queryCache.delete(normalizedKey);
      throw error;
    });

  queryCache.set(normalizedKey, {
    status: 'running',
    promise,
    validUntil: now + ttlMs
  });

  return promise;
}

function invalidateQuery(key) {
  queryCache.delete(normalizeKey(key));
}

function invalidateQueriesByPrefix(prefix) {
  const normalizedPrefix = normalizeKey(prefix);
  const arrayPrefix = Array.isArray(prefix)
    ? normalizedPrefix.replace(/\]$/, ',')
    : normalizedPrefix;

  for (const key of queryCache.keys()) {
    if (key.startsWith(normalizedPrefix) || key.startsWith(arrayPrefix)) {
      queryCache.delete(key);
    }
  }
}

export {
  fetchQuery,
  invalidateQuery,
  invalidateQueriesByPrefix,
  DEFAULT_TTL_MS
};
