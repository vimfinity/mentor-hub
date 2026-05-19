// ===========================================
// Admin Entry-Point
// ===========================================

import { initialisiere as initI18n, t, beiSprachwechsel, wechsleSprache } from './services/i18n.js';
import * as api from './services/api-client.js';
import * as toast from './components/toast.js';
import { escapeHtml } from './components/modal.js';
import * as modal from './components/modal.js';

/** @type {string} Aktiver Admin-Bereich */
let aktiverBereich = 'umfragen';

/** @type {boolean} Eingeloggt? */
let eingeloggt = false;

/**
 * Initialisiert die Admin-Seite.
 */
async function starte() {
  try {
    await initI18n();
  } catch (e) {
    console.error('i18n fehlgeschlagen:', e);
  }

  // Pruefen ob bereits ein Token vorhanden
  const token = api.holeToken();
  if (token) {
    // Token validieren mit einem Test-Request
    const test = await api.get('/api/admin/surveys');
    if (test.ok) {
      eingeloggt = true;
    } else {
      api.entferneToken();
    }
  }

  rendere();

  beiSprachwechsel(() => {
    rendere();
  });
}

/**
 * Haupt-Render-Funktion.
 */
async function rendere() {
  const app = document.getElementById('admin-app');
  if (!app) return;

  // Status pruefen (Ersteinrichtung noetig?)
  const status = await api.get('/api/admin/status');
  const eingerichtet = status.daten && status.daten.eingerichtet;

  if (!eingerichtet) {
    rendereSetup(app);
    return;
  }

  if (!eingeloggt) {
    rendereLogin(app);
    return;
  }

  rendereAdmin(app);
}

/**
 * Rendert die Ersteinrichtungs-Seite.
 * @param {HTMLElement} container
 */
function rendereSetup(container) {
  container.innerHTML = `
    <div class="login-container">
      <div class="login-karte">
        <h1 class="login-titel">${t('admin.setup')}</h1>
        <p style="margin-bottom: 1.5rem; color: var(--farbe-text-sekundaer);">
          ${t('admin.setupBeschreibung')}
        </p>
        <form id="setup-formular">
          <div class="formular-gruppe">
            <label class="formular-label" for="setup-passwort">${t('admin.passwort')}</label>
            <input type="password" id="setup-passwort" class="formular-eingabe"
              minlength="8" required autocomplete="new-password">
          </div>
          <button type="submit" class="btn btn-primaer" style="width:100%">
            ${t('admin.speichern')}
          </button>
        </form>
      </div>
    </div>
  `;

  container.querySelector('#setup-formular').addEventListener('submit', async (e) => {
    e.preventDefault();
    const passwort = container.querySelector('#setup-passwort').value;

    const ergebnis = await api.post('/api/admin/setup', { passwort });
    if (ergebnis.ok) {
      toast.erfolg(t('admin.setupErfolg'));
      rendere();
    } else {
      toast.fehler(ergebnis.daten ? ergebnis.daten.fehler : t('allgemein.fehler'));
    }
  });
}

/**
 * Rendert die Login-Seite.
 * @param {HTMLElement} container
 */
function rendereLogin(container) {
  container.innerHTML = `
    <div class="login-container">
      <div class="login-karte">
        <h1 class="login-titel">${t('admin.login')}</h1>
        <form id="login-formular">
          <div class="formular-gruppe">
            <label class="formular-label" for="login-passwort">${t('admin.passwort')}</label>
            <input type="password" id="login-passwort" class="formular-eingabe"
              required autocomplete="current-password">
          </div>
          <button type="submit" class="btn btn-primaer" style="width:100%">
            ${t('admin.anmelden')}
          </button>
        </form>
      </div>
    </div>
  `;

  container.querySelector('#login-formular').addEventListener('submit', async (e) => {
    e.preventDefault();
    const passwort = container.querySelector('#login-passwort').value;

    const ergebnis = await api.post('/api/admin/login', { passwort });
    if (ergebnis.ok && ergebnis.daten.token) {
      api.setzeToken(ergebnis.daten.token);
      eingeloggt = true;
      rendere();
    } else {
      toast.fehler(t('admin.fehler'));
    }
  });
}

/**
 * Rendert das Admin-Dashboard.
 * @param {HTMLElement} container
 */
