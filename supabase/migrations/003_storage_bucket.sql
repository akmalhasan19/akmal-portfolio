-- Create storage bucket for book page assets
insert into storage.buckets (id, name, public)
values ('book-page-assets', 'book-page-assets', true)
on conflict (id) do nothing;

-- Allow public read access to all files in the bucket
create policy "Public read access"
  on storage.objects
  for select
  using (bucket_id = 'book-page-assets');

-- Allow authenticated users to upload files
create policy "Authenticated users can upload"
  on storage.objects
  for insert
  with check (
    bucket_id = 'book-page-assets'
    and auth.role() = 'authenticated'
  );

-- Allow authenticated users to update their files
create policy "Authenticated users can update"
  on storage.objects
  for update
  using (
    bucket_id = 'book-page-assets'
    and auth.role() = 'authenticated'
  );

-- Allow authenticated users to delete their files
create policy "Authenticated users can delete"
  on storage.objects
  for delete
  using (
    bucket_id = 'book-page-assets'
    and auth.role() = 'authenticated'
  );
