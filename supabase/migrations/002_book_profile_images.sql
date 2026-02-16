create table if not exists public.book_profile_images (
  id uuid primary key default gen_random_uuid(),
  book_key text not null unique,
  image_url text not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_book_profile_images_book_key
  on public.book_profile_images (book_key);

alter table public.book_profile_images enable row level security;

create policy "Book profile images are publicly readable"
  on public.book_profile_images
  for select
  using (true);

create policy "Admins can insert book profile images"
  on public.book_profile_images
  for insert
  with check (
    auth.uid() in (select user_id from public.app_admins)
  );

create policy "Admins can update book profile images"
  on public.book_profile_images
  for update
  using (
    auth.uid() in (select user_id from public.app_admins)
  );

create policy "Admins can delete book profile images"
  on public.book_profile_images
  for delete
  using (
    auth.uid() in (select user_id from public.app_admins)
  );