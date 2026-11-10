# Changelog API

## 2026-11-09

- Menghapus MFA: login hanya memakai email/username dan kata sandi; `mfa_code` dan `recovery_code` tidak lagi diterima pada `/auth/login`.
- Menghapus `/auth/invitations/{token}/mfa/setup`, `/me/mfa/totp/setup`, dan `/me/mfa/totp/confirm`. `/auth/invitations/{token}/accept` hanya menerima `password` dan tidak mengembalikan recovery code.
- `mfa_required` pada respons pengguna tetap ada demi kompatibilitas, selalu `false`; `PATCH /users/{user_id}` tidak lagi menerima `mfa_required`.

## 2026-10-04

- Menambahkan form capaian manual berbasis OPD dan periode pada `/submissions`.
- Menambahkan rincian indikator aktif yang ditugaskan serta penyimpanan nilai per indikator.
- Mengaktifkan workflow `submit`, `start-review`, `return`, dan `approve` berikut scope, permission, audit, dan catatan koreksi.
- Menegaskan bahwa upload batch data CSV/XLSX belum diaktifkan pada tahap ini.
- Mengaktifkan bukti dukung privat PDF/JPG/PNG/XLSX dengan batas 10 MB, signature check, SHA-256, scope, dan audit.
- Mengimplementasikan ringkasan pimpinan yang hanya membaca item dari publikasi aktif.
- Mengimplementasikan kurasi kandidat capaian approved, penyusunan publikasi draft, dan aktivasi versi publikasi.
- Publikasi aktif dengan key yang sama otomatis digantikan secara transaksional dan tetap dipertahankan sebagai riwayat.
- Mengimplementasikan Asisten Data lokal berbasis retrieval publikasi aktif, sitasi per item, tingkat kecukupan, dan penolakan pertanyaan tanpa data.
- Pertanyaan dan jawaban disimpan dalam sesi serta aktivitas jawaban dicatat pada audit tanpa mengirim data ke layanan AI eksternal.
- Menambahkan notifikasi otomatis untuk submit, return, approve, dan aktivasi publikasi.
- Menambahkan inbox notifikasi, status baca, serta audit viewer yang dibatasi permission dan scope organisasi.
- Menambahkan dashboard operasional lintas role pada `/operations/dashboard` dengan pembatasan scope OPD.
- Menambahkan validasi query untuk dashboard operasional, notifikasi, dan audit viewer.

## 2026-10-03

- Mengimplementasikan endpoint fokus kebijakan, kategori, satuan, periode, dan indikator yang sebelumnya baru berupa kontrak.
- Menambahkan metadata arah capaian dan sumber rujukan indikator.
- Menambahkan target tahunan ke payload pembuatan indikator draft.
- Menegaskan bahwa daftar kategori dan indikator menggunakan envelope pagination.
- Menambahkan pembatasan scope organisasi pada daftar indikator untuk pengguna non-global.
- Menambahkan `PATCH /indicators/{indicator_id}` khusus untuk perubahan versi draft dengan audit trail.
- Mengimplementasikan transisi `submit`, `approve`, `activate`, dan `retire` dengan permission, validasi status, serta audit trail.

## v1.0.0-draft - 2026-09-29

- Menetapkan base path `/api/v1`.
- Menetapkan autentikasi berbasis sesi web.
- Menambahkan kontrak organisasi, pengguna, role/menu, fokus, kategori, indikator, dataset, submission, publikasi, dashboard, Asisten AI, dan audit.
- Menetapkan format error dan pagination standar.
- Implementasi awal tersedia untuk health, login, logout, konteks pengguna, dan menu efektif.
- Menambahkan implementasi administrasi organisasi, pengguna, assignment role, katalog permission, konfigurasi permission/menu per role, pengaturan sistem, dan feature flag.
- Menambahkan perlindungan terhadap penghapusan permission dan menu inti Superadmin.
- Menetapkan endpoint lokal sebagai server aktif; `dev.sababuka.com` belum diaktifkan.
- Menambahkan pemeriksaan dan penerimaan undangan, enrollment TOTP, login dengan MFA, serta recovery code sekali pakai.
- Menambahkan kode error `MFA_REQUIRED`, `MFA_INVALID`, dan `INVITATION_INVALID`.

Status `draft` dipertahankan sampai implementasi backend lulus contract test pertama. Perubahan yang memutus kompatibilitas sebelum rilis stabil tetap dicatat pada bagian ini.
