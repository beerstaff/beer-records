-- Run this once in your Supabase project's SQL Editor

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  created_at timestamptz not null default now()
);

create table if not exists records (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  title text not null,
  holder_name text not null,
  description text not null,
  photo text not null,
  reactions jsonb not null default '{"thumbsup":0,"laughing":0,"shocked":0,"cheers":0,"fire":0}',
  created_at timestamptz not null default now()
);

alter table categories enable row level security;
alter table records enable row level security;

-- Open read/write policies: anyone with the site link can add records and
-- categories and react to entries. There is no login system in this build.
-- Tighten these later if you want moderation or accounts.
create policy "public read categories" on categories for select using (true);
create policy "public insert categories" on categories for insert with check (true);

create policy "public read records" on records for select using (true);
create policy "public insert records" on records for insert with check (true);
create policy "public update records" on records for update using (true);
