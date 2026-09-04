import { IncidentReport, UserProfile, SystemPermissions, SystemSettings } from '../types';
import { ANIME_AVATARS, DEFAULT_ANIME_AVATAR } from './animeAvatars';

export const INITIAL_REPORTS: IncidentReport[] = [
  {
    id: '#REP-4821',
    category: 'traffic',
    categoryLabel: 'Accidente de Tránsito',
    title: 'Colisión vehicular en cruce principal',
    description: 'Impacto lateral entre dos vehículos. Una persona con contusiones leves asistida en el lugar.',
    severity: 'high',
    status: 'in_progress',
    dispatchStep: 'en_route',
    date: '20 Ago 2026',
    time: '14:32',
    unitAssigned: 'AMBULANCIA_T4',
    originDepot: 'Estación Central de Paramédicos',
    etaMinutes: 3,
    etaSeconds: 45,
    location: 'Av. Insurgentes Sur #450, Sector 4',
    coordinates: { lat: 19.4326, lng: -99.1332 },
    aiVoiceMessage: 'Unidad de paramédicos en camino hacia su ubicación. Conserve la calma.',
    imageUrl: 'https://images.unsplash.com/photo-1543353071-10c8ba85a904?auto=format&fit=crop&w=800&q=80'
  },
  {
    id: '#REP-4819',
    category: 'fire',
    categoryLabel: 'Incendio',
    title: 'Conato de incendio en local comercial',
    description: 'Humo denso proveniente de cocina comercial. Controlado por brigada de bomberos sin heridos.',
    severity: 'critical',
    status: 'resolved',
    dispatchStep: 'resolved',
    date: '19 Ago 2026',
    time: '19:40',
    unitAssigned: 'BOMBEROS_B2',
    originDepot: 'Estación de Bomberos #4',
    etaMinutes: 0,
    etaSeconds: 0,
    location: 'Calle Reforma #120, Centro',
    coordinates: { lat: 19.4342, lng: -99.1386 },
    aiVoiceMessage: 'Incendio extinguido y zona segura declarada.',
    imageUrl: 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?auto=format&fit=crop&w=800&q=80'
  },
  {
    id: '#REP-4805',
    category: 'medical',
    categoryLabel: 'Médica',
    title: 'Asistencia por crisis asmática severa',
    description: 'Paciente estabilizado con oxigenoterapia y trasladado a centro de salud.',
    severity: 'medium',
    status: 'closed',
    dispatchStep: 'resolved',
    date: '15 Ago 2026',
    time: '08:15',
    unitAssigned: 'AMBULANCIA_M1',
    originDepot: 'Hospital General',
    etaMinutes: 0,
    etaSeconds: 0,
    location: 'Residencial Los Sauces, Torre B',
    coordinates: { lat: 19.4289, lng: -99.1412 },
    aiVoiceMessage: 'Atención completada con éxito.'
  },
  {
    id: '#REP-4792',
    category: 'robbery',
    categoryLabel: 'Robo',
    title: 'Intento de asalto a transeúnte',
    description: 'Patrulla de seguridad acudió al llamado. Sujeto disuadido y perímetro resguardado.',
    severity: 'medium',
    status: 'closed',
    dispatchStep: 'resolved',
    date: '12 Ago 2026',
    time: '23:10',
    unitAssigned: 'PATRULLA_T8',
    originDepot: 'Comando de Respuesta Rápida Delta',
    etaMinutes: 0,
    etaSeconds: 0,
    location: 'Parque España, Acceso Este',
    coordinates: { lat: 19.4391, lng: -99.1298 }
  }
];

export const INITIAL_USER_PROFILE: UserProfile = {
  name: 'Misaki Morales',
  email: 'misaki.morales@secureos.org',
  phone: '+52 55 4920 1834',
  bloodType: 'O+',
  allergies: 'Penicilina, Polen',
  avatarUrl: DEFAULT_ANIME_AVATAR,
  bannerUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80',
  emergencyContacts: [
    {
      id: 'cnt-1',
      name: 'Elena Morales',
      relationship: 'Madre',
      phone: '+52 55 3192 8841',
      initials: 'EM',
      avatarUrl: ANIME_AVATARS[1]?.url || DEFAULT_ANIME_AVATAR
    },
    {
      id: 'cnt-2',
      name: 'Dr. Carlos Mendoza',
      relationship: 'Médico de Cabecera',
      phone: '+52 55 8821 9043',
      initials: 'CM',
      avatarUrl: ANIME_AVATARS[2]?.url || DEFAULT_ANIME_AVATAR
    },
    {
      id: 'cnt-3',
      name: 'Central 911 Directo',
      relationship: 'Servicios de Emergencia',
      phone: '911',
      initials: '911',
      avatarUrl: ANIME_AVATARS[3]?.url || DEFAULT_ANIME_AVATAR
    }
  ]
};

export const INITIAL_PERMISSIONS: SystemPermissions = {
  location: false,
  camera: false,
  microphone: false,
  notifications: false
};

export const INITIAL_SETTINGS: SystemSettings = {
  theme: 'dark',
  silentAlarmMode: false,
  autoGpsBroadcast: true,
  fallImpactDetection: true,
  endToEndEncryption: true,
  voiceTranscription: true,
  autoNotifyContacts: true,
  arrivalAlerts: true,
  sirenVolume: 'max',
  hapticFeedback: true,
  language: 'es',
  hapticEmergencyVibe: true,
  screenPrivacyShield: false,
  confirmCancelEmergency: true,
  sosAudioChime: true,
  highAccuracyGps: true,
  autoSaveTranscripts: true
};
