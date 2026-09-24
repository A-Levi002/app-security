// SECURE_OS / Alert.IA — Edge Function: settings
// ---------------------------------------------------------------------------
// Configuración del ciudadano (tabla `configuracion_usuario`). Reemplaza el
// acceso directo de src/lib/db.ts (fetchSettings/saveSettings): el cliente
// envía el objeto SystemSettings completo y el backend lo persiste en
// `idioma` + `datos_extra`.
//
// Acciones (body.action):
//   - "get" → { settings: Partial<SystemSettings> | null }
//   - "put" → body.settings → upsert; { ok: true }
// ---------------------------------------------------------------------------
import { getUserFromRequest, getSvcClient } from "../_shared/client.ts";
import { json, isOptions } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  if (isOptions(req)) return json("ok");

  const { user } = await getUserFromRequest(req);
  if (!user) {
    return json({ error: "Sesión no válida." }, 401);
  }
  const uid = user.id as string;

  let body: { action?: string; settings?: any };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body JSON inválido." }, 400);
  }

  const svc = getSvcClient();

  switch (body.action) {
    case "get": {
      const { data } = await svc
        .from("configuracion_usuario")
        .select("idioma, datos_extra")
        .eq("id_usuario", uid)
        .maybeSingle();
      if (!data) return json({ settings: null });
      const row = data as { idioma?: string; datos_extra?: Record<string, unknown> | null };
      const extra = (row.datos_extra ?? {}) as Record<string, unknown>;
      return json({
        settings: {
          ...extra,
          language: (row.idioma as string) ?? extra.language ?? "es",
        },
      });
    }

    case "put": {
      const settings = body.settings ?? {};
      const { error } = await svc
        .from("configuracion_usuario")
        .upsert(
          {
            id_usuario: uid,
            idioma: settings.language ?? "es",
            datos_extra: settings,
          },
          { onConflict: "id_usuario" }
        );
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    default:
      return json({ error: "Acción desconocida." }, 400);
  }
});