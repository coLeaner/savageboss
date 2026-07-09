-- Doodle sketches + emoji mood stamps on guestbook notes.
-- A note now needs text OR a doodle (or both); mood is always optional.
alter table public.guestbook
	add column if not exists mood text,
	add column if not exists doodle text;

-- Message may be empty when a doodle carries the note instead.
alter table public.guestbook drop constraint if exists guestbook_message_check;
alter table public.guestbook add constraint guestbook_message_check
	check (
		char_length(message) <= 280
		and (char_length(message) >= 1 or doodle is not null)
	);

alter table public.guestbook drop constraint if exists guestbook_mood_check;
alter table public.guestbook add constraint guestbook_mood_check
	check (mood is null or char_length(mood) between 1 and 8);

-- Doodles are small transparent PNGs drawn on the site — nothing else.
alter table public.guestbook drop constraint if exists guestbook_doodle_check;
alter table public.guestbook add constraint guestbook_doodle_check
	check (
		doodle is null
		or (doodle like 'data:image/png;base64,%' and char_length(doodle) <= 24000)
	);

drop policy if exists "guestbook sign" on public.guestbook;
create policy "guestbook sign"
	on public.guestbook for insert
	to anon, authenticated
	with check (
		char_length(name) between 1 and 40
		and char_length(message) <= 280
		and (char_length(message) >= 1 or doodle is not null)
	);
