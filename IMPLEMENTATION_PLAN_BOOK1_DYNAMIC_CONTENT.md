# Implementation Plan: Dynamic Page Authoring for Book 1 (Supabase + 3D Runtime)

## Summary
Tambahkan sistem authoring konten per sisi halaman untuk **Book 1** dengan editor admin terpisah, penyimpanan ke **Supabase Remote PostgreSQL + Storage**, autosave live, dan rendering tekstur dinamis ke `Book3D`.

Konten halaman mendukung layout berbeda-beda per halaman, blok **teks + gambar** dengan drag/resize, serta padding dinamis mengikuti ukuran page, dengan opsi override per halaman/sisi.

## Locked Decisions
1. Persistensi: Supabase Remote PostgreSQL + Supabase Storage.
2. Cakupan: Book 1 dulu, arsitektur expandable ke buku lain.
3. Model layout: tiap halaman/sisi bebas custom (drag-resize blocks).
4. Auth edit: Supabase Auth Admin.
5. Publish: autosave live.
6. Fallback halaman belum terisi: kosong putih.
7. Upload image: max 2MB, auto-resize max 2048px.
8. Padding: global dinamis + override per halaman/sisi.
9. Teks fase 1: rich text ringan (size, weight, align, color, line-height, multiline).
10. Batas blok: maksimal 8 blok per sisi.
11. Device editor fase 1: desktop only.
12. Entrypoint editor: route admin panel terpisah.
13. Preview saat edit: 2D editor + tombol buka 3D preview.

## Public API / Types Changes

### `src/components/Book3D.tsx`
Tambahan `Book3DProps`:
- `bookKey?: string` (default `"book-1"`) untuk lookup konten.
- `dynamicContent?: Record<string, PageSideLayout>` untuk override in-memory.
- `fallbackMode?: "legacy-texture" | "blank-white"` (default `"legacy-texture"`).
- `contentEnabled?: boolean` (default `false`).

Resolver key internal:
- Format: `p{pageIndex}:front|back`, contoh `p3:front`.

Prioritas texture map:
- Dynamic texture > texture lama.
- Jika `fallbackMode="blank-white"` dan konten tidak ada, render putih solid.

### New file: `src/types/book-content.ts`
Tipe yang ditambahkan:
- `BookKey = "book-1" | string`
- `PageSide = "front" | "back"`
- `PageSideLayout`
- `LayoutBlock` (union `TextBlock | ImageBlock`)
- `PaddingConfig`
- `TextStyleConfig`

Catatan:
- Koordinat block disimpan normalized (0..1) terhadap safe content area.

## Supabase Data Design

### Table: `app_admins`
- `user_id uuid primary key` (referensi `auth.users.id`)
- `created_at timestamptz default now()`

### Table: `book_page_side_layouts`
- `id uuid primary key default gen_random_uuid()`
- `book_key text not null`
- `page_index int not null`
- `side text not null check (side in ('front','back'))`
- `layout jsonb not null`
- `updated_by uuid null`
- `updated_at timestamptz not null default now()`
- `unique(book_key, page_index, side)`

### Storage bucket: `book-page-assets`
- Path: `book-1/p{pageIndex}/{side}/{blockId}-{timestamp}.webp`
- Public read: `true`
- Write/delete: hanya admin authenticated

### RLS Policies
- `book_page_side_layouts`
  - `SELECT`: public
  - `INSERT/UPDATE/DELETE`: hanya `auth.uid()` yang terdaftar di `app_admins`
- Storage `book-page-assets`
  - `SELECT`: public
  - `INSERT/UPDATE/DELETE`: hanya user di `app_admins`

## Runtime Rendering (3D)

### Data flow
1. Hero memuat Book 1 dan fetch layout dari Supabase.
2. Layout dirender menjadi `CanvasTexture` per sisi halaman visible.
3. Texture dipasang ke material page face pada `Book3D`.
4. Jika layout tidak ada, fallback putih.

### Dynamic padding formula
- Base global:
  - `padXRatio = 0.08`
  - `padYRatio = 0.10`
- Calculation:
  - `padX = clamp(canvasWidth * ratioX, 24, 140)`
  - `padY = clamp(canvasHeight * ratioY, 24, 180)`
- Jika ada override per sisi halaman, gunakan override ratio.
- Semua block (`x,y,w,h`) dihitung relatif ke safe area:
  - `[padX, padY, width - 2*padX, height - 2*padY]`

### Texture resolution by profile
- Desktop: target canvas height `1536px`
- Mobile/low-end: target canvas height `1024px`
- Tetap mengikuti `textureLoadRadius` agar hanya halaman sekitar anchor yang dirender.

