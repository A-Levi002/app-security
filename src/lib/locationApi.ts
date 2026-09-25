// Capa de geolocalización con proveedor intercambiable:
// - MyMappi: se activa al setear EXPO_PUBLIC_MYMAPPI_API_KEY (y opcional
//   EXPO_PUBLIC_MYMAPPI_BASE_URL). Endpoints basados en el SDK oficial
//   (mymappi-sdk); si una petición falla se degrada al fallback gratis.
// - Fallback gratis: Photon (geocoding/autocomplete) + OSRM público (rutas).
// Cada función devuelve null en lugar de lanzar, para que los callers sigan
// usando su comportamiento actual (curva simulada, coords numéricas, etc.).

import {
  findNearestIndustrial,
  haversineKm,
  type IndustrialPoi,
} from '../constants/industrialCatalog';

export interface PlaceResult {
  id: string;
  name: string;
  label: string;
  lat: number;
  lng: number;
}

export interface RouteResult {
  coordinates: { lat: number; lng: number }[];
  distanceMeters?: number;
  durationSeconds?: number;
}

const MYMAPPI_KEY = process.env.EXPO_PUBLIC_MYMAPPI_API_KEY;
const MYMAPPI_BASE = process.env.EXPO_PUBLIC_MYMAPPI_BASE_URL || 'https://api.mymappi.com';

const REQUEST_TIMEOUT_MS = 8000;

type JsonRecord = { [key: string]: unknown };

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim() : undefined;

const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

const asRec = (v: unknown): JsonRecord =>
  v && typeof v === 'object' ? (v as JsonRecord) : {};

const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {}
): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) return null;
    return res;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function cleanLabel(parts: (string | undefined | null)[]): string {
  const out: string[] = [];
  for (const p of parts) {
    const t = (p || '').trim();
    if (t && out.indexOf(t) === -1) out.push(t);
  }
  return out.join(', ');
}

// ---------------------------------------------------------------- MyMappi ---

async function mymappiSearch(
  query: string,
  country: string
): Promise<PlaceResult[] | null> {
  const params = new URLSearchParams({
    q: query,
    layers: 'address,street,venue',
    limit: '6',
  });
  if (country) params.set('country', country);
  const url = `${MYMAPPI_BASE}/geocoding?${params.toString()}`;
  const res = await fetchWithTimeout(url, {
    headers: { accept: 'application/json', 'x-api-key': MYMAPPI_KEY || '' },
  });
  if (!res) return null;
  const data = asRec(await res.json());
  const items = Array.isArray(data)
    ? data
    : asArray(data.results).length
      ? asArray(data.results)
      : asArray(data.features);

  const out: PlaceResult[] = [];
  for (const raw of items) {
    const item = asRec(raw);
    const props = asRec(item.properties);
    const geometry = asRec(item.geometry);
    const coords = asArray(geometry.coordinates);
    const lat =
      num(item.latitude) ?? num(item.lat) ?? (coords.length >= 2 ? num(coords[1]) : undefined);
    const lng =
      num(item.longitude) ?? num(item.lon) ?? (coords.length >= 2 ? num(coords[0]) : undefined);
    const name =
      str(props.name) ||
      str(item.label) ||
      str(item.name) ||
      str(props.label) ||
      'Lugar';
    const label =
      str(item.label) ||
      cleanLabel([
        str(props.name) || str(item.name),
        str(props.housenumber),
        str(props.street),
        str(props.district),
        str(props.city),
        str(props.state),
        str(props.country),
      ]);
    if (lat !== undefined && lng !== undefined && label) {
      out.push({ id: String(item.id ?? `${lng},${lat}-${out.length}`), name, label, lat, lng });
    }
  }
  return out.length > 0 ? out : null;
}

