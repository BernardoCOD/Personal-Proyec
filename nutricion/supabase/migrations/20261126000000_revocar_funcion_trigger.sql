-- La función del trigger que crea el perfil no debe poder llamarse por la API
-- (aviso del Security Advisor de Supabase). El trigger sigue funcionando.
revoke execute on function public.crear_perfil_nuevo_usuario() from public, anon, authenticated;
