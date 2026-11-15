-- Savings OKRs (OKR 3 and OKR 4). Run this in the Supabase SQL Editor. Safe to run twice.
--
-- OKR 3, "% of users that consistently meet their savings goals":
--   "Goal Month Result" keeps one row per user per finished month saying whether that month's Savings and
--   Spending goals were all met. The server fills it in (past months are worked out from saved transactions
--   and monthly income), so signed-in users can only read their own rows.
--
-- OKR 4, "% of users that reported savings after two months of using the app":
--   "Savings Check-in" keeps each user's answer to the check-in that appears 60 days after sign-up.
--
-- The team-only page at /admin reads both tables with the server's secret key.
begin;

create table if not exists public."Goal Month Result" (
  user_id uuid not null,
  -- the first day of the month, like 2026-10-01
  month date not null,
  -- Savings and Spending goals that could be checked that month (a Savings goal needs an income)
  goals_counted integer not null check (goals_counted >= 0),
  goals_met integer not null check (goals_met >= 0 and goals_met <= goals_counted),
  -- true when every counted goal was met
  met boolean not null,
  spent double precision not null default 0,
  income double precision,
  computed_at timestamptz not null default now(),
  primary key (user_id, month)
);

alter table public."Goal Month Result" enable row level security;
grant select on public."Goal Month Result" to authenticated;

drop policy if exists "goal_month_result_select_own" on public."Goal Month Result";
create policy "goal_month_result_select_own" on public."Goal Month Result"
  for select to authenticated
  using ((select auth.uid()) = user_id);

create table if not exists public."Savings Check-in" (
  user_id uuid primary key default auth.uid(),
  -- null until answered
  saved boolean,
  -- optional amount saved, in US dollars
  amount double precision check (amount is null or (amount >= 0 and amount < 1e9)),
  answered_at timestamptz,
  -- "Not now" hides the check-in until this time
  snoozed_until timestamptz,
  created_at timestamptz not null default now()
);

alter table public."Savings Check-in" enable row level security;
grant select, insert, update, delete on public."Savings Check-in" to authenticated;

drop policy if exists "savings_checkin_select_own" on public."Savings Check-in";
create policy "savings_checkin_select_own" on public."Savings Check-in"
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "savings_checkin_insert_own" on public."Savings Check-in";
create policy "savings_checkin_insert_own" on public."Savings Check-in"
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "savings_checkin_update_own" on public."Savings Check-in";
create policy "savings_checkin_update_own" on public."Savings Check-in"
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "savings_checkin_delete_own" on public."Savings Check-in";
create policy "savings_checkin_delete_own" on public."Savings Check-in"
  for delete to authenticated
  using ((select auth.uid()) = user_id);

commit;
