import { supabase } from './supabase';
import {
  ChatMessage,
  EmergencyCategory,
  EmergencyContact,
  IncidentReport,
  IncidentSeverity,
  IncidentStatus,
  SystemSettings,
  UserProfile,
} from '../types';
import { INITIAL_SETTINGS } from '../data/initialData';

// ---------------------------------------------------------------------------
// Capa de acceso a datos. Traduce el modelo de la app a las tablas del esquema
// Supabase (database/secure_os_supabase_schema.sql) usando los catálogos como
// puente. Lee backend/README.md para saber qué funciones deben migrar a
// Edge Functions / RPC en el servidor.
// ---------------------------------------------------------------------------

type Catalogs = {
  tiposById: Record<number, string>;
  tiposByName: Record<string, number>;
  nivelesById: Record<number, string>;
  nivelesByName: Record<string, number>;
  estadosById: Record<number, string>;
  estadosByName: Record<string, number>;
};

let catalogsPromise: Promise<Catalogs> | null = null;

async function loadCatalogs(): Promise<Catalogs> {
  const [t, n, e] = await Promise.all([
    supabase.from('tipos_emergencia').select('id_tipo_emergencia, nombre'),
    supabase.from('niveles_gravedad').select('id_nivel_gravedad, nombre'),
    supabase.from('estados_reporte').select('id_estado_reporte, nombre'),
  ]);
  const build = (
    rows: { [k: string]: number | string }[] | null,
    idKey: string,
    nameKey: string
  ) => {
    const byId: Record<number, string> = {};
    const byName: Record<string, number> = {};
    for (const r of rows ?? []) {
      const id = r[idKey] as number;
      const name = r[nameKey] as string;
      byId[id] = name;
      byName[name] = id;
    }
    return { byId, byName };
  };
  const tipos = build(t.data ?? [], 'id_tipo_emergencia', 'nombre');
  const niveles = build(n.data ?? [], 'id_nivel_gravedad', 'nombre');
  const estados = build(e.data ?? [], 'id_estado_reporte', 'nombre');
  return {
    tiposById: tipos.byId,
    tiposByName: tipos.byName,
    nivelesById: niveles.byId,
    nivelesByName: niveles.byName,
    estadosById: estados.byId,
    estadosByName: estados.byName,
  };
}

function getCatalogs(): Promise<Catalogs> {
  if (!catalogsPromise) catalogsPromise = loadCatalogs();
  return catalogsPromise;
}

export async function resetCatalogsCache() {
  catalogsPromise = null;
}

// ---------------------------------------------------------------------------
// Mapeo de catálogos (app <-> DB)
// ---------------------------------------------------------------------------

const CATEGORY_TO_TIPO: Record<EmergencyCategory, string> = {
  traffic: 'Accidente de Tránsito',
  fire: 'Incendio',
  medical: 'Emergencia Médica',
  robbery: 'Robo',
};

const TIPO_TO_CATEGORY: Record<string, EmergencyCategory> = {
  'Accidente de Tránsito': 'traffic',
  Incendio: 'fire',
  'Emergencia Médica': 'medical',
  Robo: 'robbery',
};

const SEVERITY_TO_NIVEL: Record<IncidentSeverity, string> = {
  low: 'baja',
  medium: 'media',
  high: 'alta',
  critical: 'critica',
};

const NIVEL_TO_SEVERITY: Record<string, IncidentSeverity> = {
  baja: 'low',
  media: 'medium',
  alta: 'high',
  critica: 'critical',
};

const STATUS_TO_ESTADO: Record<IncidentStatus, string> = {
  in_progress: 'en_proceso',
  resolved: 'resuelto',
  closed: 'cerrado',
};

const ESTADO_TO_STATUS: Record<string, IncidentStatus> = {
  recibido: 'in_progress',
  en_proceso: 'in_progress',
  resuelto: 'resolved',
  cerrado: 'closed',
};

// ---------------------------------------------------------------------------
// Auth helpers
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

