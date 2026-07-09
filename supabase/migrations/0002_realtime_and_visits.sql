-- 1) Realtime: broadcast guestbook inserts so a new note can pin itself
--    onto the wall live while someone else is watching.
do $$
begin
	alter publication supabase_realtime add table public.guestbook;
exception
	when duplicate_object then null; -- already in the publication
end $$;

-- 2) Visitor counter: a single-row stats table bumped through a
--    security-definer RPC, so anon can call record_visit() but can
--    never write the table directly.
create table if not exists public.site_stats (
	key text primary key,
	count bigint not null default 0
);

alter table public.site_stats enable row level security;

insert into public.site_stats (key, count)
values ('visits', 0)
on conflict (key) do nothing;

drop policy if exists "stats read" on public.site_stats;
create policy "stats read"
	on public.site_stats for select
	to anon, authenticated
	using (true);

create or replace function public.record_visit()
returns bigint
language sql
security definer
set search_path = public
as $$
	update public.site_stats
	set count = count + 1
	where key = 'visits'
	returning count;
$$;

revoke all on function public.record_visit() from public;
grant execute on function public.record_visit() to anon, authenticated;
