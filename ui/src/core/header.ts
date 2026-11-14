// Header details that CSS alone cannot express.

/**
 * The right side of the header (the VR button when the browser has WebXR + the coordinate search) is exactly as
 * wide as the "SPHEREx SKY | NASA 2026" brand text, which depends on the web font and the screen size, so it is
 * measured and kept in sync: the header stays symmetric and never runs into the centred menu (at 1280 px the VR
 * button used to sit under "Tools"). Below 1101px the search is an icon only.
 */
export function syncSearchWidth(): void {
  const brand = document.querySelector<HTMLElement>('#top .brand-text');
  const search = document.getElementById('searchBtn');
  const vr = document.getElementById('vrQuick');
  if (!brand || !search) return;
  const wide = matchMedia('(min-width: 1101px)');
  const apply = () => {
    if (!wide.matches) { search.style.width = ''; return; }
    const w = Math.ceil(Math.max(brand.getBoundingClientRect().width, brand.scrollWidth));
    const gap = parseFloat(getComputedStyle(search.parentElement as HTMLElement).columnGap) || 0;
    const taken = vr && !vr.hidden ? vr.offsetWidth + gap : 0;
    search.style.width = `${Math.max(120, w - taken)}px`;
  };
  new ResizeObserver(apply).observe(brand);
  if (vr) new ResizeObserver(apply).observe(vr); // shown once WebXR support is confirmed (viewer/sky/xr)
  wide.addEventListener('change', apply);
  document.fonts?.ready.then(apply).catch(() => {});
  apply();
}
