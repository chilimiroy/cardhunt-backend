-- TASK-account-and-bars T2, 2026-10-10: a person's REQUEST that their data be
-- deleted. server.js runs the same statements on first use (DELETION_SQL,
-- deletionTable); this file is the record.
--   user_id       the Supabase auth user id (the token's sub), one request each
--   email         the verified token's email at the time of the request
--   requested_at  when
-- Nothing is deleted by a request. Masters see it under Approve accounts.
-- No API role reads or writes it: the server is the only client.
CREATE TABLE IF NOT EXISTS account_deletion_requests (
  user_id uuid PRIMARY KEY, email text, requested_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE account_deletion_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON account_deletion_requests FROM anon, authenticated;
