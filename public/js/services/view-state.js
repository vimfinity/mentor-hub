function normalizeSelection(value, allowedValues, defaultValue) {
  return allowedValues.includes(value) ? value : defaultValue;
}

function normalizePage(value) {
  const parsedPage = Number.parseInt(value, 10);

  if (!Number.isFinite(parsedPage) || parsedPage < 1) {
    return 1;
  }

  return parsedPage;
}

function paginateItems(items, requestedPage, itemsPerPage) {
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const currentPage = Math.min(normalizePage(requestedPage), totalPages);
  const startIndex = (currentPage - 1) * itemsPerPage;

  return {
    items: items.slice(startIndex, startIndex + itemsPerPage),
    currentPage,
    totalPages,
    totalItems,
    startIndex
  };
}

export {
  normalizeSelection,
  normalizePage,
  paginateItems
};