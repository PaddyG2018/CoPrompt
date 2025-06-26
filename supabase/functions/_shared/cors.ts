// supabase/functions/_shared/cors.ts
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // Allow requests from any origin including Chrome extensions
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-requested-with",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE", // Allow POST for data, OPTIONS for preflight
  "Access-Control-Allow-Credentials": "false", // Chrome extensions don't need credentials
  "Access-Control-Max-Age": "86400", // Cache preflight for 24 hours
};
