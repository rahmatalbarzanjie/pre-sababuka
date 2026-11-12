# AGENTS.md — Panduan Agen SABABUKA

Panduan ini berlaku untuk seluruh repository dan harus dibaca oleh Codex atau agen koding lain sebelum mengubah kode.

## Tentang proyek

**SABABUKA BERSINAR** adalah sistem analisis data Kabupaten Kapuas untuk tata kelola indikator RPJMD, pelaporan OPD, verifikasi BAPPERIDA, pembinaan statistik, publikasi, serta dashboard pimpinan.

Arsitektur yang berjalan saat ini:

- `frontend/`: React 19, TypeScript, Vite, Source Sans 3, dan Lucide.
- `backend/`: Fastify, TypeScript, PostgreSQL/PostGIS, autentikasi, RBAC, dan audit trail.
- `backend/database/migrations/`: migration SQL berurutan; jangan mengubah migration yang sudah diterapkan.
- `docs/api/openapi.yaml`: kontrak API; tipe frontend hasil generate berada di `frontend/src/generated/`.
- Bahasa antarmuka dan dokumentasi pengguna: Bahasa Indonesia.

Repository ini bukan lagi aplikasi statis dan tidak sedang dimigrasikan ke Next.js. Jangan memakai struktur aplikasi demo lama sebagai acuan implementasi.

## Sumber kebenaran

1. Kode, migration, OpenAPI, dan pengujian pada branch aktif adalah sumber kebenaran teknis.
2. `docs/SABABUKA_REDESIGN_SPEC.md` adalah arah produk dan UI/UX hasil audit Claude. Baca sebelum mengubah frontend.
3. Bila spesifikasi menyebut modul sebagai placeholder tetapi modul tersebut sudah berfungsi pada kode terbaru, pertahankan fungsi yang ada dan perbarui dokumentasinya; jangan menonaktifkan fitur hanya karena catatan lama.
4. Keputusan pengguna terbaru mengungguli catatan lama. Jaga `AGENTS.md` dan `CLAUDE.md` tetap selaras ketika arsitektur atau aturan kerja berubah.

## Menjalankan dan memeriksa

Gunakan Node.js 22+ dan pnpm 11.

```bash
# frontend
cd frontend
pnpm check
pnpm build

# backend
cd backend
pnpm check
pnpm test:e2e

# perubahan kontrak API
cd frontend
pnpm api:types
pnpm api:types:check
```

Untuk pengembangan lokal, jalankan `pnpm dev` masing-masing dari `backend/` dan `frontend/`. Frontend memakai port 5173 dan mem-proxy `/api` ke backend pada port 3001.

## Aturan perubahan

- Pertahankan perubahan pengguna yang tidak berkaitan dan periksa working tree sebelum mengedit.
- Perubahan database harus berupa migration baru, didahului backup, aman dijalankan ulang bila memungkinkan, dan diverifikasi setelah diterapkan.
- OPD mengusulkan dan mengisi indikator secara manual; jangan mengubahnya menjadi auto-generate atau semiotomatis tanpa keputusan produk baru.
- Data pimpinan hanya boleh berasal dari data yang disetujui dan dipublikasikan. Pertahankan RBAC, pemisahan kewenangan, provenance, dan audit trail.
- Autentikasi hanya email/username dan kata sandi. MFA (TOTP/recovery code) sengaja dihapus atas keputusan pemilik (10 Nov 2026, migration 057); jangan menambahkannya kembali tanpa permintaan pemilik.
- Developer (superadmin) dapat "Bertindak sebagai" BAPPERIDA, Diskominfosantik, BPS, Pimpinan, atau OPD tertentu dengan wewenang penuh (permintaan pemilik, 12 Nov 2026; sebelumnya mode pratinjau hanya baca). Aksi tercatat atas nama akun Developer asli dengan `metadata.acting_as` di audit. Aturan pemisahan petugas (pengaju/reviewer/verifikator yang sama) tidak berlaku bagi Developer (keputusan pemilik, 12 Nov 2026); tetap berlaku bagi pengguna lain.
- Nilai beda antarsumber tidak pernah dipilih otomatis: ditandai konflik, ditetapkan BAPPERIDA/OPD pemilik (menu Konsolidasi Sumber); nilai identik dari sumber berbeda tetap dua baris bersumber (lihat `docs/external-connectors.md`).
- Jangan commit secret, dump database, hasil ekspor privat, cache audit, atau artefak build.
- Perubahan UI wajib menjaga aksesibilitas, state loading/empty/error, serta diuji pada desktop, tablet, dan mobile.
- Pakai util tanggal bersama dengan zona waktu aplikasi; jangan menambah format tanggal lokal yang baru.
- Untuk perubahan UI besar, gunakan branch dan pull request. Perbaikan terverifikasi yang diminta langsung dapat masuk ke branch utama sesuai arahan pemilik.
- Pesan commit ringkas dan deskriptif dalam Bahasa Indonesia atau mengikuti konvensi commit repository.

## Prinsip UI/UX inti

- Halaman keputusan dibuka dengan narasi dan status yang mudah dipahami; grafik menjadi bukti pendukung.
- Tonjolkan satu aksi utama sesuai peran dan tahap workflow.
- Setiap halaman harus menjawab tindakan pengguna berikutnya.
- Menu mengikuti role dan permission dari backend; jangan menampilkan rute yang tidak didukung.
- Tombol approve, verifikasi, kirim, dan kembalikan harus mudah ditemukan serta tetap mematuhi kewenangan backend.
- Pertahankan identitas visual pemerintah Kabupaten Kapuas dan konsistensi token di `frontend/src/ui-system.css` serta `frontend/src/styles.css`.

## Repository dan sinkronisasi

Repository pribadi pemilik adalah sumber utama. Repository organisasi adalah mirror. Sebelum push, pastikan remote lokal menunjuk ke tujuan yang benar, hindari force-push tanpa cadangan branch, dan verifikasi hash commit remote setelah sinkronisasi.

## Skill bersama

Skill proyek disimpan di `.claude/skills/` dan dipakai bersama oleh Codex dan Claude agar penilaian UI konsisten. Codex dapat membacanya langsung dari folder ini.

- `impeccable`: audit, critique, polish, dan hardening antarmuka (hierarki, aksesibilitas, responsive, state kosong dan galat). Konteks produknya ada di `PRODUCT.md`.
- `webapp-testing`: uji aplikasi lokal dengan Playwright (tangkapan layar desktop, tablet, mobile, log browser). Jalankan backend port 3001 dan frontend port 5173 lebih dulu.

Hasil audit yang berupa tangkapan layar atau cache alat (`.impeccable/`) tidak di-commit.
