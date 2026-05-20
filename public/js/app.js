import { initI18n, t, onLanguageChange, toggleLanguage, getLanguage } from './services/i18n.js';
import { createRouter } from './services/client-router.js';
import { startDevReload } from './services/dev-reload.js';
import { installRoutePrefetch } from './services/route-prefetch.js';
import { renderRouteSkeleton } from './components/loading-state.js';
import { icon } from './components/icons.js';
import { renderThemeToggle, bindThemeToggle, initTheme } from './components/theme-toggle.js';
import * as adminConsole from './features/admin-console.js';
import * as homepage from './components/homepage.js';
import * as feedbackSection from './components/feedback-section.js';

const router = createRouter();
let activeRoute = 'feed';
let pendingNavigation = 0;
let prefetchCleanup = null;

const ROUTES = {
  news: { key: 'feed', path: '/', render: homepage.render, preload: homepage.preload, icon: 'megaphone', titleKey: 'feed.title', navigationKey: 'feed', skeleton: 'feed' },
  indexAlias: { key: 'feed', path: '/index.html', render: homepage.render, preload: homepage.preload, icon: 'megaphone', titleKey: 'feed.title', navigationKey: 'feed', skeleton: 'feed' },
  feedback: { key: 'feedback', path: '/feedback', render: feedbackSection.render, preload: feedbackSection.preload, icon: 'messageSquare', titleKey: 'nav.feedback', navigationKey: 'feedback', skeleton: 'feedback' },
  adminLanding: { key: 'admin', path: '/admin', render: renderAdminRoute, preload: adminConsole.preload, icon: 'settings', titleKey: 'admin.pageTitle', navigationKey: 'admin', adminSection: 'surveys', skeleton: 'admin' },
  adminSurveys: { key: 'admin', path: '/admin/surveys', render: renderAdminRoute, preload: adminConsole.preload, icon: 'settings', titleKey: 'admin.surveys', navigationKey: 'admin', adminSection: 'surveys', skeleton: 'admin' },
  adminResources: { key: 'admin', path: '/admin/resources', render: renderAdminRoute, preload: adminConsole.preload, icon: 'settings', titleKey: 'admin.resources', navigationKey: 'admin', adminSection: 'resources', skeleton: 'admin' },
  adminConcerns: { key: 'admin', path: '/admin/concerns', render: renderAdminRoute, preload: adminConsole.preload, icon: 'settings', titleKey: 'admin.concerns', navigationKey: 'admin', adminSection: 'concerns', skeleton: 'admin' },
  adminNews: { key: 'admin', path: '/admin/news', render: renderAdminRoute, preload: adminConsole.preload, icon: 'settings', titleKey: 'admin.news', navigationKey: 'admin', adminSection: 'news', skeleton: 'admin' }
};

const NAVIGATION_ITEMS = [
  { key: 'feed', path: '/', icon: 'megaphone' },
  { key: 'feedback', path: '/feedback', icon: 'messageSquare' },
  { key: 'admin', path: '/admin', icon: 'settings' }
];

Object.values(ROUTES).forEach((route) => {
  router.registerRoute(route.path, route);
});

async function start() {
  initTheme();
  startDevReload();

  try {
    await initI18n();
  } catch (error) {
    console.error('i18n initialization failed:', error);
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
    updatePageChrome();
    renderNavigation();

    const { route } = router.getCurrentState();
    if (route) {
      renderRoute(route);
    }
  });
}

function updatePageChrome() {
  document.documentElement.lang = getLanguage();
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

  document.querySelectorAll('.logo-bild').forEach((element) => {
    element.alt = t('app.logoAlt');
  });
}

function renderNavigation() {
  const navigation = document.getElementById('tab-navigation');
  if (!navigation) {
    return;
  }

  const html = NAVIGATION_ITEMS.map((item) => `
    <a class="tab-link ${item.key === activeRoute ? 'aktiv' : ''}"
      href="${item.path}" data-route="${item.key}"
      aria-current="${item.key === activeRoute ? 'page' : 'false'}">
      <span class="tab-icon">${icon(item.icon, 18)}</span>
      <span class="tab-label">${t('nav.' + item.key)}</span>
    </a>
  `).join('');

  const languageSwitcherHtml = `
    <button class="sprach-wechsel" id="language-button" title="${t('nav.language')}">
      ${icon('globe', 16)}
      <span>${getLanguage() === 'de' ? 'EN' : 'DE'}</span>
    </button>
  `;

  const themeToggleHtml = renderThemeToggle();

  navigation.innerHTML = html + languageSwitcherHtml + themeToggleHtml;

  navigation.querySelectorAll('.tab-link').forEach((link) => {
    link.addEventListener('click', (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      event.preventDefault();
      router.navigateTo(link.getAttribute('href'));
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
  const mainContent = document.getElementById('hauptinhalt');
  if (!mainContent || !route) {
    return;
  }

  setViewClasses(route);

  const navigationId = ++pendingNavigation;
  const section = document.createElement('section');
  section.id = 'route-' + route.key;
  section.className = 'sektion aktiv';
  section.setAttribute('aria-live', 'polite');
  section.innerHTML = renderRouteSkeleton(route.skeleton || route.key);

  mainContent.innerHTML = '';
  mainContent.appendChild(section);

  try {
    await route.render(section, {
      route,
      section: route.adminSection || null,
      path: route.path,
      searchParams: router.getCurrentState().searchParams,
      navigateTo: (path, options) => router.navigateTo(path, options),
      setSearchParams: (values, options) => router.setSearchParams(values, options)
    });
  } catch (error) {
    console.error('Route rendering failed:', error);

    if (navigationId !== pendingNavigation) {
      return;
    }

    section.innerHTML = `
      <div class="leer-zustand">
        <div class="leer-zustand-icon">${icon('alertCircle', 48)}</div>
        <p class="leer-zustand-text">${t('general.error')}</p>
      </div>
    `;
  }
}

function setViewClasses(route) {
  const mainContent = document.getElementById('hauptinhalt');
  if (!mainContent) {
    return;
  }

  const isAdminView = (route.navigationKey || route.key) === 'admin';
  mainContent.classList.toggle('hauptinhalt-admin', isAdminView);
  document.body.classList.toggle('ansicht-admin', isAdminView);
}

function findRouteByPath(pathname) {
  return Object.values(ROUTES).find((route) => route.path === pathname) || null;
}

function renderAdminRoute(container, context) {
  return adminConsole.render(container, context);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}
