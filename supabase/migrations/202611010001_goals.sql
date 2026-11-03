-- Adapts the existing public."Goal" table shown in Supabase.
-- Assumes "Goal".user_id uses the Auth UUID, matching the app's "User" lookup.
-- Existing foreign keys and rows are preserved. Run in Supabase SQL Editor.
begin;
alter table public."Goal" add column if not exists goal_name text;
create index if not exists goal_user_id_idx on public."Goal"(user_id);
alter table public."Goal" enable row level security;
grant select, insert, update, delete on public."Goal" to authenticated;

-- A restrictive policy also limits any existing permissive policies.
-- Existing policies are retained; stricter existing policies can still deny access.
drop policy if exists "goal_owner_boundary" on public."Goal";
create policy "goal_owner_boundary" on public."Goal"
  as restrictive for all to public
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists "goal_owner_access" on public."Goal";
create policy "goal_owner_access" on public."Goal"
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.save_user_goals(items jsonb)
returns setof public."Goal"
language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to save goals.';
  end if;
  if jsonb_typeof(items) is distinct from 'array' then
    raise exception 'Goals must be an array.';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(items)
      as x(id uuid, kind text, name text, target double precision)
    where x.id is null or x.kind is null
      or x.kind not in ('Savings', 'Spending', 'Earnings', 'Investing')
      or x.name is null or char_length(trim(x.name)) not between 1 and 36
      or x.target is null or not (x.target > 0 and x.target < 'Infinity'::double precision)
  ) then
    raise exception 'Each goal needs a valid ID, type, name, and positive finite target.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  insert into public."Goal" (goal_id, user_id, goal_type, goal_name, desired_savings, amount_savings)
  select x.id, auth.uid(), x.kind, trim(x.name), x.target, 0
  from jsonb_to_recordset(items)
    as x(id uuid, kind text, name text, target double precision)
  on conflict (goal_id) do update
    set goal_type = excluded.goal_type, goal_name = excluded.goal_name,
        desired_savings = excluded.desired_savings;
  delete from public."Goal" g
  where g.user_id = auth.uid()
    and not exists (
      select 1 from jsonb_to_recordset(items) as x(id uuid) where x.id = g.goal_id
    );
  return query select g.* from public."Goal" g
    where g.user_id = auth.uid() order by g.goal_id;
end;
$$;
revoke all on function public.save_user_goals(jsonb) from public, anon;
grant execute on function public.save_user_goals(jsonb) to authenticated;
commit;
