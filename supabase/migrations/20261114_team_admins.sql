-- Team admins: who can open the team-only /admin page (savings OKRs).
-- Run this in the Supabase SQL Editor. Safe to run twice.
--
-- To make someone an admin, open Table Editor → "Team Admin" → Insert row, and type their login email.
-- Delete the row to remove them. Changes apply within 30 seconds; nothing needs to be redeployed.
--
-- Security: row level security is on and there are no policies, and signed-in users have no grants, so the
-- app's users cannot read or change this table, even by calling Supabase directly. Only the server (secret
-- key) and people signed in to the Supabase dashboard can.
begin;

create table if not exists public."Team Admin" (
  -- the admin's login email; upper/lower case does not matter
  email text primary key check (char_length(trim(email)) between 3 and 320),
  -- optional, for your own records, like "Scrum master"
  note text,
  added_at timestamptz not null default now()
);

alter table public."Team Admin" enable row level security;
revoke all on public."Team Admin" from anon, authenticated;

commit;
