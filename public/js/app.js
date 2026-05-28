import { initI18n, t, onLanguageChange, toggleLanguage, getLanguage, getLocale, getLocaleFromPath } from './services/i18n.js';
import { createRouter } from './services/client-router.js';
import { startDevReload } from './services/dev-reload.js';
import { installRoutePrefetch } from './services/route-prefetch.js';
import { renderRouteSkeleton } from './components/loading-state.js';
import { icon } from './components/icons.js';
import { renderThemeToggle, bindThemeToggle, initTheme, getTheme } from './components/theme-toggle.js';
import * as adminConsole from './features/admin-console.js';
import * as homepage from './components/homepage.js';
import * as feedDetail from './components/feed-detail.js';
import * as feedbackSection from './components/feedback-section.js';
import * as surveyDetail from './components/survey-detail.js';

const router = createRouter();
let activeRoute = 'feed';
let pendingNavigation = 0;
let prefetchCleanup = null;

const ROUTES = {
  news: { key: 'feed', path: '/', render: homepage.render, preload: homepage.preload, icon: 'megaphone', titleKey: 'feed.title', navigationKey: 'feed', skeleton: 'feed' },
  indexAlias: { key: 'feed', path: '/index.html', render: homepage.render, preload: homepage.preload, icon: 'megaphone', titleKey: 'feed.title', navigationKey: 'feed', skeleton: 'feed' },
  feedDetail: { key: 'feed-detail', path: '/feed/:id', render: feedDetail.render, preload: feedDetail.preload, icon: 'megaphone', titleKey: 'feed.title', navigationKey: 'feed', skeleton: 'feed-detail' },
  feedback: { key: 'feedback', path: '/feedback', render: feedbackSection.render, preload: feedbackSection.preload, icon: 'messageSquare', titleKey: 'nav.feedback', navigationKey: 'feedback', skeleton: 'feedback' },
  surveyDetail: { key: 'survey-detail', path: '/surveys/:id', render: surveyDetail.render, preload: surveyDetail.preload, icon: 'messageSquare', titleKey: 'survey.singleLabel', navigationKey: 'feedback', skeleton: 'feed-detail' },
  adminLanding: { key: 'admin', path: '/admin', render: renderAdminRoute, preload: adminConsole.preload, icon: 'settings', titleKey: 'admin.pageTitle', navigationKey: 'admin', adminSection: 'feed', skeleton: 'admin' },
  adminFeed: { key: 'admin', path: '/admin/feed', render: renderAdminRoute, preload: adminConsole.preload, icon: 'settings', titleKey: 'admin.feed', navigationKey: 'admin', adminSection: 'feed', skeleton: 'admin' },
  adminSurveys: { key: 'admin', path: '/admin/surveys', render: renderAdminRoute, preload: adminConsole.preload, icon: 'settings', titleKey: 'admin.surveys', navigationKey: 'admin', adminSection: 'surveys', skeleton: 'admin' },
  adminConcerns: { key: 'admin', path: '/admin/concerns', render: renderAdminRoute, preload: adminConsole.preload, icon: 'settings', titleKey: 'admin.concerns', navigationKey: 'admin', adminSection: 'concerns', skeleton: 'admin' }
};

const NAVIGATION_ITEMS = [
  { key: 'feed', path: '/', icon: 'megaphone' },
  { key: 'feedback', path: '/feedback', icon: 'messageSquare' },
  { key: 'admin', path: '/admin', icon: 'settings' }
];

Object.values(ROUTES).forEach((route) => {
  router.registerRoute(route.path, route);
  ['de-DE', 'en-US'].forEach((locale) => {
    router.registerRoute(withLocalePrefix(route.path, locale), route);
  });
});

async function start() {
  initTheme();
  startDevReload();

  try {
    await initI18n();
  } catch (error) {
    console.error('i18n initialization failed:', error);
  }

  if (!getLocaleFromPath(window.location.pathname)) {
    router.replacePath(localizePath(window.location.pathname + window.location.search));
  }

  const currentState = router.getCurrentState();
  if (currentState.route) {
    activeRoute = currentState.route.navigationKey || currentState.route.key;
  }

  updatePageChrome();
  renderNavigation();
  router.onChange(({ path, route }) => {
    if (!route) {
      if (path !== ROUTES.news.path) {
        router.replacePath(ROUTES.news.path);
      }
      return;
    }

    activeRoute = route.navigationKey || route.key;
    updatePageChrome();
    renderNavigation();
    renderRoute(route);
  });

  router.start();

  onLanguageChange(() => {
    const currentUrl = new URL(window.location.href);
    const barePath = stripLocalePrefix(currentUrl.pathname);
    const localizedPath = withLocalePrefix(barePath, getLocale()) + currentUrl.search + currentUrl.hash;
    if (localizedPath !== window.location.pathname + window.location.search) {
      router.replacePath(localizedPath);
    }

    updatePageChrome();
    renderNavigation();

    const { route } = router.getCurrentState();
    if (route) {
      renderRoute(route);
    }
  });
}

function updatePageChrome() {
  document.documentElement.lang = getLocale();
  const currentState = router.getCurrentState();
  const currentPage = currentState.route;
  const title = currentPage && currentPage.titleKey
    ? t(currentPage.titleKey)
    : activeRoute === 'feed'
      ? t('app.title')
      : t('nav.' + activeRoute);

  document.title = title === t('app.title')
    ? t('app.title')
    : title + ' - ' + t('app.title');

  document.querySelectorAll('.logo-text').forEach((element) => {
    element.textContent = t('app.title');
  });

  document.querySelectorAll('.logo-image').forEach((element) => {
    element.alt = t('app.logoAlt');
  });
}

