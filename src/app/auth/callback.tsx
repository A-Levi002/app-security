import React, { useEffect } from 'react';
import { View, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { supabase } from '@/lib/supabase';

// Ruta del deep link auth/callback (flujo PKCE).
// Recibe appsecurity://auth/callback?code=... tanto desde el flujo de Google
// como desde el correo de confirmación de Supabase. Como detectSessionInUrl
// está apagado en el cliente, canjeamos el code por sesión y volvemos a la app.
export default function AuthCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string }>();

  useEffect(() => {
    (async () => {
      try {
        // Expo Router puede o no exponer el code vía useLocalSearchParams;
        // también lo leemos del URL por si llega como parámetro del enlace.
        let code = params.code;
        if (!code) {
          const initUrl = await Linking.getInitialURL();
          code = (Linking.parse(initUrl || '').queryParams as Record<string, string> | null)?.code;
        }

        if (code) {
          await supabase.auth.exchangeCodeForSession(code);
        } else {
          const { data } = await supabase.auth.getSession();
          if (!data.session) {
            // Sin código ni sesión: no hay nada que canjear.
            router.replace('/');
            return;
          }
        }
      } catch {
        // pase lo que pase, volvemos a la app (SecureOSApp restaura la sesión)
      } finally {
        router.replace('/');
      }
    })();
  }, [params.code, router]);

  return (
    <View style={{ flex: 1, backgroundColor: '#0c0c0d', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#e5e2e1', fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>
        Verificando sesión...
      </Text>
    </View>
  );
}
