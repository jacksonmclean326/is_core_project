--
-- PostgreSQL database dump
--

\restrict Gp4kzLUCVm7D56K5YHMcYW2HPiCDr5X9aKg8jxzDpoJft8A0E4swkwyepwbgXkE

-- Dumped from database version 17.11
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  INSERT INTO public."User" (
    user_id,
    auth_user_id,
    email_address,
    first_name,
    last_name
  )
  VALUES (
    NEW.id,
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data ->> 'first_name',
    NEW.raw_user_meta_data ->> 'last_name'
  );

  RETURN NEW;
END;
$$;


--
-- Name: set_user_friend_code(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_user_friend_code() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  alphabet CONSTANT text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
  position integer;
BEGIN
  IF NEW.friend_code IS NOT NULL AND btrim(NEW.friend_code) <> '' THEN
    RETURN NEW;
  END IF;

  LOOP
    candidate := '';
    FOR position IN 1..6 LOOP
      candidate := candidate || substr(
        alphabet,
        floor(pg_catalog.random() * length(alphabet))::integer + 1,
        1
      );
    END LOOP;

    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(candidate, 0)
    );
    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public."User" AS existing_user
      WHERE existing_user.friend_code = candidate
    );
  END LOOP;

  NEW.friend_code := candidate;
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: Budget; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Budget" (
    monthly_budget double precision NOT NULL,
    monthly_income double precision NOT NULL,
    month date,
    budget_id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid
);


--
-- Name: Category; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Category" (
    category_budget double precision NOT NULL,
    spending double precision,
    year date NOT NULL,
    name text NOT NULL,
    category_id uuid DEFAULT gen_random_uuid() NOT NULL,
    budget_id uuid
);


--
-- Name: Chatbot History; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Chatbot History" (
    user_input text NOT NULL,
    datestamp timestamp with time zone DEFAULT now() NOT NULL,
    chatbot_response text,
    chat_id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid
);


--
-- Name: Friend; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Friend" (
    user1_id uuid,
    user2_id uuid
);


--
-- Name: Goal; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Goal" (
    goal_type text,
    desired_savings double precision,
    amount_savings double precision,
    goal_id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid
);


--
-- Name: Income Source; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Income Source" (
    balance double precision,
    source_type text,
    source_id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    plaid_connection_id uuid,
    plaid_account_id text,
    account_name text,
    official_name text,
    account_mask text,
    account_subtype text,
    available_balance double precision,
    currency_code text,
    balance_synced_at timestamp with time zone
);


--
-- Name: TABLE "Income Source"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public."Income Source" IS 'Income Source of User';


--
-- Name: COLUMN "Income Source".balance; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."Income Source".balance IS '[SENSITIVE]';


--
-- Name: Plaid Item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Plaid Item" (
    item_id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    plaid_item_id text DEFAULT ''::text NOT NULL,
    user_id uuid NOT NULL,
    institution_id text,
    institution_name text NOT NULL,
    access_token_encrypted text NOT NULL,
    last_synced_at timestamp with time zone
);


--
-- Name: Transaction; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Transaction" (
    amount double precision,
    date timestamp with time zone,
    transaction_id uuid DEFAULT gen_random_uuid() NOT NULL,
    category_id uuid,
    source_id uuid
);


--
-- Name: User; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."User" (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    first_name text,
    last_name text,
    email_address text,
    streak bigint DEFAULT '0'::bigint,
    date_of_birth timestamp without time zone,
    friend_code character varying DEFAULT ''::character varying NOT NULL,
    last_active timestamp without time zone,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    auth_user_id uuid,
    CONSTRAINT "User_friend_code_format_check" CHECK (((friend_code)::text ~ '^[A-HJ-NP-Z2-9]{6}$'::text))
);


--
-- Name: Budget Budget_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Budget"
    ADD CONSTRAINT "Budget_pkey" PRIMARY KEY (budget_id);


--
-- Name: Category Category_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Category"
    ADD CONSTRAINT "Category_pkey" PRIMARY KEY (category_id);


--
-- Name: Chatbot History Chatbot History_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Chatbot History"
    ADD CONSTRAINT "Chatbot History_pkey" PRIMARY KEY (chat_id);


--
-- Name: Goal Goal_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Goal"
    ADD CONSTRAINT "Goal_pkey" PRIMARY KEY (goal_id);


--
-- Name: Income Source Income Source_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Income Source"
    ADD CONSTRAINT "Income Source_pkey" PRIMARY KEY (source_id);


--
-- Name: Income Source Income Source_plaid_account_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Income Source"
    ADD CONSTRAINT "Income Source_plaid_account_unique" UNIQUE (plaid_connection_id, plaid_account_id);


--
-- Name: Plaid Item Plaid Item_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Plaid Item"
    ADD CONSTRAINT "Plaid Item_pkey" PRIMARY KEY (item_id);


--
-- Name: Plaid Item Plaid Item_plaid_item_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Plaid Item"
    ADD CONSTRAINT "Plaid Item_plaid_item_id_key" UNIQUE (plaid_item_id);


