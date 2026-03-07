-- No policies needed — absence of policies with RLS enabled defaults to deny all.
-- Only the service role key (which bypasses RLS) can interact with this table.
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;