function rendereAdmin(container) {
  container.innerHTML = `
    <div class="admin-layout">
      <aside class="admin-sidebar">
        <button class="admin-nav-link ${aktiverBereich === 'umfragen' ? 'aktiv' : ''}"
          data-bereich="umfragen">${t('admin.umfragen')}</button>
        <button class="admin-nav-link ${aktiverBereich === 'ressourcen' ? 'aktiv' : ''}"
          data-bereich="ressourcen">${t('admin.ressourcen')}</button>
        <button class="admin-nav-link ${aktiverBereich === 'painpoints' ? 'aktiv' : ''}"
          data-bereich="painpoints">${t('admin.painpoints')}</button>
        <button class="admin-nav-link ${aktiverBereich === 'neuigkeiten' ? 'aktiv' : ''}"
          data-bereich="neuigkeiten">${t('admin.neuigkeiten')}</button>
        <hr style="margin: 1rem 0; border: none; border-top: 1px solid var(--farbe-grau-200);">
        <button class="admin-nav-link" id="abmelden-btn">${t('admin.abmelden')}</button>
      </aside>
      <div class="admin-inhalt" id="admin-inhalt">
        <!-- Wird dynamisch gefuellt -->
      </div>
    </div>
  `;

  // Sidebar-Navigation
  container.querySelectorAll('.admin-nav-link[data-bereich]').forEach(btn => {
    btn.addEventListener('click', () => {
      aktiverBereich = btn.dataset.bereich;
      rendereAdmin(container);
    });
  });

  // Abmelden
  container.querySelector('#abmelden-btn').addEventListener('click', async () => {
    await api.post('/api/admin/logout', {});
    api.entferneToken();
    eingeloggt = false;
    rendere();
  });

  // Aktiven Bereich rendern
  const inhalt = container.querySelector('#admin-inhalt');
  switch (aktiverBereich) {
    case 'umfragen': rendereUmfragenAdmin(inhalt); break;
    case 'ressourcen': rendereRessourcenAdmin(inhalt); break;
    case 'painpoints': renderePainpointsAdmin(inhalt); break;
    case 'neuigkeiten': rendereNeuigkeitenAdmin(inhalt); break;
  }
}

// ===========================================
// Admin: Umfragen
// ===========================================

async function rendereUmfragenAdmin(container) {
  const antwort = await api.get('/api/admin/surveys');
  const umfragen = antwort.ok ? antwort.daten : [];

  container.innerHTML = `
    <div class="admin-kopfzeile">
      <h2>${t('admin.umfragen')}</h2>
      <button class="btn btn-primaer" id="umfrage-erstellen">${t('admin.erstellen')}</button>
    </div>
    ${umfragen.length === 0 ? '<p class="leer-zustand-text">' + t('survey.leer') + '</p>' : ''}
    <table class="tabelle" ${umfragen.length === 0 ? 'style="display:none"' : ''}>
      <thead>
        <tr>
          <th>Titel</th>
          <th>${t('admin.status')}</th>
          <th>${t('admin.antworten')}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${umfragen.map(u => `
          <tr>
            <td>${escapeHtml(u.titel)}</td>
            <td>
              <span class="status-badge ${u.aktiv ? 'status-offen' : 'status-erledigt'}">
                ${u.aktiv ? t('admin.aktiv') : t('admin.inaktiv')}
              </span>
            </td>
            <td>${(u.antworten || []).length}</td>
            <td class="tabelle-aktionen">
              <button class="btn btn-klein btn-sekundaer" data-aktion="toggle" data-id="${u.id}">
                ${u.aktiv ? '&#10074;&#10074;' : '&#9654;'}
              </button>
              <button class="btn btn-klein btn-sekundaer" data-aktion="details" data-id="${u.id}">
                &#128065;
              </button>
              <button class="btn btn-klein btn-gefahr" data-aktion="loeschen" data-id="${u.id}">
                &#128465;
              </button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  // Erstellen-Button
  container.querySelector('#umfrage-erstellen').addEventListener('click', () => {
    zeigeUmfrageFormular(container);
  });

  // Aktions-Buttons
  container.querySelectorAll('[data-aktion]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const aktion = btn.dataset.aktion;

      if (aktion === 'toggle') {
        const umfrage = umfragen.find(u => u.id === id);
        await api.put('/api/admin/surveys/' + id, { aktiv: !umfrage.aktiv });
        rendereUmfragenAdmin(container);
      } else if (aktion === 'loeschen') {
        modal.bestaetigung(t('admin.bestaetigung'), async () => {
          await api.loeschen('/api/admin/surveys/' + id);
          rendereUmfragenAdmin(container);
        });
      } else if (aktion === 'details') {
        zeigeUmfrageDetails(umfragen.find(u => u.id === id));
      }
    });
  });
}

