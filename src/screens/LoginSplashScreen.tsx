import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Image,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import Svg, { Defs, Pattern, Rect, Circle, Path } from 'react-native-svg';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { fetchProfile, fetchContacts, saveProfile, saveContacts, saveSettings } from '../lib/db';
import {
  Shield,
  ArrowRight,
  Lock,
  Mail,
  User,
  Phone,
  Eye,
  EyeOff,
  UserPlus,
  LogIn,
  CheckCircle2,
  AlertCircle,
  Upload,
  HeartPulse,
  Users,
  Plus,
  Trash2,
  X,
  Sparkles,
  Check,
} from 'lucide-react-native';
import { UserProfile, EmergencyContact } from '../types';
import { ANIME_AVATARS, DEFAULT_ANIME_AVATAR, avatarSource } from '../data/animeAvatars';
import * as ImagePicker from 'expo-image-picker';

// ---------------------------------------------------------------------------
// LoginSplashScreen (React Native)
// - localStorage -> AsyncStorage (useStoredState)
// - <input> -> TextInput ; <select> grupo sanguíneo -> chips
// - <input type=file> + FileReader -> expo-image-picker
// - avatares anime locales -> avatarSource() (id string serializable)
// - motion/AnimatePresence -> Animated.View + render condicional
// ---------------------------------------------------------------------------

interface LoginSplashScreenProps {
  theme?: 'dark' | 'light';
  onAuthSuccess: (userProfile: UserProfile) => void;
  defaultProfile?: UserProfile;
}

const PRESET_AVATARS = ANIME_AVATARS.map((av) => av.url);

const PRESET_BANNERS = [
  'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=1200&q=80',
];

const BLOOD_TYPES = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'];

const QUICK_RELATION_TAGS = [
  'Madre',
  'Padre',
  'Pareja / Cónyuge',
  'Hijo / Hija',
  'Hermano / Hermana',
  'Médico de Cabecera',
  'Amigo / Vecino',
  'Servicios de Emergencia',
];

// Logo oficial de Google (G multicolor, asset de marca de Google)
const GoogleLogo: React.FC<{ size?: number }> = ({ size = 20 }) => (
  <Svg width={size} height={size} viewBox="0 0 48 48">
    <Path
      fill="#EA4335"
      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
    />
    <Path
      fill="#4285F4"
      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
    />
    <Path
      fill="#FBBC05"
      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
    />
    <Path
      fill="#34A853"
      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
    />
  </Svg>
);

