-- Incremental transaction sync: remember how far each bank has been synced so that only changes are
-- pulled from Plaid. Safe to re-run.

ALTER TABLE public."Plaid Item"
    ADD COLUMN IF NOT EXISTS transactions_cursor text,
    ADD COLUMN IF NOT EXISTS transactions_synced_at timestamp with time zone,
    ADD COLUMN IF NOT EXISTS history_complete boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS categorizer_version integer NOT NULL DEFAULT 0;
