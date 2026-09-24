// SECURE_OS / Alert.IA — Edge Function: reports
// ---------------------------------------------------------------------------
// CRUD de reportes de emergencia para el flujo ciudadano. Sustituye el acceso
// directo a tablas que antes vivía en el cliente (src/lib/db.ts): aquí se
// concentra el mapeo de catálogos y el manejo de `reportes_emergencia` +
// `ubicaciones`.
//
// Acciones (body.action):
//   - "list"       → GET la lista enriquecida del ciudadano (IncidentReport[])
//   - "upsert"     → crea o actualiza un reporte (inserta/reutiliza ubicación)
//   - "replaceAll" → borra todos los reportes del usuario y los recrea
//   - "delete"     → elimina un reporte por su id local (datos_extra->>id)
//
// Seguridad: JWT obligatorio; escrituras con service-role acotadas al uid del
// JWT (nunca se confía en el body para autorizar).
// ---------------------------------------------------------------------------
import { getUserFromRequest, getSvcClient } from "../_shared/client.ts";
import { json, isOptions } from "../_shared/cors.ts";
import {
  CATEGORY_TO_TIPO,
  TIPO_TO_CATEGORY,
  SEVERITY_TO_NIVEL,
  NIVEL_TO_SEVERITY,
  STATUS_TO_ESTADO,
  ESTADO_TO_STATUS,
  EmergencyCategory,
} from "../_shared/catalog.ts";

const SPANISH_MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function formatDate(d: Date): { date: string; time: string } {
  return {
    date: `${d.getDate()} ${SPANISH_MONTHS[d.getMonth()]} ${d.getFullYear()}`,
    time: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
  };
}

interface ReportRow {
  id_reporte: number;
  descripcion: string | null;
  id_tipo_emergencia: number | null;
  id_nivel_gravedad: number | null;
  id_estado_reporte: number;
  fecha_hora_reporte: string;
  datos_extra: Record<string, unknown> | null;
  ubicaciones?: {
    latitud: number;
    longitud: number;
    direccion_referencia: string | null;
  }[];
}

async function loadCatalogMaps(svc: ReturnType<typeof getSvcClient>) {
  const [t, n, e] = await Promise.all([
    svc.from("tipos_emergencia").select("id_tipo_emergencia, nombre"),
    svc.from("niveles_gravedad").select("id_nivel_gravedad, nombre"),
    svc.from("estados_reporte").select("id_estado_reporte, nombre"),
  ]);
  const byId = (rows: { [k: string]: number | string }[] | null, idKey: string, nameKey: string) => {
    const map: Record<number, string> = {};
    for (const r of rows ?? []) map[r[idKey] as number] = r[nameKey] as string;
    return map;
  };
  const byName = (rows: { [k: string]: number | string }[] | null, idKey: string, nameKey: string) => {
    const map: Record<string, number> = {};
    for (const r of rows ?? []) map[r[nameKey] as string] = r[idKey] as number;
    return map;
  };
  return {
    tiposById: byId(t.data, "id_tipo_emergencia", "nombre"),
    tiposByName: byName(t.data, "id_tipo_emergencia", "nombre"),
    nivelesById: byId(n.data, "id_nivel_gravedad", "nombre"),
    nivelesByName: byName(n.data, "id_nivel_gravedad", "nombre"),
    estadosById: byId(e.data, "id_estado_reporte", "nombre"),
    estadosByName: byName(e.data, "id_estado_reporte", "nombre"),
  };
}