function renderNavigation() {
  const navigation = document.getElementById('tab-navigation');
  if (!navigation) {
    return;
  }

  const mainItems = NAVIGATION_ITEMS.map((item) => `
    <a class="tab-link ${item.key === activeRoute ? 'active' : ''}"
      href="${localizePath(item.path)}" data-route="${item.key}"
      aria-current="${item.key === activeRoute ? 'page' : 'false'}">
      <span class="tab-icon">${icon(item.icon, 18)}</span>
      <span class="tab-label">${t('nav.' + item.key)}</span>
    </a>
  `).join('');

  // Theme and language controls share the tab-link treatment and sit in a
  // dedicated utility group.
  const themeName = getTheme();
  const themeIcon = themeName === 'dark' ? 'sun' : 'moon';
  const otherLanguage = getLanguage() === 'de' ? 'EN' : 'DE';

  const utilities = `
    <div class="nav-utilities">
      <button class="tab-link tab-link-utility" id="language-button" type="button" title="${t('nav.language')}">
        <span class="tab-icon">${icon('globe', 16)}</span>
        <span class="tab-label">${otherLanguage}</span>
      </button>
      <button class="tab-link tab-link-utility tab-link-icon" id="theme-toggle" type="button" title="Toggle theme" aria-label="Toggle theme">
        <span class="tab-icon">${icon(themeIcon, 16)}</span>
      </button>
    </div>
  `;

  navigation.innerHTML = mainItems + utilities;

  navigation.querySelectorAll('.tab-link[data-route]').forEach((link) => {
    link.addEventListener('click', (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      event.preventDefault();
      router.navigateTo(localizePath(link.getAttribute('href')));
    });
  });

  prefetchCleanup?.();
  prefetchCleanup = installRoutePrefetch(navigation, findRouteByPath);

  const languageButton = document.getElementById('language-button');
  if (languageButton) {
    languageButton.addEventListener('click', async () => {
      languageButton.disabled = true;
      await toggleLanguage();
      languageButton.disabled = false;
    });
  }

  bindThemeToggle();
}

async function renderRoute(route) {
  const mainContent = document.getElementById('main-content');
  if (!mainContent || !route) {
    return;
  }

  setViewClasses(route);

  const navigationId = ++pendingNavigation;
  const section = document.createElement('section');
  section.id = 'route-' + route.key;
  section.className = 'section active';
  section.setAttribute('aria-live', 'polite');
  section.innerHTML = renderRouteSkeleton(route.skeleton || route.key);

  mainContent.innerHTML = '';
  mainContent.appendChild(section);

  try {
    await route.render(section, {
      route,
      section: route.adminSection || null,
      path: router.getCurrentState().path,
      searchParams: router.getCurrentState().searchParams,
      params: route.params || {},
      navigateTo: (path, options) => router.navigateTo(localizePath(path), options),
      setSearchParams: (values, options) => router.setSearchParams(values, options)
    });
    localizeInternalLinks(section);
  } catch (error) {
    console.error('Route rendering failed:', error);

    if (navigationId !== pendingNavigation) {
      return;
    }

    section.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">${icon('alertCircle', 48)}</div>
        <p class="empty-state-text">${t('general.error')}</p>
      </div>
    `;
  }
}

function setViewClasses(route) {
  const mainContent = document.getElementById('main-content');
  if (!mainContent) {
    return;
  }

  const isAdminView = (route.navigationKey || route.key) === 'admin';
  // Admin uses the same main layout as the rest; auth cards keep their
  // dedicated class hook for login/setup views.
  mainContent.classList.toggle('main-content-admin', isAdminView);
  document.body.classList.toggle('view-admin', isAdminView);
}

function findRouteByPath(pathname) {
  const localizedPathname = localizePath(pathname);
  for (const route of Object.values(ROUTES)) {
    if (route.path === pathname || withLocalePrefix(route.path, getLocale()) === pathname || withLocalePrefix(route.path, getLocale()) === localizedPathname) {
      return route;
    }
  }
  return null;
}

function withLocalePrefix(pathname, locale = getLocale()) {
  const path = pathname || '/';
  if (path === '/') {
    return '/' + locale;
  }
  return '/' + locale + (path.startsWith('/') ? path : '/' + path);
}

function stripLocalePrefix(pathname) {
  const path = pathname || '/';
  const match = path.match(/^\/(de-DE|en-US)(\/.*)?$/);
  if (!match) {
    return path;
  }
  return match[2] || '/';
}

function localizePath(target) {
  const url = new URL(target || '/', window.location.origin);
  if (getLocaleFromPath(url.pathname)) {
    return url.pathname + url.search + url.hash;
  }

  const barePath = stripLocalePrefix(url.pathname);
  const localizedPath = withLocalePrefix(barePath, getLocale());
  return localizedPath + url.search + url.hash;
}

function localizeInternalLinks(container) {
  container.querySelectorAll('a[href^="/"]').forEach((anchor) => {
    const href = anchor.getAttribute('href') || '';
    if (href.startsWith('/api/') || href.startsWith('/uploads/') || getLocaleFromPath(href)) {
      return;
    }
    anchor.setAttribute('href', localizePath(href));
  });
}

function renderAdminRoute(container, context) {
  return adminConsole.render(container, context);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}
