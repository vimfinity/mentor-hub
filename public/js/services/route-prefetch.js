function installiereRoutenPrefetch(navigation, routeResolver) {
  if (!navigation) {
    return () => {};
  }

  const verarbeitetePfade = new Set();
  const prefetch = (link) => {
    const pfad = link.getAttribute('href');
    if (!pfad || verarbeitetePfade.has(pfad)) {
      return;
    }

    const route = routeResolver(pfad);
    if (!route || !route.preload) {
      return;
    }

    verarbeitetePfade.add(pfad);
    route.preload().catch(() => {
      verarbeitetePfade.delete(pfad);
    });
  };

  const links = Array.from(navigation.querySelectorAll('.tab-link'));
  const entkoppler = [];

  links.forEach((link) => {
    const beiHover = () => prefetch(link);
    const beiFokus = () => prefetch(link);
    link.addEventListener('mouseenter', beiHover);
    link.addEventListener('focus', beiFokus);
    entkoppler.push(() => {
      link.removeEventListener('mouseenter', beiHover);
      link.removeEventListener('focus', beiFokus);
    });
  });

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          prefetch(entry.target);
          observer.unobserve(entry.target);
        }
      });
    }, {
      root: null,
      rootMargin: '120px',
      threshold: 0.01
    });

    links.forEach((link) => observer.observe(link));
    entkoppler.push(() => observer.disconnect());
  }

  return () => {
    entkoppler.forEach((entkopple) => entkopple());
  };
}

export { installiereRoutenPrefetch };