export const LoginSplashScreen: React.FC<LoginSplashScreenProps> = ({
  theme = 'dark',
  onAuthSuccess,
  defaultProfile,
}) => {
  const isLight = theme === 'light';
  const bg = isLight ? '#f7f7f8' : '#0c0c0d';
  const fg = isLight ? '#121212' : '#e5e2e1';
  const muted = '#8e9192';

  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [showPassword, setShowPassword] = useState(false);

  // Login Form State
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register Form State - Base
  const [regEmail, setRegEmail] = useState('');
  const [confirmRegEmail, setConfirmRegEmail] = useState('');
  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');

  // Identidad OAuth de Google pendiente de completar el perfil (Paso 2).
  const [pendingGoogle, setPendingGoogle] = useState<{
    email?: string;
    name?: string;
    avatarUrl?: string;
  } | null>(null);

  const [regAvatarUrl, setRegAvatarUrl] = useState<string>(PRESET_AVATARS[0]);
  const regBannerUrl = PRESET_BANNERS[0];
  const [regBloodType, setRegBloodType] = useState('O+');
  const [regAllergies, setRegAllergies] = useState('Ninguna');

  const [regContacts, setRegContacts] = useState<EmergencyContact[]>([]);

  const [showAddContactForm, setShowAddContactForm] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [newContactRel, setNewContactRel] = useState('Madre');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactAvatar, setNewContactAvatar] = useState<string>(PRESET_AVATARS[0]);

  const [registerSubStep, setRegisterSubStep] = useState<1 | 2>(1);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const pickAvatarImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería para subir tu avatar.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      setRegAvatarUrl(result.assets[0].uri);
    }
  };

  const handleLoginSubmit = async () => {
    if (isSubmitting) return;
    setErrorMessage(null);
    setSuccessMessage(null);

    const emailTrimmed = loginEmail.trim().toLowerCase();
    const passTrimmed = loginPassword.trim();

    if (!emailTrimmed || !passTrimmed) {
      setErrorMessage('Por favor ingresa tu correo y contraseña.');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailTrimmed)) {
      setErrorMessage('Ingresa un correo electrónico válido (ej. nombre@dominio.com).');
      return;
    }

    if (!isSupabaseConfigured) {
      setErrorMessage('Configura EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY en tu archivo .env para conectarte a SecureOS.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailTrimmed,
        password: passTrimmed,
      });

      if (error) {
        const msg = error.message.toLowerCase();
        if (msg.includes('invalid login')) {
          setErrorMessage('Credenciales incorrectas. Verifica tu correo y contraseña.');
        } else if (msg.includes('email') && (msg.includes('confirm') || msg.includes('verif'))) {
          setErrorMessage('Confirma tu correo electrónico antes de iniciar sesión. Revisa tu bandeja de entrada.');
        } else {
          setErrorMessage(error.message);
        }
        return;
      }

      const user = data.user;
      if (!user) {
        setErrorMessage('No se pudo recuperar la sesión del usuario.');
        return;
      }

      // Si existe un perfil pendiente (registro con confirmación de correo),
      // lo aplicamos y lo borramos para no repetirlo.
      let pending: { email: string; profile: UserProfile } | null = null;
      try {
        const raw = await AsyncStorage.getItem('alert_ia_pending_profile');
        if (raw) {
          pending = JSON.parse(raw);
          if (pending?.email === emailTrimmed) {
            await AsyncStorage.removeItem('alert_ia_pending_profile');
          } else {
            pending = null;
          }
        }
      } catch {
        pending = null;
      }

      const [dbProfile, dbContacts] = await Promise.all([
        fetchProfile(user.id),
        fetchContacts(user.id),
      ]);

      const updatedProfile: UserProfile = {
        name: pending?.profile.name || dbProfile?.name || defaultProfile?.name || 'Ciudadano SecureOS',
        email: user.email || emailTrimmed,
        phone: pending?.profile.phone || dbProfile?.phone || defaultProfile?.phone || '',
        bloodType: pending?.profile.bloodType || dbProfile?.bloodType || defaultProfile?.bloodType || 'O+',
        allergies: pending?.profile.allergies || dbProfile?.allergies || defaultProfile?.allergies || 'Ninguna registrada',
        avatarUrl: pending?.profile.avatarUrl || dbProfile?.avatarUrl || defaultProfile?.avatarUrl || PRESET_AVATARS[0],
        bannerUrl: pending?.profile.bannerUrl || dbProfile?.bannerUrl || defaultProfile?.bannerUrl || PRESET_BANNERS[0],
        emergencyContacts: pending?.profile.emergencyContacts.length
          ? pending!.profile.emergencyContacts
          : dbContacts.length
            ? dbContacts
            : defaultProfile?.emergencyContacts || [],
      };

      if (pending) {
        await saveProfile(user.id, updatedProfile);
        await saveContacts(user.id, updatedProfile.emergencyContacts);
        await saveSettings(user.id, {});
      }

      setSuccessMessage(`Bienvenido, ${updatedProfile.name}`);
      setTimeout(() => {
        onAuthSuccess(updatedProfile);
      }, 400);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Error al iniciar sesión.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (isSubmitting) return;
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!isSupabaseConfigured) {
      setErrorMessage('Configura EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY en tu archivo .env para conectarte a SecureOS.');
      return;
    }

    setIsSubmitting(true);
    try {
      const redirectTo = Linking.createURL('auth/callback');
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
      });

      if (error) {
        setErrorMessage(`Error al conectar con Google: ${error.message}`);
        return;
      }

      let session: Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session'] | null = null;

      if (data?.url) {
        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
        if (result.type !== 'success' || !result.url) {
          setErrorMessage('Se canceló el acceso con Google.');
          return;
        }

        // Extraer el `code` que Supabase devuelve en el redirect (flujo PKCE) y
        // canjearlo por una sesión (detectSessionInUrl está apagado en el cliente).
        const urlData = Linking.parse(result.url);
        const params = urlData.queryParams as Record<string, string> | undefined;
        if (params?.code) {
          const { data: exchangeData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(params.code);
          if (exchangeError) {
            setErrorMessage(`Error al intercambiar el código de Google: ${exchangeError.message}`);
            return;
          }
          session = exchangeData.session;
        }
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const resolvedSession = session || sessionData.session;
      if (!resolvedSession?.user) {
        setErrorMessage('No se estableció la sesión con Google. Verifica que el proveedor esté habilitado en Supabase y el redirect URL.');
        return;
      }

      const user = resolvedSession.user;
      const [dbProfile, dbContacts] = await Promise.all([
        fetchProfile(user.id),
        fetchContacts(user.id),
      ]);

      const googleName = dbProfile?.name || user.user_metadata?.full_name || 'Usuario Google';
      const googleAvatar = dbProfile?.avatarUrl || user.user_metadata?.avatar_url || DEFAULT_ANIME_AVATAR;

      if (authMode === 'register') {
        // Flujo de registro con Google: pre-rellenamos lo que Google da (nombre,
        // correo, avatar) y pedimos que el usuario complete el resto en el Paso 2.
        setRegEmail(user.email || '');
        setConfirmRegEmail(user.email || '');
        setRegName(googleName);
        setRegAvatarUrl(googleAvatar);
        if (dbProfile?.phone) setRegPhone(dbProfile.phone);
        if (dbProfile?.bloodType) setRegBloodType(dbProfile.bloodType);
        if (dbProfile?.allergies) setRegAllergies(dbProfile.allergies);
        setPendingGoogle({
          email: user.email || '',
          name: googleName,
          avatarUrl: googleAvatar,
        });
        setAuthMode('register');
        setRegisterSubStep(2);
        setSuccessMessage('Tu perfil básico de Google está listo. Completa teléfono, ficha médica y contactos para finalizar.');
        return;
      }

      const googleProfile: UserProfile = {
        name: googleName,
        email: user.email || 'usuario@gmail.com',
        phone: dbProfile?.phone || '',
        bloodType: dbProfile?.bloodType || 'O+',
        allergies: dbProfile?.allergies || 'Ninguna registrada',
        avatarUrl: googleAvatar,
        bannerUrl: dbProfile?.bannerUrl || PRESET_BANNERS[0],
        emergencyContacts: dbContacts.length ? dbContacts : [],
      };

      setSuccessMessage(`¡Acceso autorizado con Google (${googleProfile.email})! Cargando SecureOS...`);
      setTimeout(() => {
        onAuthSuccess(googleProfile);
      }, 400);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Error al conectar con Google.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegisterStep1Next = () => {
    setErrorMessage(null);

    const emailTrimmed = regEmail.trim().toLowerCase();
    const confirmEmailTrimmed = confirmRegEmail.trim().toLowerCase();
    const nameTrimmed = regName.trim();
    const phoneTrimmed = regPhone.trim();
    const passTrimmed = regPassword.trim();

    if (!emailTrimmed || !nameTrimmed || !phoneTrimmed || (!pendingGoogle && (!confirmEmailTrimmed || !passTrimmed))) {
      setErrorMessage('Todos los campos son requeridos (Correo, Nombre, Teléfono, Contraseña).');
      return;
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!emailPattern.test(emailTrimmed)) {
      setErrorMessage('Ingresa un correo electrónico válido (ej. nombre@dominio.com).');
      return;
    }

    if (emailTrimmed !== confirmEmailTrimmed && !pendingGoogle) {
      setErrorMessage('Los correos electrónicos no coinciden.');
      return;
    }

    if (!pendingGoogle && passTrimmed.length < 8) {
      setErrorMessage('La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    if (!pendingGoogle && /^\d+$/.test(passTrimmed)) {
      setErrorMessage('La contraseña no puede ser solo números.');
      return;
    }

    // Teléfono celular de Bolivia: +591 + 8 dígitos, o 8 dígitos sin prefijo.
    const digits = phoneTrimmed.replace(/\D/g, '');
    const normalizedDigits = digits.startsWith('591') ? digits.slice(3) : digits;
    if (!/^\d{8}$/.test(normalizedDigits)) {
      setErrorMessage('Ingresa un teléfono de Bolivia válido (+591 7000 0000).');
      return;
    }
    setRegPhone(`+591 ${normalizedDigits}`);

    setRegisterSubStep(2);
  };

  const handleAddRegContact = () => {
    if (!newContactName.trim() || !newContactPhone.trim()) {
      setErrorMessage('Por favor ingresa nombre y teléfono del contacto.');
      return;
    }

    const initials = newContactName
      .trim()
      .split(' ')
      .map((n) => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();

    const createdContact: EmergencyContact = {
      id: `cnt-${Date.now()}`,
      name: newContactName.trim(),
      relationship: newContactRel.trim() || 'Contacto de Emergencia',
      phone: newContactPhone.trim(),
      initials,
      avatarUrl: newContactAvatar,
    };

    setRegContacts((prev) => [...prev, createdContact]);
    setNewContactName('');
    setNewContactPhone('');
    setNewContactRel('Madre');
    setShowAddContactForm(false);
    setErrorMessage(null);
  };

  const handleRegisterFinalSubmit = async () => {
    if (isSubmitting) return;
    setErrorMessage(null);
    setSuccessMessage(null);

    const emailTrimmed = regEmail.trim().toLowerCase();
    const nameTrimmed = regName.trim();
    const phoneTrimmed = regPhone.trim();
    const passTrimmed = regPassword.trim();

    const newProfile: UserProfile = {
      name: nameTrimmed,
      email: emailTrimmed,
      phone: phoneTrimmed,
      bloodType: regBloodType,
      allergies: regAllergies.trim() || 'Ninguna registrada',
      avatarUrl: regAvatarUrl,
      bannerUrl: regBannerUrl,
      emergencyContacts: regContacts,
    };

    setIsSubmitting(true);
    try {
      // Si el usuario vino por "Registrarse con Google", la identidad OAuth ya
      // está autenticada: solo aplicamos el perfil (teléfono, salud, contactos)
      // y entramos, sin crear cuenta adicional ni pedir contraseña.
      if (pendingGoogle) {
        const { data: sessionData } = await supabase.auth.getSession();
        const uid = sessionData.session?.user?.id;
        if (!uid) {
          setErrorMessage('No se pudo recuperar tu sesión de Google. Vuelve a iniciar sesión.');
          return;
        }
        newProfile.name = pendingGoogle.name || nameTrimmed || 'Usuario Google';
        newProfile.email = pendingGoogle.email || emailTrimmed;
        newProfile.avatarUrl = pendingGoogle.avatarUrl || regAvatarUrl;
        await saveProfile(uid, newProfile);
        await saveContacts(uid, newProfile.emergencyContacts);
        await saveSettings(uid, {});
        setPendingGoogle(null);
        setSuccessMessage(`¡Perfil completado, ${newProfile.name}! Bienvenido a SECURE_OS.`);
        setTimeout(() => onAuthSuccess(newProfile), 400);
        return;
      }

      if (!isSupabaseConfigured) {
        setErrorMessage('Configura EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY en tu archivo .env para conectarte a SecureOS.');
        return;
      }
      if (!emailTrimmed || !nameTrimmed || !phoneTrimmed || !passTrimmed) {
        setErrorMessage('Todos los campos son requeridos (Correo, Nombre, Teléfono, Contraseña).');
        return;
      }

      const { error } = await supabase.auth.signUp({
        email: emailTrimmed,
        password: passTrimmed,
        options: {
          data: { nombre: nameTrimmed, telefono: phoneTrimmed },
        },
      });

      if (error) {
        if (error.message.toLowerCase().includes('already registered')) {
          setErrorMessage('Este correo ya está registrado. Inicia sesión con tu contraseña.');
        } else {
          setErrorMessage(error.message);
        }
        return;
      }

      // Confirmación de correo SIEMPRE obligatoria: guardamos el perfil pendiente
      // y cuando el usuario confirme el correo y vuelva a iniciar sesión se aplicará.
      // Nunca entramos directo a la cuenta tras crear el registro.
      try {
        await AsyncStorage.setItem(
          'alert_ia_pending_profile',
          JSON.stringify({ email: emailTrimmed, profile: newProfile })
        );
      } catch {
        // perfil pendiente es best-effort
      }

      setRegisterSubStep(1);
      setRegPassword('');
      setSuccessMessage('Cuenta creada. Revisa tu correo para confirmar y luego inicia sesión.');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Error al crear la cuenta.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputStyle = (): object => ({
    backgroundColor: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.05)',
    borderColor: isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)',
    color: fg,
  });

  const cardStyle = {
    backgroundColor: isLight ? 'rgba(255,255,255,0.9)' : 'rgba(20,20,22,0.9)',
    borderColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.15)',
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg style={styles.dotLayer}>
          <Defs>
            <Pattern id="authDots" width={18} height={18} patternUnits="userSpaceOnUse">
              <Circle
                cx={9}
                cy={9}
                r={1.3}
                fill={isLight ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.22)'}
              />
            </Pattern>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#authDots)" />
        </Svg>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          authMode === 'login' ? styles.scrollCentered : styles.scrollTop,
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo */}
        <Animated.View entering={FadeInDown.duration(300)} style={styles.logoRow}>
          <View
            style={[
              styles.logoBox,
              { backgroundColor: isLight ? '#fff' : '#141416', borderColor: isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.2)' },
            ]}
          >
            <Shield size={24} color={fg} />
          </View>
          <View>
            <Text style={[styles.logoTitle, { color: fg }]}>SECURE_OS</Text>
            <Text style={[styles.logoSub, { color: muted }]}>La IA al servicio de la vida</Text>
          </View>
        </Animated.View>

        {/* Mode Switcher */}
        <View
          style={[
            styles.modeTabs,
            { backgroundColor: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)', borderColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.15)' },
          ]}
        >
          <TouchableOpacity
            style={[styles.modeTab, authMode === 'login' && (isLight ? styles.tabActiveLight : styles.tabActiveDark)]}
            onPress={() => {
              setAuthMode('login');
              setErrorMessage(null);
              setSuccessMessage(null);
            }}
          >
            <LogIn size={16} color={authMode === 'login' ? (isLight ? '#fff' : '#000') : muted} />
            <Text style={[styles.modeTabText, { color: authMode === 'login' ? (isLight ? '#fff' : '#000') : muted }]}>
              Iniciar Sesión
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeTab, authMode === 'register' && (isLight ? styles.tabActiveLight : styles.tabActiveDark)]}
            onPress={() => {
              setAuthMode('register');
              setRegisterSubStep(1);
              setErrorMessage(null);
              setSuccessMessage(null);
            }}
          >
            <UserPlus size={16} color={authMode === 'register' ? (isLight ? '#fff' : '#000') : muted} />
            <Text style={[styles.modeTabText, { color: authMode === 'register' ? (isLight ? '#fff' : '#000') : muted }]}>
              Crear Cuenta
            </Text>
          </TouchableOpacity>
        </View>

        {/* Feedback Banners */}
        {errorMessage && (
          <View style={[styles.errorBanner, { borderColor: 'rgba(239,68,68,0.3)' }]}>
            <AlertCircle size={16} color="#ef4444" />
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        )}
        {successMessage && (
          <View style={[styles.successBanner, { borderColor: 'rgba(16,185,129,0.3)' }]}>
            <CheckCircle2 size={16} color="#10b981" />
            <Text style={styles.successText}>{successMessage}</Text>
          </View>
        )}

        {/* ─────────── LOGIN FORM ─────────── */}
        {authMode === 'login' && (
          <Animated.View key="login" entering={FadeIn.duration(220)} style={[styles.formCard, cardStyle]}>
            <View style={styles.formHeader}>
              <Text style={[styles.formTitle, { color: fg }]}>Ingresa tus credenciales</Text>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: muted }]}>
                <Mail size={14} color={muted} />  Correo Electrónico
              </Text>
              <TextInput
                value={loginEmail}
                onChangeText={setLoginEmail}
                placeholder="ejemplo@secureos.org"
                placeholderTextColor={muted}
                keyboardType="email-address"
                autoCapitalize="none"
                style={[styles.input, inputStyle()]}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: muted }]}>
                <Lock size={14} color={muted} />  Contraseña (Password)
              </Text>
              <View style={[styles.passwordWrap, inputStyle()]}>
                <TextInput
                  value={loginPassword}
                  onChangeText={setLoginPassword}
                  placeholder="Tu contraseña"
                  placeholderTextColor={muted}
                  secureTextEntry={!showPassword}
                  style={[styles.inputInner, { color: fg }]}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeButton}>
                  {showPassword ? <EyeOff size={18} color={muted} /> : <Eye size={18} color={muted} />}
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.primaryButton, isLight ? styles.primaryLight : styles.primaryDark]}
              onPress={handleLoginSubmit}
            >
              <Text style={{ color: isLight ? '#fff' : '#000', fontWeight: '700', fontSize: 13, textTransform: 'uppercase' }}>
                Iniciar Sesión
              </Text>
              <ArrowRight size={18} color={isLight ? '#fff' : '#000'} />
            </TouchableOpacity>

            <View style={styles.dividerRow}>
              <View style={[styles.dividerLine, { backgroundColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)' }]} />
              <Text style={[styles.dividerText, { color: muted }]}>O CONECTA CON</Text>
              <View style={[styles.dividerLine, { backgroundColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)' }]} />
            </View>

            <TouchableOpacity
              style={[styles.googleButton, { borderColor: isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.2)', backgroundColor: isLight ? '#fff' : 'rgba(255,255,255,0.1)' }]}
              onPress={handleGoogleSignIn}
            >
              <GoogleLogo />
              <Text style={{ color: fg, fontWeight: '700', fontSize: 13 }}>Continuar con Google</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.switchLinkWrap}
              onPress={() => {
                setAuthMode('register');
                setRegisterSubStep(1);
                setErrorMessage(null);
              }}
            >
              <Text style={[styles.switchLink, { color: muted }]}>
                ¿No tienes una cuenta? <Text style={styles.switchLinkBold}>Crear cuenta</Text>
              </Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* ─────────── REGISTER FORM ─────────── */}
        {authMode === 'register' && (
          <Animated.View key="register" entering={FadeIn.duration(220)} style={[styles.formCard, cardStyle]}>
            <View style={styles.regHeader}>
              <View>
                <Text style={[styles.monoTag, { color: muted }]}>REGISTRO DE PERFIL TÁCTICO</Text>
                <Text style={[styles.formTitle, { color: fg }]}>
                  {registerSubStep === 1 ? 'Paso 1: Credenciales de Acceso' : 'Paso 2: Avatar Anime, Salud & Contactos'}
                </Text>
              </View>
              <View style={[styles.stepBadge, { borderColor: fg }]}>
                <Text style={{ color: fg, fontSize: 10, fontWeight: '700' }}>{registerSubStep}/2</Text>
              </View>
            </View>

            {registerSubStep === 1 ? (
              <Animated.View entering={FadeIn.duration(220)} style={styles.subStepInner}>
<TouchableOpacity
                    style={[styles.googleButton, { borderColor: isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.2)', backgroundColor: isLight ? '#fff' : 'rgba(255,255,255,0.1)' }]}
                    onPress={handleGoogleSignIn}
                  >
                    <GoogleLogo />
                    <Text style={{ color: fg, fontWeight: '700', fontSize: 12 }}>Registrarse con Google (Acceso Directo)</Text>
                  </TouchableOpacity>

                <View style={styles.dividerRow}>
                  <View style={[styles.dividerLine, { backgroundColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)' }]} />
                  <Text style={[styles.dividerText, { color: muted }]}>O LLENA TUS DATOS</Text>
                  <View style={[styles.dividerLine, { backgroundColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)' }]} />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, { color: muted }]}>
                    <Mail size={14} color={muted} />  Correo Electrónico *
                  </Text>
                  <TextInput value={regEmail} onChangeText={setRegEmail} placeholder="nombre@ejemplo.com" placeholderTextColor={muted} keyboardType="email-address" autoCapitalize="none" style={[styles.input, inputStyle()]} />
                </View>
                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, { color: muted }]}>
                    <Mail size={14} color={muted} />  Repetir Correo Electrónico *
                  </Text>
                  <TextInput value={confirmRegEmail} onChangeText={setConfirmRegEmail} placeholder="Repite tu correo electrónico" placeholderTextColor={muted} keyboardType="email-address" autoCapitalize="none" style={[styles.input, inputStyle()]} />
                </View>
                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, { color: muted }]}>
                    <User size={14} color={muted} />  Nombre Completo *
                  </Text>
                  <TextInput value={regName} onChangeText={setRegName} placeholder="Tu nombre y apellidos" placeholderTextColor={muted} style={[styles.input, inputStyle()]} />
                </View>
                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, { color: muted }]}>
                    <Phone size={14} color={muted} />  Teléfono Celular (Bolivia) *
                  </Text>
                  <TextInput value={regPhone} onChangeText={setRegPhone} placeholder="+591 7000 0000" placeholderTextColor={muted} keyboardType="phone-pad" style={[styles.input, inputStyle()]} />
                </View>
                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, { color: muted }]}>
                    <Lock size={14} color={muted} />  Contraseña *
                  </Text>
                  <View style={[styles.passwordWrap, inputStyle()]}>
                    <TextInput value={regPassword} onChangeText={setRegPassword} placeholder="Mínimo 8 caracteres" placeholderTextColor={muted} secureTextEntry={!showPassword} style={[styles.inputInner, { color: fg }]} />
                    <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeButton}>
                      {showPassword ? <EyeOff size={16} color={muted} /> : <Eye size={16} color={muted} />}
                    </TouchableOpacity>
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.primaryButton, isLight ? styles.primaryLight : styles.primaryDark]}
                  onPress={handleRegisterStep1Next}
                >
                  <Text style={{ color: isLight ? '#fff' : '#000', fontWeight: '700', fontSize: 13, textTransform: 'uppercase' }}>
                    Continuar
                  </Text>
                  <ArrowRight size={18} color={isLight ? '#fff' : '#000'} />
                </TouchableOpacity>
              </Animated.View>
            ) : (
              <Animated.View entering={FadeIn.duration(220)} style={styles.subStepInner}>
                {/* Foto de Perfil Anime */}
                <View style={styles.sectionBlock}>
                  <View style={styles.sectionHeaderRow}>
                    <Text style={[styles.fieldLabel, { color: muted, flex: 1 }]}>
                      <Sparkles size={14} color="#f59e0b" />  Foto de Perfil (Avatar Anime)
                    </Text>
                    <Text style={[styles.monoTagSmall, { color: muted }]}>6 Estilos Anime</Text>
                  </View>
                  <View style={styles.avatarPickerRow}>
                    <View style={styles.avatarPreviewLarge}>
                      <Image source={avatarSource(regAvatarUrl)} style={styles.avatarFull} />
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.avatarRow}>
                      {PRESET_AVATARS.map((av, idx) => (
                        <TouchableOpacity
                          key={idx}
                          onPress={() => setRegAvatarUrl(av)}
                          style={[
                            styles.avatarThumb,
                            regAvatarUrl === av && { borderColor: '#10b981', borderWidth: 2 },
                          ]}
                        >
                          <Image source={avatarSource(av)} style={styles.avatarFull} />
                        </TouchableOpacity>
                      ))}
                      <TouchableOpacity
                        style={[styles.avatarUploadBtn, { borderColor: isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.2)', backgroundColor: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.1)' }]}
                        onPress={pickAvatarImage}
                      >
                        <Upload size={14} color={fg} />
                      </TouchableOpacity>
                    </ScrollView>
                  </View>
                </View>

                {/* Ficha Médica */}
                <View style={[styles.sectionBlock, styles.sectionBordered]}>
                  <Text style={[styles.fieldLabel, { color: muted }]}>
                    <HeartPulse size={14} color="#ef4444" />  Ficha Médica Vital
                  </Text>
                  <Text style={[styles.miniLabel, { color: muted }]}>Grupo Sanguíneo:</Text>
                  <View style={styles.bloodGrid}>
                    {BLOOD_TYPES.map((bt) => (
                      <TouchableOpacity
                        key={bt}
                        onPress={() => setRegBloodType(bt)}
                        style={[
                          styles.bloodChip,
                          { borderColor: isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)', backgroundColor: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.05)' },
                          regBloodType === bt && (isLight ? styles.chipActiveLight : styles.chipActiveDark),
                        ]}
                      >
                        <Text style={{ color: regBloodType === bt ? (isLight ? '#fff' : '#000') : fg, fontWeight: '700', fontSize: 12 }}>
                          {bt}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={[styles.miniLabel, { color: muted }]}>Alergias / Condiciones:</Text>
                  <TextInput
                    value={regAllergies}
                    onChangeText={setRegAllergies}
                    placeholder="ej. Penicilina, Asma"
                    placeholderTextColor={muted}
                    style={[styles.input, inputStyle()]}
                  />
                </View>

                {/* Contactos de Emergencia */}
                <View style={[styles.sectionBlock, styles.sectionBordered]}>
                  <View style={styles.sectionHeaderRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.fieldLabel, { color: muted }]}>
                        <Users size={14} color="#22d3ee" />  Contactos de Emergencia ({regContacts.length})
                      </Text>
                      <Text style={[styles.monoTagSmall, { color: muted }]}>Notificación automática y llamada directa</Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.addContactBtn, isLight ? styles.primaryLight : styles.primaryDark]}
                      onPress={() => setShowAddContactForm(!showAddContactForm)}
                    >
                      <Plus size={14} color={isLight ? '#fff' : '#000'} />
                      <Text style={{ color: isLight ? '#fff' : '#000', fontSize: 10, fontWeight: '700' }}>Añadir</Text>
                    </TouchableOpacity>
                  </View>

                  {showAddContactForm && (
                    <View
                      style={[
                        styles.addContactForm,
                        { backgroundColor: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.05)', borderColor: isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)' },
                      ]}
                    >
                      <View style={styles.addContactFormHeader}>
                        <Text style={[styles.formTitle, { color: fg, fontSize: 12, flex: 1 }]}>Nuevo Contacto de Emergencia</Text>
                        <TouchableOpacity onPress={() => setShowAddContactForm(false)} style={styles.smallClose}>
                          <X size={14} color={muted} />
                        </TouchableOpacity>
                      </View>
                      <View style={styles.twoCol}>
                        <TextInput
                          value={newContactName}
                          onChangeText={setNewContactName}
                          placeholder="Nombre (ej. María)"
                          placeholderTextColor={muted}
                          style={[styles.input, styles.flexInput, inputStyle()]}
                        />
                        <TextInput
                          value={newContactPhone}
                          onChangeText={setNewContactPhone}
                          placeholder="Teléfono (+52...)"
                          placeholderTextColor={muted}
                          keyboardType="phone-pad"
                          style={[styles.input, styles.flexInput, inputStyle()]}
                        />
                      </View>
                      <Text style={[styles.miniLabel, { color: muted }]}>Parentesco / Relación:</Text>
                      <View style={styles.relChips}>
                        {QUICK_RELATION_TAGS.map((tag) => (
                          <TouchableOpacity
                            key={tag}
                            onPress={() => setNewContactRel(tag)}
                            style={[
                              styles.relChip,
                              { borderColor: isLight ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.2)' },
                              newContactRel === tag && (isLight ? styles.chipActiveLight : styles.chipActiveDark),
                            ]}
                          >
                            <Text style={{ color: newContactRel === tag ? (isLight ? '#fff' : '#000') : fg, fontSize: 9, fontWeight: '700' }}>
                              {tag}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <Text style={[styles.miniLabel, { color: muted }]}>Avatar Anime del Contacto:</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.avatarRow}>
                        {PRESET_AVATARS.map((av, i) => (
                          <TouchableOpacity
                            key={i}
                            onPress={() => setNewContactAvatar(av)}
                            style={[
                              styles.avatarThumbSmall,
                              newContactAvatar === av && { borderColor: '#22d3ee', borderWidth: 2 },
                            ]}
                          >
                            <Image source={avatarSource(av)} style={styles.avatarFull} />
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                      <TouchableOpacity
                        style={[styles.primaryButton, styles.smallPrimary, isLight ? styles.primaryLight : styles.primaryDark]}
                        onPress={handleAddRegContact}
                      >
                        <Plus size={16} color={isLight ? '#fff' : '#000'} />
                        <Text style={{ color: isLight ? '#fff' : '#000', fontWeight: '700', fontSize: 11, textTransform: 'uppercase' }}>
                          Guardar Contacto
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  <View style={styles.contactList}>
                    {regContacts.map((contact) => (
                      <View
                        key={contact.id}
                        style={[
                          styles.contactItem,
                          { backgroundColor: isLight ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.04)', borderColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)' },
                        ]}
                      >
                        <View style={styles.contactItemLeft}>
                          <View style={styles.contactItemAvatar}>
                            <Image source={avatarSource(contact.avatarUrl)} style={styles.avatarFull} />
                          </View>
                          <View style={{ flexShrink: 1 }}>
                            <Text style={[styles.contactItemName, { color: fg }]} numberOfLines={1}>{contact.name}</Text>
                            <View style={styles.contactMetaRow}>
                              <Text style={[styles.contactMetaChip, { borderColor: isLight ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.2)', color: fg }]}>
                                {contact.relationship}
                              </Text>
                              <Text style={[styles.contactMetaPhone, { color: muted }]} numberOfLines={1}>{contact.phone}</Text>
                            </View>
                          </View>
                        </View>
                        <TouchableOpacity onPress={() => setRegContacts((prev) => prev.filter((c) => c.id !== contact.id))} style={styles.deleteBtn}>
                          <Trash2 size={14} color={muted} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                </View>

                {/* Volver / Finalizar */}
                <View style={styles.buttonsCol}>
                  <TouchableOpacity
                    style={[styles.secondaryButton, styles.flexBtn, { borderColor: isLight ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.2)', borderRadius: 999 }]}
                    onPress={() => setRegisterSubStep(1)}
                  >
                    <Text style={{ color: fg, fontWeight: '700', fontSize: 12, textTransform: 'uppercase' }}>Atrás</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.primaryButton, styles.flexBtn, isLight ? styles.primaryLight : styles.primaryDark, { borderRadius: 999, justifyContent: 'center' }]}
                    onPress={handleRegisterFinalSubmit}
                  >
                    <View style={styles.finalizeBtnInner}>
                      <Text style={{ color: isLight ? '#fff' : '#000', fontWeight: '700', fontSize: 12, textTransform: 'uppercase', textAlign: 'center' }}>
                        Finalizar Registro
                      </Text>
                      <Check size={16} color={isLight ? '#fff' : '#000'} style={styles.finalizeBtnIcon} />
                    </View>
                  </TouchableOpacity>
                </View>
              </Animated.View>
            )}

            <TouchableOpacity
              style={styles.switchLinkWrap}
              onPress={() => {
                setAuthMode('login');
                setErrorMessage(null);
              }}
            >
              <Text style={[styles.switchLink, { color: muted }]}>
                ¿Ya tienes cuenta? <Text style={styles.switchLinkBold}>Iniciar sesión</Text>
              </Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Footer */}
        <View style={{ height: 16 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  dotLayer: { ...StyleSheet.absoluteFill, opacity: 0.75 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 24,
  },
  scrollCentered: { justifyContent: 'center' },
  scrollTop: { justifyContent: 'flex-start' },
  monoTag: { fontSize: 10, letterSpacing: 1.5, fontWeight: '700', textTransform: 'uppercase' },
  monoTagSmall: { fontSize: 9, textTransform: 'uppercase', letterSpacing: 1 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, alignSelf: 'center', marginBottom: 12 },
  logoBox: { width: 48, height: 48, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  logoTitle: { fontWeight: '800', fontSize: 24, letterSpacing: 3, textTransform: 'uppercase' },
  logoSub: { fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, marginTop: 2 },
  modeTabs: { flexDirection: 'row', padding: 4, borderRadius: 16, borderWidth: 1, marginTop: 6, marginBottom: 12 },
  modeTab: { flex: 1, paddingVertical: 10, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  tabActiveLight: { backgroundColor: '#000' },
  tabActiveDark: { backgroundColor: '#fff' },
  modeTabText: { fontWeight: '700', fontSize: 12, textTransform: 'uppercase' },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderWidth: 1,
    marginBottom: 10,
  },
  errorText: { color: '#ef4444', fontSize: 11, flex: 1 },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(16,185,129,0.15)',
    borderWidth: 1,
    marginBottom: 10,
  },
  successText: { color: '#10b981', fontSize: 11, flex: 1 },
  formCard: { borderRadius: 28, padding: 20, borderWidth: 1, shadowOpacity: 0.2, shadowRadius: 20, shadowOffset: { width: 0, height: 10 } },
  formHeader: { marginBottom: 12 },
  formTitle: { fontWeight: '800', fontSize: 16, marginTop: 2 },
  fieldGroup: { marginBottom: 12 },
  fieldLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 13,
  },
  passwordWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 14 },
  inputInner: { flex: 1, paddingVertical: 12, fontSize: 13 },
  eyeButton: { padding: 4 },
  primaryButton: {
    paddingVertical: 14,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  smallPrimary: { paddingVertical: 12 },
  primaryLight: { backgroundColor: '#000' },
  primaryDark: { backgroundColor: '#fff' },
  secondaryButton: { paddingVertical: 14, borderRadius: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 14 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  googleButton: {
    paddingVertical: 13,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1,
  },
  switchLinkWrap: { alignItems: 'center', marginTop: 14 },
  switchLink: { fontSize: 11, textAlign: 'center' },
  switchLinkBold: { fontWeight: '800', textDecorationLine: 'underline' },
  regHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.1)', paddingBottom: 10, marginBottom: 12 },
  stepBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  subStepInner: {},
  autofillBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, marginTop: 4 },
  autofillText: { color: '#f59e0b', fontSize: 11, fontWeight: '700' },
  sectionBlock: {},
  sectionBordered: { borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.1)', marginTop: 14, paddingTop: 12 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  avatarPickerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatarPreviewLarge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#10b981',
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  avatarFull: { width: '100%', height: '100%' },
  avatarRow: { gap: 6, alignItems: 'center', flexGrow: 1 },
  avatarThumb: { width: 40, height: 40, borderRadius: 20, overflow: 'hidden', borderColor: 'rgba(0,0,0,0.2)', borderWidth: 1, opacity: 0.75 },
  avatarThumbSmall: { width: 28, height: 28, borderRadius: 14, overflow: 'hidden', borderColor: 'rgba(0,0,0,0.2)', borderWidth: 1, opacity: 0.7 },
  avatarUploadBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  miniLabel: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  bloodGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  bloodChip: { width: '22%', paddingVertical: 9, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  chipActiveLight: { backgroundColor: '#000', borderColor: '#000' },
  chipActiveDark: { backgroundColor: '#fff', borderColor: '#fff' },
  addContactBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 4 },
  addContactForm: { borderRadius: 16, padding: 12, borderWidth: 1, gap: 10, marginTop: 8 },
  addContactFormHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.1)', paddingBottom: 8 },
  smallClose: { padding: 2 },
  twoCol: { flexDirection: 'row', gap: 8 },
  flexInput: { flex: 1 },
  flexBtn: { flex: 1 },
  buttonsCol: { flexDirection: 'row', gap: 10, marginTop: 4 },
  finalizeBtnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  finalizeBtnIcon: { width: 16 },
  relChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  relChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  contactList: { marginTop: 8, gap: 6 },
  contactItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 10, borderRadius: 16, borderWidth: 1, gap: 8 },
  contactItemLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  contactItemAvatar: { width: 32, height: 32, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(0,0,0,0.2)' },
  contactItemName: { fontWeight: '700', fontSize: 12 },
  contactMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  contactMetaChip: { fontSize: 8, textTransform: 'uppercase', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, borderWidth: 1, fontWeight: '700' },
  contactMetaPhone: { fontSize: 9, flexShrink: 1 },
  deleteBtn: { padding: 4 },
});
