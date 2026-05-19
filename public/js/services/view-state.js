function normalisiereAuswahl(wert, erlaubteWerte, standardWert) {
  return erlaubteWerte.includes(wert) ? wert : standardWert;
}

function normalisiereSeite(wert) {
  const geparsteSeite = Number.parseInt(wert, 10);

  if (!Number.isFinite(geparsteSeite) || geparsteSeite < 1) {
    return 1;
  }

  return geparsteSeite;
}

function paginiereElemente(elemente, angeforderteSeite, elementeProSeite) {
  const gesamtElemente = elemente.length;
  const gesamtSeiten = Math.max(1, Math.ceil(gesamtElemente / elementeProSeite));
  const aktuelleSeite = Math.min(normalisiereSeite(angeforderteSeite), gesamtSeiten);
  const startIndex = (aktuelleSeite - 1) * elementeProSeite;

  return {
    elemente: elemente.slice(startIndex, startIndex + elementeProSeite),
    aktuelleSeite,
    gesamtSeiten,
    gesamtElemente,
    startIndex
  };
}

export {
  normalisiereAuswahl,
  normalisiereSeite,
  paginiereElemente
};