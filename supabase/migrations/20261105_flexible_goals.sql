-- Flexible goals: a Spending goal can be limited to one category, and manual goals
-- (Earnings, Investing, Custom) can have a deadline and a progress amount the user types in.
-- Run this in the Supabase SQL Editor after 202611010001_goals.sql. Safe to run twice.
begin;

alter table public."Goal" add column if not exists category_key text;
alter table public."Goal" add column if not exists target_date date;

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
      as x(id uuid, kind text, name text, target double precision,
           category text, deadline date, progress double precision)
    where x.id is null or x.kind is null
      or x.kind not in ('Savings', 'Spending', 'Earnings', 'Investing', 'Custom')
      or x.name is null or char_length(trim(x.name)) not between 1 and 36
      or x.target is null or not (x.target > 0 and x.target < 'Infinity'::double precision)
      or (x.category is not null and char_length(x.category) > 64)
      or (x.progress is not null
          and not (x.progress >= 0 and x.progress < 'Infinity'::double precision))
  ) then
    raise exception 'Each goal needs a valid ID, type, name, and positive finite target.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  insert into public."Goal" (goal_id, user_id, goal_type, goal_name, desired_savings,
                             amount_savings, category_key, target_date)
  select x.id, auth.uid(), x.kind, trim(x.name), x.target,
         coalesce(x.progress, 0), x.category, x.deadline
  from jsonb_to_recordset(items)
    as x(id uuid, kind text, name text, target double precision,
         category text, deadline date, progress double precision)
  on conflict (goal_id) do update
    set goal_type = excluded.goal_type, goal_name = excluded.goal_name,
        desired_savings = excluded.desired_savings, amount_savings = excluded.amount_savings,
        category_key = excluded.category_key, target_date = excluded.target_date;
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