// ---------------------------------------------------------------------------
// Perfil (usuarios)
// ---------------------------------------------------------------------------

type UsuarioRow = {
  id_usuario: string;
  id_rol: number;
  nombre: string;
  apellido: string;
  telefono: string | null;
  grupo_sanguineo: string | null;
  alergias: string | null;
  avatar_url: string | null;
  banner_url: string | null;
};

export async function fetchProfile(uid: string): Promise<Partial<UserProfile> | null> {
  const { data } = await supabase
    .from('usuarios')
    .select('nombre, apellido, telefono, grupo_sanguineo, alergias, avatar_url, banner_url')
    .eq('id_usuario', uid)
    .maybeSingle();
  if (!data) return null;
  const row = data as UsuarioRow;
  return {
    name: [row.nombre, row.apellido].filter(Boolean).join(' ').trim(),
    phone: row.telefono ?? '',
    bloodType: row.grupo_sanguineo ?? '',
    allergies: row.alergias ?? '',
    avatarUrl: row.avatar_url ?? '',
    bannerUrl: row.banner_url ?? '',
  };
}

export async function saveProfile(uid: string, profile: Partial<UserProfile>): Promise<void> {
  const parts = (profile.name ?? '').trim().split(/\s+/);
  const nombre = parts[0] ?? '';
  const apellido = parts.slice(1).join(' ');
  const { error } = await supabase
    .from('usuarios')
    .update({
      nombre,
      apellido: apellido || ' ',
      telefono: profile.phone ?? null,
      grupo_sanguineo: profile.bloodType ?? null,
      alergias: profile.allergies ?? null,
      avatar_url: profile.avatarUrl ?? null,
      banner_url: profile.bannerUrl ?? null,
    })
    .eq('id_usuario', uid);
  if (error) console.warn('saveProfile:', error.message);
}

// ---------------------------------------------------------------------------
// Contactos (contactos_confianza)
// ---------------------------------------------------------------------------

type ContactoRow = {
  id_contacto: number;
  id_externo: string | null;
  nombre: string;
  relacion: string | null;
  telefono: string;
  avatar_url: string | null;
};

export async function fetchContacts(uid: string): Promise<EmergencyContact[]> {
  const { data } = await supabase
    .from('contactos_confianza')
    .select('id_contacto, id_externo, nombre, relacion, telefono, avatar_url')
    .eq('id_usuario', uid)
    .order('id_contacto', { ascending: true });
  return (data ?? []).map((row) => {
    const r = row as ContactoRow;
    return {
      id: r.id_externo ?? `cnt-${r.id_contacto}`,
      name: r.nombre,
      relationship: r.relacion ?? 'Contacto de Emergencia',
      phone: r.telefono,
      initials: r.nombre
        .split(' ')
        .map((n) => n[0])
        .join('')
        .substring(0, 2)
        .toUpperCase(),
      avatarUrl: r.avatar_url ?? undefined,
    };
  });
}

export async function saveContacts(uid: string, contacts: EmergencyContact[]): Promise<void> {
  const { error: delErr } = await supabase.from('contactos_confianza').delete().eq('id_usuario', uid);
  if (delErr) {
    console.warn('saveContacts (delete):', delErr.message);
    return;
  }
  if (contacts.length === 0) return;
  const { error: insErr } = await supabase.from('contactos_confianza').insert(
    contacts.map((c) => ({
      id_usuario: uid,
      id_externo: c.id,
      nombre: c.name,
      relacion: c.relationship || null,
      telefono: c.phone,
      avatar_url: c.avatarUrl ?? null,
    }))
  );
  if (insErr) console.warn('saveContacts (insert):', insErr.message);
}

// ---------------------------------------------------------------------------
// Settings (configuracion_usuario)
// ---------------------------------------------------------------------------

