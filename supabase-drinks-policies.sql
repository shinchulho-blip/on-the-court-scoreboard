-- Run this once in Supabase SQL Editor.
-- It allows the public anon key used by this app to read, add, and delete drink orders.

alter table public.drinks enable row level security;

drop policy if exists "drinks_select_anon" on public.drinks;
create policy "drinks_select_anon"
on public.drinks
for select
to anon
using (true);

drop policy if exists "drinks_insert_anon" on public.drinks;
create policy "drinks_insert_anon"
on public.drinks
for insert
to anon
with check (true);

drop policy if exists "drinks_delete_anon" on public.drinks;
create policy "drinks_delete_anon"
on public.drinks
for delete
to anon
using (true);
