-- Guestbook note wall for visitors.
-- Public (anon) can read every note and add their own, nothing else.
create table if not exists public.guestbook (
	id bigint generated always as identity primary key,
	name text not null check (char_length(name) between 1 and 40),
	message text not null check (char_length(message) between 1 and 280),
	created_at timestamptz not null default now()
);

alter table public.guestbook enable row level security;

drop policy if exists "guestbook read" on public.guestbook;
create policy "guestbook read"
	on public.guestbook for select
	to anon, authenticated
	using (true);

drop policy if exists "guestbook sign" on public.guestbook;
create policy "guestbook sign"
	on public.guestbook for insert
	to anon, authenticated
	with check (
		char_length(name) between 1 and 40
		and char_length(message) between 1 and 280
	);

create index if not exists guestbook_created_at_idx
	on public.guestbook (created_at desc);
