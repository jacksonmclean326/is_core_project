-- Apply after 202611080001_friends.sql. Safe to run again.
-- Authorizes only the caller and their direct friends who enabled leaderboard visibility.
-- Financial records remain protected by existing RLS; the server returns aggregate progress only.
begin;
create or replace function public.leaderboard_members()
returns table (id uuid, name text)
language sql stable security definer set search_path = ''
as $$
  select u.user_id,
    coalesce(nullif(trim(concat_ws(' ', u.first_name, u.last_name)), ''), 'Friend')
  from public."User" u
  where auth.uid() is not null and u.leaderboard_visibility = true
    and (u.user_id = auth.uid() or exists (
      select 1 from public."Friend" f
      where (f.user1_id = auth.uid() and f.user2_id = u.user_id)
         or (f.user2_id = auth.uid() and f.user1_id = u.user_id)
    ))
  order by u.user_id;
$$;
revoke all on function public.leaderboard_members() from public, anon;
grant execute on function public.leaderboard_members() to authenticated;
commit;
