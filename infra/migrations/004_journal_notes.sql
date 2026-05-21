-- 004: general journal notes with tags and date filtering

create table journal_notes (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null references auth.users(id) on delete cascade,
  title             text,
  encrypted_content text        not null,
  tags              text[]      not null default '{}',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table journal_notes enable row level security;
create policy "journal_notes: own rows only" on journal_notes
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());

create index idx_journal_notes_user    on journal_notes(user_id, created_at desc);
create index idx_journal_notes_tags    on journal_notes using gin(tags);
