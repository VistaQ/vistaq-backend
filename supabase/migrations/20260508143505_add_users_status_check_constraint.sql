UPDATE public.users SET status = 'active' WHERE status NOT IN ('active','inactive','suspended');
ALTER TABLE public.users ADD CONSTRAINT users_status_check CHECK (status IN ('active','inactive','suspended'));
CREATE INDEX IF NOT EXISTS users_active_role_group_idx ON public.users (group_id, role) WHERE status = 'active';
