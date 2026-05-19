const STANDARD_TTL_MS = 5 * 60 * 1000;
const abfragen = new Map();

function normalisiereSchluessel(schluessel) {
  if (Array.isArray(schluessel)) {
    return JSON.stringify(schluessel);
  }

  return String(schluessel);
}

function istCachebar(daten) {
  if (!daten || typeof daten !== 'object' || !('ok' in daten)) {
    return true;
  }

  return daten.ok;
}

async function holeAbfrage({ schluessel, abrufFunktion, ttlMs = STANDARD_TTL_MS }) {
  const normalisierterSchluessel = normalisiereSchluessel(schluessel);
  const jetzt = Date.now();
  const vorhandenerEintrag = abfragen.get(normalisierterSchluessel);

  if (vorhandenerEintrag) {
    if (vorhandenerEintrag.status === 'laeuft') {
      return vorhandenerEintrag.promise;
    }

    if (vorhandenerEintrag.status === 'erfolgreich' && vorhandenerEintrag.gueltigBis > jetzt) {
      return vorhandenerEintrag.daten;
    }
  }

  const promise = Promise.resolve()
    .then(() => abrufFunktion())
    .then((daten) => {
      if (!istCachebar(daten)) {
        abfragen.delete(normalisierterSchluessel);
        return daten;
      }

      abfragen.set(normalisierterSchluessel, {
        status: 'erfolgreich',
        daten,
        gueltigBis: Date.now() + ttlMs
      });

      return daten;
    })
    .catch((fehler) => {
      abfragen.delete(normalisierterSchluessel);
      throw fehler;
    });

  abfragen.set(normalisierterSchluessel, {
    status: 'laeuft',
    promise,
    gueltigBis: jetzt + ttlMs
  });

  return promise;
}

function invalidiereAbfrage(schluessel) {
  abfragen.delete(normalisiereSchluessel(schluessel));
}

function invalidiereAbfragenMitPraefix(praefix) {
  const normalisiertesPraefix = normalisiereSchluessel(praefix);

  for (const schluessel of abfragen.keys()) {
    if (schluessel.startsWith(normalisiertesPraefix)) {
      abfragen.delete(schluessel);
    }
  }
}

export {
  holeAbfrage,
  invalidiereAbfrage,
  invalidiereAbfragenMitPraefix,
  STANDARD_TTL_MS
};