## Admin Editor (2D)

### New routes
- `src/app/admin/book-1/page.tsx` (editor utama)
- `src/app/admin/login/page.tsx` (auth)
- Tombol preview membuka `/` di tab baru.

### New components
- `src/components/admin/book1/Book1PageEditor.tsx`
- `src/components/admin/book1/PageCanvasStage.tsx`
- `src/components/admin/book1/BlockInspector.tsx`
- `src/components/admin/book1/PageNavigator.tsx`
- `src/components/admin/book1/ImageUploadField.tsx`

### Feature scope phase 1
1. Pilih page index + side (`front/back`).
2. Tambah block `text` atau `image`.
3. Drag/resize block pada canvas.
4. Edit style text ringan.
5. Upload image dengan validasi ukuran.
6. Autosave debounce 600ms.
7. Hard limit 8 block per sisi.

## Detailed Implementation Stages

### Stage 1: Supabase foundation
- Tambah util client auth/db/storage:
  - `src/lib/supabase/client.ts`
- Tambah migration SQL:
  - `supabase/migrations/001_book1_layouts.sql`
- Tambah env:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Stage 2: Domain types + validation
- `src/types/book-content.ts`
- `src/lib/book-content/validation.ts`
  - clamp normalized rect
  - validasi max block = 8
  - validasi range style
- `src/lib/book-content/padding.ts`
  - hitung safe area dari ratio + override

### Stage 3: Image processing
- `src/lib/book-content/image-processing.ts`
  - resize longest side max 2048
  - output WebP terkontrol
  - reject file >2MB sebelum upload
- Upload ke Supabase Storage + update `assetPath` block image.

### Stage 4: Editor UI + state
- Jotai atoms editor:
  - selected page/side
  - current layout draft
  - dirty/saving/error flags
- Autosave `upsert` ke `book_page_side_layouts`.
- Auth guard admin via session Supabase + verifikasi `app_admins`.

### Stage 5: 3D runtime bridge
- `src/lib/book-content/render-canvas.ts`
  - draw white background
  - draw image blocks
  - draw wrapped text blocks
- `src/lib/book-content/useBookSideTextures.ts`
  - cache texture per key `p{index}:{side}`
  - regenerate hanya jika hash layout berubah
  - dispose texture saat unmount/cleanup
- `Hero.tsx`
  - Book 1 pass `contentEnabled`
  - fetch layout live
  - inject ke `Book3D`

### Stage 6: `Book3D` integration
- Support dynamic content map di assignment material `Page`.
- `fallbackMode="blank-white"` untuk Book 1.
- Book 2 tetap jalur lama (no behavior change).

### Stage 7: Preview flow
- Tombol "Buka 3D Preview" di admin panel membuka homepage tab baru.
- Karena autosave live, hasil terbaru langsung terlihat.

## Test Cases and Scenarios

### Auth & security
1. Non-admin tidak bisa akses `/admin/book-1`.
2. Non-admin tidak bisa insert/update/delete layout.
3. Publik tetap bisa read layout untuk rendering.

### Upload
1. File >2MB ditolak.
2. File valid di-resize max 2048 lalu tersimpan di bucket.
3. URL/path asset tersimpan benar di JSON layout.

### Editor behavior
1. Add/move/resize block tersimpan live.
2. Block ke-9 ditolak dengan pesan jelas.
3. Re-open editor menampilkan state terakhir.

### Dynamic padding
1. Ubah prop `width`/`height` page, layout tetap proporsional.
2. Override padding per sisi bekerja tanpa merusak halaman lain.
3. Text wrap tetap di dalam safe area.

### 3D rendering
1. Halaman dengan konten custom menampilkan dynamic map benar.
2. Halaman tanpa konten custom tampil putih (Book 1).
3. Halaman di luar `textureLoadRadius` tidak memicu generation berlebih.
4. Tidak ada leak texture saat navigasi cepat.

### Regression
1. Perbaikan cover-book anti-tembus tetap aman.
2. Profile mobile/desktop tetap aktif.
3. `lint` dan `build` tetap hijau.

## Assumptions and Defaults
1. Jumlah interior page Book 1 mengikuti struktur saat ini.
2. Fase 1 hanya block `text` dan `image`.
3. Rotasi block, filter gambar, dan efek layer kompleks ditunda.
4. Bucket asset public-read untuk runtime publik sederhana.
5. Preview 3D fase 1 via homepage, bukan live side-by-side.
6. Editor fase 1 desktop-only.
