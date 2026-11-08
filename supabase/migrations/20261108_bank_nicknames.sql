-- Rename and hide bank connections and accounts (Accounts page).
-- Run this in the Supabase SQL Editor. Safe to run twice.
--
--   Plaid Item.nickname    a name you give a bank connection (blank = use the bank's own name)
--   Income Source.nickname a name you give one account
--   Income Source.hidden   true = leave this account out of spending totals, the transaction list, goals
--                          and chat, without disconnecting it
begin;

alter table public."Plaid Item" add column if not exists nickname text;
alter table public."Income Source" add column if not exists nickname text;
alter table public."Income Source" add column if not exists hidden boolean not null default false;

alter table public."Plaid Item" drop constraint if exists plaid_item_nickname_length;
alter table public."Plaid Item"
  add constraint plaid_item_nickname_length check (nickname is null or char_length(nickname) between 1 and 40);

alter table public."Income Source" drop constraint if exists income_source_nickname_length;
alter table public."Income Source"
  add constraint income_source_nickname_length check (nickname is null or char_length(nickname) between 1 and 40);

commit;
