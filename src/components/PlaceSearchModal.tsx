import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import { Search, X, MapPin } from 'lucide-react-native';
import { searchPlaces, type PlaceResult } from '../lib/locationApi';

interface PlaceSearchModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (place: PlaceResult) => void;
  near?: { lat: number; lng: number };
  country?: string;
}

// Buscador de direcciones por autocomplete (MyMappi si hay key, si no Photon).
// Al elegir un resultado, devuelve el lugar con sus coordenadas para reubicar
// el incidente en el mapa.
export function PlaceSearchModal({
  visible,
  onClose,
  onSelect,
  near,
  country = 'BO',
}: PlaceSearchModalProps) {
  const isLight = useColorScheme() === 'light';
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);

  const runSearch = useCallback(
    async (q: string) => {
      const id = ++requestId.current;
      if (q.trim().length < 3) {
        setResults([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      const found = await searchPlaces(q, {
        country,
        near,
        limit: 6,
      });
      if (id !== requestId.current) return;
      setResults(found);
      setLoading(false);
    },
    [country, near]
  );

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => runSearch(query), 400);
    return () => clearTimeout(t);
  }, [query, visible, runSearch]);

  const reset = () => {
    requestId.current += 1;
    setQuery('');
    setResults([]);
    setLoading(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const handleSelect = (place: PlaceResult) => {
    onSelect(place);
    reset();
  };

  const fg = isLight ? '#111' : '#f2f2f3';
  const muted = isLight ? '#6b6b70' : '#8a8a8e';
  const card = isLight ? '#ffffff' : '#141416';
  const border = isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.12)';
  const rowBg = isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable
          style={[styles.sheet, { backgroundColor: card, borderColor: border }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <Search size={16} color={muted} />
              <Text style={[styles.headerTitle, { color: fg }]}>
                BUSCAR OTRAS COORDENADAS
              </Text>
            </View>
            <TouchableOpacity onPress={close} style={styles.closeBtn} activeOpacity={0.7}>
              <X size={16} color={muted} />
            </TouchableOpacity>
          </View>

          <View style={[styles.inputRow, { backgroundColor: rowBg, borderColor: border }]}>
            <MapPin size={15} color={isLight ? '#111' : '#fff'} />
            <TextInput
              style={[styles.input, { color: fg }]}
              value={query}
              onChangeText={setQuery}
              placeholder="Escribe una dirección o lugar..."
              placeholderTextColor={muted}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {loading ? <ActivityIndicator size="small" color={muted} /> : null}
          </View>

          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                {!loading && query.trim().length > 0 && query.trim().length < 3 ? (
                  <Text style={[styles.emptyText, { color: muted }]}>
                    Escribe al menos 3 caracteres
                  </Text>
                ) : null}
                {!loading && query.trim().length >= 3 && results.length === 0 ? (
                  <Text style={[styles.emptyText, { color: muted }]}>
                    Sin resultados para &quot;{query.trim()}&quot;
                  </Text>
                ) : null}
              </View>
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.resultRow, { borderBottomColor: border }]}
                onPress={() => handleSelect(item)}
                activeOpacity={0.7}
              >
                <View style={[styles.resultIcon, { backgroundColor: rowBg }]}>
                  <MapPin size={15} color={isLight ? '#111' : '#fff'} />
                </View>
                <View style={styles.resultTextWrap}>
                  <Text style={[styles.resultName, { color: fg }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={[styles.resultLabel, { color: muted }]} numberOfLines={2}>
                    {item.label}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    minHeight: 340,
    maxHeight: '72%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 10,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 18,
    marginBottom: 10,
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
  },
  input: {
    flex: 1,
    fontSize: 14,
    padding: 0,
  },
  listContent: {
    paddingBottom: 24,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  resultIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultTextWrap: {
    flex: 1,
  },
  resultName: {
    fontSize: 13,
    fontWeight: '700',
  },
  resultLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  emptyWrap: {
    paddingTop: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
  },
});