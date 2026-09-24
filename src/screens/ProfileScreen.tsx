import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Image,
  TextInput,
  Alert,
  Platform,
} from 'react-native';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import {
  Phone,
  Settings,
  Edit3,
  Plus,
  X,
  Trash2,
  Image as ImageIcon,
  Upload,
  AlertCircle,
  Bell,
  Leaf,
} from 'lucide-react-native';
import { UserProfile, EmergencyContact, IncidentReport, EnvironmentalSubtype } from '../types';
import { ENVIRONMENTAL_SUBTYPE_LABELS } from '../constants/environmentalCatalog';
import { ANIME_AVATARS, DEFAULT_ANIME_AVATAR, avatarSource } from '../data/animeAvatars';

// Orden estable de subtipos para las barras de estadísticas.
const ENVIRONMENTAL_SUBTYPE_ORDER: EnvironmentalSubtype[] = [
  'derrame_quimico',
  'fuga_gas',
  'quema_residuos',
  'botadero_ilegal',
  'contaminacion_agua_suelo',
];

// ---------------------------------------------------------------------------
// ProfileScreen (React Native)
// - div/Tailwind -> View/StyleSheet
// - motion.* -> Animated.View (reanimated)
// - <input type="file"> + FileReader -> expo-image-picker (launchImageLibraryAsync)
// - Modales "fixed inset-0" -> <Modal transparent>
// ---------------------------------------------------------------------------

interface ProfileScreenProps {
  userProfile: UserProfile;
  reports?: IncidentReport[];
  onUpdateProfile?: (profile: UserProfile, feedbackMessage?: string) => void;
  onCallContact: (name: string, phone?: string) => void;
  onOpenSettings: () => void;
  theme?: 'dark' | 'light';
}

const PRESET_BANNERS = [
  'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?auto=format&fit=crop&w=1200&q=80',
];

interface AvatarPreset {
  id: string;
  name: string;
  category: 'illustration' | 'anime' | 'mecha' | 'minimal' | 'pixel' | 'rpg';
  categoryLabel: string;
  url: string;
}

const AVATAR_CATEGORIES = [
  { id: 'all', label: '✨ Todos' },
  { id: 'illustration', label: '🌸 Anime Ilustrado' },
  { id: 'anime', label: '🎌 Manga Vector' },
  { id: 'mecha', label: '🤖 Cyber Mecha' },
  { id: 'minimal', label: '🎨 Minimalista' },
  { id: 'pixel', label: '👾 Pixel Art' },
  { id: 'rpg', label: '⚔️ Aventura RPG' },
];

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

const PRESET_AVATARS: AvatarPreset[] = [
  ...ANIME_AVATARS.map((av) => ({
    id: av.id,
    name: av.name,
    category: 'illustration' as const,
    categoryLabel: 'Anime Ilustrado',
    url: av.url,
  })),
  { id: 'av-1', name: 'Shinji', category: 'anime', categoryLabel: 'Anime', url: 'https://api.dicebear.com/7.x/lorelei/png?seed=Shinji&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf' },
  { id: 'av-2', name: 'Asuka', category: 'anime', categoryLabel: 'Anime', url: 'https://api.dicebear.com/7.x/lorelei/png?seed=Asuka&backgroundColor=ffd5dc,b6e3f4,ffdfbf' },
  { id: 'av-3', name: 'Mikasa', category: 'anime', categoryLabel: 'Anime', url: 'https://api.dicebear.com/7.x/lorelei/png?seed=Mikasa&backgroundColor=ffd5dc,ffdfbf,d1d4f9' },
  { id: 'av-9', name: 'CyberPulse', category: 'mecha', categoryLabel: 'Mecha', url: 'https://api.dicebear.com/7.x/bottts/png?seed=CyberPulse&backgroundColor=b6e3f4,c0aede,d1d4f9' },
  { id: 'av-10', name: 'Nexus AI', category: 'mecha', categoryLabel: 'Mecha', url: 'https://api.dicebear.com/7.x/bottts/png?seed=Nexus&backgroundColor=ffd5dc,c0aede' },
  { id: 'av-14', name: 'Soren', category: 'minimal', categoryLabel: 'Minimal', url: 'https://api.dicebear.com/7.x/notionists/png?seed=Soren&backgroundColor=b6e3f4,c0aede,d1d4f9' },
  { id: 'av-15', name: 'Maya', category: 'minimal', categoryLabel: 'Minimal', url: 'https://api.dicebear.com/7.x/notionists/png?seed=Maya&backgroundColor=ffd5dc,ffdfbf' },
  { id: 'av-19', name: 'Pixel Hero', category: 'pixel', categoryLabel: 'Pixel', url: 'https://api.dicebear.com/7.x/pixel-art/png?seed=Hero&backgroundColor=b6e3f4,c0aede' },
  { id: 'av-20', name: 'Cyber Rogue', category: 'pixel', categoryLabel: 'Pixel', url: 'https://api.dicebear.com/7.x/pixel-art/png?seed=Rogue&backgroundColor=ffd5dc,ffdfbf' },
  { id: 'av-23', name: 'Aria RPG', category: 'rpg', categoryLabel: 'RPG', url: 'https://api.dicebear.com/7.x/adventurer/png?seed=Aria&backgroundColor=b6e3f4,ffd5dc' },
  { id: 'av-24', name: 'Ronin', category: 'rpg', categoryLabel: 'RPG', url: 'https://api.dicebear.com/7.x/adventurer/png?seed=Ronin&backgroundColor=c0aede,d1d4f9' },
];

