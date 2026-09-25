import React, { useRef, useState, useMemo, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import {
  Map,
  Camera,
  ViewAnnotation,
  GeoJSONSource,
  Layer,
  type CameraRef,
  type MapRef,
} from '@maplibre/maplibre-react-native';
import type { StyleSpecification } from '@maplibre/maplibre-gl-style-spec';
import {
  Layers,
  Crosshair,
  Copy,
  Check,
  Car,
  Plus,
  Minus,
  Shield,
  Leaf,
  Maximize2,
  Navigation,
  MapPin,
  AlertTriangle,
  Factory,
} from 'lucide-react-native';
import { EmergencyCategory } from '../types';
import { directions } from '../lib/locationApi';

// ---------------------------------------------------------------------------
// IncidentMap (MapLibre) — reemplaza react-native-maps/Google por tiles libres
// sin API key. API de MapLibre v11:
// - "dark" (Táctico) usa el estilo VECTORIAL CARTO "dark-matter" (URL JSON):
//   el raster `dark_all` quedó deprecado y hoy incrusta un watermark
//   "API KEY REQUIRED" en cada tile → se eliminó.
// - "satellite" usa Esri World_Imagery, pero con fallback automático a la
//   capa Táctico si los tiles no cargan (esri es intermitente); el mapa nunca
//   se queda en blanco.
// <Map mapStyle> (string | StyleSpecification) + <Camera initialViewState> /
// <ViewAnnotation> / <GeoJSONSource> + <Layer type="line"|"circle" paint={...}>.
// Props y React.memo intactos: las pantallas consumidoras no cambian.
// ---------------------------------------------------------------------------

export type MapTileLayer = 'dark' | 'satellite' | 'street' | 'terrain';

// JSON de estilo (raster) por capa, sin key. La atribución la muestra el
// propio mapa (attribution) y queda registrada en cada source.
const rasterStyle = (
  tiles: string,
  maxzoom: number,
  attribution: string
): StyleSpecification => ({
  version: 8,
  sources: {
    raster: {
      type: 'raster',
      tiles: [tiles],
      tileSize: 256,
      maxzoom,
      attribution,
    },
  },
  layers: [{ id: 'raster', type: 'raster', source: 'raster' }],
});

// Estilos por capa. "dark" es un estilo vectorial CARTO (JSON) — los raster de
// CARTO sin key quedaron con watermark "API KEY REQUIRED".
const LAYER_STYLES: Record<MapTileLayer, StyleSpecification | string> = {
  street: rasterStyle(
    'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    19,
    '© OpenStreetMap contributors'
  ),
  terrain: rasterStyle(
    'https://a.tile.opentopomap.org/{z}/{x}/{y}.png',
    17,
    '© OpenTopoMap (CC-BY-SA) · © OpenStreetMap contributors'
  ),
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  satellite: rasterStyle(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    18,
    '© Esri · Maxar · Earthstar Geographics · © OpenStreetMap contributors'
  ),
};

const LAYER_LABELS: Record<MapTileLayer, string> = {
  dark: 'Táctico',
  satellite: 'Satélite',
  street: 'Calles',
  terrain: 'Relieve',
};

// Convierte latitudeDelta (vieja API) a nivel de zoom de MapLibre.
const deltaToZoom = (delta: number) =>
  15 - Math.log2(Math.max(0.002, Math.min(0.5, delta)) / 0.01);

// Aproximación visual del radio de seguridad (200 m) a píxeles según zoom.
// metros->px = 200 / (156543.03392 * cos(lat) / 2^zoom)  (~lat -17: cos~0.95).
const RADIUS_PX_EXPR = [
  'interpolate',
  ['linear'],
  ['zoom'],
  12,
  6,
  14,
  22,
  16,
  88,
  18,
  350,
  19,
  700,
] as const;

const clampZoom = (z: number) => Math.max(6, Math.min(19, z));

interface IncidentMapProps {
  coordinates: { lat: number; lng: number };
  title?: string;
  locationName?: string;
  category?: EmergencyCategory | string;
  interactive?: boolean;
  height?: number;
  showControls?: boolean;
  unitAssigned?: string;
  originDepot?: string;
  initialLayer?: MapTileLayer;
  showRoute?: boolean;
  unitCoordinates?: { lat: number; lng: number };
  fullScreen?: boolean;
  onExpand?: () => void;
  /** Fábricas/plantas industriales cercanas (punto del incidente incluido si no
   *  está anotado con "sustancia aquí"). Marcadores discretos en cualquier capa. */
  pois?: { id: string; name: string; lat: number; lng: number; kind?: string }[];
  /** Altura (px) de la UI que cubre la parte inferior (ej. HUD de seguimiento).
   *  Eleva los badges inferiores y centra el rail de controles en el área visible. */
  bottomSafeOffset?: number;
}

const CATEGORY_COLOR: Record<string, string> = {
  traffic: '#f97316',
  fire: '#ef4444',
  medical: '#06b6d4',
  robbery: '#eab308',
  // ODS 12 — verde ambiental que contrasta con el tema táctico oscuro
  ambiental: '#22c55e',
  default: '#38bdf8',
};

export const IncidentMap = React.memo(function IncidentMap({
  coordinates,
  locationName,
  category = 'traffic',
  interactive = true,
  height = 240,
  showControls = true,
  unitAssigned,
  originDepot,
  initialLayer = 'dark',
  showRoute = false,
  unitCoordinates,
  fullScreen = false,
  onExpand,
  bottomSafeOffset = 0,
  pois,
}: IncidentMapProps) {
  const mapRef = useRef<MapRef>(null);
  const cameraRef = useRef<CameraRef>(null);
  const [activeLayer, setActiveLayer] = useState<MapTileLayer>(initialLayer);
  const [copiedCoords, setCopiedCoords] = useState(false);
  const [showLayerDrawer, setShowLayerDrawer] = useState(false);
  const [satelliteFallback, setSatelliteFallback] = useState(false);
  const satelliteLoadedRef = useRef(false);
  const [currentZoom, setCurrentZoom] = useState(() =>
    clampZoom(Math.round(deltaToZoom(0.02)))
  );
  const [routeCoordinates, setRouteCoordinates] = useState<{ lat: number; lng: number }[] | null>(null);

  const markerColor = CATEGORY_COLOR[category as string] || CATEGORY_COLOR.default;

  const incidentLngLat = useMemo<[number, number]>(
    () => [coordinates.lng, coordinates.lat],
    [coordinates]
  );

  // Punto simulado de la unidad si no se provee (offset hacia noreste).
  const unitCoords = useMemo(
    () =>
      unitCoordinates || {
        lat: coordinates.lat + 0.01,
        lng: coordinates.lng + 0.012,
      },
    [unitCoordinates, coordinates]
  );
  const unitLngLat = useMemo<[number, number]>(
    () => [unitCoords.lng, unitCoords.lat],
    [unitCoords]
  );

  // Ruta real (OSRM/MyMappi) entre unidad e incidente; si falla, mantiene la
  // curva simulada de 3 puntos.
  const routeCoords = useMemo(
    () =>
      routeCoordinates ||
      [
        unitCoords,
        {
          lat: (unitCoords.lat + coordinates.lat) / 2 + 0.002,
          lng: (unitCoords.lng + coordinates.lng) / 2 - 0.002,
        },
        coordinates,
      ],
    [routeCoordinates, unitCoords, coordinates]
  );

  useEffect(() => {
    if (!showRoute) return;
    let cancelled = false;
    directions({ lat: unitCoords.lat, lng: unitCoords.lng }, coordinates)
      .then((route) => {
        if (!cancelled) setRouteCoordinates(route?.coordinates ?? null);
      })
      .catch(() => {
        if (!cancelled) setRouteCoordinates(null);
      });
    return () => {
      cancelled = true;
    };
  }, [showRoute, unitCoords, coordinates]);

  const routeFeature = useMemo(() => {
    const coords: [number, number][] = routeCoords.map((c) => [c.lng, c.lat]);
    return {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          geometry: { type: 'LineString' as const, coordinates: coords },
          properties: {},
        },
      ],
    };
  }, [routeCoords]);

  const radiusFeature = useMemo(() => {
    return {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: incidentLngLat },
          properties: {},
        },
      ],
    };
  }, [incidentLngLat]);

  const handleCopyCoords = () => {
    const text = `${coordinates.lat.toFixed(5)}, ${coordinates.lng.toFixed(5)}`;
    Clipboard.setStringAsync(text);
    setCopiedCoords(true);
    setTimeout(() => setCopiedCoords(false), 1800);
  };

  const recenter = () => {
    cameraRef.current?.flyTo({
      center: incidentLngLat,
      zoom: currentZoom,
      duration: 450,
    });
  };

  const zoomBy = (factor: number) => {
    const next = clampZoom(Math.round(currentZoom + (factor < 1 ? -1 : 1)));
    setCurrentZoom(next);
    cameraRef.current?.zoomTo(next, { duration: 300 });
  };

  const centerUnit = () => {
    cameraRef.current?.flyTo({ center: unitLngLat, zoom: 15, duration: 450 });
  };

  const fitAllBounds = () => {
    const lats = [unitCoords.lat, coordinates.lat];
    const lngs = [unitCoords.lng, coordinates.lng];
    cameraRef.current?.fitBounds(
      [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)],
      { padding: { top: 40, right: 40, bottom: 40, left: 40 }, duration: 450 }
    );
  };

  const onRegionDidChange = useCallback((event: { nativeEvent: { zoom?: number } }) => {
    const zoom = event.nativeEvent?.zoom;
    if (typeof zoom === 'number') {
      setCurrentZoom((prev) => (Math.abs(zoom - prev) > 0.1 ? clampZoom(zoom) : prev));
    }
  }, []);

  // Fallback del satélite: Esri es intermitente (a veces no responde). Si la
  // capa no termina de cargar en 15 s (o falla al cargar), cambiamos a Táctico
  // para que el mapa jamás se vea en blanco.
  const fallbackToTactical = useCallback(() => {
    setActiveLayer('dark');
    setSatelliteFallback(true);
    setTimeout(() => setSatelliteFallback(false), 4000);
  }, []);

  useEffect(() => {
    if (activeLayer !== 'satellite') return;
    satelliteLoadedRef.current = false;
    const timer = setTimeout(() => {
      if (!satelliteLoadedRef.current) fallbackToTactical();
    }, 15000);
    return () => clearTimeout(timer);
  }, [activeLayer, fallbackToTactical]);

  // En mapas compactos (tarjeta del chat / historial) ocultamos los botones
  // de encuadre/centro-unidad para que el rail no se desborde del contenedor.
  const compact = !fullScreen && (height || 240) < 260;

  // Opciones del selector de capas (compartido por ambos layouts de controles).
  const layerOptions = (Object.keys(LAYER_LABELS) as MapTileLayer[]).map((layer) => (
    <TouchableOpacity
      key={layer}
      style={[styles.layerOption, activeLayer === layer && styles.layerOptionActive]}
      onPress={() => {
        setActiveLayer(layer);
        setShowLayerDrawer(false);
      }}
    >
      <Text style={[styles.layerOptionText, activeLayer === layer && styles.layerOptionTextActive]}>
        {LAYER_LABELS[layer]}
      </Text>
    </TouchableOpacity>
  ));

  return (
    <View style={[styles.container, !fullScreen && { height }]}>
      <Map
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        mapStyle={LAYER_STYLES[activeLayer]}
        androidView="texture"
        dragPan={interactive}
        touchZoom={interactive}
        doubleTapZoom={interactive}
        doubleTapHoldZoom={interactive}
        touchRotate={interactive}
        touchPitch={interactive}
        attribution
        attributionPosition={{ top: 8, left: 8 }}
        logo={false}
        compass={false}
        tintColor="#c4c7c8"
        onRegionDidChange={onRegionDidChange}
        onDidFinishLoadingMap={() => {
          satelliteLoadedRef.current = true;
        }}
        onDidFailLoadingMap={() => {
          if (activeLayer === 'satellite') fallbackToTactical();
        }}
      >
        <Camera
          ref={cameraRef}
          initialViewState={{
            center: incidentLngLat,
            zoom: clampZoom(Math.round(deltaToZoom(0.02))),
          }}
          minZoom={5}
          maxZoom={19}
        />

        {/* Radio de seguridad (200 m, aproximado en píxeles por zoom) */}
        <GeoJSONSource id="radius-source" data={radiusFeature}>
          <Layer
            id="radius-layer"
            type="circle"
            source="radius-source"
            paint={{
              'circle-color': `${markerColor}22`,
              'circle-radius': RADIUS_PX_EXPR as unknown as number,
              'circle-stroke-width': 3,
              'circle-stroke-color': `${markerColor}55`,
            }}
          />
        </GeoJSONSource>

        {/* Ruta entre unidad e incidente */}
        {(showRoute || unitAssigned) && (
          <GeoJSONSource id="route-source" data={routeFeature}>
            <Layer
              id="route-layer"
              type="line"
              source="route-source"
              paint={{
                'line-color': '#ffffff',
                'line-width': 4,
                'line-dasharray': [6, 6],
              }}
            />
          </GeoJSONSource>
        )}

        {/* Marcador del incidente (ícono ambiental distinto para ODS 12) */}
        <ViewAnnotation id="incident-annotation" lngLat={incidentLngLat} anchor="center">
          <View style={[styles.incidentMarker, { borderColor: markerColor }]}>
            {category === 'ambiental' ? <Leaf size={14} color={markerColor} /> : <Shield size={14} color={markerColor} />}
          </View>
        </ViewAnnotation>

        {/* Marcador de la unidad asignada */}
        {(showRoute || unitAssigned) && (
          <ViewAnnotation id="unit-annotation" lngLat={unitLngLat} anchor="center">
            <View style={styles.unitMarker}>
              <Car size={14} color="#0a0a0c" />
            </View>
          </ViewAnnotation>
        )}

        {/* Fábricas/plantas industriales cercanas (Fase D): marcadores discretos
            visibles en las 4 capas; se omite la que coincide con el incidente. */}
        {pois && pois.length > 0 &&
          pois
            .filter(
              (p) =>
                Math.abs(p.lat - coordinates.lat) > 0.0004 ||
                Math.abs(p.lng - coordinates.lng) > 0.0004
            )
            .map((p) => (
              <ViewAnnotation
                key={`poi-${p.id}`}
                id={`poi-${p.id}`}
                lngLat={[p.lng, p.lat]}
                anchor="center"
              >
                <View style={styles.poiMarker}>
                  <Factory size={12} color="#334155" />
                </View>
              </ViewAnnotation>
            ))}
      </Map>      {showControls && (
        <>
          {/* Aviso de fallback del satélite */}
          {satelliteFallback && (
            <View style={styles.satFallbackNotice} pointerEvents="none">
              <AlertTriangle size={12} color="#fbbf24" />
              <Text style={styles.satFallbackText}>Sin cobertura satelital · cambiado a Táctico</Text>
            </View>
          )}

          {fullScreen ? (
            <>
              {/* FULLSCREEN — rail único centrado verticalmente (derecha):
                  capas, expandir no aplica, zoom, encuadre, unidad, recentrar.
                  Así ningún botón queda tapado por el HUD inferior ni separado. */}
              <View style={[styles.rail, bottomSafeOffset > 0 && { bottom: bottomSafeOffset }]} pointerEvents="box-none">
                <View>
                  <TouchableOpacity
                    style={styles.controlButton}
                    onPress={() => setShowLayerDrawer((v) => !v)}
                    activeOpacity={0.8}
                    accessibilityLabel="Cambiar capa del mapa"
                  >
                    <Layers size={16} color="#fff" />
                  </TouchableOpacity>
                  {showLayerDrawer && <View style={styles.layerDrawer}>{layerOptions}</View>}
                </View>
                <TouchableOpacity style={styles.controlButton} onPress={() => zoomBy(0.6)} accessibilityLabel="Acercar">
                  <Plus size={16} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.controlButton} onPress={() => zoomBy(1.6)} accessibilityLabel="Alejar">
                  <Minus size={16} color="#fff" />
                </TouchableOpacity>
                {(showRoute || unitAssigned) && (
                  <TouchableOpacity style={styles.controlButton} onPress={fitAllBounds} accessibilityLabel="Encuadre de ruta completa">
                    <Navigation size={16} color="#fff" />
                  </TouchableOpacity>
                )}
                {(showRoute || unitAssigned) && (
                  <TouchableOpacity style={styles.controlButton} onPress={centerUnit} accessibilityLabel="Centrar en vehículo de rescate">
                    <Car size={16} color="#fff" />
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.controlButton} onPress={recenter} accessibilityLabel="Centrar en incidente">
                  <Crosshair size={16} color="#fff" />
                </TouchableOpacity>
              </View>

              {/* Coordenadas y ubicación, elevadas sobre el HUD */}
              <TouchableOpacity
                style={[styles.coordsBadge, bottomSafeOffset > 0 && { bottom: bottomSafeOffset + 12 }]}
                onPress={handleCopyCoords}
                activeOpacity={0.85}
              >
                {copiedCoords ? <Check size={12} color="#34d399" /> : <Copy size={12} color="#c4c7c8" />}
                <Text style={styles.coordsText}>
                  {coordinates.lat.toFixed(4)}, {coordinates.lng.toFixed(4)}
                </Text>
              </TouchableOpacity>
              {locationName ? (
                <View style={[styles.locationBadge, bottomSafeOffset > 0 && { bottom: bottomSafeOffset + 50 }]}>
                  <MapPin size={12} color={markerColor} />
                  <Text style={styles.locationText} numberOfLines={1}>
                    {locationName}
                  </Text>
                </View>
              ) : null}
            </>
          ) : (
            <>
              {/* COMPACTO — layout clásico en dos esquinas (no cambia respecto al diseño previo) */}
              <View style={styles.controlsTopRight}>
                <TouchableOpacity
                  style={styles.controlButton}
                  onPress={() => setShowLayerDrawer((v) => !v)}
                  activeOpacity={0.8}
                >
                  <Layers size={16} color="#fff" />
                </TouchableOpacity>

                {showLayerDrawer && <View style={styles.layerDrawer}>{layerOptions}</View>}

                {onExpand && (
                  <TouchableOpacity
                    style={styles.controlButton}
                    onPress={onExpand}
                    activeOpacity={0.8}
                    accessibilityLabel="Ampliar mapa completo"
                  >
                    <Maximize2 size={16} color="#fff" />
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.controlsBottomRight}>
                <TouchableOpacity style={styles.controlButton} onPress={() => zoomBy(0.6)}>
                  <Plus size={16} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.controlButton} onPress={() => zoomBy(1.6)}>
                  <Minus size={16} color="#fff" />
                </TouchableOpacity>
                {(showRoute || unitAssigned) && !compact && (
                  <TouchableOpacity
                    style={styles.controlButton}
                    onPress={fitAllBounds}
                    accessibilityLabel="Encuadre de ruta completa"
                  >
                    <Navigation size={16} color="#fff" />
                  </TouchableOpacity>
                )}
                {(showRoute || unitAssigned) && !compact && (
                  <TouchableOpacity
                    style={styles.controlButton}
                    onPress={centerUnit}
                    accessibilityLabel="Centrar en vehículo de rescate"
                  >
                    <Car size={16} color="#fff" />
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.controlButton} onPress={recenter}>
                  <Crosshair size={16} color="#fff" />
                </TouchableOpacity>
              </View>

              {/* Copiar coordenadas */}
              <TouchableOpacity style={styles.coordsBadge} onPress={handleCopyCoords} activeOpacity={0.85}>
                {copiedCoords ? <Check size={12} color="#34d399" /> : <Copy size={12} color="#c4c7c8" />}
                <Text style={styles.coordsText}>
                  {coordinates.lat.toFixed(4)}, {coordinates.lng.toFixed(4)}
                </Text>
              </TouchableOpacity>

              {/* Chip de ubicación / dirección */}
              {locationName ? (
                <View style={styles.locationBadge}>
                  <MapPin size={12} color={markerColor} />
                  <Text style={styles.locationText} numberOfLines={1}>
                    {locationName}
                  </Text>
                </View>
              ) : null}
            </>
          )}
        </>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#0a0a0c',
    flex: 1,
  },
  incidentMarker: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#131313',
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unitMarker: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ef4444',
  },
  poiMarker: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(232,236,242,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(100,116,139,0.6)',
  },
  controlsTopRight: {
    position: 'absolute',
    top: 12,
    right: 12,
    alignItems: 'flex-end',
    gap: 8,
  },
  // FULLSCREEN — rail único de controles centrado verticalmente en el borde
  // derecho: ningún botón queda tapado por el HUD inferior ni repartido en
  // esquinas opuestas. `bottomSafeOffset` lo sube por encima del HUD.
  rail: {
    position: 'absolute',
    right: 12,
    bottom: 0,
    top: 0,
    justifyContent: 'center',
    gap: 8,
    alignItems: 'flex-end',
  },
  controlsBottomRight: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    gap: 8,
  },
  controlButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(19,19,19,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  layerDrawer: {
    marginTop: 6,
    backgroundColor: 'rgba(19,19,19,0.95)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
    minWidth: 110,
  },
  layerOption: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  layerOptionActive: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  layerOptionText: {
    color: '#c4c7c8',
    fontSize: 11,
    textTransform: 'uppercase',
  },
  layerOptionTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  coordsBadge: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(19,19,19,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  coordsText: {
    color: '#c4c7c8',
    fontSize: 10,
    fontVariant: ['tabular-nums'],
  },
  locationBadge: {
    position: 'absolute',
    bottom: 48,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(19,19,19,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 10,
    maxWidth: '55%',
  },
  locationText: {
    color: '#fff',
    fontSize: 10,
    flexShrink: 1,
  },
  satFallbackNotice: {
    position: 'absolute',
    top: 12,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  satFallbackText: {
    color: '#fbbf24',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    backgroundColor: 'rgba(19,19,19,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.3)',
    borderRadius: 14,
    paddingVertical: 5,
    paddingHorizontal: 10,
    overflow: 'hidden',
  },
});