import React, { useRef, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import MapView, { Marker, Polyline, Circle, PROVIDER_GOOGLE } from 'react-native-maps';
import {
  Layers,
  Crosshair,
  Copy,
  Check,
  Car,
  Plus,
  Minus,
  Shield,
  Maximize2,
  Navigation,
  MapPin,
} from 'lucide-react-native';
import { EmergencyCategory } from '../types';

// ---------------------------------------------------------------------------
// IncidentMap (React Native) — reemplaza Leaflet por react-native-maps.
// Conserva: capas (estándar/satélite/híbrido/terreno), marcador de incidente,
// marcador de unidad, ruta (polyline), radio de seguridad (circle),
// controles flotantes (capas, recentrar, copiar coords, zoom).
// ---------------------------------------------------------------------------

export type MapTileLayer = 'dark' | 'satellite' | 'street' | 'terrain';

// Mapea nuestras "capas" estilo web a los mapTypes nativos disponibles.
// iOS/Android no soportan un tile "dark" custom sin un proveedor de mapas de
// pago (Mapbox, etc). Usamos 'standard' como sustituto de 'dark'/'street'.
const LAYER_TO_MAP_TYPE: Record<MapTileLayer, 'standard' | 'satellite' | 'hybrid' | 'terrain'> = {
  dark: 'standard',
  street: 'standard',
  satellite: 'satellite',
  terrain: Platform.OS === 'android' ? 'terrain' : 'standard',
};

const LAYER_LABELS: Record<MapTileLayer, string> = {
  dark: 'Táctico',
  satellite: 'Satélite',
  street: 'Calles',
  terrain: 'Relieve',
};

interface IncidentMapProps {
  coordinates: { lat: number; lng: number };
  title?: string;
  locationName?: string;
  category?: EmergencyCategory | string;
  interactive?: boolean;
  height?: number; // en RN usamos número de puntos, no string CSS
  showControls?: boolean;
  unitAssigned?: string;
  originDepot?: string;
  initialLayer?: MapTileLayer;
  showRoute?: boolean;
  unitCoordinates?: { lat: number; lng: number };
  fullScreen?: boolean;
  onExpand?: () => void;
}

const CATEGORY_COLOR: Record<string, string> = {
  traffic: '#f97316',
  fire: '#ef4444',
  medical: '#06b6d4',
  robbery: '#eab308',
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
}: IncidentMapProps) {
  const mapRef = useRef<MapView>(null);
  const [activeLayer, setActiveLayer] = useState<MapTileLayer>(initialLayer);
  const [copiedCoords, setCopiedCoords] = useState(false);
  const [showLayerDrawer, setShowLayerDrawer] = useState(false);
  const [currentZoomDelta, setCurrentZoomDelta] = useState(0.02);

  const markerColor = CATEGORY_COLOR[category as string] || CATEGORY_COLOR.default;

  // Punto simulado de la unidad si no se provee (offset hacia noreste)
  const unitCoords = useMemo(
    () =>
      unitCoordinates || {
        lat: coordinates.lat + 0.01,
        lng: coordinates.lng + 0.012,
      },
    [unitCoordinates, coordinates]
  );

  const routeCoords = useMemo(
    () => [
      { latitude: unitCoords.lat, longitude: unitCoords.lng },
      // punto intermedio simple para dar la sensación de ruta curva
      {
        latitude: (unitCoords.lat + coordinates.lat) / 2 + 0.002,
        longitude: (unitCoords.lng + coordinates.lng) / 2 - 0.002,
      },
      { latitude: coordinates.lat, longitude: coordinates.lng },
    ],
    [unitCoords, coordinates]
  );

  const handleCopyCoords = () => {
    const text = `${coordinates.lat.toFixed(5)}, ${coordinates.lng.toFixed(5)}`;
    Clipboard.setStringAsync(text);
    setCopiedCoords(true);
    setTimeout(() => setCopiedCoords(false), 1800);
  };

  const recenter = () => {
    mapRef.current?.animateToRegion(
      {
        latitude: coordinates.lat,
        longitude: coordinates.lng,
        latitudeDelta: currentZoomDelta,
        longitudeDelta: currentZoomDelta,
      },
      450
    );
  };

  const zoomBy = (factor: number) => {
    const newDelta = Math.max(0.002, Math.min(0.5, currentZoomDelta * factor));
    setCurrentZoomDelta(newDelta);
    // Conserva el centro del viewport actual en lugar de re-centrar al incidente
    mapRef.current?.getCamera().then((camera) => {
      const center = camera?.center || {
        latitude: coordinates.lat,
        longitude: coordinates.lng,
      };
      mapRef.current?.animateToRegion(
        {
          latitude: center.latitude,
          longitude: center.longitude,
          latitudeDelta: newDelta,
          longitudeDelta: newDelta,
        },
        300
      );
    });
  };

  const centerUnit = () => {
    mapRef.current?.animateToRegion(
      {
        latitude: unitCoords.lat,
        longitude: unitCoords.lng,
        latitudeDelta: 0.04,
        longitudeDelta: 0.04,
      },
      450
    );
  };

  const fitAllBounds = () => {
    mapRef.current?.fitToCoordinates(
      [
        { latitude: unitCoords.lat, longitude: unitCoords.lng },
        { latitude: coordinates.lat, longitude: coordinates.lng },
      ],
      { edgePadding: { top: 60, right: 60, bottom: 60, left: 60 }, animated: true }
    );
  };

  return (
    <View style={[styles.container, !fullScreen && { height }]}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        mapType={LAYER_TO_MAP_TYPE[activeLayer]}
        // En un tema táctico oscuro real, aquí se pasaría `customMapStyle`
        // (JSON de estilo de Google Maps) cuando activeLayer === 'dark'.
        scrollEnabled={interactive}
        zoomEnabled={interactive}
        rotateEnabled={interactive}
        pitchEnabled={interactive}
        initialRegion={{
          latitude: coordinates.lat,
          longitude: coordinates.lng,
          latitudeDelta: currentZoomDelta,
          longitudeDelta: currentZoomDelta,
        }}
      >
        {/* Marcador del incidente */}
        <Marker
          coordinate={{ latitude: coordinates.lat, longitude: coordinates.lng }}
          title={locationName || 'Ubicación del incidente'}
        >
          <View style={[styles.incidentMarker, { borderColor: markerColor }]}>
            <Shield size={14} color={markerColor} />
          </View>
        </Marker>

        {/* Radio de seguridad */}
        <Circle
          center={{ latitude: coordinates.lat, longitude: coordinates.lng }}
          radius={200}
          strokeColor={`${markerColor}88`}
          fillColor={`${markerColor}22`}
        />

        {/* Marcador de la unidad asignada */}
        {(showRoute || unitAssigned) && (
          <Marker
            coordinate={{ latitude: unitCoords.lat, longitude: unitCoords.lng }}
            title={unitAssigned || 'Unidad'}
            description={originDepot}
          >
            <View style={styles.unitMarker}>
              <Car size={14} color="#0a0a0c" />
            </View>
          </Marker>
        )}

        {/* Ruta entre unidad e incidente */}
        {(showRoute || unitAssigned) && (
          <Polyline
            coordinates={routeCoords}
            strokeColor="#ffffff"
            strokeWidth={4}
            lineDashPattern={[6, 6]}
          />
        )}
      </MapView>

      {showControls && (
        <>
          {/* Botón de capas */}
          <View style={styles.controlsTopRight}>
            <TouchableOpacity
              style={styles.controlButton}
              onPress={() => setShowLayerDrawer((v) => !v)}
              activeOpacity={0.8}
            >
              <Layers size={16} color="#fff" />
            </TouchableOpacity>

            {showLayerDrawer && (
              <View style={styles.layerDrawer}>
                {(Object.keys(LAYER_LABELS) as MapTileLayer[]).map((layer) => (
                  <TouchableOpacity
                    key={layer}
                    style={[
                      styles.layerOption,
                      activeLayer === layer && styles.layerOptionActive,
                    ]}
                    onPress={() => {
                      setActiveLayer(layer);
                      setShowLayerDrawer(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.layerOptionText,
                        activeLayer === layer && styles.layerOptionTextActive,
                      ]}
                    >
                      {LAYER_LABELS[layer]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {onExpand && !fullScreen && (
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

          {/* Zoom + recentrar + centro unidad + encuadre */}
          <View style={styles.controlsBottomRight}>
            <TouchableOpacity style={styles.controlButton} onPress={() => zoomBy(0.6)}>
              <Plus size={16} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.controlButton} onPress={() => zoomBy(1.6)}>
              <Minus size={16} color="#fff" />
            </TouchableOpacity>
            {(showRoute || unitAssigned) && (
              <TouchableOpacity
                style={styles.controlButton}
                onPress={fitAllBounds}
                accessibilityLabel="Encuadre de ruta completa"
              >
                <Navigation size={16} color="#fff" />
              </TouchableOpacity>
            )}
            {(showRoute || unitAssigned) && (
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
  controlsTopRight: {
    position: 'absolute',
    top: 12,
    right: 12,
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
    marginBottom: 8,
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
});
