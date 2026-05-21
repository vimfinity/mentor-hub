function normalizePath(pathname) {
  if (!pathname) {
    return '/';
  }

  let normalizedPath = pathname;

  try {
    normalizedPath = new URL(pathname, window.location.origin).pathname;
  } catch (error) {
    normalizedPath = pathname;
  }

  if (!normalizedPath.startsWith('/')) {
    normalizedPath = '/' + normalizedPath;
  }

  if (normalizedPath.length > 1) {
    normalizedPath = normalizedPath.replace(/\/+$/, '');
  }

  return normalizedPath || '/';
}

function getUrl(target) {
  return new URL(target || window.location.href, window.location.origin);
}

/**
 * Compiles a route pattern like '/feed/:id' into:
 *  - a RegExp matcher (anchored)
 *  - the list of parameter names in path order
 *  - a specificity score (higher = more specific; static segments win)
 *
 * Patterns supported:
 *  - static segments: '/admin/feed'
 *  - named params:    '/feed/:id'
 *  - catch-all tail:  '/admin/*'   (kept for forward compat; greedy)
 */
function compilePattern(pattern) {
  const path = normalizePath(pattern);

  if (!path.includes(':') && !path.includes('*')) {
    return {
      path,
      params: [],
      specificity: 100,
      match: (candidate) => (candidate === path ? {} : null)
    };
  }

  const params = [];
  const segments = path.split('/').slice(1);
  let specificity = 0;
  const regexParts = segments.map((segment) => {
    if (segment.startsWith(':')) {
      params.push(segment.slice(1));
      specificity += 1;
      return '([^/]+)';
    }
    if (segment === '*') {
      params.push('rest');
      return '(.*)';
    }
    specificity += 2;
    return segment.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  });
  const regex = new RegExp('^/' + regexParts.join('/') + '$');

  return {
    path,
    params,
    specificity,
    match: (candidate) => {
      const result = regex.exec(candidate);
      if (!result) {
        return null;
      }
      const values = {};
      params.forEach((name, index) => {
        const raw = result[index + 1];
        try {
          values[name] = decodeURIComponent(raw);
        } catch (error) {
          values[name] = raw;
        }
      });
      return values;
    }
  };
}

function createRouter() {
  const compiled = [];
  const listeners = [];
  let currentPath = normalizePath(window.location.pathname);
  let isStarted = false;

  function registerRoute(pattern, routeData) {
    const compiledRoute = compilePattern(pattern);
    compiled.push({ ...compiledRoute, route: routeData });
    compiled.sort((a, b) => b.specificity - a.specificity);
    return api;
  }

  function findRoute(pathname = currentPath) {
    const normalized = normalizePath(pathname);
    for (const entry of compiled) {
      const params = entry.match(normalized);
      if (params !== null) {
        return { ...entry.route, params };
      }
    }
    return null;
  }

  function getCurrentState() {
    const url = getUrl(window.location.href);
    return {
      path: currentPath,
      route: findRoute(currentPath),
      url,
      searchParams: new URLSearchParams(url.search)
    };
  }

  function notify() {
    currentPath = normalizePath(window.location.pathname);
    const state = getCurrentState();
    listeners.forEach((listener) => {
      listener(state);
    });
  }

  function navigateTo(pathname, options = {}) {
    const targetUrl = getUrl(pathname || window.location.href);
    const targetPath = normalizePath(targetUrl.pathname);
    const targetSearch = targetUrl.search || '';
    const replace = options.replace || options.ersetzen;
    const force = options.force || options.erzwingen;
    const method = replace ? 'replaceState' : 'pushState';
    const currentTarget = window.location.pathname + window.location.search;
    const nextTarget = targetPath + targetSearch;

    if (nextTarget === currentTarget && !force) {
      notify();
      return;
    }

    window.history[method]({}, '', nextTarget);
    notify();
  }

  function replacePath(pathname) {
    navigateTo(pathname, { replace: true });
  }

  function setSearchParams(changes, options = {}) {
    const url = getUrl(window.location.href);
    const searchParams = new URLSearchParams(url.search);

    Object.keys(changes).forEach((key) => {
      const value = changes[key];
      if (value === undefined || value === null || value === '') {
        searchParams.delete(key);
        return;
      }

      searchParams.set(key, String(value));
    });

    const query = searchParams.toString();
    navigateTo(url.pathname + (query ? '?' + query : ''), options);
  }

  function onChange(listener) {
    listeners.push(listener);

    return () => {
      const index = listeners.indexOf(listener);
      if (index >= 0) {
        listeners.splice(index, 1);
      }
    };
  }

  function start() {
    if (!isStarted) {
      window.addEventListener('popstate', notify);
      isStarted = true;
    }

    notify();

    return () => {
      if (isStarted) {
        window.removeEventListener('popstate', notify);
        isStarted = false;
      }
    };
  }

  const api = {
    registerRoute,
    navigateTo,
    replacePath,
    setSearchParams,
    onChange,
    start,
    getCurrentState
  };

  return api;
}

export { createRouter, normalizePath };