export const RELATIONSHIP_PRESETS = [
  'Familiar',
  'Padre / Madre',
  'Pareja',
  'Hijo / Hija',
  'Hermano / Hermana',
  'Amigo / Amiga',
  'Médico / Doctor',
];

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
  userProfile,
  reports = [],
  onUpdateProfile,
  onCallContact,
  onOpenSettings,
  theme = 'dark',
}) => {
  const insets = useSafeAreaInsets();
  const isLight = theme === 'light';

  // Cálculos de actividad táctica (portado funcionalmente de arconde-gamc)
  const totalReports = reports.length;
  const activeReports = reports.filter((r) => r.status === 'in_progress').length;
  const resolvedReports = reports.filter((r) => r.status === 'resolved' || r.status === 'closed').length;

  // ODS 12 — estadísticas de incidentes ambientales (datos de la misma lista
  // de reportes, filtrando por categoría 'ambiental').
  const ambientalReports = reports.filter(
    (r) => r.category === 'ambiental' || r.subtipoAmbiental != null
  );
  const ambientalPercent = totalReports > 0 ? Math.round((ambientalReports.length / totalReports) * 100) : 0;
  const maxEnvCount = ENVIRONMENTAL_SUBTYPE_ORDER.reduce((max, sub) => {
    const c = ambientalReports.filter((r) => r.subtipoAmbiental === sub).length;
    return c > max ? c : max;
  }, 0);
  // Gravedad dominante: alta > media > baja (critical cuenta como alta).
  const ambientalSeverityMax = ambientalReports.some((r) => r.severity === 'high' || r.severity === 'critical')
    ? 'alta'
    : ambientalReports.some((r) => r.severity === 'medium')
      ? 'media'
      : ambientalReports.length > 0
        ? 'baja'
        : null;

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(userProfile.name);
  const [editPhone, setEditPhone] = useState(userProfile.phone);
  const [editEmail, setEditEmail] = useState(userProfile.email);
  const [editBloodType, setEditBloodType] = useState(userProfile.bloodType);
  const [editAllergies, setEditAllergies] = useState(userProfile.allergies);
  const [editAvatarUrl, setEditAvatarUrl] = useState(userProfile.avatarUrl);
  const [selectedAvatarCategory, setSelectedAvatarCategory] = useState<string>('all');
  const [editBannerUrl, setEditBannerUrl] = useState(userProfile.bannerUrl || PRESET_BANNERS[0]);

  // Modal Añadir Contacto
  const [showAddContact, setShowAddContact] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [newContactRel, setNewContactRel] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactNotifyOnSos, setNewContactNotifyOnSos] = useState(true);
  const [newContactAvatar, setNewContactAvatar] = useState(PRESET_AVATARS[0]?.url || DEFAULT_ANIME_AVATAR);
  const [newContactErrors, setNewContactErrors] = useState<{ name?: string; phone?: string }>({});

  // Modal Editar Contacto
  const [editingContact, setEditingContact] = useState<EmergencyContact | null>(null);
  const [editContactName, setEditContactName] = useState('');
  const [editContactRel, setEditContactRel] = useState('');
  const [editContactPhone, setEditContactPhone] = useState('');
  const [editContactNotifyOnSos, setEditContactNotifyOnSos] = useState(true);
  const [editContactAvatar, setEditContactAvatar] = useState('');
  const [editContactErrors, setEditContactErrors] = useState<{ name?: string; phone?: string }>({});

  const textMuted = '#8e9192';
  const cardBg = isLight ? 'rgba(255,255,255,0.9)' : 'rgba(20,20,22,0.9)';
  const cardBorder = isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.15)';
  const fg = isLight ? '#000' : '#fff';

  const validateContactInput = (name: string, phone: string) => {
    const errors: { name?: string; phone?: string } = {};
    if (!name.trim() || name.trim().length < 2) {
      errors.name = 'El nombre debe contener al menos 2 caracteres.';
    }
    const cleanPhone = phone.trim();
    const phoneRegex = /^[+]?[\d\s().-]{7,20}$/;
    if (!cleanPhone) {
      errors.phone = 'El teléfono es obligatorio.';
    } else if (!phoneRegex.test(cleanPhone)) {
      errors.phone = 'Ingresa un teléfono válido (mínimo 7 dígitos).';
    }
    return errors;
  };

  const handleOpenEditModal = () => {
    setEditName(userProfile.name);
    setEditPhone(userProfile.phone);
    setEditEmail(userProfile.email);
    setEditBloodType(userProfile.bloodType);
    setEditAllergies(userProfile.allergies);
    setEditAvatarUrl(userProfile.avatarUrl);
    setEditBannerUrl(userProfile.bannerUrl || PRESET_BANNERS[0]);
    setIsEditing(true);
  };

  const handleSaveProfile = () => {
    onUpdateProfile?.(
      {
        ...userProfile,
        name: editName.trim(),
        phone: editPhone.trim(),
        email: editEmail.trim(),
        bloodType: editBloodType,
        allergies: editAllergies.trim(),
        avatarUrl: editAvatarUrl,
        bannerUrl: editBannerUrl,
      },
      'PERFIL GUARDADO CON ÉXITO'
    );
    setIsEditing(false);
  };

  // Reemplaza <input type="file"> + FileReader.readAsDataURL
  const pickImage = async (onPicked: (uri: string) => void, aspect: [number, number]) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería para subir una imagen.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect,
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      onPicked(result.assets[0].uri);
    }
  };

  const getInitials = (name: string) =>
    name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();

  const handleAddContact = () => {
    const errors = validateContactInput(newContactName, newContactPhone);
    if (Object.keys(errors).length > 0) {
      setNewContactErrors(errors);
      return;
    }
    setNewContactErrors({});
    const newContact: EmergencyContact = {
      id: `cnt-${Date.now()}`,
      name: newContactName.trim(),
      relationship: newContactRel.trim() || 'Contacto de Emergencia',
      phone: newContactPhone.trim(),
      initials: getInitials(newContactName),
      avatarUrl: newContactAvatar || PRESET_AVATARS[0]?.url,
      notifyOnSos: newContactNotifyOnSos,
    };
    onUpdateProfile?.(
      {
        ...userProfile,
        emergencyContacts: [...userProfile.emergencyContacts, newContact],
      },
      `CONTACTO AÑADIDO: ${newContact.name.toUpperCase()}`
    );
    setNewContactName('');
    setNewContactRel('');
    setNewContactPhone('');
    setNewContactNotifyOnSos(true);
    setShowAddContact(false);
  };

  const handleOpenEditContact = (contact: EmergencyContact) => {
    setEditingContact(contact);
    setEditContactName(contact.name);
    setEditContactRel(contact.relationship);
    setEditContactPhone(contact.phone);
    setEditContactNotifyOnSos(contact.notifyOnSos !== false);
    setEditContactAvatar(contact.avatarUrl || PRESET_AVATARS[0]?.url || '');
    setEditContactErrors({});
  };

  const handleSaveContactEdit = () => {
    if (!editingContact) return;
    const errors = validateContactInput(editContactName, editContactPhone);
    if (Object.keys(errors).length > 0) {
      setEditContactErrors(errors);
      return;
    }
    setEditContactErrors({});
    const updatedContacts = userProfile.emergencyContacts.map((c) =>
      c.id === editingContact.id
        ? {
            ...c,
            name: editContactName.trim(),
            relationship: editContactRel.trim() || 'Contacto de Emergencia',
            phone: editContactPhone.trim(),
            initials: getInitials(editContactName),
            avatarUrl: editContactAvatar || c.avatarUrl,
            notifyOnSos: editContactNotifyOnSos,
          }
        : c
    );
    onUpdateProfile?.(
      { ...userProfile, emergencyContacts: updatedContacts },
      `CONTACTO ACTUALIZADO: ${editContactName.trim().toUpperCase()}`
    );
    setEditingContact(null);
  };

  const confirmDeleteContact = (contact: EmergencyContact) => {
    const doDelete = () => {
      onUpdateProfile?.(
        {
          ...userProfile,
          emergencyContacts: userProfile.emergencyContacts.filter((c) => c.id !== contact.id),
        },
        'CONTACTO ELIMINADO'
      );
    };

    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(`¿Deseas eliminar a ${contact.name} de tus contactos de emergencia?`)) {
        doDelete();
      }
    } else {
      Alert.alert(
        'Eliminar Contacto',
        `¿Deseas eliminar a ${contact.name} de tus contactos de confianza?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Eliminar', style: 'destructive', onPress: doDelete },
        ]
      );
    }
  };

  const renderAvatarPicker = (avatar: string, onChange: (v: string) => void) => (
    <View>
      <Text style={styles.fieldLabel}>Avatar del Contacto</Text>
      <View style={styles.avatarPreviewRow}>
        <Image source={avatarSource(avatar)} style={styles.avatarPreviewImage} />
        <TouchableOpacity
          style={[styles.uploadButtonInline, { backgroundColor: isLight ? '#000' : '#fff' }]}
          onPress={() => pickImage(onChange, [1, 1])}
        >
          <Upload size={12} color={isLight ? '#fff' : '#000'} />
          <Text style={{ color: isLight ? '#fff' : '#000', fontSize: 10, fontWeight: '700' }}>Subir Foto</Text>
        </TouchableOpacity>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {PRESET_AVATARS.slice(0, 12).map((av) => (
          <TouchableOpacity
            key={av.id}
            onPress={() => onChange(av.url)}
            style={[styles.avatarGridItem, { borderColor: avatar === av.url ? fg : cardBorder }]}
          >
            <Image source={avatarSource(av.url)} style={styles.avatarGridImage} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  const filteredAvatars =
    selectedAvatarCategory === 'all'
      ? PRESET_AVATARS
      : PRESET_AVATARS.filter((av) => av.category === selectedAvatarCategory);

  return (
    <View style={[styles.container, { paddingTop: 76 + insets.top }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Tarjeta de perfil con banner */}
        <View style={[styles.profileCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <View style={styles.banner}>
            <Image source={{ uri: userProfile.bannerUrl || PRESET_BANNERS[0] }} style={styles.bannerImage} />
            <TouchableOpacity
              style={[styles.bannerButton, { backgroundColor: isLight ? 'rgba(255,255,255,0.8)' : 'rgba(19,19,19,0.7)' }]}
              onPress={() => pickImage((uri) => onUpdateProfile?.({ ...userProfile, bannerUrl: uri }), [16, 9])}
            >
              <ImageIcon size={12} color={fg} />
              <Text style={{ color: fg, fontSize: 10, fontWeight: '700' }}>Subir Foto de Portada</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.profileBody}>
            <View style={styles.avatarWrapper}>
              <View style={[styles.avatarRing, { borderColor: isLight ? '#fff' : '#131313' }]}>
                <Image source={avatarSource(userProfile.avatarUrl)} style={styles.avatarImage} />
              </View>
              <View style={[styles.onlineDot, { borderColor: isLight ? '#fff' : '#131313' }]} />
            </View>

            <Text style={[styles.profileName, { color: fg }]}>{userProfile.name || 'Registrar nombre'}</Text>
            <Text style={[styles.profilePhone, !userProfile.phone && { opacity: 0.4 }]}>{userProfile.phone || 'Registrar teléfono'}</Text>

            <View style={styles.pillsRow}>
              <View style={[styles.pill, { borderColor: cardBorder, backgroundColor: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)' }]}>
                <Text style={{ color: fg, fontSize: 11 }}>
                  Sangre: <Text style={{ fontWeight: '800' }}>{userProfile.bloodType || 'No especificado'}</Text>
                </Text>
              </View>
              <View style={[styles.pill, { borderColor: cardBorder, backgroundColor: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)' }]}>
                <Text style={{ color: fg, fontSize: 11 }}>
                  Alergias: <Text style={{ fontWeight: '800' }}>{userProfile.allergies || 'No especificado'}</Text>
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.editProfileButton, { backgroundColor: isLight ? '#000' : '#fff' }]}
              onPress={handleOpenEditModal}
            >
              <Edit3 size={13} color={isLight ? '#fff' : '#000'} />
              <Text style={{ color: isLight ? '#fff' : '#000', fontWeight: '800', fontSize: 11 }}>
                EDITAR PERFIL Y DISEÑO
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Estadísticas de actividad táctica (portado funcionalmente de arconde-gamc) */}
        <View style={[styles.statsRowCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <View style={styles.statCol}>
            <Text style={[styles.statNumber, { color: fg }]}>{totalReports}</Text>
            <Text style={[styles.statLabel, { color: textMuted }]}>TOTAL REPORTES</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: cardBorder }]} />
          <View style={styles.statCol}>
            <Text style={[styles.statNumber, { color: '#f59e0b' }]}>{activeReports}</Text>
            <Text style={[styles.statLabel, { color: '#f59e0b' }]}>EN CURSO</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: cardBorder }]} />
          <View style={styles.statCol}>
            <Text style={[styles.statNumber, { color: '#10b981' }]}>{resolvedReports}</Text>
            <Text style={[styles.statLabel, { color: '#10b981' }]}>RESUELTOS</Text>
          </View>
        </View>

        {/* ODS 12 — estadísticas ambientales */}
        <View style={[styles.envStatsCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <View style={styles.envStatsHeader}>
            <Leaf size={14} color="#22c55e" />
            <Text style={[styles.envStatsTitle, { color: fg }]}>INCIDENTES AMBIENTALES</Text>
            <Text style={[styles.envStatsPercent, { color: '#22c55e' }]}>{ambientalPercent}%</Text>
          </View>
          <Text style={[styles.envStatsCount, { color: textMuted }]}>
            {ambientalReports.length} de {totalReports} reportes
          </Text>

          {ambientalReports.length === 0 ? (
            <Text style={[styles.envEmpty, { color: textMuted }]}>Sin incidentes ambientales todavía</Text>
          ) : (
            <>
              {/* Barras por subtipo (minimalistas, consistentes con el estilo actual) */}
              <View style={styles.envBars}>
                {ENVIRONMENTAL_SUBTYPE_ORDER.map((sub) => {
                  const count = ambientalReports.filter((r) => r.subtipoAmbiental === sub).length;
                  const width = `${maxEnvCount > 0 ? Math.max(6, Math.round((count / maxEnvCount) * 100)) : 0}%` as const;
                  return (
                    <View key={sub} style={styles.envBarRow}>
                      <Text numberOfLines={1} style={[styles.envBarLabel, { color: textMuted }]}>
                        {ENVIRONMENTAL_SUBTYPE_LABELS[sub]}
                      </Text>
                      <View style={styles.envBarTrack}>
                        <View style={[styles.envBarFill, { width, backgroundColor: '#22c55e' }]} />
                      </View>
                      <Text style={[styles.envBarValue, { color: fg }]}>{count}</Text>
                    </View>
                  );
                })}
              </View>

              {/* Indicador de gravedad de los incidentes ambientales */}
              <View style={styles.envSeverityRow}>
                {(['baja', 'media', 'alta'] as const).map((nivel) => {
                  const active = ambientalSeverityMax === nivel;
                  const colors = { baja: '#10b981', media: '#f59e0b', alta: '#ef4444' };
                  return (
                    <View
                      key={nivel}
                      style={[
                        styles.envSeverityPill,
                        { borderColor: active ? colors[nivel] : cardBorder, backgroundColor: active ? `${colors[nivel]}22` : 'transparent' },
                      ]}
                    >
                      <Text style={{ color: active ? colors[nivel] : textMuted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' }}>
                        {nivel}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </>
          )}
        </View>

        {/* Contactos de emergencia */}
        <View style={styles.contactsHeader}>
          <View>
            <Text style={[styles.sectionTitle, { color: fg }]}>Contactos de Confianza</Text>
            <Text style={styles.sectionSubtitle}>Notificación automática SOS, edición y llamada directa</Text>
          </View>
          <TouchableOpacity
            style={[styles.addContactButton, { backgroundColor: isLight ? '#000' : '#fff' }]}
            onPress={() => {
              setNewContactName('');
              setNewContactRel('');
              setNewContactPhone('');
              setNewContactNotifyOnSos(true);
              setNewContactAvatar(PRESET_AVATARS[0]?.url || DEFAULT_ANIME_AVATAR);
              setNewContactErrors({});
              setShowAddContact(true);
            }}
          >
            <Plus size={16} color={isLight ? '#fff' : '#000'} />
          </TouchableOpacity>
        </View>

        <View style={{ gap: 10 }}>
          {userProfile.emergencyContacts.length === 0 ? (
            <View style={[styles.contactCard, { backgroundColor: cardBg, borderColor: cardBorder, paddingVertical: 20, alignItems: 'center' }]}>
              <Text style={{ color: '#8e9192', fontSize: 13 }}>No hay contactos de emergencia registrados</Text>
              <Text style={{ color: '#8e9192', fontSize: 11, marginTop: 4 }}>Presiona + para agregar un contacto de confianza</Text>
            </View>
          ) : userProfile.emergencyContacts.map((contact, i) => (
            <Animated.View
              key={contact.id}
              entering={FadeInUp.delay(i * 40).duration(250)}
              style={[styles.contactCard, { backgroundColor: cardBg, borderColor: cardBorder }]}
            >
              <View style={styles.contactLeft}>
                {contact.avatarUrl ? (
                  <Image source={avatarSource(contact.avatarUrl)} style={styles.contactAvatar} />
                ) : (
                  <View style={[styles.contactInitials, { borderColor: cardBorder }]}>
                    <Text style={{ color: fg, fontWeight: '800', fontSize: 13 }}>
                      {contact.initials || getInitials(contact.name)}
                    </Text>
                  </View>
                )}
                <View style={{ flexShrink: 1 }}>
                  <Text style={[styles.contactName, { color: fg }]} numberOfLines={1}>
                    {contact.name}
                  </Text>
                  <Text style={styles.contactMeta}>{contact.relationship}</Text>
                  <View style={styles.phoneMetaRow}>
                    <Text style={styles.contactMeta} numberOfLines={1}>
                      {contact.phone}
                    </Text>
                    {contact.notifyOnSos !== false && (
                      <View style={styles.sosChip}>
                        <Bell size={9} color="#10b981" />
                        <Text style={styles.sosChipText}>AUTO SOS</Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>

              <View style={styles.contactActions}>
                <TouchableOpacity
                  style={[styles.iconButton, { borderColor: cardBorder }]}
                  onPress={() => handleOpenEditContact(contact)}
                >
                  <Edit3 size={14} color={fg} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.callButton, { backgroundColor: isLight ? '#000' : '#fff' }]}
                  onPress={() => onCallContact(contact.name, contact.phone)}
                >
                  <Phone size={12} color={isLight ? '#fff' : '#000'} />
                  <Text style={{ color: isLight ? '#fff' : '#000', fontSize: 10, fontWeight: '700' }}>
                    Llamar
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.deleteIconButton}
                  onPress={() => confirmDeleteContact(contact)}
                >
                  <Trash2 size={14} color="#8e9192" />
                </TouchableOpacity>
              </View>
            </Animated.View>
          ))}
        </View>

        {/* Acceso a ajustes */}
        <TouchableOpacity
          style={[styles.settingsShortcut, { backgroundColor: cardBg, borderColor: cardBorder }]}
          onPress={onOpenSettings}
        >
          <View style={styles.settingsLeft}>
            <View style={[styles.settingsIconBox, { backgroundColor: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.1)' }]}>
              <Settings size={16} color={fg} />
            </View>
            <View>
              <Text style={[styles.settingsTitle, { color: fg }]}>Ajustes del Sistema</Text>
              <Text style={styles.settingsSubtitle}>Seguridad, sensores y preferencias</Text>
            </View>
          </View>
          <Text style={[styles.settingsArrow, { color: fg }]}>ABRIR →</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* MODAL: Editar perfil y diseños */}
      <Modal visible={isEditing} transparent animationType="fade" onRequestClose={() => setIsEditing(false)}>
        <View style={[styles.modalOverlay, { backgroundColor: isLight ? 'rgba(0,0,0,0.4)' : 'rgba(12,12,13,0.95)' }]}>
          <ScrollView contentContainerStyle={styles.modalScrollContent}>
            <Animated.View entering={FadeIn.duration(200)} style={[styles.modalCard, { backgroundColor: isLight ? '#f7f7f8' : '#141416', borderColor: cardBorder }]}>
              <View style={[styles.modalHeader, { borderBottomColor: cardBorder }]}>
                <View>
                  <Text style={[styles.modalTitle, { color: fg }]}>Editar Perfil y Diseños</Text>
                  <Text style={styles.modalSubtitle}>Elige nuevos estilos de avatar y portada</Text>
                </View>
                <TouchableOpacity
                  style={[styles.modalCloseButton, { backgroundColor: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.1)' }]}
                  onPress={() => setIsEditing(false)}
                >
                  <X size={16} color={fg} />
                </TouchableOpacity>
              </View>

              {/* Selector de portada */}
              <Text style={styles.fieldLabel}>Fondo de Portada</Text>
              <View style={styles.bannerPreviewWrapper}>
                <Image source={{ uri: editBannerUrl }} style={styles.bannerPreviewImage} />
                <TouchableOpacity
                  style={styles.uploadOverlay}
                  onPress={() => pickImage(setEditBannerUrl, [16, 9])}
                >
                  <Upload size={14} color="#000" />
                  <Text style={{ color: '#000', fontSize: 10, fontWeight: '700' }}>Subir Imagen</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.bannerGrid}>
                {PRESET_BANNERS.map((url, i) => (
                  <TouchableOpacity
                    key={i}
                    onPress={() => setEditBannerUrl(url)}
                    style={[
                      styles.bannerThumb,
                      { borderColor: editBannerUrl === url ? fg : cardBorder },
                      editBannerUrl === url && styles.bannerThumbActive,
                    ]}
                  >
                    <Image source={{ uri: url }} style={styles.bannerThumbImage} />
                  </TouchableOpacity>
                ))}
              </View>

              {/* Selector de avatar */}
              <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Avatar de Perfil</Text>
              <View style={styles.avatarPreviewRow}>
                <Image source={avatarSource(editAvatarUrl)} style={styles.avatarPreviewImage} />
                <TouchableOpacity
                  style={[styles.uploadButtonInline, { backgroundColor: isLight ? '#000' : '#fff' }]}
                  onPress={() => pickImage(setEditAvatarUrl, [1, 1])}
                >
                  <Upload size={12} color={isLight ? '#fff' : '#000'} />
                  <Text style={{ color: isLight ? '#fff' : '#000', fontSize: 10, fontWeight: '700' }}>
                    Subir foto propia
                  </Text>
                </TouchableOpacity>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                {AVATAR_CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat.id}
                    onPress={() => setSelectedAvatarCategory(cat.id)}
                    style={[
                      styles.categoryChip,
                      { borderColor: cardBorder },
                      selectedAvatarCategory === cat.id && { backgroundColor: fg },
                    ]}
                  >
                    <Text
                      style={{
                        fontSize: 10,
                        color: selectedAvatarCategory === cat.id ? (isLight ? '#fff' : '#000') : textMuted,
                        fontWeight: '700',
                      }}
                    >
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <View style={styles.avatarGrid}>
                {filteredAvatars.slice(0, 24).map((av) => (
                  <TouchableOpacity
                    key={av.id}
                    onPress={() => setEditAvatarUrl(av.url)}
                    style={[
                      styles.avatarGridItem,
                      { borderColor: editAvatarUrl === av.url ? fg : cardBorder },
                    ]}
                  >
                    <Image source={avatarSource(av.url)} style={styles.avatarGridImage} />
                  </TouchableOpacity>
                ))}
              </View>

              {/* Campos de texto */}
              <View style={{ gap: 10, marginTop: 16 }}>
                <LabeledInput label="Nombre completo" value={editName} onChangeText={setEditName} isLight={isLight} />
                <LabeledInput label="Teléfono" value={editPhone} onChangeText={setEditPhone} isLight={isLight} keyboardType="phone-pad" />
                <LabeledInput label="Correo electrónico" value={editEmail} onChangeText={setEditEmail} isLight={isLight} keyboardType="email-address" />
                <View>
                  <Text style={styles.fieldLabel}>Tipo de sangre</Text>
                  <View style={styles.bloodTypeRow}>
                    {BLOOD_TYPES.map((bt) => (
                      <TouchableOpacity
                        key={bt}
                        onPress={() => setEditBloodType(bt)}
                        style={[
                          styles.bloodTypeChip,
                          { borderColor: editBloodType === bt ? fg : cardBorder },
                          editBloodType === bt && { backgroundColor: fg },
                        ]}
                      >
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: '800',
                            color: editBloodType === bt ? (isLight ? '#fff' : '#000') : textMuted,
                          }}
                        >
                          {bt}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                <LabeledInput label="Alergias" value={editAllergies} onChangeText={setEditAllergies} isLight={isLight} />
              </View>

              <TouchableOpacity
                style={[styles.saveButton, { backgroundColor: isLight ? '#000' : '#fff' }]}
                onPress={handleSaveProfile}
              >
                <Text style={{ color: isLight ? '#fff' : '#131313', fontWeight: '800', fontSize: 14 }}>
                  GUARDAR CAMBIOS
                </Text>
              </TouchableOpacity>
            </Animated.View>
          </ScrollView>
        </View>
      </Modal>

      {/* MODAL: Añadir contacto */}
      <Modal visible={showAddContact} transparent animationType="fade" onRequestClose={() => setShowAddContact(false)}>
        <View style={[styles.modalOverlay, { backgroundColor: 'rgba(12,12,13,0.9)' }]}>
          <ScrollView contentContainerStyle={styles.modalScrollContent}>
            <Animated.View entering={FadeIn.duration(200)} style={[styles.modalCard, { backgroundColor: isLight ? '#f7f7f8' : '#141416', borderColor: cardBorder }]}>
              <View style={[styles.modalHeader, { borderBottomColor: cardBorder }]}>
                <View>
                  <Text style={[styles.modalTitle, { color: fg }]}>Nuevo Contacto</Text>
                  <Text style={styles.modalSubtitle}>Agrega un contacto para notificaciones de emergencia</Text>
                </View>
                <TouchableOpacity
                  style={[styles.modalCloseButton, { backgroundColor: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.1)' }]}
                  onPress={() => setShowAddContact(false)}
                >
                  <X size={16} color={fg} />
                </TouchableOpacity>
              </View>
              <View style={{ gap: 12 }}>
                <LabeledInput
                  label="Nombre Completo *"
                  value={newContactName}
                  onChangeText={(v) => {
                    setNewContactName(v);
                    if (newContactErrors.name) setNewContactErrors((p) => ({ ...p, name: undefined }));
                  }}
                  isLight={isLight}
                  placeholder="Ej: Laura Vargas"
                  error={newContactErrors.name}
                />

                <View>
                  <Text style={styles.inputLabel}>Relación o Parentesco</Text>
                  <TextInput
                    value={newContactRel}
                    onChangeText={setNewContactRel}
                    placeholder="Ej: Madre, Pareja, Hermano"
                    placeholderTextColor="#8e9192"
                    style={[
                      styles.textInput,
                      {
                        backgroundColor: isLight ? '#fff' : 'rgba(255,255,255,0.05)',
                        borderColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.15)',
                        color: isLight ? '#000' : '#fff',
                      },
                    ]}
                  />
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginTop: 8 }}>
                    {RELATIONSHIP_PRESETS.map((preset) => (
                      <TouchableOpacity
                        key={preset}
                        onPress={() => setNewContactRel(preset)}
                        style={[
                          styles.presetRelChip,
                          {
                            backgroundColor: newContactRel === preset ? fg : isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)',
                            borderColor: newContactRel === preset ? fg : cardBorder,
                          },
                        ]}
                      >
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: '700',
                            color: newContactRel === preset ? (isLight ? '#fff' : '#000') : textMuted,
                          }}
                        >
                          {preset}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>

                <LabeledInput
                  label="Teléfono de Emergencia *"
                  value={newContactPhone}
                  onChangeText={(v) => {
                    setNewContactPhone(v);
                    if (newContactErrors.phone) setNewContactErrors((p) => ({ ...p, phone: undefined }));
                  }}
                  isLight={isLight}
                  keyboardType="phone-pad"
                  placeholder="+591 70000000"
                  error={newContactErrors.phone}
                />

                {/* Toggle SOS automático */}
                <View style={[styles.toggleContainer, { backgroundColor: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)', borderColor: cardBorder }]}>
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text style={[styles.toggleTitle, { color: fg }]}>Notificar en caso de SOS</Text>
                    <Text style={styles.toggleSubtitle}>Envía alerta y ubicación automática cuando se active el botón de pánico</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setNewContactNotifyOnSos(!newContactNotifyOnSos)}
                    style={[
                      styles.tacticalSwitch,
                      {
                        backgroundColor: newContactNotifyOnSos ? '#10b981' : isLight ? '#d1d5db' : '#27272a',
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.tacticalSwitchThumb,
                        {
                          transform: [{ translateX: newContactNotifyOnSos ? 18 : 2 }],
                        },
                      ]}
                    />
                  </TouchableOpacity>
                </View>

                {renderAvatarPicker(newContactAvatar, setNewContactAvatar)}
              </View>
              <TouchableOpacity
                style={[styles.saveButton, { backgroundColor: isLight ? '#000' : '#fff' }]}
                onPress={handleAddContact}
              >
                <Text style={{ color: isLight ? '#fff' : '#131313', fontWeight: '800', fontSize: 14 }}>
                  AÑADIR CONTACTO
                </Text>
              </TouchableOpacity>
            </Animated.View>
          </ScrollView>
        </View>
      </Modal>

      {/* MODAL: Editar contacto */}
      <Modal visible={!!editingContact} transparent animationType="fade" onRequestClose={() => setEditingContact(null)}>
        <View style={[styles.modalOverlay, { backgroundColor: 'rgba(12,12,13,0.9)' }]}>
          <ScrollView contentContainerStyle={styles.modalScrollContent}>
            <Animated.View entering={FadeIn.duration(200)} style={[styles.modalCard, { backgroundColor: isLight ? '#f7f7f8' : '#141416', borderColor: cardBorder }]}>
              <View style={[styles.modalHeader, { borderBottomColor: cardBorder }]}>
                <View>
                  <Text style={[styles.modalTitle, { color: fg }]}>Editar Contacto</Text>
                  <Text style={styles.modalSubtitle}>Modifica los datos y preferencias del contacto</Text>
                </View>
                <TouchableOpacity
                  style={[styles.modalCloseButton, { backgroundColor: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.1)' }]}
                  onPress={() => setEditingContact(null)}
                >
                  <X size={16} color={fg} />
                </TouchableOpacity>
              </View>
              <View style={{ gap: 12 }}>
                <LabeledInput
                  label="Nombre Completo *"
                  value={editContactName}
                  onChangeText={(v) => {
                    setEditContactName(v);
                    if (editContactErrors.name) setEditContactErrors((p) => ({ ...p, name: undefined }));
                  }}
                  isLight={isLight}
                  error={editContactErrors.name}
                />

                <View>
                  <Text style={styles.inputLabel}>Relación o Parentesco</Text>
                  <TextInput
                    value={editContactRel}
                    onChangeText={setEditContactRel}
                    placeholder="Ej: Madre, Pareja, Hermano"
                    placeholderTextColor="#8e9192"
                    style={[
                      styles.textInput,
                      {
                        backgroundColor: isLight ? '#fff' : 'rgba(255,255,255,0.05)',
                        borderColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.15)',
                        color: isLight ? '#000' : '#fff',
                      },
                    ]}
                  />
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginTop: 8 }}>
                    {RELATIONSHIP_PRESETS.map((preset) => (
                      <TouchableOpacity
                        key={preset}
                        onPress={() => setEditContactRel(preset)}
                        style={[
                          styles.presetRelChip,
                          {
                            backgroundColor: editContactRel === preset ? fg : isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)',
                            borderColor: editContactRel === preset ? fg : cardBorder,
                          },
                        ]}
                      >
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: '700',
                            color: editContactRel === preset ? (isLight ? '#fff' : '#000') : textMuted,
                          }}
                        >
                          {preset}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>

                <LabeledInput
                  label="Teléfono de Emergencia *"
                  value={editContactPhone}
                  onChangeText={(v) => {
                    setEditContactPhone(v);
                    if (editContactErrors.phone) setEditContactErrors((p) => ({ ...p, phone: undefined }));
                  }}
                  isLight={isLight}
                  keyboardType="phone-pad"
                  error={editContactErrors.phone}
                />

                {/* Toggle SOS automático */}
                <View style={[styles.toggleContainer, { backgroundColor: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)', borderColor: cardBorder }]}>
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text style={[styles.toggleTitle, { color: fg }]}>Notificar en caso de SOS</Text>
                    <Text style={styles.toggleSubtitle}>Envía alerta y ubicación automática cuando se active el botón de pánico</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setEditContactNotifyOnSos(!editContactNotifyOnSos)}
                    style={[
                      styles.tacticalSwitch,
                      {
                        backgroundColor: editContactNotifyOnSos ? '#10b981' : isLight ? '#d1d5db' : '#27272a',
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.tacticalSwitchThumb,
                        {
                          transform: [{ translateX: editContactNotifyOnSos ? 18 : 2 }],
                        },
                      ]}
                    />
                  </TouchableOpacity>
                </View>

                {renderAvatarPicker(editContactAvatar, setEditContactAvatar)}
              </View>
              <TouchableOpacity
                style={[styles.saveButton, { backgroundColor: isLight ? '#000' : '#fff' }]}
                onPress={handleSaveContactEdit}
              >
                <Text style={{ color: isLight ? '#fff' : '#131313', fontWeight: '800', fontSize: 14 }}>
                  GUARDAR CAMBIOS
                </Text>
              </TouchableOpacity>
            </Animated.View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
};

// Input reutilizable con etiqueta, soporte de errores y placeholder
const LabeledInput: React.FC<{
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  isLight: boolean;
  keyboardType?: 'default' | 'phone-pad' | 'email-address';
  placeholder?: string;
  error?: string;
}> = ({ label, value, onChangeText, isLight, keyboardType = 'default', placeholder, error }) => (
  <View>
    <Text style={styles.inputLabel}>{label}</Text>
    <TextInput
      value={value}
      onChangeText={onChangeText}
      keyboardType={keyboardType}
      placeholder={placeholder}
      placeholderTextColor="#8e9192"
      style={[
        styles.textInput,
        {
          backgroundColor: isLight ? '#fff' : 'rgba(255,255,255,0.05)',
          color: isLight ? '#000' : '#fff',
          borderColor: error ? '#ef4444' : isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.15)',
        },
      ]}
    />
    {error ? (
      <View style={styles.inputErrorRow}>
        <AlertCircle size={11} color="#ef4444" />
        <Text style={styles.inputErrorText}>{error}</Text>
      </View>
    ) : null}
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16 },
  profileCard: { borderRadius: 28, overflow: 'hidden', borderWidth: 1, marginBottom: 20 },
  banner: { height: 132, width: '100%', backgroundColor: '#1a1a1b' },
  bannerImage: { width: '100%', height: '100%', opacity: 0.85 },
  bannerButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  profileBody: { paddingHorizontal: 20, paddingBottom: 20, marginTop: -56, alignItems: 'center' },
  avatarWrapper: { marginBottom: 10 },
  avatarRing: { width: 96, height: 96, borderRadius: 48, borderWidth: 4, overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
  onlineDot: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#10b981',
    borderWidth: 2,
  },
  profileName: { fontWeight: '800', fontSize: 22 },
  profilePhone: { color: '#8e9192', fontSize: 11, marginTop: 4 },
  pillsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  pill: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  editProfileButton: {
    marginTop: 14,
    paddingHorizontal: 20,
    paddingVertical: 9,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  contactsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: { fontWeight: '800', fontSize: 15, textTransform: 'uppercase' },
  sectionSubtitle: { color: '#8e9192', fontSize: 10 },
  addContactButton: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 24,
    borderWidth: 1,
    gap: 10,
  },
  contactLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 },
  contactAvatar: { width: 40, height: 40, borderRadius: 20 },
  contactInitials: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  contactName: { fontWeight: '800', fontSize: 14 },
  contactMeta: { color: '#8e9192', fontSize: 10 },
  contactActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  iconButton: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  callButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 20,
  },
  deleteIconButton: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  settingsShortcut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 24,
    borderWidth: 1,
    marginTop: 20,
  },
  settingsLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  settingsIconBox: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  settingsTitle: { fontWeight: '800', fontSize: 14, textTransform: 'uppercase' },
  settingsSubtitle: { color: '#8e9192', fontSize: 10 },
  settingsArrow: { fontWeight: '700', fontSize: 11, textTransform: 'uppercase' },
  modalOverlay: { flex: 1 },
  modalScrollContent: { flexGrow: 1, justifyContent: 'center', padding: 16 },
  modalCard: { maxWidth: 420, width: '100%', alignSelf: 'center', borderRadius: 28, padding: 20, borderWidth: 1 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    paddingBottom: 12,
    marginBottom: 16,
  },
  modalTitle: { fontWeight: '800', fontSize: 18, textTransform: 'uppercase' },
  modalSubtitle: { color: '#8e9192', fontSize: 10, marginTop: 2 },
  modalCloseButton: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  fieldLabel: { color: '#8e9192', fontSize: 11, textTransform: 'uppercase', fontWeight: '700', marginBottom: 6 },
  bannerPreviewWrapper: { height: 112, borderRadius: 16, overflow: 'hidden', marginBottom: 10 },
  bannerPreviewImage: { width: '100%', height: '100%' },
  uploadOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  bannerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  bannerThumb: { width: '18%', height: 44, borderRadius: 12, overflow: 'hidden', borderWidth: 1, opacity: 0.7 },
  bannerThumbActive: { opacity: 1, borderWidth: 2 },
  bannerThumbImage: { width: '100%', height: '100%' },
  avatarPreviewRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  avatarPreviewImage: { width: 56, height: 56, borderRadius: 28 },
  uploadButtonInline: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  categoryChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, marginRight: 6 },
  avatarGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  avatarGridItem: { width: 52, height: 52, borderRadius: 26, overflow: 'hidden', borderWidth: 2 },
  avatarGridImage: { width: '100%', height: '100%' },
  inputLabel: { color: '#8e9192', fontSize: 10, textTransform: 'uppercase', fontWeight: '700', marginBottom: 4 },
  textInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13 },
  bloodTypeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  bloodTypeChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  saveButton: { marginTop: 18, paddingVertical: 14, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  statsRowCard: {
    marginHorizontal: 0,
    marginTop: 0,
    marginBottom: 20,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  // ODS 12 — estadísticas ambientales
  envStatsCard: {
    marginBottom: 20,
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
  },
  envStatsHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  envStatsTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1, flex: 1 },
  envStatsPercent: { fontSize: 13, fontWeight: '800' },
  envStatsCount: { fontSize: 10, marginTop: 2 },
  envEmpty: { fontSize: 12, marginTop: 10 },
  envBars: { marginTop: 12, gap: 8 },
  envBarRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  envBarLabel: { fontSize: 10, width: '38%' },
  envBarTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(128,128,128,0.2)', overflow: 'hidden' },
  envBarFill: { height: '100%', borderRadius: 3 },
  envBarValue: { fontSize: 11, fontWeight: '700', minWidth: 16, textAlign: 'right', fontVariant: ['tabular-nums'] },
  envSeverityRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  envSeverityPill: { borderRadius: 999, borderWidth: 1, paddingVertical: 4, paddingHorizontal: 12 },
  statCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statDivider: {
    width: 1,
    height: 28,
  },
  statNumber: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginTop: 3,
    textTransform: 'uppercase',
  },
  phoneMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  sosChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(16,185,129,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  sosChipText: {
    color: '#10b981',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  presetRelChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
  },
  toggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 4,
  },
  toggleTitle: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  toggleSubtitle: {
    fontSize: 10,
    color: '#8e9192',
    marginTop: 2,
  },
  tacticalSwitch: {
    width: 44,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
  },
  tacticalSwitchThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  inputErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  inputErrorText: {
    color: '#ef4444',
    fontSize: 10,
    fontWeight: '600',
  },
});
