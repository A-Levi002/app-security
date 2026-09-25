import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export function useStoredState<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(initialValue);
  const hydrated = useRef(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(key)
      .then((stored) => {
        if (!active) return;
        if (stored != null) {
          try {
            setValue(JSON.parse(stored) as T);
          } catch {
            // ignore malformed storage, keep initial value
          }
        }
        hydrated.current = true;
      })
      .catch(() => {
        hydrated.current = true;
      });
    return () => {
      active = false;
    };
  }, [key]);

  // Escritura con debounce: los reportes incluyen chats con media y moverlos a
  // AsyncStorage en CADA cambio serializaba JSON enorme en el hilo de UI (ANR).
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!hydrated.current) return;
    if (writeTimer.current) clearTimeout(writeTimer.current);
    writeTimer.current = setTimeout(() => {
      AsyncStorage.setItem(key, JSON.stringify(value)).catch(() => {
        // ignore write errors
      });
    }, 500);
    return () => {
      if (writeTimer.current) clearTimeout(writeTimer.current);
    };
  }, [key, value]);

  return [value, setValue] as const;
}
