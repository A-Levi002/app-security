export type NavTab = 'home' | 'history' | 'profile';
export type NavigationTab = NavTab;

export type EmergencyCategory =
  | 'traffic'
  | 'fire'
  | 'medical'
  | 'robbery';

export type IncidentStatus = 'in_progress' | 'resolved' | 'closed';

export type DispatchStep =
  | 'received'
  | 'classified'
  | 'resources_assigned'
  | 'en_route'
  | 'resolved';

export type IncidentSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface ChatMessage {
  id: string;
  sender: 'ai' | 'user' | 'system';
  text: string;
  timestamp: string;
  type?: 'text' | 'audio' | 'photo' | 'video' | 'live_tracking_card' | 'camera_feed' | 'alert_card' | 'location_card';
  audioDuration?: string;
  audioTranscript?: string;
  audioUrl?: string;
  photoUrl?: string;
  videoUrl?: string;
  cameraFeedUrl?: string;
  cameraName?: string;
  alertData?: {
    title: string;
    sector: string;
    description: string;
    severity?: string;
  };
  imageUrl?: string;
  incidentData?: IncidentReport;
}

export interface IncidentReport {
  id: string;
  category: EmergencyCategory;
  categoryLabel: string;
  title: string;
  description: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  dispatchStep: DispatchStep;
  date: string;
  time: string;
  unitAssigned: string;
  originDepot: string;
  etaMinutes: number;
  etaSeconds: number;
  location: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  audioNote?: string;
  imageUrl?: string;
  aiVoiceMessage?: string;
  chat?: ChatMessage[];
}

export interface CreateIncidentInput {
  category: EmergencyCategory;
  title?: string;
  description?: string;
  location?: string;
  severity?: IncidentSeverity;
  audioNote?: string;
  imageUrl?: string;
  originDepot?: string;
  aiVoiceMessage?: string;
}

export interface EmergencyContact {
  id: string;
  name: string;
  relationship: string;
  phone: string;
  initials: string;
  avatarUrl?: string;
}

export interface UserAccount {
  id: string;
  email: string;
  name: string;
  phone: string;
  password?: string;
  createdAt?: string;
}

export interface UserProfile {
  name: string;
  email: string;
  phone: string;
  bloodType: string;
  allergies: string;
  avatarUrl: string;
  bannerUrl?: string;
  emergencyContacts: EmergencyContact[];
}

export interface SystemPermissions {
  location: boolean;
  camera: boolean;
  microphone: boolean;
  notifications: boolean;
}

export interface SystemSettings {
  // Real functional settings
  theme: 'dark' | 'light';
  silentAlarmMode: boolean;
  autoGpsBroadcast: boolean;
  fallImpactDetection: boolean;
  endToEndEncryption: boolean;
  voiceTranscription: boolean;
  autoNotifyContacts: boolean;
  arrivalAlerts: boolean;
  sirenVolume: 'off' | 'low' | 'max';
  hapticFeedback: boolean;
  language: 'es' | 'en';
  // Additional meaningful settings
  hapticEmergencyVibe: boolean;
  screenPrivacyShield: boolean;
  confirmCancelEmergency: boolean;
  sosAudioChime: boolean;
  highAccuracyGps: boolean;
  autoSaveTranscripts: boolean;
}

export type AIChatMessage = ChatMessage;
