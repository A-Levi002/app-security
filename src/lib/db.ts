import { supabase } from './supabase';
import {
  AppNotification,
  ChatMessage,
  EmergencyContact,
  IncidentReport,
  SystemSettings,
  UserProfile,
} from '../types';
import { INITIAL_SETTINGS } from '../data/initialData';

// ---------------------------------------------------------------------------
// Capa de acceso a datos (CLIENTE) → Edge Functions del backend.
// Toda la lógica de negocio y el mapeo de catálogos viven en las funciones
// deno (backend/supabase/functions/): reports, profile, contacts, settings,
// notifications, analyze-incident, ai-respond. Este archivo es un cliente
// fino y NO toca tablas de Supabase ni catálogos directamente.
// ---------------------------------------------------------------------------

async function invoke<T>(fn: string, body: Record<string, unknown>): Promise<T | null> {
  try {
    const { data, error } = await supabase.functions.invoke(fn, { body });
    if (error) {
      console.warn(`[db] ${fn}:`, error.message);
      return null;
    }
    return (data as T) ?? null;
  } catch (err) {
    console.warn(`[db] ${fn} exception:`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Auth helpers (SE MANTIENEN en el cliente: usan el proveedor de sesión)
// ---------------------------------------------------------------------------

export async function getCurrentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function getCurrentUserEmail(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.email ?? null;
}

export async function signOutServer(): Promise<void> {
  await supabase.auth.signOut();
}

// Ya no hay catálogos cacheados en el cliente: no-op por compatibilidad.
export async function resetCatalogsCache(): Promise<void> {}

// ---------------------------------------------------------------------------
// Perfil (usuarios) → Edge Function "profile"
// ---------------------------------------------------------------------------

export async function fetchProfile(uid: string): Promise<Partial<UserProfile> | null> {
  const res = await invoke<{ profile: Partial<UserProfile> | null }>('profile', { action: 'get' });
  return res?.profile ?? null;
}

export async function saveProfile(uid: string, profile: Partial<UserProfile>): Promise<void> {
  await invoke('profile', { action: 'put', profile });
}

// ---------------------------------------------------------------------------
// Contactos (contactos_confianza) → Edge Function "contacts"
// ---------------------------------------------------------------------------

export async function fetchContacts(uid: string): Promise<EmergencyContact[]> {
  const res = await invoke<{ contacts: EmergencyContact[] }>('contacts', { action: 'get' });
  return res?.contacts ?? [];
}

export async function saveContacts(uid: string, contacts: EmergencyContact[]): Promise<void> {
  await invoke('contacts', { action: 'putAll', contacts });
}

export async function saveSingleContact(uid: string, contact: EmergencyContact): Promise<void> {
  await invoke('contacts', { action: 'put', contact });
}

export async function deleteSingleContact(uid: string, contactId: string): Promise<void> {
  await invoke('contacts', { action: 'delete', contactId });
}

// ---------------------------------------------------------------------------
// Settings (configuracion_usuario) → Edge Function "settings"
// ---------------------------------------------------------------------------

export async function fetchSettings(uid: string): Promise<Partial<SystemSettings> | null> {
  const res = await invoke<{ settings: Partial<SystemSettings> | null }>('settings', { action: 'get' });
  return res?.settings ?? null;
}

export async function saveSettings(uid: string, settings: Partial<SystemSettings>): Promise<void> {
  const full = { ...INITIAL_SETTINGS, ...settings };
  await invoke('settings', { action: 'put', settings: full });
}

// ---------------------------------------------------------------------------
// Reportes (reportes_emergencia + ubicaciones) → Edge Function "reports"
// ---------------------------------------------------------------------------

export async function fetchReports(uid: string): Promise<IncidentReport[]> {
  const res = await invoke<{ reports: IncidentReport[] }>('reports', { action: 'list' });
  return (res?.reports ?? ([] as IncidentReport[])).map((r) => ({
    ...r,
    chat: r.chat as ChatMessage[] | undefined,
  }));
}

export async function saveReport(uid: string, report: IncidentReport): Promise<void> {
  await invoke('reports', { action: 'upsert', report });
}

export async function replaceAllReports(uid: string, reports: IncidentReport[]): Promise<void> {
  await invoke('reports', { action: 'replaceAll', reports });
}

export async function deleteReport(uid: string, localId: string): Promise<void> {
  await invoke('reports', { action: 'delete', incidentId: localId });
}

// ---------------------------------------------------------------------------
// Notificaciones (notificaciones) → Edge Function "notifications"
// ---------------------------------------------------------------------------

export async function saveNotificationRecord(uid: string, notif: AppNotification): Promise<void> {
  await invoke('notifications', { action: 'post', notification: notif });
}

export async function fetchNotifications(uid: string): Promise<AppNotification[]> {
  const res = await invoke<{ notifications: AppNotification[] }>('notifications', { action: 'get' });
  return res?.notifications ?? [];
}