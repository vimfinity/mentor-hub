function normalisierePfad(pfad) {
  if (!pfad) {
    return '/';
  }

  let normalisierterPfad = pfad;

  try {
    normalisierterPfad = new URL(pfad, window.location.origin).pathname;
  } catch (error) {
    normalisierterPfad = pfad;
  }

  if (!normalisierterPfad.startsWith('/')) {
    normalisierterPfad = '/' + normalisierterPfad;
  }

  if (normalisierterPfad.length > 1) {
    normalisierterPfad = normalisierterPfad.replace(/\/+$/, '');
  }

  return normalisierterPfad || '/';
}

function holeUrlObjekt(ziel) {
  return new URL(ziel || window.location.href, window.location.origin);
}

function erstelleRouter() {
  const routen = new Map();
  const hoerer = [];
  let aktuellerPfad = normalisierePfad(window.location.pathname);
  let istGestartet = false;

  function registriereRoute(pfad, daten) {
    routen.set(normalisierePfad(pfad), daten);
    return api;
  }

  function findeRoute(pfad = aktuellerPfad) {
    return routen.get(normalisierePfad(pfad)) || null;
  }

  function holeAktuellenStand() {
    const url = holeUrlObjekt(window.location.href);
    return {
      pfad: aktuellerPfad,
      route: findeRoute(aktuellerPfad),
      url,
      suchparameter: new URLSearchParams(url.search)
    };
  }

  function benachrichtige() {
    aktuellerPfad = normalisierePfad(window.location.pathname);
    const stand = holeAktuellenStand();
    hoerer.forEach((listener) => {
      listener(stand);
    });
  }

  function navigiereZu(pfad, optionen = {}) {
    const zielUrl = holeUrlObjekt(pfad || window.location.href);
    const zielpfad = normalisierePfad(zielUrl.pathname);
    const zielSuche = zielUrl.search || '';
    const methode = optionen.ersetzen ? 'replaceState' : 'pushState';
    const aktuellesZiel = window.location.pathname + window.location.search;
    const neuesZiel = zielpfad + zielSuche;

    if (neuesZiel === aktuellesZiel && !optionen.erzwingen) {
      benachrichtige();
      return;
    }

    window.history[methode]({}, '', neuesZiel);
    benachrichtige();
  }

  function ersetzePfad(pfad) {
    navigiereZu(pfad, { ersetzen: true });
  }

  function setzeSuchparameter(aenderungen, optionen = {}) {
    const url = holeUrlObjekt(window.location.href);
    const suchparameter = new URLSearchParams(url.search);

    Object.keys(aenderungen).forEach((schluessel) => {
      const wert = aenderungen[schluessel];
      if (wert === undefined || wert === null || wert === '') {
        suchparameter.delete(schluessel);
        return;
      }

      suchparameter.set(schluessel, String(wert));
    });

    const query = suchparameter.toString();
    navigiereZu(url.pathname + (query ? '?' + query : ''), optionen);
  }

  function aufAenderung(listener) {
    hoerer.push(listener);

    return () => {
      const index = hoerer.indexOf(listener);
      if (index >= 0) {
        hoerer.splice(index, 1);
      }
    };
  }

  function starte() {
    if (!istGestartet) {
      window.addEventListener('popstate', benachrichtige);
      istGestartet = true;
    }

    benachrichtige();

    return () => {
      if (istGestartet) {
        window.removeEventListener('popstate', benachrichtige);
        istGestartet = false;
      }
    };
  }

  const api = {
    registriereRoute,
    navigiereZu,
    ersetzePfad,
    setzeSuchparameter,
    aufAenderung,
    starte,
    holeAktuellenStand
  };

  return api;
}

export { erstelleRouter, normalisierePfad };