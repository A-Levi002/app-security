import React, { memo, useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import { AmbientBackground } from './AmbientBackground';
import { TopAppBar } from './TopAppBar';
import { BottomNavBar } from './BottomNavBar';
import { HomeScreen } from '../screens/HomeScreen';
import { HistoryScreen } from '../screens/HistoryScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { CategorySelectionModal } from './CategorySelectionModal';
import { AIEmergencyChatModal } from './AIEmergencyChatModal';
import { TacticalCallModal } from './TacticalCallModal';
import { WelcomeLogoBoot } from './WelcomeLogoBoot';
import { PermissionsModal } from './PermissionsModal';
import { AppTourAndSetupModal } from './AppTourAndSetupModal';
import { LoginSplashScreen } from '../screens/LoginSplashScreen';
import {
  INITIAL_REPORTS,
  INITIAL_USER_PROFILE,
  INITIAL_PERMISSIONS,
  INITIAL_SETTINGS,
} from '../data/initialData';
import {
  IncidentReport,
  EmergencyCategory,
  UserProfile,
  SystemPermissions,
  SystemSettings,
  NavigationTab,
} from '../types';
import { useStoredState } from '../hooks/useStoredState';
import { supabase } from '../lib/supabase';
import {
  getCurrentUserId,
  signOutServer,
  fetchReports,
  fetchSettings,
  fetchProfile,
  fetchContacts,
  saveReport,
  deleteReport,
  saveProfile,
  saveContacts,
  saveSettings,
} from '../lib/db';

// Pantallas pesadas que viven montadas: se memoizan para que un cambio de
// pestaña o una guardada del chat no re-renderice pantallas ocultas (mapas).
const MemoHomeScreen = memo(HomeScreen);
const MemoHistoryScreen = memo(HistoryScreen);
const MemoProfileScreen = memo(ProfileScreen);

export const SecureOSApp: React.FC = () => {
  // 1. Boot Animation Sequence (siempre inicia al cargar)
  const [hasSeenInitialBoot, setHasSeenInitialBoot] = useState<boolean>(false);

  // 2. Tour inicial y configuración de funciones (persistido: solo la 1ª vez)
  const [hasCompletedTour, setHasCompletedTour] = useStoredState<boolean>('alert_ia_tour_done', false);

  // 3. Autenticación
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [authRestoring, setAuthRestoring] = useState<boolean>(true);

  // 4. Permisos del sistema (persistido: solo la 1ª vez)
  const [hasCompletedPermissions, setHasCompletedPermissions] = useStoredState<boolean>(
    'alert_ia_permissions_done',
    false
  );

  // Navegación
  const [activeTab, setActiveTab] = useState<NavigationTab>('home');
  const [activeScreen, setActiveScreen] = useState<'main' | 'settings'>('main');

  // Modales y paneles
  const [showCategorySelect, setShowCategorySelect] = useState(false);
  const [showAIEmergencyChat, setShowAIEmergencyChat] = useState(false);
  const [selectedEmergencyCategory, setSelectedEmergencyCategory] = useState<EmergencyCategory>('traffic');
  const [activeChatReport, setActiveChatReport] = useState<IncidentReport | null>(null);
  const [callingContact, setCallingContact] = useState<{ name: string; phone?: string } | null>(null);

  // Datos y persistencia (localStorage -> AsyncStorage vía useStoredState)
  const [reports, setReports] = useStoredState<IncidentReport[]>('alert_ia_reports', INITIAL_REPORTS);
  const [userProfile, setUserProfile] = useStoredState<UserProfile>('alert_ia_profile', INITIAL_USER_PROFILE);
  const [permissions, setPermissions] = useStoredState<SystemPermissions>(
    'alert_ia_permissions',
    INITIAL_PERMISSIONS
  );
  const [settings, setSettings] = useStoredState<SystemSettings>('alert_ia_settings', INITIAL_SETTINGS);

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(null), 3000);
    return () => clearTimeout(t);
  }, [toastMessage]);

  // Restaurar sesión guardada (Supabase persiste en AsyncStorage): si ya hay
  // una sesión activa de un login anterior, entrar directo sin pedir credenciales.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const uid = data.session?.user?.id;
        if (active && uid) {
          const [dbProfile, dbContacts] = await Promise.all([
            fetchProfile(uid),
            fetchContacts(uid),
          ]);
          if (active) {
            setUserProfile({
              name: dbProfile?.name || userProfile.name || '',
              email: data.session?.user?.email || userProfile.email || '',
              phone: dbProfile?.phone || userProfile.phone || '',
              bloodType: dbProfile?.bloodType || userProfile.bloodType || '',
              allergies: dbProfile?.allergies || userProfile.allergies || '',
              avatarUrl: dbProfile?.avatarUrl || userProfile.avatarUrl,
              bannerUrl: dbProfile?.bannerUrl || userProfile.bannerUrl || '',
              emergencyContacts: dbContacts.length ? dbContacts : userProfile.emergencyContacts,
            });
            setAuthUserId(uid);
            setIsAuthenticated(true);
          }
        }
      } catch {
        // sin sesión o error: se muestra el login
      } finally {
        if (active) setAuthRestoring(false);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showToast = useCallback((msg: string) => setToastMessage(msg), []);

  const loadUserDataFromServer = useCallback(async (uid: string) => {
    try {
      const [dbReports, dbSettings] = await Promise.all([fetchReports(uid), fetchSettings(uid)]);
      if (dbReports.length) {
        setReports(dbReports);
      }
      if (dbSettings) {
        setSettings((prev) => ({ ...prev, ...dbSettings }));
      }
    } catch {
      // offline: mantener cache local
    }
  }, [setReports, setSettings]);

  const handleAuthSuccess = useCallback(async (newProfile: UserProfile) => {
    setUserProfile(newProfile);
    setIsAuthenticated(true);
    const uid = await getCurrentUserId();
    if (uid) {
      setAuthUserId(uid);
      loadUserDataFromServer(uid);
    }
    showToast(`SESIÓN INICIADA: ${newProfile.name ? newProfile.name.toUpperCase() : 'SECURE_OS'}`);
  }, [loadUserDataFromServer, setUserProfile, showToast]);

  const handleOpenEmergencySelection = useCallback(() => setShowCategorySelect(true), []);

  const handleSelectCategory = useCallback((category: EmergencyCategory) => {
    setSelectedEmergencyCategory(category);
    setActiveChatReport(null);
    setShowCategorySelect(false);
    setShowAIEmergencyChat(true);
  }, []);

  const handleSaveReportFromChat = useCallback((newReport: IncidentReport) => {
    setReports((prev) => {
      const exists = prev.some((r) => r.id === newReport.id);
      return exists
        ? prev.map((r) => (r.id === newReport.id ? newReport : r))
        : [newReport, ...prev];
    });
    if (authUserId) {
      saveReport(authUserId, newReport).catch(() => {
        // sync best-effort: local state sigue siendo la fuente inmediata
      });
    }
  }, [setReports, authUserId]);

  const handleOpenReportDetailInChat = useCallback((report: IncidentReport) => {
    setSelectedEmergencyCategory(report.category);
    setActiveChatReport(report);
    setShowAIEmergencyChat(true);
  }, []);

  const handleUpdateSettings = useCallback((newS: Partial<SystemSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...newS };
      if (authUserId) saveSettings(authUserId, next).catch(() => {});
      return next;
    });
  }, [setSettings, authUserId]);

  const handleUpdateProfile = useCallback((p: UserProfile, feedbackMessage?: string) => {
    setUserProfile(p);
    if (authUserId) {
      saveProfile(authUserId, p).catch(() => {});
      saveContacts(authUserId, p.emergencyContacts).catch(() => {});
    }
    showToast(feedbackMessage || 'PERFIL ACTUALIZADO');
  }, [setUserProfile, authUserId, showToast]);

  const handleDeleteReport = useCallback((id: string) => {
    setReports((prev) => prev.filter((r) => r.id !== id));
    if (authUserId) deleteReport(authUserId, id).catch(() => {});
    showToast('REPORTE ELIMINADO');
  }, [setReports, authUserId, showToast]);

  const handleCallContact = useCallback((name: string, phone?: string) => {
    setCallingContact({ name, phone });
  }, []);

  const handleOpenSettings = useCallback(() => setActiveScreen('settings'), []);

  const handleGoHome = useCallback(() => {
    setActiveScreen('main');
    setActiveTab('home');
  }, []);

  const handleSelectTab = useCallback((tab: NavigationTab) => {
    setActiveScreen('main');
    setActiveTab(tab);
  }, []);

  const insets = useSafeAreaInsets();
  const isLight = settings.theme === 'light';

  // 1. Boot
  if (!hasSeenInitialBoot) {
    return <WelcomeLogoBoot theme={settings.theme} onComplete={() => setHasSeenInitialBoot(true)} />;
  }

  // Estado de carga al restaurar la sesión guardada
  if (authRestoring) {
    return <WelcomeLogoBoot theme={settings.theme} onComplete={() => {}} />;
  }

  // 2. Auth (primero: si ya hay sesión/cuenta, no se muestra el tour ni permisos)
  if (!isAuthenticated) {
    return (
      <LoginSplashScreen
        defaultProfile={userProfile}
        theme={settings.theme}
        onAuthSuccess={handleAuthSuccess}
      />
    );
  }

  // 3. Tour inicial (solo la primera vez que se configura el dispositivo)
  if (!hasCompletedTour) {
    return (
      <AppTourAndSetupModal
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        onFinishTour={() => {
          setHasCompletedTour(true);
          showToast('CONFIGURACIÓN INICIAL APLICADA');
        }}
      />
    );
  }

  // 4. Permisos del sistema (solo la primera vez)
  if (!hasCompletedPermissions) {
    return (
      <PermissionsModal
        permissions={permissions}
        theme={settings.theme}
        onUpdatePermissions={(p) => setPermissions(p)}
        onContinue={() => {
          setHasCompletedPermissions(true);
          showToast('PERMISOS ACTIVADOS CORRECTAMENTE');
        }}
      />
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: isLight ? '#f5f5f7' : '#0c0c0d' }]}>
      <AmbientBackground theme={settings.theme} />

      <TopAppBar
        title="SECURE_OS"
        theme={settings.theme}
        onOpenSettings={handleOpenSettings}
        onGoHome={handleGoHome}
      />

      <View style={styles.content}>
        {activeScreen === 'settings' ? (
          <Animated.View key="settings-screen" entering={FadeIn.duration(150)} style={styles.fill}>
            <SettingsScreen
              settings={settings}
              onUpdateSettings={handleUpdateSettings}
              onBack={() => setActiveScreen('main')}
              onLogout={() => {
                setIsAuthenticated(false);
                setAuthUserId(null);
                signOutServer().catch(() => {});
                showToast('SESIÓN FINALIZADA');
              }}
              userProfile={userProfile}
            />
          </Animated.View>
        ) : (
          <View style={styles.fill}>
            {/*
              Se monta SOLO la pestaña activa: desmontar las ocultas evita que
              MapLibre (Historial: un mapa por tarjeta) y las animaciones
              infinitas de Home sigan viviendo en segundo plano y consuman
              hilo de UI/GPU (causa del lag y del "app no responde").
            */}
            {activeTab === 'home' && (
              <MemoHomeScreen onTriggerEmergency={handleOpenEmergencySelection} theme={settings.theme} />
            )}
            {activeTab === 'history' && (
              <MemoHistoryScreen
                reports={reports}
                onSelectReport={handleOpenReportDetailInChat}
                onOpenCreateIncident={handleOpenEmergencySelection}
                onDeleteReport={handleDeleteReport}
                theme={settings.theme}
              />
            )}
            {activeTab === 'profile' && (
              <MemoProfileScreen
                userProfile={userProfile}
                onUpdateProfile={handleUpdateProfile}
                onCallContact={handleCallContact}
                onOpenSettings={handleOpenSettings}
                theme={settings.theme}
              />
            )}
          </View>
        )}
      </View>

      {activeScreen === 'main' && (
        <BottomNavBar
          activeTab={activeTab}
          theme={settings.theme}
          onSelectTab={handleSelectTab}
        />
      )}

      {showCategorySelect && (
        <CategorySelectionModal
          onSelectCategory={handleSelectCategory}
          onCancel={() => setShowCategorySelect(false)}
          theme={settings.theme}
        />
      )}

      {showAIEmergencyChat && (
        <AIEmergencyChatModal
          category={selectedEmergencyCategory}
          onClose={() => setShowAIEmergencyChat(false)}
          onSaveReport={handleSaveReportFromChat}
          onCallContact={handleCallContact}
          existingReport={activeChatReport}
          theme={settings.theme}
          settings={settings}
        />
      )}

      {callingContact && (
        <TacticalCallModal
          contactName={callingContact.name}
          phoneNumber={callingContact.phone}
          onEndCall={() => setCallingContact(null)}
          theme={settings.theme}
        />
      )}

      {toastMessage && (
        <Animated.View
          entering={FadeIn.duration(250)}
          pointerEvents="none"
          style={[styles.toast, { bottom: 90 + insets.bottom, backgroundColor: isLight ? 'rgba(255,255,255,0.95)' : 'rgba(19,19,19,0.92)', borderColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.2)' }]}
        >
          <View style={styles.toastDot} />
          <Text style={[styles.toastText, { color: isLight ? '#131313' : '#fff' }]}>{toastMessage}</Text>
        </Animated.View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  fill: { flex: 1 },
  content: { flex: 1, position: 'relative', zIndex: 1 },
  toast: {
    position: 'absolute',
    left: '15%',
    right: '15%',
    zIndex: 50,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 30,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
  },
  toastDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10b981' },
  toastText: { fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
});
