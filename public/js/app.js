import { initI18n, t, onLanguageChange, toggleLanguage, getLanguage } from './services/i18n.js';
import { icon } from './components/icons.js';
import * as newsFeed from './components/news-feed.js';
import * as feedbackSection from './components/feedback-section.js';
import * as resourceGrid from './components/resource-grid.js';

let activeTab = 'news';
let isRendering = false;

const TABS = {
  news: { render: newsFeed.render, icon: 'megaphone' },
  feedback: { render: feedbackSection.render, icon: 'messageSquare' },
  resources: { render: resourceGrid.render, icon: 'bookOpen' }
};

const tabContentCache = {};

async function start() {
  try {
    await initI18n();
  } catch (error) {
    console.error('i18n initialization failed:', error);
  }

  updatePageChrome();
  createTabContainers();
  renderNavigation();
  await loadTab(activeTab);

  onLanguageChange(async () => {
    updatePageChrome();
    updateNavigationLabels();
    Object.keys(tabContentCache).forEach((key) => {
      tabContentCache[key] = false;
    });
    await loadTab(activeTab);
  });
}

function updatePageChrome() {
  document.documentElement.lang = getLanguage();
  document.title = t('app.title');

  document.querySelectorAll('.logo-text').forEach((element) => {
    element.textContent = t('app.title');
  });

  document.querySelectorAll('.logo-bild').forEach((element) => {
    element.alt = t('app.logoAlt');
  });
}

function createTabContainers() {
  const mainContent = document.getElementById('hauptinhalt');
  if (!mainContent) {
    return;
  }

  mainContent.innerHTML = '';

  Object.keys(TABS).forEach((key) => {
    const section = document.createElement('section');
    section.id = 'tab-' + key;
    section.className = 'sektion';
    if (key === activeTab) {
      section.classList.add('aktiv');
    }
    mainContent.appendChild(section);
  });
}

function renderNavigation() {
  const navigation = document.getElementById('tab-navigation');
  if (!navigation) {
    return;
  }

  const html = Object.keys(TABS).map((key) => `
    <button class="tab-link ${key === activeTab ? 'aktiv' : ''}"
      data-tab="${key}" aria-selected="${key === activeTab}">
      <span class="tab-icon">${icon(TABS[key].icon, 18)}</span>
      <span class="tab-label">${t('nav.' + key)}</span>
    </button>
  `).join('');

  const languageSwitcherHtml = `
    <button class="sprach-wechsel" id="language-button" title="${t('nav.language')}">
      ${icon('globe', 16)}
      <span>${getLanguage() === 'de' ? 'EN' : 'DE'}</span>
    </button>
  `;

  navigation.innerHTML = html + languageSwitcherHtml;

  navigation.querySelectorAll('.tab-link').forEach((button) => {
    button.addEventListener('click', () => {
      if (button.dataset.tab === activeTab) {
        return;
      }
      switchTab(button.dataset.tab);
    });
  });

  const languageButton = document.getElementById('language-button');
  if (languageButton) {
    languageButton.addEventListener('click', async () => {
      languageButton.disabled = true;
      await toggleLanguage();
      languageButton.disabled = false;
    });
  }
}

function updateNavigationLabels() {
  const navigation = document.getElementById('tab-navigation');
  if (!navigation) {
    return;
  }

  navigation.querySelectorAll('.tab-link').forEach((button) => {
    const key = button.dataset.tab;
    const label = button.querySelector('.tab-label');
    if (label) {
      label.textContent = t('nav.' + key);
    }
  });

  const languageButton = document.getElementById('language-button');
  if (languageButton) {
    languageButton.title = t('nav.language');
    const label = languageButton.querySelector('span');
    if (label) {
      label.textContent = getLanguage() === 'de' ? 'EN' : 'DE';
    }
  }
}

async function switchTab(nextTab) {
  if (nextTab === activeTab) {
    return;
  }

  const currentContainer = document.getElementById('tab-' + activeTab);
  if (currentContainer) {
    currentContainer.classList.remove('aktiv');
  }

  const navigation = document.getElementById('tab-navigation');
  if (navigation) {
    navigation.querySelectorAll('.tab-link').forEach((button) => {
      const isActive = button.dataset.tab === nextTab;
      button.classList.toggle('aktiv', isActive);
      button.setAttribute('aria-selected', isActive);
    });
  }

  activeTab = nextTab;

  const nextContainer = document.getElementById('tab-' + nextTab);
  if (nextContainer) {
    nextContainer.classList.add('aktiv');
  }

  await loadTab(nextTab);
}

async function loadTab(tabKey) {
  if (isRendering) {
    return;
  }

  isRendering = true;
  try {
    const container = document.getElementById('tab-' + tabKey);
    const tab = TABS[tabKey];
    if (!container || !tab) {
      return;
    }

    if (!tabContentCache[tabKey]) {
      await tab.render(container);
      tabContentCache[tabKey] = true;
    }
  } finally {
    isRendering = false;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}
