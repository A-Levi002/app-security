// SECURE_OS / Alert.IA — _shared/client.ts
// Clientes de Supabase para Edge Functions.
// - getUserFromRequest: cliente con el JWT del ciudadano (para RLS) + su user.
// - getSvcClient: cliente service-role (SOLO backend; el cliente jamás la usa).
// El service-role bypassa RLS, por eso TODA escritura pasa por un chequeo
// explícito del uid obtenido del JWT (nunca se confía en el body).
import { createClient, SupabaseClient } from "supabase-js";

export type AppUser = Awaited<
  ReturnType<SupabaseClient["auth"]["getUser"]>
>["data"]["user"];

export async function getUserFromRequest(req: Request): Promise<{
  user: AppUser | null;
  supabase: SupabaseClient;
}> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const apikey = req.headers.get("apikey") ?? "";
  if (!authHeader && !apikey) {
    return {
      user: null,
      supabase: createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_ANON_KEY") ?? ""
      ),
    };
  }
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data } = await supabase.auth.getUser(
    authHeader.replace("Bearer ", "")
  );
  return { user: data.user ?? null, supabase };
}

export function getSvcClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );
}