function rowToIncident(r: ReportRow, cats: Awaited<ReturnType<typeof loadCatalogMaps>>) {
  const ubicacion = r.ubicaciones?.[0];
  const tipo = r.id_tipo_emergencia != null ? cats.tiposById[r.id_tipo_emergencia] : undefined;
  const nivel = r.id_nivel_gravedad != null ? cats.nivelesById[r.id_nivel_gravedad] : undefined;
  const estado = cats.estadosById[r.id_estado_reporte];
  const extra = (r.datos_extra ?? {}) as Record<string, any>;
  const { date, time } = formatDate(new Date(r.fecha_hora_reporte));
  const coords = extra.coordinates as { lat: number; lng: number } | undefined;
  return {
    id: (extra.id as string) ?? `#REP-${r.id_reporte}`,
    category: (extra.category as EmergencyCategory) ?? TIPO_TO_CATEGORY[tipo ?? ""] ?? "traffic",
    categoryLabel: (extra.categoryLabel as string) ?? tipo ?? "Incidente",
    title: (extra.title as string) ?? "Reporte táctico SEV",
    description: r.descripcion ?? "",
    severity: (extra.severity as string) ?? NIVEL_TO_SEVERITY[nivel ?? ""] ?? "high",
    status: ESTADO_TO_STATUS[estado] ?? (extra.status as string) ?? "in_progress",
    dispatchStep: (extra.dispatchStep as string) ?? "received",
    date: (extra.date as string) ?? date,
    time: (extra.time as string) ?? time,
    unitAssigned: (extra.unitAssigned as string) ?? "",
    originDepot: (extra.originDepot as string) ?? "",
    etaMinutes: (extra.etaMinutes as number) ?? 0,
    etaSeconds: (extra.etaSeconds as number) ?? 0,
    location:
      (extra.location as string) ??
      ubicacion?.direccion_referencia ??
      "Ubicación desconocida",
    coordinates: coords ?? {
      lat: ubicacion?.latitud ?? 0,
      lng: ubicacion?.longitud ?? 0,
    },
    audioNote: extra.audioNote as string | undefined,
    imageUrl: extra.imageUrl as string | undefined,
    aiVoiceMessage: extra.aiVoiceMessage as string | undefined,
    subtipoAmbiental: (extra.subtipoAmbiental as string | undefined) ?? undefined,
    chat: extra.chat as { id: string; sender: string; text: string; timestamp: string; type?: string }[] | undefined,
  };
}

async function findLocalId(svc: ReturnType<typeof getSvcClient>, uid: string, localId: string): Promise<number | null> {
  const { data } = await svc
    .from("reportes_emergencia")
    .select("id_reporte")
    .eq("id_usuario", uid)
    .eq("datos_extra->>id", localId)
    .maybeSingle();
  return (data as { id_reporte: number } | null)?.id_reporte ?? null;
}