--
-- Name: Transaction Transaction_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Transaction"
    ADD CONSTRAINT "Transaction_pkey" PRIMARY KEY (transaction_id);


--
-- Name: User User_auth_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_auth_user_id_key" UNIQUE (auth_user_id);


--
-- Name: User User_frien_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_frien_code_key" UNIQUE (friend_code);


--
-- Name: User User_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY (user_id);


--
-- Name: User_friend_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "User_friend_code_key" ON public."User" USING btree (friend_code);


--
-- Name: User set_user_friend_code; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_user_friend_code BEFORE INSERT OR UPDATE ON public."User" FOR EACH ROW EXECUTE FUNCTION public.set_user_friend_code();


--
-- Name: Budget Budget_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Budget"
    ADD CONSTRAINT "Budget_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public."User"(user_id);


--
-- Name: Category Category_budget_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Category"
    ADD CONSTRAINT "Category_budget_id_fkey" FOREIGN KEY (budget_id) REFERENCES public."Budget"(budget_id);


--
-- Name: Chatbot History Chatbot History_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Chatbot History"
    ADD CONSTRAINT "Chatbot History_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public."User"(user_id);


--
-- Name: Friend Friend_user1_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Friend"
    ADD CONSTRAINT "Friend_user1_id_fkey" FOREIGN KEY (user1_id) REFERENCES public."User"(user_id);


--
-- Name: Friend Friend_user2_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Friend"
    ADD CONSTRAINT "Friend_user2_id_fkey" FOREIGN KEY (user2_id) REFERENCES public."User"(user_id);


--
-- Name: Goal Goal_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Goal"
    ADD CONSTRAINT "Goal_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public."User"(user_id);


--
-- Name: Income Source Income Source_plaid_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Income Source"
    ADD CONSTRAINT "Income Source_plaid_connection_id_fkey" FOREIGN KEY (plaid_connection_id) REFERENCES public."Plaid Item"(item_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Income Source Income Source_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Income Source"
    ADD CONSTRAINT "Income Source_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public."User"(user_id);


--
-- Name: Plaid Item Plaid Item_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Plaid Item"
    ADD CONSTRAINT "Plaid Item_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public."User"(user_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Transaction Transaction_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Transaction"
    ADD CONSTRAINT "Transaction_category_id_fkey" FOREIGN KEY (category_id) REFERENCES public."Category"(category_id);


--
-- Name: Transaction Transaction_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Transaction"
    ADD CONSTRAINT "Transaction_source_id_fkey" FOREIGN KEY (source_id) REFERENCES public."Income Source"(source_id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: User User_auth_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_auth_user_id_fkey" FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: Budget; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Budget" ENABLE ROW LEVEL SECURITY;

--
-- Name: Category; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Category" ENABLE ROW LEVEL SECURITY;

--
-- Name: Chatbot History; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Chatbot History" ENABLE ROW LEVEL SECURITY;

--
-- Name: Budget Enable delete for users based on user_id; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable delete for users based on user_id" ON public."Budget" FOR DELETE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: Chatbot History Enable delete for users based on user_id; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable delete for users based on user_id" ON public."Chatbot History" FOR DELETE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: Goal Enable delete for users based on user_id; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable delete for users based on user_id" ON public."Goal" FOR DELETE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: Income Source Enable delete for users based on user_id; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable delete for users based on user_id" ON public."Income Source" FOR DELETE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: Plaid Item Enable delete for users based on user_id; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable delete for users based on user_id" ON public."Plaid Item" FOR DELETE USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: User Enable delete for users based on user_id; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable delete for users based on user_id" ON public."User" FOR DELETE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: Plaid Item Enable insert for authenticated users only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable insert for authenticated users only" ON public."Plaid Item" FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: Budget Enable insert for users based on user_id; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable insert for users based on user_id" ON public."Budget" FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: Chatbot History Enable insert for users based on user_id; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable insert for users based on user_id" ON public."Chatbot History" FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: Goal Enable insert for users based on user_id; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable insert for users based on user_id" ON public."Goal" FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: Income Source Enable insert for users based on user_id; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable insert for users based on user_id" ON public."Income Source" FOR INSERT WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: User Enable insert for users based on user_id; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable insert for users based on user_id" ON public."User" FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: Budget Enable users to view their own data only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable users to view their own data only" ON public."Budget" FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: Chatbot History Enable users to view their own data only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable users to view their own data only" ON public."Chatbot History" FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: Goal Enable users to view their own data only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable users to view their own data only" ON public."Goal" FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: Income Source Enable users to view their own data only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable users to view their own data only" ON public."Income Source" FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: Plaid Item Enable users to view their own data only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable users to view their own data only" ON public."Plaid Item" FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: User Enable users to view their own data only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable users to view their own data only" ON public."User" FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: Friend; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Friend" ENABLE ROW LEVEL SECURITY;

--
-- Name: Goal; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Goal" ENABLE ROW LEVEL SECURITY;

--
-- Name: Income Source; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Income Source" ENABLE ROW LEVEL SECURITY;

--
-- Name: Plaid Item; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Plaid Item" ENABLE ROW LEVEL SECURITY;

--
-- Name: Transaction; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Transaction" ENABLE ROW LEVEL SECURITY;

--
-- Name: User; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY;

--
-- Name: Category Users can add categories to their budgets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can add categories to their budgets" ON public."Category" FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public."Budget" b
  WHERE ((b.budget_id = "Category".budget_id) AND (b.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: Transaction Users can add their own transactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can add their own transactions" ON public."Transaction" FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1
   FROM (public."Category" c
     JOIN public."Budget" b ON ((b.budget_id = c.budget_id)))
  WHERE ((c.category_id = "Transaction".category_id) AND (b.user_id = ( SELECT auth.uid() AS uid))))) AND ((source_id IS NULL) OR (EXISTS ( SELECT 1
   FROM public."Income Source" s
  WHERE ((s.source_id = "Transaction".source_id) AND (s.user_id = ( SELECT auth.uid() AS uid))))))));


