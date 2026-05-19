// ===========================================
// Umfrage-Liste Komponente
// ===========================================

import * as api from '../services/api-client.js';
import { t } from '../services/i18n.js';
import { escapeHtml } from './modal.js';
import * as toast from './toast.js';

/**
 * Rendert die Umfragen-Sektion.
 * @param {HTMLElement} container - Ziel-Container
 */
async function rendere(container) {
  container.innerHTML = '<p class="leer-zustand-text">' + t('allgemein.laden') + '</p>';

  const antwort = await api.get('/api/surveys');

  if (!antwort.ok || !antwort.daten || antwort.daten.length === 0) {
    container.innerHTML = `
      <div class="leer-zustand">
        <div class="leer-zustand-icon">&#128203;</div>
        <p class="leer-zustand-text">${t('survey.leer')}</p>
      </div>
    `;
    return;
  }

  const html = `
    <h1 class="sektion-titel">${t('survey.titel')}</h1>
    <div class="umfragen-container">
      ${antwort.daten.map(umfrage => rendereUmfrage(umfrage)).join('')}
    </div>
  `;

  container.innerHTML = html;
  registriereEvents(container);
}

/**
 * Rendert eine einzelne Umfrage.
 * @param {Object} umfrage - Umfrage-Objekt
 * @returns {string} HTML-String
 */
function rendereUmfrage(umfrage) {
  const fragenHtml = umfrage.fragen.map((frage, index) =>
    rendereFrage(frage, index)
  ).join('');

  return `
    <div class="umfrage-karte" data-umfrage-id="${escapeHtml(umfrage.id)}">
      <h2 class="karte-titel">${escapeHtml(umfrage.titel)}</h2>
      ${umfrage.beschreibung ? `<p class="karte-text">${escapeHtml(umfrage.beschreibung)}</p>` : ''}
      <form class="umfrage-formular">
        ${fragenHtml}
        <div class="formular-gruppe">
          <input type="text" class="formular-eingabe umfrage-name"
            placeholder="${t('survey.namePlaceholder')}">
        </div>
        <button type="submit" class="btn btn-primaer">${t('survey.absenden')}</button>
      </form>
    </div>
  `;
}

/**
 * Rendert eine einzelne Frage basierend auf ihrem Typ.
 * @param {Object} frage - Frage-Objekt
 * @param {number} index - Frage-Index
 * @returns {string} HTML-String
 */
function rendereFrage(frage, index) {
  let eingabeHtml = '';

  switch (frage.typ) {
    case 'freitext':
      eingabeHtml = `
        <textarea class="formular-textarea frage-eingabe"
          data-index="${index}"
          placeholder="${t('survey.freitext')}"
          rows="3"></textarea>
      `;
      break;

    case 'bewertung':
      eingabeHtml = `
        <div class="sterne-bewertung frage-eingabe" data-index="${index}" data-wert="0">
          ${[1,2,3,4,5].map(n => `
            <svg class="stern" data-wert="${n}" viewBox="0 0 24 24">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
          `).join('')}
        </div>
      `;
      break;

    case 'ja_nein':
      eingabeHtml = `
        <div class="ja-nein-auswahl frage-eingabe" data-index="${index}" data-wert="">
          <button type="button" class="ja-nein-btn" data-wert="ja">${t('survey.jaLabel')}</button>
          <button type="button" class="ja-nein-btn" data-wert="nein">${t('survey.neinLabel')}</button>
        </div>
      `;
      break;

    case 'auswahl':
      eingabeHtml = `
        <div class="auswahl-gruppe frage-eingabe" data-index="${index}" data-wert="">
          ${(frage.optionen || []).map(option => `
            <label class="auswahl-option">
              <input type="radio" name="frage_${index}" value="${escapeHtml(option)}">
              <span>${escapeHtml(option)}</span>
            </label>
          `).join('')}
        </div>
      `;
      break;

    default:
      eingabeHtml = `
        <input type="text" class="formular-eingabe frage-eingabe"
          data-index="${index}"
          placeholder="${t('survey.freitext')}">
      `;
  }

  return `
    <div class="frage-block">
      <p class="frage-text">${escapeHtml(frage.text)}</p>
      ${eingabeHtml}
    </div>
  `;
}

