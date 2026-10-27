import type { ContentRecord, RoutePort } from './cms-types';
import { local, type Locale } from './content';
import { listingQueryLimit, matchesListingSearch } from './listing-filters';

export type MappedRoute = ContentRecord & {
  origin: RoutePort;
  destination: RoutePort;
  waypoints: [number, number][];
};

export const ROUTE_PAGE_SIZE = 6;
export type RouteFilters = { query: string; origin: string; destination: string; page: number };
export const emptyRouteFilters: RouteFilters = { query: '', origin: '', destination: '', page: 1 };

const portKeyLimit = 600;
const normalizedPortText = (text: string) => text.normalize('NFKC').toLowerCase().replace(/[\u200B\uFEFF]/g, '').trim().replace(/\s+/g, ' ');
const displayText = (text: string) => text.trim().replace(/\s+/g, ' ');

// Use English identity fields so changing the interface language keeps the same port.
// A tuple avoids collisions when a port or country itself contains punctuation.
export function routePortKey(port: RoutePort) {
  return JSON.stringify([normalizedPortText(port.name), normalizedPortText(port.country)]);
}

export function routePortOptions(routes: readonly MappedRoute[], side: 'origin' | 'destination', locale: Locale) {
  const ports = new Map<string, { value: string; label: string }>();
  for (const route of routes) {
    const port = route[side];
    const value = routePortKey(port);
    if (ports.has(value)) continue;
    const name = displayText(local(locale, port.name, port.nameTh) || port.name || port.nameTh);
    const country = displayText(local(locale, port.country, port.countryTh) || port.country || port.countryTh);
    ports.set(value, { value, label: [name, country].filter(Boolean).join(' · ') });
  }
  return [...ports.values()].sort((a, b) => a.label.localeCompare(b.label, locale, { sensitivity: 'base' }));
}

export function filterMappedRoutes(routes: readonly MappedRoute[], filters: RouteFilters) {
  return routes.filter(route =>
    (!filters.origin || routePortKey(route.origin) === filters.origin) &&
    (!filters.destination || routePortKey(route.destination) === filters.destination) &&
    matchesListingSearch(filters.query, [
      route.title, route.titleTh, route.description, route.descriptionTh,
      route.origin.name, route.origin.nameTh, route.origin.country, route.origin.countryTh,
      route.destination.name, route.destination.nameTh, route.destination.country, route.destination.countryTh,
    ]));
}

function positivePage(value: number | string | null) {
  const page = Number(value);
  return Number.isFinite(page) ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(1, Math.floor(page))) : 1;
}

export function readRouteFilters(search: { get(name: string): string | null }): RouteFilters {
  return {
    query: (search.get('q') || '').slice(0, listingQueryLimit),
    origin: (search.get('from') || '').slice(0, portKeyLimit),
    destination: (search.get('to') || '').slice(0, portKeyLimit),
    page: positivePage(search.get('routePage')),
  };
}

export function writeRouteFilters(search: string, filters: RouteFilters) {
  const params = new URLSearchParams(search);
  const query = filters.query.slice(0, listingQueryLimit);
  const origin = filters.origin.slice(0, portKeyLimit);
  const destination = filters.destination.slice(0, portKeyLimit);
  if (query) params.set('q', query); else params.delete('q');
  if (origin) params.set('from', origin); else params.delete('from');
  if (destination) params.set('to', destination); else params.delete('to');
  const page = positivePage(filters.page);
  if (page > 1) params.set('routePage', String(page)); else params.delete('routePage');
  const value = params.toString();
  return value ? `?${value}` : '';
}

export function getRoutePage(routes: readonly MappedRoute[], requestedPage: number) {
  const total = routes.length;
  const pageCount = Math.max(1, Math.ceil(total / ROUTE_PAGE_SIZE));
  const page = Math.min(positivePage(requestedPage), pageCount);
  const offset = (page - 1) * ROUTE_PAGE_SIZE;
  return {
    items: routes.slice(offset, offset + ROUTE_PAGE_SIZE), page, pageCount, total,
    start: total ? offset + 1 : 0,
    end: Math.min(offset + ROUTE_PAGE_SIZE, total),
  };
}