--
-- Name: Friend Users can create friend links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create friend links" ON public."Friend" FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = user1_id));


--
-- Name: Category Users can delete categories in their budgets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete categories in their budgets" ON public."Category" FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public."Budget" b
  WHERE ((b.budget_id = "Category".budget_id) AND (b.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: Friend Users can delete their own friend links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own friend links" ON public."Friend" FOR DELETE TO authenticated USING (((( SELECT auth.uid() AS uid) = user1_id) OR (( SELECT auth.uid() AS uid) = user2_id)));


--
-- Name: Transaction Users can delete their own transactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own transactions" ON public."Transaction" FOR DELETE TO authenticated USING (((EXISTS ( SELECT 1
   FROM (public."Category" c
     JOIN public."Budget" b ON ((b.budget_id = c.budget_id)))
  WHERE ((c.category_id = "Transaction".category_id) AND (b.user_id = ( SELECT auth.uid() AS uid))))) AND ((source_id IS NULL) OR (EXISTS ( SELECT 1
   FROM public."Income Source" s
  WHERE ((s.source_id = "Transaction".source_id) AND (s.user_id = ( SELECT auth.uid() AS uid))))))));


--
-- Name: Category Users can update categories in their budgets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update categories in their budgets" ON public."Category" FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public."Budget" b
  WHERE ((b.budget_id = "Category".budget_id) AND (b.user_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public."Budget" b
  WHERE ((b.budget_id = "Category".budget_id) AND (b.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: Budget Users can update their own budgets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own budgets" ON public."Budget" FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: Chatbot History Users can update their own chatbot history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own chatbot history" ON public."Chatbot History" FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: Goal Users can update their own goals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own goals" ON public."Goal" FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: Income Source Users can update their own income sources; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own income sources" ON public."Income Source" FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: User Users can update their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own profile" ON public."User" FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: Transaction Users can update their own transactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own transactions" ON public."Transaction" FOR UPDATE TO authenticated USING (((EXISTS ( SELECT 1
   FROM (public."Category" c
     JOIN public."Budget" b ON ((b.budget_id = c.budget_id)))
  WHERE ((c.category_id = "Transaction".category_id) AND (b.user_id = ( SELECT auth.uid() AS uid))))) AND ((source_id IS NULL) OR (EXISTS ( SELECT 1
   FROM public."Income Source" s
  WHERE ((s.source_id = "Transaction".source_id) AND (s.user_id = ( SELECT auth.uid() AS uid)))))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM (public."Category" c
     JOIN public."Budget" b ON ((b.budget_id = c.budget_id)))
  WHERE ((c.category_id = "Transaction".category_id) AND (b.user_id = ( SELECT auth.uid() AS uid))))) AND ((source_id IS NULL) OR (EXISTS ( SELECT 1
   FROM public."Income Source" s
  WHERE ((s.source_id = "Transaction".source_id) AND (s.user_id = ( SELECT auth.uid() AS uid))))))));


--
-- Name: Category Users can view categories in their budgets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view categories in their budgets" ON public."Category" FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public."Budget" b
  WHERE ((b.budget_id = "Category".budget_id) AND (b.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: Friend Users can view their own friend links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own friend links" ON public."Friend" FOR SELECT TO authenticated USING (((( SELECT auth.uid() AS uid) = user1_id) OR (( SELECT auth.uid() AS uid) = user2_id)));


--
-- Name: Transaction Users can view their own transactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own transactions" ON public."Transaction" FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM (public."Category" c
     JOIN public."Budget" b ON ((b.budget_id = c.budget_id)))
  WHERE ((c.category_id = "Transaction".category_id) AND (b.user_id = ( SELECT auth.uid() AS uid))))) AND ((source_id IS NULL) OR (EXISTS ( SELECT 1
   FROM public."Income Source" s
  WHERE ((s.source_id = "Transaction".source_id) AND (s.user_id = ( SELECT auth.uid() AS uid))))))));


--
-- Name: Plaid Item update only your data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "update only your data" ON public."Plaid Item" FOR UPDATE USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- PostgreSQL database dump complete
--

\unrestrict Gp4kzLUCVm7D56K5YHMcYW2HPiCDr5X9aKg8jxzDpoJft8A0E4swkwyepwbgXkE