function zeigeUmfrageFormular(container) {
  modal.oeffne({
    titel: t('admin.erstellen') + ': ' + t('admin.umfragen'),
    inhalt: `
      <form id="neue-umfrage-form">
        <div class="formular-gruppe">
          <label class="formular-label">Titel *</label>
          <input type="text" class="formular-eingabe" id="nf-titel" required maxlength="200">
        </div>
        <div class="formular-gruppe">
          <label class="formular-label">Beschreibung</label>
          <textarea class="formular-textarea" id="nf-beschreibung"></textarea>
        </div>
        <div class="formular-gruppe">
          <label class="formular-label">Fragen</label>
          <div id="fragen-liste"></div>
          <button type="button" class="btn btn-sekundaer btn-klein" id="frage-hinzufuegen">+ Frage</button>
        </div>
      </form>
    `,
    bestaetigenText: t('admin.speichern'),
    abbrechenText: t('admin.abbrechen'),
    beiBestaetigung: async (overlay) => {
      const titel = overlay.querySelector('#nf-titel').value.trim();
      if (!titel) return;

      const fragen = sammleFragenAusFormular(overlay);
      if (fragen.length === 0) {
        toast.fehler('Mindestens eine Frage erforderlich');
        return;
      }

      const beschreibung = overlay.querySelector('#nf-beschreibung').value.trim();
      await api.post('/api/admin/surveys', { titel, beschreibung, fragen });
      toast.erfolg('Umfrage erstellt');
      rendereUmfragenAdmin(container);
    }
  });

  // Fragen-Builder
  const fragenListe = document.querySelector('#fragen-liste');
  const fragenBtn = document.querySelector('#frage-hinzufuegen');
  let fragenZaehler = 0;

  fragenBtn.addEventListener('click', () => {
    fragenZaehler++;
    const div = document.createElement('div');
    div.className = 'formular-gruppe';
    div.style.padding = '0.5rem';
    div.style.border = '1px solid var(--farbe-grau-200)';
    div.style.borderRadius = '8px';
    div.style.marginBottom = '0.5rem';
    div.innerHTML = `
      <input type="text" class="formular-eingabe frage-text-input"
        placeholder="Frage ${fragenZaehler}" style="margin-bottom:0.5rem">
      <select class="formular-select frage-typ-select">
        <option value="freitext">Freitext</option>
        <option value="bewertung">Sterne-Bewertung (1-5)</option>
        <option value="ja_nein">Ja / Nein</option>
      </select>
    `;
    fragenListe.appendChild(div);
  });

  // Eine Frage direkt hinzufuegen
  fragenBtn.click();
}

function sammleFragenAusFormular(overlay) {
  const fragen = [];
  const texte = overlay.querySelectorAll('.frage-text-input');
  const typen = overlay.querySelectorAll('.frage-typ-select');

  texte.forEach((input, index) => {
    const text = input.value.trim();
    if (text) {
      fragen.push({
        text,
        typ: typen[index] ? typen[index].value : 'freitext'
      });
    }
  });

  return fragen;
}

function zeigeUmfrageDetails(umfrage) {
  if (!umfrage) return;

  const antwortHtml = (umfrage.antworten || []).map(a => {
    const datum = new Date(a.eingereichtAm).toLocaleDateString('de-DE');
    return `
      <div style="padding:0.5rem; border-bottom: 1px solid var(--farbe-grau-100); margin-bottom:0.5rem">
        <small style="color:var(--farbe-text-gedaempft)">${datum} ${a.name ? '- ' + escapeHtml(a.name) : '(Anonym)'}</small>
        <div>${a.antworten.map((ant, i) => `
          <p><strong>${escapeHtml(umfrage.fragen[i] ? umfrage.fragen[i].text : 'Frage ' + (i+1))}:</strong> ${escapeHtml(String(ant))}</p>
        `).join('')}</div>
      </div>
    `;
  }).join('');

  modal.oeffne({
    titel: escapeHtml(umfrage.titel) + ' - ' + t('admin.antworten'),
    inhalt: antwortHtml || '<p>Noch keine Antworten.</p>',
    abbrechenText: t('allgemein.schliessen')
  });
}