async function mymappiReverse(lat: number, lng: number): Promise<string | null> {
  const url = `${MYMAPPI_BASE}/reverse?latitude=${lat}&longitude=${lng}`;
  const res = await fetchWithTimeout(url, {
    headers: { accept: 'application/json', 'x-api-key': MYMAPPI_KEY || '' },
  });
  if (!res) return null;
  const data = asRec(await res.json());
  const props = asRec(data.properties).name ? asRec(data.properties) : asRec(data.address);
  const label = cleanLabel([
    str(props.name),
    str(props.street),
    str(props.district),
    str(props.city),
    str(props.state),
    str(props.country),
  ]);
  return label || null;
}

async function mymappiDirections(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): Promise<RouteResult | null> {
  const url = `${MYMAPPI_BASE}/directions?origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}`;
  const res = await fetchWithTimeout(url, {
    headers: { accept: 'application/json', 'x-api-key': MYMAPPI_KEY || '' },
  });
  if (!res) return null;
  const data = asRec(await res.json());
  const routeRec = asRec(asArray(data.routes)[0]) || data;
  const coords = asArray(asRec(routeRec.geometry).coordinates);
  if (coords.length < 2) return null;
  const coordinates = coords
    .map((c) => {
      const arr = asArray(c);
      const lng = num(arr[0]);
      const lat = num(arr[1]);
      return lng !== undefined && lat !== undefined ? { lat, lng } : null;
    })
    .filter((c): c is { lat: number; lng: number } => c !== null);
  if (coordinates.length < 2) return null;
  return {
    coordinates,
    distanceMeters: num(routeRec.distance),
    durationSeconds: num(routeRec.duration),
  };
}

// ------------------------------------------------------------- Fallback -----

async function photonSearch(
  query: string,
  near: { lat: number; lng: number } | undefined,
  limit: number
): Promise<PlaceResult[] | null> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  if (near) {
    params.set('lat', String(near.lat));
    params.set('lon', String(near.lng));
  }
  const res = await fetchWithTimeout(`https://photon.komoot.io/api/?${params.toString()}`);
  if (!res) return null;
  const data = asRec(await res.json());
  const out: PlaceResult[] = [];
  for (const raw of asArray(data.features)) {
    const feature = asRec(raw);
    const geometry = asRec(feature.geometry);
    const props = asRec(feature.properties);
    const coords = asArray(geometry.coordinates);
    const lng = num(coords[0]);
    const lat = num(coords[1]);
    const name = str(props.name) || str(props.street) || str(props.city) || str(props.country) || 'Lugar';
    const label = cleanLabel([
      str(props.name),
      str(props.housenumber) && str(props.street)
        ? `${str(props.housenumber)} ${str(props.street)}`
        : str(props.street),
      str(props.district),
      str(props.city),
      str(props.state),
      str(props.country),
    ]);
    if (lat !== undefined && lng !== undefined && label) {
      out.push({ id: `${lng},${lat}-${out.length}`, name, label, lat, lng });
    }
  }
  return out.length > 0 ? out : null;
}

async function photonReverse(lat: number, lng: number): Promise<string | null> {
  const res = await fetchWithTimeout(
    `https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}`
  );
  if (!res) return null;
  const data = asRec(await res.json());
  const props = asRec(asRec(asArray(data.features)[0]).properties);
  const label = cleanLabel([
    str(props.name),
    str(props.housenumber) && str(props.street)
      ? `${str(props.housenumber)} ${str(props.street)}`
      : str(props.street),
    str(props.district),
    str(props.city),
    str(props.state),
    str(props.country),
  ]);
  return label || null;
}

async function osrmDirections(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): Promise<RouteResult | null> {
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
  const res = await fetchWithTimeout(url);
  if (!res) return null;
  const data = asRec(await res.json());
  const routeRec = asRec(asArray(data.routes)[0]);
  const coords = asArray(asRec(routeRec.geometry).coordinates);
  if (coords.length < 2) return null;
  const coordinates = coords
    .map((c) => {
      const arr = asArray(c);
      const lng = num(arr[0]);
      const lat = num(arr[1]);
      return lng !== undefined && lat !== undefined ? { lat, lng } : null;
    })
    .filter((c): c is { lat: number; lng: number } => c !== null);
  if (coordinates.length < 2) return null;
  return {
    coordinates,
    distanceMeters: num(routeRec.distance),
    durationSeconds: num(routeRec.duration),
  };
}

