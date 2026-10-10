-- The deals shelf's tables (2026-10-08 .. 10-10). server.js creates them on
-- first use (dealTable); this file is the record of the same statements, so
-- every first-use table has one (PROGRESS 2026-10-10 (first-use tables)).
-- Our own records only: no eBay title, price, photo, seller or end time.
CREATE TABLE IF NOT EXISTS deal_picks (
  card_id text PRIMARY KEY, item_id text NOT NULL, found_at timestamptz NOT NULL DEFAULT now(), run_id text);
ALTER TABLE deal_picks ENABLE ROW LEVEL SECURITY;
-- When the job last walked each card (the rotation, TASK-account-and-bars T5a).
CREATE TABLE IF NOT EXISTS deal_walks (card_id text PRIMARY KEY, walked_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE deal_walks ENABLE ROW LEVEL SECURITY;
-- The auction bars' picks (T5b): our band, never eBay's end time.
CREATE TABLE IF NOT EXISTS bar_picks (bar text NOT NULL, card_id text NOT NULL, item_id text NOT NULL,
  band text, found_at timestamptz NOT NULL DEFAULT now(), run_id text, PRIMARY KEY (bar, card_id));
ALTER TABLE bar_picks ENABLE ROW LEVEL SECURITY;
