-- In-app feedback: what people send from the "Send feedback" dialog (Settings, Details, Help).
-- Run this in the Supabase SQL Editor. Safe to run twice.
--
-- Signed-in users can add feedback and read back only their own. The team reads all of it in the
-- Supabase Table Editor (Feedback), which is not limited by these policies.
begin;

create table if not exists public."Feedback" (
  feedback_id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  kind text not null check (kind in ('bug', 'confusing', 'idea', 'praise')),
  message text not null check (char_length(message) between 5 and 1000),
  -- the page it was sent from, like /details
  page text check (page is null or char_length(page) <= 21),
  -- true when the person agreed the team can email them; email is only filled in then
  contact_ok boolean not null default false,
  email text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists feedback_created_at_idx on public."Feedback" (created_at desc);

alter table public."Feedback" enable row level security;
grant insert, select on public."Feedback" to authenticated;

drop policy if exists "feedback_insert_own" on public."Feedback";
create policy "feedback_insert_own" on public."Feedback"
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "feedback_select_own" on public."Feedback";
create policy "feedback_select_own" on public."Feedback"
  for select to authenticated
  using ((select auth.uid()) = user_id);

commit;
