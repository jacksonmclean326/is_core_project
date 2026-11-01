-- Custom categories, remembered merchant rules, and manual per-transaction categories.
-- Safe to re-run. The server writes with the service role (bypasses RLS);
-- signed-in users can only read their own rows.

CREATE TABLE IF NOT EXISTS public."Custom Category" (
    user_id uuid NOT NULL REFERENCES public."User"(user_id) ON DELETE CASCADE,
    category_key text NOT NULL CHECK (category_key ~ '^c-[0-9a-f]{8}$'),
    name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 24),
    color text NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, category_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS "Custom Category_user_name_key"
    ON public."Custom Category" (user_id, lower(name));

CREATE TABLE IF NOT EXISTS public."Merchant Rule" (
    user_id uuid NOT NULL REFERENCES public."User"(user_id) ON DELETE CASCADE,
    merchant_key text NOT NULL CHECK (char_length(merchant_key) BETWEEN 1 AND 200),
    category_key text NOT NULL CHECK (category_key ~ '^[a-z0-9-]{1,40}$'),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, merchant_key)
);

ALTER TABLE public."Custom Category" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Merchant Rule" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own custom categories" ON public."Custom Category";
CREATE POLICY "Users can view their own custom categories"
    ON public."Custom Category" FOR SELECT TO authenticated
    USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can view their own merchant rules" ON public."Merchant Rule";
CREATE POLICY "Users can view their own merchant rules"
    ON public."Merchant Rule" FOR SELECT TO authenticated
    USING ((SELECT auth.uid()) = user_id);

-- A transaction's category can now be a custom key, and may be chosen by the user.
ALTER TABLE public."Transaction"
    ADD COLUMN IF NOT EXISTS category_manual boolean NOT NULL DEFAULT false;

ALTER TABLE public."Transaction" DROP CONSTRAINT IF EXISTS "Transaction_category_key_check";
ALTER TABLE public."Transaction"
    ADD CONSTRAINT "Transaction_category_key_check"
    CHECK (category_key IS NULL OR category_key ~ '^[a-z0-9-]{1,40}$');
