-- ==========================================================
-- Nexaa Link Shortener - Supabase Database Schema
-- Jalankan script SQL ini di: Supabase Dashboard -> SQL Editor
-- ==========================================================

-- 1. Buat tabel links jika belum ada
create table if not exists public.links (
  id text primary key,
  slug text unique not null,
  destination text not null,
  short_url text not null,
  clicks integer default 0 not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  expires_at timestamp with time zone not null,
  last_accessed_at timestamp with time zone,
  user_id text,
  user_email text
);

-- 2. Migrasi untuk database yang sudah ada (tambah kolom jika belum ada)
alter table public.links add column if not exists user_id text;
alter table public.links add column if not exists user_email text;

-- 3. Buat indeks untuk performa pencarian cepat
create index if not exists idx_links_slug on public.links (slug);
create index if not exists idx_links_expires_at on public.links (expires_at);
create index if not exists idx_links_user_id on public.links (user_id);

-- 4. Konfigurasi Row Level Security (RLS)
alter table public.links enable row level security;

-- Policy agar server dapat membaca dan menulis data (menggunakan anon key atau service role key)
drop policy if exists "Allow public read-write for links" on public.links;
create policy "Allow public read-write for links"
  on public.links
  for all
  using (true)
  with check (true);