// -------------------------------------------------------------- Public ------

export async function searchPlaces(
  query: string,
  opts: { country?: string; near?: { lat: number; lng: number }; limit?: number } = {}
): Promise<PlaceResult[]> {
  const q = query.trim();
  if (!q) return [];
  const country = opts.country || 'BO';
  const limit = opts.limit || 6;
  if (MYMAPPI_KEY) {
    const res = await mymappiSearch(q, country);
    if (res) return res;
  }
  const fallback = await photonSearch(q, opts.near, limit);
  return fallback || [];
}

export async function reverseGeocode(
  lat: number,
  lng: number
): Promise<string | null> {
  if (MYMAPPI_KEY) {
    const res = await mymappiReverse(lat, lng);
    if (res) return res;
  }
  return photonReverse(lat, lng);
}

export async function directions(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): Promise<RouteResult | null> {
  if (MYMAPPI_KEY) {
    const res = await mymappiDirections(from, to);
    if (res) return res;
  }
  return osrmDirections(from, to);
}

// ------------------------------------------------------------- Industrial ----

export interface IndustrialResult extends IndustrialPoi {
  distanceKm: number;
}

// Fábricas/plantas industriales CERCANAS: primero OpenStreetMap EN VIVO vía
// Photon (osm_tag) y, si no hay red o resultados, el catálogo local como
// respaldo offline. Ordenadas por distancia.
export async function searchIndustrialNear(
  lat: number,
  lng: number,
  radiusKm = 15,
  limit = 8
): Promise<IndustrialResult[]> {
  const out: IndustrialResult[] = [];

  try {
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lng),
      limit: String(Math.min(40, limit * 4)),
    });
    params.append('osm_tag', 'landuse:industrial');
    params.append('osm_tag', 'man_made:works');
    params.append('osm_tag', 'building:industrial');
    const res = await fetchWithTimeout(
      `https://photon.komoot.io/api/?${params.toString()}`
    );
    if (res) {
      const data = asRec(await res.json());
      for (const raw of asArray(data.features)) {
        const feature = asRec(raw);
        const geometry = asRec(feature.geometry);
        const props = asRec(feature.properties);
        const coords = asArray(geometry.coordinates);
        const plng = num(coords[0]);
        const plat = num(coords[1]);
        if (plat === undefined || plng === undefined) continue;
        const d = haversineKm(lat, lng, plat, plng);
        if (d > radiusKm) continue;
        const name =
          str(props.name) ||
          (str(props.street) ? `Planta industrial, ${str(props.street)}` : '') ||
          'Planta industrial';
        if (!name) continue;
        const kind = str(props.osm_value) || 'industria';
        const key = `${plng.toFixed(4)},${plat.toFixed(4)}`;
        if (out.some((o) => o.name === name || `${o.lng.toFixed(4)},${o.lat.toFixed(4)}` === key)) continue;
        out.push({
          id: key,
          name,
          kind,
          lat: plat,
          lng: plng,
          distanceKm: Math.round(d * 10) / 10,
        });
      }
    }
  } catch {
    // sin red: caemos al catálogo local
  }

  if (out.length === 0) {
    const nearest = findNearestIndustrial(lat, lng, radiusKm);
    if (nearest) {
      out.push({
        id: nearest.id,
        name: nearest.name,
        kind: nearest.kind,
        lat: nearest.lat,
        lng: nearest.lng,
        distanceKm: Math.round(nearest.distanceKm * 10) / 10,
      });
    }
  }

  return out.sort((a, b) => a.distanceKm - b.distanceKm).slice(0, limit);
}