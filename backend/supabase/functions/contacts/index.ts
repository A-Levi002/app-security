// SECURE_OS / Alert.IA — Edge Function: contacts
// ---------------------------------------------------------------------------
// Contactos de confianza (tabla `contactos_confianza`). Reemplaza el acceso
// directo de src/lib/db.ts y la lógica GUARDAR (delete-todo + reinsertar).
//
// Acciones (body.action):
//   - "get"     → { contacts: EmergencyContact[] }
//   - "putAll"  → body.contacts → borra y recrea el batch (GUARDAR del perfil)
//   - "put"     → body.contact → upsert de un solo contacto (id_externo)
//   - "delete"  → body.contactId → borra por id_externo
// ---------------------------------------------------------------------------
import { getUserFromRequest, getSvcClient } from "../_shared/client.ts";
import { json, isOptions } from "../_shared/cors.ts";

interface ContactRow {
  id_contacto: number;
  id_externo?: string | null;
  nombre: string;
  relacion?: string | null;
  telefono: string;
  avatar_url?: string | null;
  notificar_en_sos?: boolean | null;
}

function rowToContact(r: ContactRow) {
  return {
    id: r.id_externo ?? `cnt-${r.id_contacto}`,
    name: r.nombre,
    relationship: r.relacion ?? "Contacto de Emergencia",
    phone: r.telefono,
    initials: r.nombre
      .split(" ")
      .map((n) => n[0])
      .join("")
      .substring(0, 2)
      .toUpperCase(),
    avatarUrl: r.avatar_url ?? undefined,
    notifyOnSos: r.notificar_en_sos ?? true,
  };
}

function toRow(uid: string, c: any) {
  return {
    id_usuario: uid,
    id_externo: c.id ?? null,
    nombre: c.name ?? "",
    relacion: c.relationship || null,
    telefono: c.phone ?? "",
    avatar_url: c.avatarUrl ?? null,
    notificar_en_sos: c.notifyOnSos ?? true,
  };
}

Deno.serve(async (req: Request) => {
  if (isOptions(req)) return json("ok");

  const { user } = await getUserFromRequest(req);
  if (!user) {
    return json({ error: "Sesión no válida." }, 401);
  }
  const uid = user.id as string;

  let body: { action?: string; contacts?: any[]; contact?: any; contactId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body JSON inválido." }, 400);
  }

  const svc = getSvcClient();

  switch (body.action) {
    case "get": {
      const { data } = await svc
        .from("contactos_confianza")
        .select("id_contacto, id_externo, nombre, relacion, telefono, avatar_url, notificar_en_sos")
        .eq("id_usuario", uid)
        .order("id_contacto", { ascending: true });
      return json({ contacts: (data ?? []).map((row) => rowToContact(row as ContactRow)) });
    }

    case "putAll": {
      const contacts = Array.isArray(body.contacts) ? body.contacts : [];
      const { error: delErr } = await svc.from("contactos_confianza").delete().eq("id_usuario", uid);
      if (delErr) return json({ error: delErr.message }, 500);
      if (contacts.length > 0) {
        const { error: insErr } = await svc
          .from("contactos_confianza")
          .insert(contacts.map((c) => toRow(uid, c)));
        if (insErr) return json({ error: insErr.message }, 500);
      }
      return json({ ok: true });
    }

    case "put": {
      const contact = body.contact;
      if (!contact?.id) return json({ error: "contact.id requerido." }, 400);
      const { data: existing } = await svc
        .from("contactos_confianza")
        .select("id_contacto")
        .eq("id_usuario", uid)
        .eq("id_externo", contact.id)
        .maybeSingle();
      if (existing) {
        const { error } = await svc
          .from("contactos_confianza")
          .update(toRow(uid, contact))
          .eq("id_contacto", (existing as { id_contacto: number }).id_contacto);
        if (error) return json({ error: error.message }, 500);
      } else {
        const { error } = await svc.from("contactos_confianza").insert(toRow(uid, contact));
        if (error) return json({ error: error.message }, 500);
      }
      return json({ ok: true });
    }

    case "delete": {
      const { error } = await svc
        .from("contactos_confianza")
        .delete()
        .eq("id_usuario", uid)
        .eq("id_externo", body.contactId ?? "");
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    default:
      return json({ error: "Acción desconocida." }, 400);
  }
});