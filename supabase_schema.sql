-- ==========================================================
-- Nexaa Link Shortener - Supabase Database Schema
-- Jalankan script SQL ini di: Supabase Dashboard -> SQL Editor
-- ==========================================================

create table if not exists public.links (
  id text primary key,
  slug text unique not null,
  destination text not null,
  short_url text not null,
  clicks integer default 0 not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  expires_at timestamp with time zone not null,
  last_accessed_at timestamp with time zone
);

-- Buat index untuk pencarian cepat berdasarkan slug
create index if not exists idx_links_slug on public.links (slug);

-- Buat index untuk filter expires_at
create index if not exists idx_links_expires_at on public.links (expires_at);

-- Matikan Row Level Security (RLS) atau buat policy publik agar API serverless bisa membaca & menulis
alter table public.links enable row level security;

-- Policy agar server dapat membaca dan menulis data (menggunakan anon key atau service role key)
create policy "Allow public read-write for links"
  on public.links
  for all
  using (true)
  with check (true);
