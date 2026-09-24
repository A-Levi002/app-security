// SECURE_OS — ODS 12: catálogo de subtipos ambientales (lado cliente).
// Espeja backend/supabase/functions/_shared/catalog.ts para no importar
// código de Deno desde la app.
import { EnvironmentalSubtype } from '../types';

export const ENVIRONMENTAL_SUBTYPES: EnvironmentalSubtype[] = [
  'derrame_quimico',
  'fuga_gas',
  'quema_residuos',
  'botadero_ilegal',
  'contaminacion_agua_suelo',
];

export const ENVIRONMENTAL_SUBTYPE_LABELS: Record<EnvironmentalSubtype, string> = {
  derrame_quimico: 'Derrame o fuga química',
  fuga_gas: 'Fuga de gas',
  quema_residuos: 'Quema de residuos',
  botadero_ilegal: 'Botadero ilegal',
  contaminacion_agua_suelo: 'Contaminación de agua o suelo',
};
