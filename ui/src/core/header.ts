// Header details that CSS alone cannot express.

/**
 * The coordinate search (#searchBtn) is exactly as wide as the "SPHEREx | NASA 2026" brand text, which depends on
 * the web font and the screen size, so it is measured and kept in sync. Below 1101px the search is an icon only.
 */
export function syncSearchWidth(): void {
  const brand = document.querySelector<HTMLElement>('#top .brand-text');
  const search = document.getElementById('searchBtn');
  if (!brand || !search) return;
  const wide = matchMedia('(min-width: 1101px)');
  const apply = () => {
    if (!wide.matches) { search.style.width = ''; return; }
    const w = Math.ceil(Math.max(brand.getBoundingClientRect().width, brand.scrollWidth));
    search.style.width = `${w}px`;
  };
  new ResizeObserver(apply).observe(brand);
  wide.addEventListener('change', apply);
  document.fonts?.ready.then(apply).catch(() => {});
  apply();
}
