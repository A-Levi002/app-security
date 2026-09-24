// SECURE_OS / Alert.IA — Edge Function: ai-respond
// ---------------------------------------------------------------------------
// Conversación de seguimiento con SECURE_OS CORE durante una emergencia en
// curso. Recibe el contexto del incidente (categoría, unidad, dispatchStep,
// historial del chat) y la pregunta/solicitud del ciudadano, y devuelve:
//   - respuesta (texto en español para el chat)
//   - mensaje_voz (opcional)
//   - siguiente_paso: estado de despacho al que se avanza (o null)
//   - finalizar: true si la conversación indica que la emergencia terminó
// Como side-effect, si la IA avanza el paso o cierra la emergencia, actualiza
// `reportes_emergencia.datos_extra` (service-role + chequeo del uid del JWT).
//
// Seguridad: idéntica a analyze-incident — JWT obligatorio (verify_jwt=true),
// escrituras con service-role acotadas al uid verificado.
// ---------------------------------------------------------------------------
import { getUserFromRequest, getSvcClient } from "../_shared/client.ts";
import { json, isOptions } from "../_shared/cors.ts";
import { runRespond, DispatchStep } from "../_shared/ai.ts";

interface HistorialItem {
  sender: "ciudadano" | "asistente";
  text: string;
}

function historialToContext(items: HistorialItem[] | undefined): string {
  if (!items || items.length === 0) return "(sin historial previo)";
  return items
    .slice(-12)
    .map(
      (m) =>
        `${m.sender === "asistente" ? "Asistente" : "Ciudadano"}: ${m.text}`
    )
    .join("\n");
}

Deno.serve(async (req: Request) => {
  if (isOptions(req)) return json("ok");

  const { user } = await getUserFromRequest(req);
  if (!user) {
    return json({ error: "Sesión no válida." }, 401);
  }

  if (!Deno.env.get("GEMINI_API_KEY")) {
    return json(
      {
        error: "GEMINI_API_KEY no configurada en Secrets de Edge Functions.",
        fallback: true,
      },
      500
    );
  }

  let body: {
    reporteId?: number;
    incidentId?: string;
    categoria?: string;
    categoriaLabel?: string;
    unidad?: string;
    dispatchStep?: DispatchStep;
    historial?: HistorialItem[];
    pregunta?: string;
    subtipoAmbiental?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body JSON inválido.", fallback: true }, 400);
  }

  const pregunta = (body.pregunta ?? "").trim();
  if (!pregunta) {
    return json({ error: "pregunta vacía.", fallback: true }, 400);
  }

  const contexto = [
    `Incidente activo. Categoría: ${body.categoriaLabel ?? body.categoria ?? "desconocida"}`,
    // ODS 12 — contexto ambiental para que la IA aplique el bloque ambiental.
    body.categoria === "ambiental" ? "Categoría ambiental (ODS 12)." : "",
    body.categoria === "ambiental" && body.subtipoAmbiental
      ? `Subtipo ambiental: ${body.subtipoAmbiental}`
      : "",
    body.unidad ? `Unidad asignada: ${body.unidad}` : "",
    body.dispatchStep ? `Paso de despacho actual: ${body.dispatchStep}` : "",
    `Historial del chat:\n${historialToContext(body.historial)}`,
  ]
    .filter(Boolean)
    .join("\n");

  let result;
  try {
    result = await runRespond({ contexto, pregunta });
  } catch (err) {
    console.error("ai-respond:", err instanceof Error ? err.message : err);
    return json(
      {
        error: "La IA no respondió a tiempo. Intenta nuevamente.",
        fallback: true,
      },
      503
    );
  }

  // Persistir avance de estado / finalización (solo si aplica y el reporte es del usuario).
  if (result.siguiente_paso || result.finalizar) {
    try {
      const svc = getSvcClient();
      let reporteId: number | null = body.reporteId ?? null;
      if (reporteId == null && body.incidentId) {
        const { data } = await svc
          .from("reportes_emergencia")
          .select("id_reporte")
          .eq("id_usuario", user.id)
          .eq("datos_extra->>id", body.incidentId)
          .maybeSingle();
        reporteId = (data as { id_reporte?: number } | null)?.id_reporte ?? null;
      }
      if (reporteId != null) {
        const { data: owned } = await svc
          .from("reportes_emergencia")
          .select("id_usuario, datos_extra")
          .eq("id_reporte", reporteId)
          .maybeSingle();
        if (owned && owned.id_usuario === user.id) {
          const extra = (
            (owned as { datos_extra?: Record<string, unknown> | null })
              .datos_extra ?? {}
          ) as Record<string, unknown>;
          const patch: Record<string, unknown> = {
            ...extra,
          };
          if (result.siguiente_paso) patch.dispatchStep = result.siguiente_paso;
          if (result.finalizar) {
            patch.dispatchStep = "resolved";
            patch.status = "resolved";
            patch.etaMinutes = 0;
            patch.etaSeconds = 0;
          }
          await svc
            .from("reportes_emergencia")
            .update({ datos_extra: patch })
            .eq("id_reporte", reporteId);
        }
      }
    } catch (err) {
      console.error("ai-respond persist:", err instanceof Error ? err.message : err);
    }
  }

  return json({ ...result });
});