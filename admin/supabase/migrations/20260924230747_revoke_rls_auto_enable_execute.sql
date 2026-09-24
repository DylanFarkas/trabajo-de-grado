-- Función de evento de Supabase. No es un endpoint: anon y authenticated
-- no deben poder llamarla por /rest/v1/rpc.
revoke all on function public.rls_auto_enable() from public, anon, authenticated;
