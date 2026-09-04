import { IncidentReport, UserProfile, SystemPermissions, SystemSettings } from '../types';
import { DEFAULT_ANIME_AVATAR } from './animeAvatars';

export const INITIAL_REPORTS: IncidentReport[] = [];

export const INITIAL_USER_PROFILE: UserProfile = {
  name: '',
  email: '',
  phone: '',
  bloodType: '',
  allergies: '',
  avatarUrl: DEFAULT_ANIME_AVATAR,
  bannerUrl: '',
  emergencyContacts: []
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
