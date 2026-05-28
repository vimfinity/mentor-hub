'use strict';

const buckets = new Map();

const POLICIES = {
  page: { name: 'page', capacity: 600, refillPerSecond: 20 },
  apiRead: { name: 'api-read', capacity: 240, refillPerSecond: 4 },
  apiWrite: { name: 'api-write', capacity: 30, refillPerSecond: 30 / 60 },
  adminWrite: { name: 'admin-write', capacity: 180, refillPerSecond: 3 },
  auth: { name: 'auth', capacity: 10, refillPerSecond: 10 / 60 },
  dev: { name: 'dev', capacity: 600, refillPerSecond: 10 }
};

function normalizePath(url) {
  return String(url || '/').split('?')[0] || '/';
}

function isStaticFile(path) {
  return /\.[a-z0-9]+$/i.test(path) && !path.startsWith('/api/');
}

function isWriteRequest(method) {
  return method === 'POST' || method === 'PUT' || method === 'DELETE' || method === 'PATCH';
}

function selectPolicy(req) {
  const method = String(req.method || 'GET').toUpperCase();
  const path = normalizePath(req.url);

  if (path === '/api/dev/events') {
    return { policy: POLICIES.dev, scope: 'dev-events' };
  }

  if (isStaticFile(path)) {
    return null;
  }

  if (!path.startsWith('/api/')) {
    return { policy: POLICIES.page, scope: 'page' };
  }

  if (!isWriteRequest(method)) {
    return { policy: POLICIES.apiRead, scope: path.startsWith('/api/admin/') ? 'admin-read' : 'public-read' };
  }

  if (path === '/api/admin/login' || path === '/api/admin/setup' || path === '/api/admin/password') {
    return { policy: POLICIES.auth, scope: path };
  }

  if (path.startsWith('/api/admin/')) {
    return { policy: POLICIES.adminWrite, scope: 'admin-write' };
  }

  if (path === '/api/concerns' || path.indexOf('/responses') >= 0) {
    return { policy: POLICIES.apiWrite, scope: path };
  }

  return { policy: POLICIES.apiWrite, scope: 'public-write' };
}

function refillBucket(bucket, policy, now) {
  const elapsedSeconds = Math.max(0, (now - bucket.lastRefillAt) / 1000);
  bucket.tokens = Math.min(policy.capacity, bucket.tokens + (elapsedSeconds * policy.refillPerSecond));
  bucket.lastRefillAt = now;
}

function checkRequest(req, ip) {
  const selection = selectPolicy(req);
  if (!selection) {
    return {
      allowed: true,
      headers: {}
    };
  }

  const now = Date.now();
  const key = ip + ':' + selection.scope + ':' + selection.policy.name;
  const bucket = buckets.get(key) || {
    tokens: selection.policy.capacity,
    lastRefillAt: now
  };

  refillBucket(bucket, selection.policy, now);

  const allowed = bucket.tokens >= 1;
  if (allowed) {
    bucket.tokens -= 1;
  }

  buckets.set(key, bucket);

  const remaining = Math.max(0, Math.floor(bucket.tokens));
  const missingTokens = allowed ? 0 : 1 - bucket.tokens;
  const retryAfterSeconds = missingTokens > 0
    ? Math.ceil(missingTokens / selection.policy.refillPerSecond)
    : 0;

  return {
    allowed,
    retryAfterSeconds,
    headers: {
      'X-RateLimit-Policy': selection.policy.name,
      'X-RateLimit-Limit': String(selection.policy.capacity),
      'X-RateLimit-Remaining': String(remaining),
      'X-RateLimit-Reset': String(now + (retryAfterSeconds * 1000)),
      ...(retryAfterSeconds > 0 ? { 'Retry-After': String(retryAfterSeconds) } : {})
    }
  };
}

function cleanup() {
  const now = Date.now();

  for (const [key, bucket] of buckets) {
    if ((now - bucket.lastRefillAt) > 15 * 60 * 1000) {
      buckets.delete(key);
    }
  }
}

setInterval(cleanup, 300000).unref();

module.exports = {
  checkRequest
};
