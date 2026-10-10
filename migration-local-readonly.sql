-- 2026-10-10: a local run cannot write to production (localdb.js).
-- Roy runs this in the Supabase SQL editor. It creates a role that can only
-- READ; this machine's DATABASE_URL then uses it, and Postgres itself refuses
-- any write a local server, tool or session attempts. The production write
-- URL moves to CARDHUNT_WRITE_DATABASE_URL, which only refresh-daily.cmd and
-- refresh-weekly.cmd map onto DATABASE_URL for their own node process.
--
-- 1. The role. Choose the password in the editor; it is never written here.
--    BYPASSRLS: most tables have RLS on and no policy (the server is their only
--    client), so a plain role would read nothing. If Supabase refuses BYPASSRLS
--    to a role the postgres user creates, use step 1b instead.
CREATE ROLE cardhunt_local_ro LOGIN PASSWORD 'CHOOSE-IN-THE-EDITOR' BYPASSRLS;
ALTER ROLE cardhunt_local_ro SET default_transaction_read_only = on;

-- 2. Read, and nothing else: no INSERT, UPDATE, DELETE, TRUNCATE, no CREATE.
GRANT USAGE ON SCHEMA public TO cardhunt_local_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO cardhunt_local_ro;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO cardhunt_local_ro;
-- Tables created later (the server's first-use migrations run as postgres):
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT ON TABLES TO cardhunt_local_ro;

-- 1b. Only if BYPASSRLS was refused: create the role without it, then one
--     read policy per RLS-enabled table, e.g.
--   CREATE POLICY local_ro_read ON public.price_history FOR SELECT TO cardhunt_local_ro USING (true);
--     (a policy is needed on every table the local server reads).

-- 3. Check, connected AS cardhunt_local_ro (localdb.CAPABILITY_SQL):
--   SELECT current_user, has_table_privilege(current_user, 'public.price_history', 'INSERT'),
--          has_schema_privilege(current_user, 'public', 'CREATE'),
--          current_setting('default_transaction_read_only');
--   -> cardhunt_local_ro | f | f | on
-- and a write must fail:  INSERT INTO search_log (query) VALUES ('x');  -> ERROR
