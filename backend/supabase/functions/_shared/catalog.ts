// SECURE_OS / Alert.IA — _shared/catalog.ts
// ÚNICA fuente de verdad de los mapeos de catálogos (app <-> BD).
// Antes duplicados en el cliente (src/lib/db.ts) y en analyze-incident.
// Aquí viven los 8 tipos de emergencia, severidades y estados normalizados.
// El catálogo SQL real se lee por nombre contra las tablas semilla
// (tipos_emergencia / niveles_gravedad / estados_reporte).

export const CATEGORIES = [
  "traffic",
  "fire",
  "medical",
  "robbery",
  "suspicious_person",
  "violence",
  "vandalism",
  "ambiental",
  "other",
] as const;
export type EmergencyCategory = (typeof CATEGORIES)[number];

// ODS 12 — subtipos de incidentes ambientales (viajan en datos_extra y en
// la columna subtipo_ambiental de reportes_emergencia).
export const ENVIRONMENTAL_SUBTYPES = [
  "derrame_quimico",
  "fuga_gas",
  "quema_residuos",
  "botadero_ilegal",
  "contaminacion_agua_suelo",
] as const;
export type EnvironmentalSubtype = (typeof ENVIRONMENTAL_SUBTYPES)[number];

export const ENVIRONMENTAL_SUBTYPE_LABELS: Record<EnvironmentalSubtype, string> = {
  derrame_quimico: "Derrame o fuga química",
  fuga_gas: "Fuga de gas",
  quema_residuos: "Quema de residuos",
  botadero_ilegal: "Botadero ilegal",
  contaminacion_agua_suelo: "Contaminación de agua o suelo",
};

export const SEVERITIES = ["baja", "media", "alta", "critica"] as const;
export type SeverityName = (typeof SEVERITIES)[number];

export const CATEGORY_TO_TIPO: Record<EmergencyCategory, string> = {
  traffic: "Accidente de Tránsito",
  fire: "Incendio",
  medical: "Emergencia Médica",
  robbery: "Robo",
  suspicious_person: "Persona Sospechosa",
  violence: "Violencia",
  vandalism: "Vandalismo",
  ambiental: "Incidente Ambiental",
  other: "Otro",
};

export const TIPO_TO_CATEGORY: Record<string, EmergencyCategory> = Object.fromEntries(
  Object.entries(CATEGORY_TO_TIPO).map(([k, v]) => [v, k as EmergencyCategory])
);

export const SEVERITY_TO_NIVEL: Record<string, SeverityName> = {
  low: "baja",
  medium: "media",
  high: "alta",
  critical: "critica",
};

export const NIVEL_TO_SEVERITY: Record<string, string> = {
  baja: "low",
  media: "medium",
  alta: "high",
  critica: "critical",
};

export const STATUS_TO_ESTADO: Record<string, string> = {
  in_progress: "en_proceso",
  resolved: "resuelto",
  closed: "cerrado",
};

export const ESTADO_TO_STATUS: Record<string, string> = {
  recibido: "in_progress",
  en_proceso: "in_progress",
  resuelto: "resolved",
  cerrado: "closed",
};