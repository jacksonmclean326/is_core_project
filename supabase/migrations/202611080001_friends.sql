-- Run once in the Supabase SQL Editor (safe to run again).
-- Friendships are mutual. Only names and IDs are shared, never email or finances.
begin;

create or replace function public.list_friends()
returns table (id uuid, name text)
language sql stable security definer set search_path = ''
as $$
  select u.user_id,
    coalesce(nullif(trim(concat_ws(' ', u.first_name, u.last_name)), ''), 'Friend')
  from public."User" u
  where auth.uid() is not null and u.user_id <> auth.uid()
    and exists (
      select 1 from public."Friend" f
      where (f.user1_id = auth.uid() and f.user2_id = u.user_id)
         or (f.user2_id = auth.uid() and f.user1_id = u.user_id)
    )
  order by 2, 1;
$$;

create or replace function public.add_friend_by_code(code text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  target uuid;
begin
  if caller is null then raise exception 'Sign in to manage friends.' using errcode = '28000'; end if;
  if code is null or upper(trim(code)) !~ '^[A-HJ-NP-Z2-9]{6}$' then
    raise exception 'Enter a valid six-character friend code.' using errcode = '22023';
  end if;
  select user_id into target from public."User" where friend_code = upper(trim(code));
  if target is null then raise exception 'No account matches that friend code.' using errcode = 'P0002'; end if;
  if target = caller then raise exception 'You cannot add yourself.' using errcode = '22023'; end if;
  -- Serialize adds/removals so simultaneous reciprocal adds create only one link.
  lock table public."Friend" in share row exclusive mode;
  if exists (select 1 from public."Friend" where
    (user1_id = caller and user2_id = target) or (user1_id = target and user2_id = caller)) then
    raise exception 'You are already friends.' using errcode = '23505';
  end if;
  insert into public."Friend" (user1_id, user2_id) values (caller, target);
end;
$$;

create or replace function public.remove_friend(friend_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Sign in to manage friends.' using errcode = '28000'; end if;
  lock table public."Friend" in share row exclusive mode;
  delete from public."Friend" where
    (user1_id = auth.uid() and user2_id = friend_id)
    or (user2_id = auth.uid() and user1_id = friend_id);
end;
$$;

-- All new links go through the validated, serialized code lookup.
drop policy if exists "Users can create friend links" on public."Friend";
revoke insert, update on public."Friend" from anon, authenticated;
revoke all on function public.list_friends() from public, anon;
revoke all on function public.add_friend_by_code(text) from public, anon;
revoke all on function public.remove_friend(uuid) from public, anon;
grant execute on function public.list_friends() to authenticated;
grant execute on function public.add_friend_by_code(text) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;
commit;
