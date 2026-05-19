import { initI18n, t, onLanguageChange, toggleLanguage, getLanguage } from './services/i18n.js';
import { erstelleRouter } from './services/client-router.js';
import { starteDevReload } from './services/dev-reload.js';
import { installiereRoutenPrefetch } from './services/route-prefetch.js';
import { renderRouteSkeleton } from './components/loading-state.js';
import { icon } from './components/icons.js';
import * as adminConsole from './features/admin-console.js';
import * as newsFeed from './components/news-feed.js';
import * as feedbackSection from './components/feedback-section.js';
import * as resourceGrid from './components/resource-grid.js';

const router = erstelleRouter();
let aktiveRoute = 'news';
let laufendeNavigation = 0;
let prefetchAufraeumer = null;

const ROUTEN = {
  news: { key: 'news', pfad: '/', render: newsFeed.render, preload: newsFeed.preload, icon: 'megaphone', titleKey: 'nav.news', navigationKey: 'news', skeleton: 'news' },
  indexAlias: { key: 'news', pfad: '/index.html', render: newsFeed.render, preload: newsFeed.preload, icon: 'megaphone', titleKey: 'nav.news', navigationKey: 'news', skeleton: 'news' },
  feedback: { key: 'feedback', pfad: '/feedback', render: feedbackSection.render, preload: feedbackSection.preload, icon: 'messageSquare', titleKey: 'nav.feedback', navigationKey: 'feedback', skeleton: 'feedback' },
  resources: { key: 'resources', pfad: '/resources', render: resourceGrid.render, preload: resourceGrid.preload, icon: 'bookOpen', titleKey: 'nav.resources', navigationKey: 'resources', skeleton: 'resources' },
  adminLanding: { key: 'admin', pfad: '/admin', render: renderAdminRoute, preload: adminConsole.preload, icon: 'settings', titleKey: 'admin.pageTitle', navigationKey: 'admin', adminSection: 'surveys', skeleton: 'admin' },
  adminHtmlAlias: { key: 'admin', pfad: '/admin.html', render: renderAdminRoute, preload: adminConsole.preload, icon: 'settings', titleKey: 'admin.pageTitle', navigationKey: 'admin', adminSection: 'surveys', skeleton: 'admin' },
  adminSurveys: { key: 'admin', pfad: '/admin/surveys', render: renderAdminRoute, preload: adminConsole.preload, icon: 'settings', titleKey: 'admin.surveys', navigationKey: 'admin', adminSection: 'surveys', skeleton: 'admin' },
  adminResources: { key: 'admin', pfad: '/admin/resources', render: renderAdminRoute, preload: adminConsole.preload, icon: 'settings', titleKey: 'admin.resources', navigationKey: 'admin', adminSection: 'resources', skeleton: 'admin' },
  adminConcerns: { key: 'admin', pfad: '/admin/concerns', render: renderAdminRoute, preload: adminConsole.preload, icon: 'settings', titleKey: 'admin.concerns', navigationKey: 'admin', adminSection: 'concerns', skeleton: 'admin' },
  adminNews: { key: 'admin', pfad: '/admin/news', render: renderAdminRoute, preload: adminConsole.preload, icon: 'settings', titleKey: 'admin.news', navigationKey: 'admin', adminSection: 'news', skeleton: 'admin' }
};

const NAVIGATION = [
  { key: 'news', pfad: '/', icon: 'megaphone' },
  { key: 'feedback', pfad: '/feedback', icon: 'messageSquare' },
  { key: 'resources', pfad: '/resources', icon: 'bookOpen' },
  { key: 'admin', pfad: '/admin', icon: 'settings' }
];

Object.values(ROUTEN).forEach((route) => {
  router.registriereRoute(route.pfad, route);
});

