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

  useEffect(() => {
    if (!hydrated.current) return;
    AsyncStorage.setItem(key, JSON.stringify(value)).catch(() => {
      // ignore write errors
    });
  }, [key, value]);

  return [value, setValue] as const;
}
