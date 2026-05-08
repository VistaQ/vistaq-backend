-- Drop superseded indexes
DROP INDEX IF EXISTS public.users_active_role_group_idx;
DROP INDEX IF EXISTS public.idx_users_group_id_role;

-- Full composite indexes matching actual query patterns
CREATE INDEX users_group_id_role_status_idx ON public.users (group_id, role, status);
CREATE INDEX users_tenant_id_role_status_idx ON public.users (tenant_id, role, status);