export async function fetchSettings(uid: string): Promise<Partial<SystemSettings> | null> {
  const { data } = await supabase
    .from('configuracion_usuario')
    .select('idioma, datos_extra')
    .eq('id_usuario', uid)
    .maybeSingle();
  if (!data) return null;
  const extra = (data.datos_extra ?? {}) as Partial<SystemSettings>;
  return { ...extra, language: (data.idioma as SystemSettings['language']) ?? extra.language ?? 'es' };
}

export async function saveSettings(uid: string, settings: Partial<SystemSettings>): Promise<void> {
  const full = { ...INITIAL_SETTINGS, ...settings };
  const { error } = await supabase
    .from('configuracion_usuario')
    .upsert(
      {
        id_usuario: uid,
        idioma: full.language ?? 'es',
        datos_extra: full,
      },
      { onConflict: 'id_usuario' }
    );
  if (error) console.warn('saveSettings:', error.message);
}

// ---------------------------------------------------------------------------
// Reportes (reportes_emergencia + ubicaciones)
// ---------------------------------------------------------------------------

type ReportRow = {
  id_reporte: number;
  descripcion: string | null;
  id_tipo_emergencia: number | null;
  id_nivel_gravedad: number | null;
  id_estado_reporte: number;
  fecha_hora_reporte: string;
  datos_extra: Record<string, unknown> | null;
  ubicaciones: {
    latitud: number;
    longitud: number;
    direccion_referencia: string | null;
  }[];
};

const SPANISH_MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function formatDate(d: Date): { date: string; time: string } {
  return {
    date: `${d.getDate()} ${SPANISH_MONTHS[d.getMonth()]} ${d.getFullYear()}`,
    time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
  };
}

export async function fetchReports(uid: string): Promise<IncidentReport[]> {
  const cats = await getCatalogs();
  const { data } = await supabase
    .from('reportes_emergencia')
    .select('id_reporte, descripcion, id_tipo_emergencia, id_nivel_gravedad, id_estado_reporte, fecha_hora_reporte, datos_extra, ubicaciones(latitud, longitud, direccion_referencia)')
    .eq('id_usuario', uid)
    .order('fecha_hora_reporte', { ascending: false });
  if (!data) return [];

  return (data as unknown as ReportRow[]).map((r) => {
    const ubicacion = r.ubicaciones?.[0];
    const tipo = r.id_tipo_emergencia != null ? cats.tiposById[r.id_tipo_emergencia] : undefined;
    const nivel = r.id_nivel_gravedad != null ? cats.nivelesById[r.id_nivel_gravedad] : undefined;
    const estado = cats.estadosById[r.id_estado_reporte];
    const extra = (r.datos_extra ?? {}) as Record<string, any>;
    const { date, time } = formatDate(new Date(r.fecha_hora_reporte));
    const coords = extra.coordinates as { lat: number; lng: number } | undefined;
    return {
      id: (extra.id as string) ?? `#REP-${r.id_reporte}`,
      category: (extra.category as EmergencyCategory) ?? TIPO_TO_CATEGORY[tipo ?? ''] ?? 'traffic',
      categoryLabel: (extra.categoryLabel as string) ?? tipo ?? 'Incidente',
      title: (extra.title as string) ?? 'Reporte táctico SEV',
      description: r.descripcion ?? '',
      severity: (extra.severity as IncidentSeverity) ?? NIVEL_TO_SEVERITY[nivel ?? ''] ?? 'high',
      status: ESTADO_TO_STATUS[estado] ?? (extra.status as IncidentStatus) ?? 'in_progress',
      dispatchStep: (extra.dispatchStep as IncidentReport['dispatchStep']) ?? 'received',
      date: (extra.date as string) ?? date,
      time: (extra.time as string) ?? time,
      unitAssigned: (extra.unitAssigned as string) ?? '',
      originDepot: (extra.originDepot as string) ?? '',
      etaMinutes: (extra.etaMinutes as number) ?? 0,
      etaSeconds: (extra.etaSeconds as number) ?? 0,
      location:
        (extra.location as string) ??
        ubicacion?.direccion_referencia ??
        'Ubicación desconocida',
      coordinates: coords ?? {
        lat: ubicacion?.latitud ?? 0,
        lng: ubicacion?.longitud ?? 0,
      },
      audioNote: extra.audioNote as string | undefined,
      imageUrl: extra.imageUrl as string | undefined,
      aiVoiceMessage: extra.aiVoiceMessage as string | undefined,
      chat: extra.chat as ChatMessage[] | undefined,
    };
  });
}

