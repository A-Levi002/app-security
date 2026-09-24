// SECURE_OS / Alert.IA — Edge Function: profile
// ---------------------------------------------------------------------------
// Lee y actualiza el perfil extendido del ciudadano (tabla `usuarios`).
// Reemplaza el acceso directo de src/lib/db.ts (fetchProfile/saveProfile).
//
// Acciones (body.action):
//   - "get" → { profile: { name, phone, bloodType, allergies, avatarUrl, bannerUrl } | null }
//   - "put" → body.profile (mismo shape) → actualiza; { ok: true }
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

  let body: { action?: string; profile?: any };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body JSON inválido." }, 400);
  }

  const svc = getSvcClient();

  switch (body.action) {
    case "get": {
      const { data } = await svc
        .from("usuarios")
        .select("nombre, apellido, telefono, grupo_sanguineo, alergias, avatar_url, banner_url")
        .eq("id_usuario", uid)
        .maybeSingle();
      if (!data) return json({ profile: null });
      const row = data as {
        nombre?: string;
        apellido?: string;
        telefono?: string | null;
        grupo_sanguineo?: string | null;
        alergias?: string | null;
        avatar_url?: string | null;
        banner_url?: string | null;
      };
      return json({
        profile: {
          name: [row.nombre, row.apellido].filter(Boolean).join(" ").trim(),
          phone: row.telefono ?? "",
          bloodType: row.grupo_sanguineo ?? "",
          allergies: row.alergias ?? "",
          avatarUrl: row.avatar_url ?? "",
          bannerUrl: row.banner_url ?? "",
        },
      });
    }

    case "put": {
      const profile = body.profile ?? {};
      const parts = (profile.name ?? "").trim().split(/\s+/);
      const nombre = parts[0] ?? "";
      const { error } = await svc
        .from("usuarios")
        .update({
          nombre,
          apellido: parts.slice(1).join(" ") || " ",
          telefono: profile.phone ?? null,
          grupo_sanguineo: profile.bloodType ?? null,
          alergias: profile.allergies ?? null,
          avatar_url: profile.avatarUrl ?? null,
          banner_url: profile.bannerUrl ?? null,
        })
        .eq("id_usuario", uid);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    default:
      return json({ error: "Acción desconocida." }, 400);
  }
});