async function start() {
  starteDevReload();

  try {
    await initI18n();
  } catch (error) {
    console.error('i18n initialization failed:', error);
  }

  const aktuellerStand = router.holeAktuellenStand();
  if (aktuellerStand.route) {
    aktiveRoute = aktuellerStand.route.navigationKey || aktuellerStand.route.key;
  }

  updatePageChrome();
  renderNavigation();
  router.aufAenderung(({ pfad, route }) => {
    if (!route) {
      if (pfad !== ROUTEN.news.pfad) {
        router.ersetzePfad(ROUTEN.news.pfad);
      }
      return;
    }

    aktiveRoute = route.navigationKey || route.key;
    updatePageChrome();
    renderNavigation();
    renderRoute(route);
  });

  router.starte();

  onLanguageChange(() => {
    updatePageChrome();
    renderNavigation();

    const { route } = router.holeAktuellenStand();
    if (route) {
      renderRoute(route);
    }
  });
}

function updatePageChrome() {
  document.documentElement.lang = getLanguage();
  const aktuellerStand = router.holeAktuellenStand();
  const aktuelleSeite = aktuellerStand.route;
  const titel = aktuelleSeite && aktuelleSeite.titleKey
    ? t(aktuelleSeite.titleKey)
    : aktiveRoute === 'news'
      ? t('app.title')
      : t('nav.' + aktiveRoute);

  document.title = titel === t('app.title')
    ? t('app.title')
    : titel + ' - ' + t('app.title');

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

  const html = NAVIGATION.map((route) => `
    <a class="tab-link ${route.key === aktiveRoute ? 'aktiv' : ''}"
      href="${route.pfad}" data-route="${route.key}"
      aria-current="${route.key === aktiveRoute ? 'page' : 'false'}">
      <span class="tab-icon">${icon(route.icon, 18)}</span>
      <span class="tab-label">${t('nav.' + route.key)}</span>
    </a>
  `).join('');

  const languageSwitcherHtml = `
    <button class="sprach-wechsel" id="language-button" title="${t('nav.language')}">
      ${icon('globe', 16)}
      <span>${getLanguage() === 'de' ? 'EN' : 'DE'}</span>
    </button>
  `;

  navigation.innerHTML = html + languageSwitcherHtml;

  navigation.querySelectorAll('.tab-link').forEach((link) => {
    link.addEventListener('click', (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      event.preventDefault();
      router.navigiereZu(link.getAttribute('href'));
    });
  });

  prefetchAufraeumer?.();
  prefetchAufraeumer = installiereRoutenPrefetch(navigation, findeRouteNachPfad);

  const languageButton = document.getElementById('language-button');
  if (languageButton) {
    languageButton.addEventListener('click', async () => {
      languageButton.disabled = true;
      await toggleLanguage();
      languageButton.disabled = false;
    });
  }
}

async function renderRoute(route) {
  const mainContent = document.getElementById('hauptinhalt');
  if (!mainContent || !route) {
    return;
  }

  setzeAnsichtsKlassen(route);

  const navigationId = ++laufendeNavigation;
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
      path: route.pfad,
      suchparameter: router.holeAktuellenStand().suchparameter,
      navigateTo: (path, optionen) => router.navigiereZu(path, optionen),
      setSearchParams: (werte, optionen) => router.setzeSuchparameter(werte, optionen)
    });
  } catch (error) {
    console.error('Route rendering failed:', error);

    if (navigationId !== laufendeNavigation) {
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

function setzeAnsichtsKlassen(route) {
  const mainContent = document.getElementById('hauptinhalt');
  if (!mainContent) {
    return;
  }

  const istAdminAnsicht = (route.navigationKey || route.key) === 'admin';
  mainContent.classList.toggle('hauptinhalt-admin', istAdminAnsicht);
  document.body.classList.toggle('ansicht-admin', istAdminAnsicht);
}

function findeRouteNachPfad(pfad) {
  return Object.values(ROUTEN).find((route) => route.pfad === pfad) || null;
}

function renderAdminRoute(container, context) {
  return adminConsole.render(container, context);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}