export async function saveReport(uid: string, report: IncidentReport): Promise<void> {
  const cats = await getCatalogs();

  // 1. Insertar (o reutilizar) la ubicación
  const latNum = Number(report.coordinates.lat) || 0;
  const lngNum = Number(report.coordinates.lng) || 0;
  const { data: ubi, error: ubiErr } = await supabase
    .from('ubicaciones')
    .insert({
      latitud: latNum,
      longitud: lngNum,
      direccion_referencia: report.location || null,
    })
    .select('id_ubicacion')
    .single();
  if (ubiErr || !ubi) {
    console.warn('saveReport (ubicacion):', ubiErr?.message);
    return;
  }
  const idUbicacion = ubi.id_ubicacion as number;

  const tipoId = cats.tiposByName[CATEGORY_TO_TIPO[report.category]];
  const nivelId = cats.nivelesByName[SEVERITY_TO_NIVEL[report.severity] ?? 'alta'];
  const estadoId =
    cats.estadosByName[STATUS_TO_ESTADO[report.status] ?? 'en_proceso'] ??
    cats.estadosByName.en_proceso;

  const existingId = await findReportLocalId(uid, report.id);

  const payload = {
    id_ubicacion: idUbicacion,
    id_tipo_emergencia: tipoId ?? null,
    id_nivel_gravedad: nivelId ?? null,
    id_estado_reporte: estadoId,
    descripcion: report.description || report.title || null,
    origen: 'app_movil',
    datos_extra: {
      id: report.id,
      category: report.category,
      categoryLabel: report.categoryLabel,
      title: report.title,
      severity: report.severity,
      status: report.status,
      dispatchStep: report.dispatchStep,
      date: report.date,
      time: report.time,
      unitAssigned: report.unitAssigned,
      originDepot: report.originDepot,
      etaMinutes: report.etaMinutes,
      etaSeconds: report.etaSeconds,
      location: report.location,
      coordinates: report.coordinates,
      audioNote: report.audioNote,
      imageUrl: report.imageUrl,
      aiVoiceMessage: report.aiVoiceMessage,
      chat: report.chat,
    },
  };

  if (existingId != null) {
    const { error } = await supabase.from('reportes_emergencia').update(payload).eq('id_reporte', existingId);
    if (error) console.warn('saveReport (update):', error.message);
  } else {
    const { error } = await supabase.from('reportes_emergencia').insert({ id_usuario: uid, ...payload });
    if (error) console.warn('saveReport (insert):', error.message);
  }
}

async function findReportLocalId(uid: string, localId: string): Promise<number | null> {
  const { data } = await supabase
    .from('reportes_emergencia')
    .select('id_reporte')
    .eq('id_usuario', uid)
    .eq('datos_extra->>id', localId)
    .maybeSingle();
  return (data as { id_reporte: number } | null)?.id_reporte ?? null;
}

export async function deleteReport(uid: string, localId: string): Promise<void> {
  const id = await findReportLocalId(uid, localId);
  if (id == null) return;
  const { error } = await supabase.from('reportes_emergencia').delete().eq('id_reporte', id);
  if (error) console.warn('deleteReport:', error.message);
}

export async function replaceAllReports(uid: string, reports: IncidentReport[]): Promise<void> {
  const { error: delErr } = await supabase.from('reportes_emergencia').delete().eq('id_usuario', uid);
  if (delErr) {
    console.warn('replaceAllReports (delete):', delErr.message);
    return;
  }
  for (const report of reports) {
    await saveReport(uid, report);
  }
}