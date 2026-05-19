// ===========================================
// Feedback-Sektion Komponente
// (Umfragen + Anliegen-Formular kombiniert)
// ===========================================

import * as api from '../services/api-client.js';
import { t } from '../services/i18n.js';
import { escapeHtml } from './modal.js';
import { icon } from './icons.js';
import * as toast from './toast.js';

/**
 * Rendert die kombinierte Feedback-Sektion.
 * @param {HTMLElement} container - Ziel-Container
 */
async function rendere(container) {
  const antwort = await api.get('/api/surveys');
  const hatUmfragen = antwort.ok && antwort.daten && antwort.daten.length > 0;

  let html = `<h1 class="sektion-titel">${t('survey.titel')}</h1>`;

  if (hatUmfragen) {
    html += `
      <div class="umfragen-container">
        ${antwort.daten.map(umfrage => rendereUmfrage(umfrage)).join('')}
      </div>
    `;
  }

  // Anliegen-Formular (frueher "Painpoint melden")
  html += rendereAnliegenFormular();

  container.innerHTML = html;
  registriereEvents(container);
}

/**
 * Rendert das Anliegen-Einreichungs-Formular.
 * @returns {string} HTML-String
 */
function rendereAnliegenFormular() {
  return `
    <div class="anliegen-sektion">
      <h2 class="anliegen-titel">
        ${icon('lightbulb', 22)}
        <span>${t('painpoint.titel')}</span>
      </h2>
      <p class="sektion-beschreibung">${t('painpoint.beschreibung')}</p>
      <form class="formular" id="anliegen-formular">
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
        <button type="submit" class="btn btn-primaer">
          ${icon('send', 16)}
          <span>${t('painpoint.absenden')}</span>
        </button>
      </form>
    </div>
  `;
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
        <button type="submit" class="btn btn-primaer">
          ${icon('send', 16)}
          <span>${t('survey.absenden')}</span>
        </button>
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
            <span class="stern" data-wert="${n}">${icon('star', 28)}</span>
          `).join('')}
        </div>
      `;
      break;

    case 'ja_nein':
      eingabeHtml = `
        <div class="ja-nein-auswahl frage-eingabe" data-index="${index}" data-wert="">
          <button type="button" class="ja-nein-btn" data-wert="ja">
            ${icon('thumbsUp', 16)} ${t('survey.jaLabel')}
          </button>
          <button type="button" class="ja-nein-btn" data-wert="nein">
            ${icon('thumbsDown', 16)} ${t('survey.neinLabel')}
          </button>
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
 * Registriert Event-Listener.
 * @param {HTMLElement} container - Container-Element
 */
function registriereEvents(container) {
  // Sterne-Bewertung
  container.querySelectorAll('.sterne-bewertung').forEach(bewertung => {
    bewertung.querySelectorAll('.stern').forEach(stern => {
      stern.addEventListener('click', () => {
        const wert = parseInt(stern.dataset.wert);
        bewertung.dataset.wert = wert;
        aktualisiereSterne(bewertung, wert);
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

  // Umfrage-Formulare absenden
  container.querySelectorAll('.umfrage-formular').forEach(formular => {
    formular.addEventListener('submit', (e) => {
      e.preventDefault();
      sendeUmfrage(formular);
    });
  });

  // Anliegen-Formular
  const anliegenFormular = container.querySelector('#anliegen-formular');
  if (anliegenFormular) {
    anliegenFormular.addEventListener('submit', async (e) => {
      e.preventDefault();

      const titel = container.querySelector('#pp-titel').value.trim();
      const beschreibung = container.querySelector('#pp-detail').value.trim();
      const name = container.querySelector('#pp-name').value.trim();

      if (!titel) return;

      const submitBtn = anliegenFormular.querySelector('button[type="submit"]');
      submitBtn.disabled = true;

      const ergebnis = await api.post('/api/painpoints', {
        titel,
        beschreibung,
        name: name || null
      });

      submitBtn.disabled = false;

      if (ergebnis.ok) {
        toast.erfolg(t('painpoint.erfolg'));
        anliegenFormular.reset();
      } else {
        toast.fehler(t('painpoint.fehler'));
      }
    });
  }
}

/**
 * Aktualisiert die Sterne-Anzeige.
 * @param {HTMLElement} bewertung - Bewertungs-Container
 * @param {number} wert - Ausgewaehlter Wert (1-5)
 */
function aktualisiereSterne(bewertung, wert) {
  bewertung.querySelectorAll('.stern').forEach(stern => {
    const sternWert = parseInt(stern.dataset.wert);
    stern.classList.toggle('aktiv', sternWert <= wert);
  });
}

/**
 * Sendet eine ausgefuellte Umfrage ab.
 * @param {HTMLElement} formular - Formular-Element
 */
async function sendeUmfrage(formular) {
  const karte = formular.closest('.umfrage-karte');
  const umfrageId = karte.dataset.umfrageId;

  const antworten = [];
  formular.querySelectorAll('.frage-eingabe').forEach(eingabe => {
    if (eingabe.tagName === 'TEXTAREA' || eingabe.tagName === 'INPUT') {
      antworten.push(eingabe.value.trim());
    } else if (eingabe.classList.contains('sterne-bewertung')) {
      antworten.push(parseInt(eingabe.dataset.wert) || 0);
    } else if (eingabe.classList.contains('ja-nein-auswahl')) {
      antworten.push(eingabe.dataset.wert || '');
    } else if (eingabe.classList.contains('auswahl-gruppe')) {
      const checked = eingabe.querySelector('input:checked');
      antworten.push(checked ? checked.value : '');
    }
  });

  const nameEingabe = formular.querySelector('.umfrage-name');
  const name = nameEingabe ? nameEingabe.value.trim() : null;

  const submitBtn = formular.querySelector('button[type="submit"]');
  submitBtn.disabled = true;

  const ergebnis = await api.post('/api/surveys/' + umfrageId + '/responses', {
    name: name || null,
    antworten
  });

  submitBtn.disabled = false;

  if (ergebnis.ok) {
    toast.erfolg(t('survey.erfolg'));
    karte.style.opacity = '0.6';
    karte.style.pointerEvents = 'none';
  } else {
    toast.fehler(ergebnis.daten?.fehler || t('survey.fehler'));
  }
}

export { rendere };