/**
 * Registriert Event-Listener fuer Umfrage-Interaktionen.
 * @param {HTMLElement} container - Umfragen-Container
 */
function registriereEvents(container) {
  // Sterne-Bewertung
  container.querySelectorAll('.sterne-bewertung').forEach(bewertung => {
    bewertung.querySelectorAll('.stern').forEach(stern => {
      stern.addEventListener('click', () => {
        const wert = parseInt(stern.dataset.wert);
        bewertung.dataset.wert = wert;
        aktualisiereStenne(bewertung, wert);
      });
    });
  });

  // Ja/Nein Buttons
  container.querySelectorAll('.ja-nein-auswahl').forEach(auswahl => {
    auswahl.querySelectorAll('.ja-nein-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        auswahl.querySelectorAll('.ja-nein-btn').forEach(b =>
          b.classList.remove('ausgewaehlt')
        );
        btn.classList.add('ausgewaehlt');
        auswahl.dataset.wert = btn.dataset.wert;
      });
    });
  });

  // Formular absenden
  container.querySelectorAll('.umfrage-formular').forEach(formular => {
    formular.addEventListener('submit', (e) => {
      e.preventDefault();
      sendeUmfrage(formular);
    });
  });
}

/**
 * Aktualisiert die visuelle Darstellung der Sterne.
 * @param {HTMLElement} bewertung - Sterne-Container
 * @param {number} wert - Ausgewaehlter Wert (1-5)
 */
function aktualisiereStenne(bewertung, wert) {
  bewertung.querySelectorAll('.stern').forEach(stern => {
    const sternWert = parseInt(stern.dataset.wert);
    if (sternWert <= wert) {
      stern.classList.add('aktiv');
    } else {
      stern.classList.remove('aktiv');
    }
  });
}

/**
 * Sammelt Antworten und sendet sie an die API.
 * @param {HTMLFormElement} formular - Umfrage-Formular
 */
async function sendeUmfrage(formular) {
  const karte = formular.closest('.umfrage-karte');
  const umfrageId = karte.dataset.umfrageId;
  const nameInput = formular.querySelector('.umfrage-name');
  const name = nameInput ? nameInput.value.trim() : '';

  // Antworten sammeln
  const antworten = [];
  const eingaben = formular.querySelectorAll('.frage-eingabe');

  eingaben.forEach(eingabe => {
    if (eingabe.tagName === 'TEXTAREA' || eingabe.tagName === 'INPUT') {
      antworten.push(eingabe.value);
    } else if (eingabe.classList.contains('sterne-bewertung')) {
      antworten.push(parseInt(eingabe.dataset.wert) || 0);
    } else if (eingabe.classList.contains('ja-nein-auswahl')) {
      antworten.push(eingabe.dataset.wert || '');
    } else if (eingabe.classList.contains('auswahl-gruppe')) {
      const ausgewaehlt = eingabe.querySelector('input:checked');
      antworten.push(ausgewaehlt ? ausgewaehlt.value : '');
    }
  });

  const ergebnis = await api.post('/api/surveys/' + umfrageId + '/responses', {
    name: name || null,
    antworten
  });

  if (ergebnis.ok) {
    toast.erfolg(t('survey.erfolg'));
    // Formular zuruecksetzen
    formular.reset();
    formular.querySelectorAll('.stern').forEach(s => s.classList.remove('aktiv'));
    formular.querySelectorAll('.ja-nein-btn').forEach(b => b.classList.remove('ausgewaehlt'));
    formular.querySelectorAll('.sterne-bewertung').forEach(b => { b.dataset.wert = '0'; });
    formular.querySelectorAll('.ja-nein-auswahl').forEach(b => { b.dataset.wert = ''; });
  } else {
    toast.fehler(t('survey.fehler'));
  }
}

export { rendere };
