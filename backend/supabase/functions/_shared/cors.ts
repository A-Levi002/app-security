// SECURE_OS / Alert.IA — _shared/cors.ts
// Helpers CORS para todas las Edge Functions. Nunca se despliega sola:
// es un módulo compartido (Carpeta `_shared` no es una función).

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};

export const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

export const isOptions = (req: Request): boolean => req.method === "OPTIONS";