-- Fix agent_codes.user_id FK to use ON DELETE SET NULL.
-- Without this, deleting an auth user (which cascades to public.users) fails
-- because agent_codes.user_id still references the user row.

ALTER TABLE agent_codes
  DROP CONSTRAINT agent_codes_user_id_fkey,
  ADD CONSTRAINT agent_codes_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
