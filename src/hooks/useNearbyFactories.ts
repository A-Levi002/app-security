import { useEffect, useState } from 'react';
import { searchIndustrialNear, type IndustrialResult } from '../lib/locationApi';

// Cache por coordenadas redondeadas resumidas: no relanzar la búsqueda OSM cada
// re-render ni por micro-movimientos del GPS.
const cache = new Map<string, IndustrialResult[]>();

const cacheKey = (lat: number, lng: number): string => `${lat.toFixed(3)},${lng.toFixed(3)}`;

/**
 * Fábricas/plantas industriales cercanas a las coordenadas del reporte.
 * Prioridad: OpenStreetMap (Photon, osm_tag) en vivo; fallback al catálogo local.
 * Devuelve la lista ordenada (de menor a mayor distancia) y la más cercana.
 *
 * Con cache, la lista llega ya en el render inicial. Sin coords válidas la
 * lista devuelta siempre es vacía. Nunca setea estado de forma síncrona dentro
 * del efecto (regla react-hooks/set-state-in-effect).
 */
export function useNearbyFactories(coords?: { lat: number; lng: number } | null, radiusKm = 15) {
  const key =
    coords && coords.lat !== 0
      ? cacheKey(coords.lat, coords.lng)
      : null;

  const [factories, setFactories] = useState<IndustrialResult[]>(() =>
    key && cache.has(key) ? cache.get(key)! : []
  );

  useEffect(() => {
    if (!key) return;
    if (!coords || coords.lat === 0) return;
    if (cache.has(key)) return;

    let cancelled = false;
    const lat = coords.lat;
    const lng = coords.lng;
    searchIndustrialNear(lat, lng, radiusKm)
      .then((res) => {
        if (cancelled) return;
        cache.set(key, res);
        setFactories(res);
      })
      .catch(() => {
        if (!cancelled) cache.set(key, []);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, radiusKm]);

  const effective = key ? factories : [];
  const nearest = effective[0] ?? null;

  return { factories: effective, nearest };
}