// ===========================================
// Admin: Ressourcen
// ===========================================

async function rendereRessourcenAdmin(container) {
  const antwort = await api.get('/api/resources');
  const ressourcen = antwort.ok ? antwort.daten : [];

  container.innerHTML = `
    <div class="admin-kopfzeile">
      <h2>${t('admin.ressourcen')}</h2>
      <button class="btn btn-primaer" id="ressource-erstellen">${t('admin.erstellen')}</button>
    </div>
    ${ressourcen.length === 0 ? '<p class="leer-zustand-text">' + t('resource.leer') + '</p>' : ''}
    <table class="tabelle" ${ressourcen.length === 0 ? 'style="display:none"' : ''}>
      <thead>
        <tr>
          <th>Titel</th>
          <th>Kategorie</th>
          <th>URL</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${ressourcen.map(r => `
          <tr>
            <td>${escapeHtml(r.titel)}</td>
            <td><span class="karte-kategorie">${escapeHtml(r.kategorie)}</span></td>
            <td><a href="${escapeHtml(r.url)}" target="_blank" rel="noopener">&#128279;</a></td>
            <td class="tabelle-aktionen">
              <button class="btn btn-klein btn-gefahr" data-aktion="loeschen" data-id="${r.id}">
                &#128465;
              </button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  container.querySelector('#ressource-erstellen').addEventListener('click', () => {
    modal.oeffne({
      titel: t('admin.erstellen') + ': ' + t('admin.ressourcen'),
      inhalt: `
        <div class="formular-gruppe">
          <label class="formular-label">Titel *</label>
          <input type="text" class="formular-eingabe" id="nr-titel" maxlength="200" required>
        </div>
        <div class="formular-gruppe">
          <label class="formular-label">URL *</label>
          <input type="url" class="formular-eingabe" id="nr-url" required>
        </div>
        <div class="formular-gruppe">
          <label class="formular-label">Beschreibung</label>
          <textarea class="formular-textarea" id="nr-beschreibung"></textarea>
        </div>
        <div class="formular-gruppe">
          <label class="formular-label">Kategorie</label>
          <select class="formular-select" id="nr-kategorie">
            <option value="artikel">Artikel</option>
            <option value="tool">Tool</option>
            <option value="video">Video</option>
            <option value="tutorial">Tutorial</option>
          </select>
        </div>
      `,
      bestaetigenText: t('admin.speichern'),
      abbrechenText: t('admin.abbrechen'),
      beiBestaetigung: async (overlay) => {
        const titel = overlay.querySelector('#nr-titel').value.trim();
        const url = overlay.querySelector('#nr-url').value.trim();
        if (!titel || !url) return;

        await api.post('/api/admin/resources', {
          titel,
          url,
          beschreibung: overlay.querySelector('#nr-beschreibung').value.trim(),
          kategorie: overlay.querySelector('#nr-kategorie').value
        });
        toast.erfolg('Ressource erstellt');
        rendereRessourcenAdmin(container);
      }
    });
  });

  container.querySelectorAll('[data-aktion="loeschen"]').forEach(btn => {
    btn.addEventListener('click', () => {
      modal.bestaetigung(t('admin.bestaetigung'), async () => {
        await api.loeschen('/api/admin/resources/' + btn.dataset.id);
        rendereRessourcenAdmin(container);
      });
    });
  });
}

// ===========================================
// Admin: Painpoints
// ===========================================

