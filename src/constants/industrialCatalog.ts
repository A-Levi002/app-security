// SECURE_OS — Catálogo local de fábricas/plantas industriales (respaldo OFFLINE)
// ---------------------------------------------------------------------------
// Usado como fallback de la consulta EN VIVO a OpenStreetMap (searchIndustrialNear
// en locationApi): si no hay red o OSM no devuelve resultados, se muestra la
// fábrica más cercana de este catálogo curado (distancias por haversine).
// El catálogo son zonas/parques industriales representativos; los datos en vivo
// de OSM tienen prioridad por ser exactos por coordenada.

export interface IndustrialPoi {
  id: string;
  name: string;
  kind: string;
  lat: number;
  lng: number;
}

// Distancias en km entre dos coordenadas (fórmula de haversine).
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Parques y zonas industriales representativos (coordenadas aproximadas).
export const INDUSTRIAL_CATALOG: IndustrialPoi[] = [
  { id: 'cat-scz-1', name: 'Parque Industrial Santa Cruz', kind: 'Zona industrial', lat: -17.735, lng: -63.135 },
  { id: 'cat-scz-2', name: 'Planta Química Casablanca', kind: 'Química', lat: -17.7522, lng: -63.0735 },
  { id: 'cat-scz-3', name: 'Refinería Gualberto Villarroel', kind: 'Hidrocarburos', lat: -17.628, lng: -63.231 },
  { id: 'cat-scz-4', name: 'Curtiembre Kurtz Cotoca', kind: 'Curtido / residuos', lat: -17.77, lng: -62.99 },
  { id: 'cat-elp-1', name: 'Zona Franca Industrial El Alto', kind: 'Zona industrial', lat: -16.522, lng: -68.212 },
  { id: 'cat-elp-2', name: 'Planta Alimentos El Alto (SENASAG), viacha', kind: 'Agroindustrial', lat: -16.653, lng: -68.302 },
  { id: 'cat-central-1', name: 'Cemento Viacha (COBOCE)', kind: 'Cementera', lat: -16.659, lng: -68.287 },
  { id: 'cat-elp-3', name: 'Parque Industrial El Alto (FEJUVE)', kind: 'Industrial mixto', lat: -16.505, lng: -68.198 },
  { id: 'cat-cbba-1', name: 'Parque Industrial Cochabamba', kind: 'Zona industrial', lat: -17.372, lng: -66.132 },
  { id: 'cat-cbba-2', name: 'Planta Embotelladora Cochabamba', kind: 'Bebidas', lat: -17.391, lng: -66.155 },
  { id: 'cat-cbba-3', name: 'Fábrica Fideos Aurora (Vinto)', kind: 'Alimenticia', lat: -17.408, lng: -66.339 },
  { id: 'cat-oru-1', name: 'Fundición Vinto', kind: 'Metalúrgica', lat: -17.416, lng: -66.348 },
  { id: 'cat-lpz-1', name: 'Parque Industrial La Paz (Señor de Mayo)', kind: 'Zona industrial', lat: -16.636, lng: -68.205 },
  { id: 'cat-lpz-2', name: 'Planta FABOCEL (Papelera)', kind: 'Papelera / químicos', lat: -16.534, lng: -68.195 },
  { id: 'cat-lpz-3', name: 'Curtiembre La Paz (Mallasa)', kind: 'Curtido', lat: -16.586, lng: -68.12 },
  { id: 'cat-tja-1', name: 'Ingenio Azucarero San Buenaventura', kind: 'Agroindustrial', lat: -14.416, lng: -67.562 },
  { id: 'cat-pnd-1', name: 'Planta Petroquímica YPFB Gran Chaco', kind: 'Petroquímica', lat: -21.277, lng: -63.176 },
  { id: 'cat-pnd-2', name: 'Refinería Guillermo Elder Bell (Santa Cruz)', kind: 'Hidrocarburos', lat: -17.8, lng: -63.16 },
  { id: 'cat-lla-1', name: 'Planta de Ácido Sulfúrico (Huanchaca)', kind: 'Minería / químicos', lat: -19.526, lng: -67.952 },
];

// Fábrica del catálogo más cercana al punto (o null si no hay en el radio).
export function findNearestIndustrial(
  lat: number,
  lng: number,
  radiusKm = 15
): (IndustrialPoi & { distanceKm: number }) | null {
  let best: { poi: IndustrialPoi; distanceKm: number } | null = null;
  for (const poi of INDUSTRIAL_CATALOG) {
    const d = haversineKm(lat, lng, poi.lat, poi.lng);
    if (d <= radiusKm && (!best || d < best.distanceKm)) {
      best = { poi, distanceKm: d };
    }
  }
  return best ? { ...best.poi, distanceKm: best.distanceKm } : null;
}

// Formatea la distancia (1 cifra; <1 km sin decimales).
export function formatDistanceKm(km: number): string {
  if (km < 1) return `${Math.max(0.1, Math.round(km * 10) / 10).toFixed(1)} km`;
  if (km >= 10) return `${Math.round(km)} km`;
  return `${Math.round(km * 10) / 10} km`;
}