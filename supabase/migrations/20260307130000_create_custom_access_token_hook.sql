-- Custom access token hook
-- Injects app-level claims (app_role, tenant_id, user_id) into the JWT
-- without overriding Supabase's reserved 'role' claim.

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb AS $$
DECLARE
  claims jsonb;
  user_app_role text;
  user_tenant_id uuid;
  user_id uuid;
BEGIN
  user_id := (event ->> 'user_id')::uuid;

  SELECT role, tenant_id
  INTO user_app_role, user_tenant_id
  FROM public.users
  WHERE id = user_id;

  claims := event -> 'claims';
  claims := jsonb_set(claims, '{app_role}',  to_jsonb(user_app_role));
  claims := jsonb_set(claims, '{tenant_id}', to_jsonb(user_tenant_id));
  claims := jsonb_set(claims, '{user_id}',   to_jsonb(user_id));

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Allow the auth service to execute the hook and read from public.users
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
GRANT SELECT ON public.users TO supabase_auth_admin;