async function renderePainpointsAdmin(container) {
  const antwort = await api.get('/api/admin/painpoints');
  const punkte = antwort.ok ? antwort.daten : [];

  container.innerHTML = `
    <div class="admin-kopfzeile">
      <h2>${t('admin.painpoints')}</h2>
    </div>
    ${punkte.length === 0 ? '<p class="leer-zustand-text">Keine Painpoints vorhanden.</p>' : ''}
    <table class="tabelle" ${punkte.length === 0 ? 'style="display:none"' : ''}>
      <thead>
        <tr>
          <th>Titel</th>
          <th>Name</th>
          <th>${t('admin.status')}</th>
          <th>Datum</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${punkte.map(p => `
          <tr>
            <td title="${escapeHtml(p.beschreibung || '')}">${escapeHtml(p.titel)}</td>
            <td>${p.name ? escapeHtml(p.name) : '<em>Anonym</em>'}</td>
            <td>
              <select class="formular-select status-select" data-id="${p.id}" style="width:auto;padding:0.25rem">
                <option value="offen" ${p.status === 'offen' ? 'selected' : ''}>${t('admin.offen')}</option>
                <option value="in_bearbeitung" ${p.status === 'in_bearbeitung' ? 'selected' : ''}>${t('admin.inBearbeitung')}</option>
                <option value="erledigt" ${p.status === 'erledigt' ? 'selected' : ''}>${t('admin.erledigt')}</option>
              </select>
            </td>
            <td>${new Date(p.erstelltAm).toLocaleDateString('de-DE')}</td>
            <td class="tabelle-aktionen">
              <button class="btn btn-klein btn-gefahr" data-aktion="loeschen" data-id="${p.id}">
                &#128465;
              </button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  // Status-Aenderung
  container.querySelectorAll('.status-select').forEach(select => {
    select.addEventListener('change', async () => {
      await api.put('/api/admin/painpoints/' + select.dataset.id, {
        status: select.value
      });
      toast.erfolg('Status aktualisiert');
    });
  });

  // Loeschen
  container.querySelectorAll('[data-aktion="loeschen"]').forEach(btn => {
    btn.addEventListener('click', () => {
      modal.bestaetigung(t('admin.bestaetigung'), async () => {
        await api.loeschen('/api/admin/painpoints/' + btn.dataset.id);
        renderePainpointsAdmin(container);
      });
    });
  });
}

// ===========================================
// Admin: Neuigkeiten
// ===========================================

async function rendereNeuigkeitenAdmin(container) {
  const antwort = await api.get('/api/news');
  const news = antwort.ok ? antwort.daten : [];

  container.innerHTML = `
    <div class="admin-kopfzeile">
      <h2>${t('admin.neuigkeiten')}</h2>
      <button class="btn btn-primaer" id="news-erstellen">${t('admin.erstellen')}</button>
    </div>
    ${news.length === 0 ? '<p class="leer-zustand-text">' + t('news.leer') + '</p>' : ''}
    <table class="tabelle" ${news.length === 0 ? 'style="display:none"' : ''}>
      <thead>
        <tr>
          <th>Titel</th>
          <th>Datum</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${news.map(n => `
          <tr>
            <td>${escapeHtml(n.titel)}</td>
            <td>${new Date(n.erstelltAm).toLocaleDateString('de-DE')}</td>
            <td class="tabelle-aktionen">
              <button class="btn btn-klein btn-gefahr" data-aktion="loeschen" data-id="${n.id}">
                &#128465;
              </button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  container.querySelector('#news-erstellen').addEventListener('click', () => {
    modal.oeffne({
      titel: t('admin.erstellen') + ': ' + t('admin.neuigkeiten'),
      inhalt: `
        <div class="formular-gruppe">
          <label class="formular-label">Titel *</label>
          <input type="text" class="formular-eingabe" id="nn-titel" maxlength="200" required>
        </div>
        <div class="formular-gruppe">
          <label class="formular-label">Inhalt</label>
          <textarea class="formular-textarea" id="nn-inhalt" maxlength="5000" rows="6"></textarea>
        </div>
      `,
      bestaetigenText: t('admin.speichern'),
      abbrechenText: t('admin.abbrechen'),
      beiBestaetigung: async (overlay) => {
        const titel = overlay.querySelector('#nn-titel').value.trim();
        if (!titel) return;

        await api.post('/api/admin/news', {
          titel,
          inhalt: overlay.querySelector('#nn-inhalt').value.trim()
        });
        toast.erfolg('Neuigkeit erstellt');
        rendereNeuigkeitenAdmin(container);
      }
    });
  });

  container.querySelectorAll('[data-aktion="loeschen"]').forEach(btn => {
    btn.addEventListener('click', () => {
      modal.bestaetigung(t('admin.bestaetigung'), async () => {
        await api.loeschen('/api/admin/news/' + btn.dataset.id);
        rendereNeuigkeitenAdmin(container);
      });
    });
  });
}

// Starten
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', starte);
} else {
  starte();
}
