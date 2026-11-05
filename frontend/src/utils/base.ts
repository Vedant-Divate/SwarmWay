/**
 * Deployment base path for GitHub project pages.
 *
 * When the site is served from a project-page subpath
 * (https://<user>.github.io/<repo>/) every asset, navigation target and
 * pathname must be relative to that subpath. VITE_BASE_PATH is set at build
 * time (CI sets it to /<repo>/) and defaults to '/' for local development and
 * for the root domain.
 */
export const BASE_PATH: string = (import.meta.env.VITE_BASE_PATH as string | undefined) ?? '/';

/** Strip the base prefix from a browser pathname so the router sees clean routes. */
export function stripBase(pathname: string): string {
  const clean = pathname.split('?')[0].replace(/\/+$/, '') || '/';
  if (BASE_PATH === '/' || BASE_PATH === '') return clean;
  const base = BASE_PATH.endsWith('/') ? BASE_PATH.slice(0, -1) : BASE_PATH;
  if (clean === base) return '/';
  if (clean.startsWith(base + '/')) return clean.slice(base.length) || '/';
  return clean;
}

/** Build a base-aware absolute href for client-side navigation. */
export function toHref(route: string): string {
  const base = BASE_PATH.endsWith('/') ? BASE_PATH.slice(0, -1) : BASE_PATH;
  if (base === '' || base === '/') return route;
  const r = route.startsWith('/') ? route.slice(1) : route;
  return `${base}/${r}`;
}