async function upsertReport(
  svc: ReturnType<typeof getSvcClient>,
  uid: string,
  report: any,
  cats: Awaited<ReturnType<typeof loadCatalogMaps>>
): Promise<{ ok: boolean; reporteId: number | null; error?: string }> {
  const latNum = Number(report.coordinates?.lat) || 0;
  const lngNum = Number(report.coordinates?.lng) || 0;

  const existingId = report.id ? await findLocalId(svc, uid, report.id) : null;

  // Reutilizar la ubicación del reporte existente; si no, crear una nueva.
  let idUbicacion: number | null = null;
  if (existingId != null) {
    const { data: row } = await svc
      .from("reportes_emergencia")
      .select("id_ubicacion")
      .eq("id_reporte", existingId)
      .maybeSingle();
    idUbicacion = (row as { id_ubicacion?: number } | null)?.id_ubicacion ?? null;
  }
  if (idUbicacion == null) {
    const { data: ubi, error: ubiErr } = await svc
      .from("ubicaciones")
      .insert({
        latitud: latNum,
        longitud: lngNum,
        direccion_referencia: report.location || null,
      })
      .select("id_ubicacion")
      .single();
    if (ubiErr || !ubi) {
      return { ok: false, reporteId: null, error: ubiErr?.message ?? "ubicación" };
    }
    idUbicacion = (ubi as { id_ubicacion: number }).id_ubicacion;
  }

  const tipoId = cats.tiposByName[CATEGORY_TO_TIPO[report.category as EmergencyCategory] ?? ""] ?? null;
  const nivelId = cats.nivelesByName[SEVERITY_TO_NIVEL[report.severity] ?? "alta"] ?? null;
  const estadoId =
    cats.estadosByName[STATUS_TO_ESTADO[report.status] ?? "en_proceso"] ??
    cats.estadosByName.en_proceso;

  const payload = {
    id_ubicacion: idUbicacion,
    id_tipo_emergencia: tipoId ?? null,
    id_nivel_gravedad: nivelId ?? null,
    id_estado_reporte: estadoId,
    descripcion: report.description || report.title || null,
    origen: "app_movil",
    // ODS 12 — categoría ambiental y su subtipo (columnas propias además de
    // datos_extra para permitir filtros/estadísticas por SQL directo).
    categoria: report.category === "ambiental" ? "ambiental" : "general",
    subtipo_ambiental:
      report.category === "ambiental" && typeof report.subtipoAmbiental === "string"
        ? report.subtipoAmbiental
        : null,
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
      subtipoAmbiental: report.subtipoAmbiental ?? null,
      audioNote: report.audioNote,
      imageUrl: report.imageUrl,
      aiVoiceMessage: report.aiVoiceMessage,
      chat: report.chat,
    },
  };

  if (existingId != null) {
    let { error } = await svc.from("reportes_emergencia").update(payload).eq("id_reporte", existingId);
    // Tolerar migración pendiente (columnas categoria/subtipo_ambiental): reintentar sin ellas.
    if (error && /categoria|subtipo_ambiental/i.test(error.message)) {
      const { categoria: _c, subtipo_ambiental: _s, ...rest } = payload;
      ({ error } = await svc.from("reportes_emergencia").update(rest).eq("id_reporte", existingId));
    }
    return { ok: !error, reporteId: existingId, error: error?.message };
  }
  let { data: ins, error } = await svc
    .from("reportes_emergencia")
    .insert({ id_usuario: uid, ...payload })
    .select("id_reporte")
    .single();
  if (error && /categoria|subtipo_ambiental/i.test(error.message)) {
    const { categoria: _c, subtipo_ambiental: _s, ...rest } = payload;
    ({ data: ins, error } = await svc
      .from("reportes_emergencia")
      .insert({ id_usuario: uid, ...rest })
      .select("id_reporte")
      .single());
  }
  return {
    ok: !error,
    reporteId: (ins as { id_reporte?: number } | null)?.id_reporte ?? null,
    error: error?.message,
  };
}

Deno.serve(async (req: Request) => {
  if (isOptions(req)) return json("ok");

  const { user } = await getUserFromRequest(req);
  if (!user) {
    return json({ error: "Sesión no válida." }, 401);
  }
  const uid = user.id as string;

  let body: { action?: string; report?: any; reports?: any[]; incidentId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body JSON inválido." }, 400);
  }

  const svc = getSvcClient();
  const cats = await loadCatalogMaps(svc);

  switch (body.action) {
    case "list": {
      const { data, error } = await svc
        .from("reportes_emergencia")
        .select(
          "id_reporte, descripcion, id_tipo_emergencia, id_nivel_gravedad, id_estado_reporte, fecha_hora_reporte, datos_extra, ubicaciones(latitud, longitud, direccion_referencia)"
        )
        .eq("id_usuario", uid)
        .order("fecha_hora_reporte", { ascending: false });
      if (error) return json({ error: error.message }, 500);
      return json({ reports: (data ?? []).map((row) => rowToIncident(row as ReportRow, cats)) });
    }

    case "upsert": {
      if (!body.report) return json({ error: "report requerido." }, 400);
      const result = await upsertReport(svc, uid, body.report, cats);
      if (!result.ok) return json({ error: result.error ?? "No se pudo guardar el reporte." }, 500);
      return json({ ok: true, reporteId: result.reporteId });
    }

    case "replaceAll": {
      const reports: any[] = Array.isArray(body.reports) ? body.reports : [];
      const { error: delErr } = await svc.from("reportes_emergencia").delete().eq("id_usuario", uid);
      if (delErr) return json({ error: delErr.message }, 500);
      for (const report of reports) {
        await upsertReport(svc, uid, report, cats);
      }
      return json({ ok: true });
    }

    case "delete": {
      const id = body.incidentId ? await findLocalId(svc, uid, body.incidentId) : null;
      if (id == null) return json({ ok: true });
      const { error } = await svc.from("reportes_emergencia").delete().eq("id_reporte", id);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    default:
      return json({ error: "Acción desconocida." }, 400);
  }
});