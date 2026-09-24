// SECURE_OS / Alert.IA — Edge Function: notifications
// ---------------------------------------------------------------------------
// Registro y lectura de notificaciones para el flujo ciudadano (tabla
// `notificaciones`, que referencia un reporte del usuario).
// Reemplaza el acceso directo de src/lib/db.ts (fetchNotifications /
// saveNotificationRecord).
//
// Acciones (body.action):
//   - "get"  → { notifications: AppNotification[] } (las del ciudadano)
//   - "post" → body.notification (AppNotification) → inserta; { ok: true }
// ---------------------------------------------------------------------------
import { getUserFromRequest, getSvcClient } from "../_shared/client.ts";
import { json, isOptions } from "../_shared/cors.ts";

async function findLocalId(
  svc: ReturnType<typeof getSvcClient>,
  uid: string,
  localId: string
): Promise<number | null> {
  const { data } = await svc
    .from("reportes_emergencia")
    .select("id_reporte")
    .eq("id_usuario", uid)
    .eq("datos_extra->>id", localId)
    .maybeSingle();
  return (data as { id_reporte?: number } | null)?.id_reporte ?? null;
}

Deno.serve(async (req: Request) => {
  if (isOptions(req)) return json("ok");

  const { user } = await getUserFromRequest(req);
  if (!user) {
    return json({ error: "Sesión no válida." }, 401);
  }
  const uid = user.id as string;

  let body: { action?: string; notification?: any };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body JSON inválido." }, 400);
  }

  const svc = getSvcClient();

  switch (body.action) {
    case "get": {
      const { data } = await svc
        .from("notificaciones")
        .select(
          "id_notificacion, id_reporte, canal, mensaje, estado_envio, fecha_envio, reportes_emergencia!inner(id_usuario, datos_extra)"
        )
        .eq("reportes_emergencia.id_usuario", uid)
        .order("fecha_envio", { ascending: false });
      const notifications = (data ?? []).map((row: any) => {
        const n = row as {
          id_notificacion: number;
          mensaje?: string | null;
          estado_envio: string;
          fecha_envio: string;
          reportes_emergencia?: { datos_extra?: Record<string, unknown> | null };
        };
        const parts = (n.mensaje ?? "").split(": ");
        const title = parts.length > 1 ? parts[0] : "ALERTA TÁCTICA";
        const message = parts.length > 1 ? parts.slice(1).join(": ") : (n.mensaje ?? "");
        const extra = n.reportes_emergencia?.datos_extra ?? {};
        return {
          id: `notif-db-${n.id_notificacion}`,
          title,
          message,
          timestamp: new Date(n.fecha_envio).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          read: n.estado_envio === "leido",
          type: "dispatch",
          relatedIncidentId: (extra as { id?: string }).id,
        };
      });
      return json({ notifications });
    }

    case "post": {
      const notif = body.notification ?? {};
      let reporteId: number | null = null;
      if (notif.relatedIncidentId) {
        reporteId = await findLocalId(svc, uid, notif.relatedIncidentId);
      }
      if (reporteId == null) {
        return json({ error: "No se encuentra el reporte relacionado.", ok: false }, 400);
      }
      const { error } = await svc.from("notificaciones").insert({
        id_reporte: reporteId,
        canal: "push",
        mensaje: `${notif.title ?? ""}: ${notif.message ?? ""}`.substring(0, 255),
        estado_envio: notif.read ? "leido" : "enviado",
      });
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    default:
      return json({ error: "Acción desconocida." }, 400);
  }
});