function installRoutePrefetch(navigation, routeResolver) {
  if (!navigation) {
    return () => {};
  }

  const prefetchedPaths = new Set();
  const prefetch = (link) => {
    const path = link.getAttribute('href');
    if (!path || prefetchedPaths.has(path)) {
      return;
    }

    const route = routeResolver(path);
    if (!route || !route.preload) {
      return;
    }

    prefetchedPaths.add(path);
    route.preload().catch(() => {
      prefetchedPaths.delete(path);
    });
  };

  const links = Array.from(navigation.querySelectorAll('.tab-link'));
  const disposers = [];

  links.forEach((link) => {
    const onHover = () => prefetch(link);
    const onFocus = () => prefetch(link);
    link.addEventListener('mouseenter', onHover);
    link.addEventListener('focus', onFocus);
    disposers.push(() => {
      link.removeEventListener('mouseenter', onHover);
      link.removeEventListener('focus', onFocus);
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
    disposers.push(() => observer.disconnect());
  }

  return () => {
    disposers.forEach((dispose) => dispose());
  };
}

export { installRoutePrefetch };