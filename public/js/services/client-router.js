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

function createRouter() {
  const routes = new Map();
  const listeners = [];
  let currentPath = normalizePath(window.location.pathname);
  let isStarted = false;

  function registerRoute(pathname, routeData) {
    routes.set(normalizePath(pathname), routeData);
    return api;
  }

  function findRoute(pathname = currentPath) {
    return routes.get(normalizePath(pathname)) || null;
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
    const method = options.replace ? 'replaceState' : 'pushState';
    const currentTarget = window.location.pathname + window.location.search;
    const nextTarget = targetPath + targetSearch;

    if (nextTarget === currentTarget && !options.force) {
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