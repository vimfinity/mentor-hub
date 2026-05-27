'use strict';

(function bootstrapTheme() {
  let theme = null;

  try {
    theme = localStorage.getItem('theme-preference');
  } catch (error) {
    theme = null;
  }

  if (!theme) {
    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  document.documentElement.setAttribute('data-theme', theme);
})();
