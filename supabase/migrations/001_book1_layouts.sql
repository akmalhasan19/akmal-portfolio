-- ============================================================
-- Migration: Book 1 Dynamic Page Authoring
-- ============================================================

-- 1. Admin whitelist table
create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- 2. Page side layouts (one row per page-side)
create table if not exists public.book_page_side_layouts (
  id uuid primary key default gen_random_uuid(),
  book_key text not null,
  page_index int not null,
  side text not null check (side in ('front', 'back')),
  layout jsonb not null default '{"blocks":[]}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (book_key, page_index, side)
);

-- Index for fast lookup by book_key
create index if not exists idx_bpsl_book_key
  on public.book_page_side_layouts (book_key);

-- 3. RLS policies — book_page_side_layouts
alter table public.book_page_side_layouts enable row level security;

-- Public can read all layouts (needed for 3D rendering)
create policy "Layouts are publicly readable"
  on public.book_page_side_layouts
  for select
  using (true);

-- Only admins can insert
create policy "Admins can insert layouts"
  on public.book_page_side_layouts
  for insert
  with check (
    auth.uid() in (select user_id from public.app_admins)
  );

-- Only admins can update
create policy "Admins can update layouts"
  on public.book_page_side_layouts
  for update
  using (
    auth.uid() in (select user_id from public.app_admins)
  );

-- Only admins can delete
create policy "Admins can delete layouts"
  on public.book_page_side_layouts
  for delete
  using (
    auth.uid() in (select user_id from public.app_admins)
  );

-- 4. RLS policies — app_admins
alter table public.app_admins enable row level security;

create policy "Admins table is readable by authenticated users"
  on public.app_admins
  for select
  using (auth.role() = 'authenticated');

-- ============================================================
-- Storage bucket: book-page-assets
-- Run these in Supabase Dashboard > Storage if not using CLI:
--
-- 1. Create bucket "book-page-assets" with public = true
-- 2. Add policy: SELECT = public (anon + authenticated)
-- 3. Add policy: INSERT/UPDATE/DELETE = authenticated AND
--    auth.uid() in (select user_id from public.app_admins)
-- ============================================================
