// ===========================================
// Painpoint-Formular Komponente
// ===========================================

import * as api from '../services/api-client.js';
import { t } from '../services/i18n.js';
import * as toast from './toast.js';

/**
 * Rendert das Painpoint-Einreichungs-Formular.
 * @param {HTMLElement} container - Ziel-Container
 */
function rendere(container) {
  const html = `
    <h1 class="sektion-titel">${t('painpoint.titel')}</h1>
    <p class="sektion-beschreibung">${t('painpoint.beschreibung')}</p>
    <form class="formular" id="painpoint-formular">
      <div class="formular-gruppe">
        <label class="formular-label" for="pp-titel">${t('painpoint.titelLabel')}</label>
        <input type="text" id="pp-titel" class="formular-eingabe"
          placeholder="${t('painpoint.titelPlaceholder')}"
          maxlength="200" required>
      </div>
      <div class="formular-gruppe">
        <label class="formular-label" for="pp-detail">${t('painpoint.detailLabel')}</label>
        <textarea id="pp-detail" class="formular-textarea"
          placeholder="${t('painpoint.detailPlaceholder')}"
          maxlength="2000"></textarea>
      </div>
      <div class="formular-gruppe">
        <label class="formular-label" for="pp-name">${t('painpoint.nameLabel')}</label>
        <input type="text" id="pp-name" class="formular-eingabe"
          placeholder="${t('painpoint.namePlaceholder')}"
          maxlength="100">
      </div>
      <button type="submit" class="btn btn-primaer">${t('painpoint.absenden')}</button>
    </form>
  `;

  container.innerHTML = html;
  registriereEvents(container);
}

/**
 * Registriert Formular-Events.
 * @param {HTMLElement} container - Container mit dem Formular
 */
function registriereEvents(container) {
  const formular = container.querySelector('#painpoint-formular');

  formular.addEventListener('submit', async (e) => {
    e.preventDefault();

    const titel = container.querySelector('#pp-titel').value.trim();
    const beschreibung = container.querySelector('#pp-detail').value.trim();
    const name = container.querySelector('#pp-name').value.trim();

    if (!titel) return;

    const submitBtn = formular.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    const ergebnis = await api.post('/api/painpoints', {
      titel,
      beschreibung,
      name: name || null
    });

    submitBtn.disabled = false;

    if (ergebnis.ok) {
      toast.erfolg(t('painpoint.erfolg'));
      formular.reset();
    } else {
      toast.fehler(t('painpoint.fehler'));
    }
  });
}

export { rendere };
