-- Store auto-categorized Plaid transactions per user.
-- Safe to re-run. The server writes with the service role (bypasses RLS);
-- signed-in users can only read their own rows.

ALTER TABLE public."Transaction"
    ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public."User"(user_id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS plaid_transaction_id text,
    ADD COLUMN IF NOT EXISTS name text,
    ADD COLUMN IF NOT EXISTS category_key text,
    ADD COLUMN IF NOT EXISTS account_name text,
    ADD COLUMN IF NOT EXISTS institution_name text;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Transaction_plaid_transaction_unique'
    ) THEN
        ALTER TABLE public."Transaction"
            ADD CONSTRAINT "Transaction_plaid_transaction_unique" UNIQUE (user_id, plaid_transaction_id);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Transaction_category_key_check'
    ) THEN
        ALTER TABLE public."Transaction"
            ADD CONSTRAINT "Transaction_category_key_check"
            CHECK (category_key IS NULL OR category_key IN
                ('housing','food','transport','utilities','education','personal','other'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Transaction_user_date_idx" ON public."Transaction" (user_id, date DESC);

DROP POLICY IF EXISTS "Users can view their own imported transactions" ON public."Transaction";
CREATE POLICY "Users can view their own imported transactions"
    ON public."Transaction" FOR SELECT TO authenticated
    USING (user_id IS NOT NULL AND (SELECT auth.uid()) = user_id);
