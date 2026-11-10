# Backend API SABABUKA

Fondasi backend MVP menggunakan TypeScript, Node.js 22, Fastify 5, PostgreSQL/PostGIS, dan kontrak OpenAPI 3.1.

## Cakupan implementasi saat ini

- health check;
- login dan logout berbasis session server-side;
- cookie session `HttpOnly` dan token CSRF;
- password Argon2id dan lockout login;
- undangan sekali pakai dengan masa berlaku;
- aktivasi akun dengan membuat password (tanpa MFA);
- profil pengguna, role, permission, serta scope organisasi;
- menu dinamis berdasarkan permission;
- pengelolaan organisasi/OPD dan pengguna;
- assignment role dengan scope global atau organisasi;
- konfigurasi permission dan menu per role;
- pengaturan sistem nonrahasia dan feature flag;
- master fokus kebijakan, kategori, satuan, periode, dan indikator;
- metadata arah capaian, sumber rujukan, pemetaan OPD, dan target tahunan indikator;
- pembatasan daftar indikator sesuai scope organisasi;
- transisi definisi indikator draft, review, persetujuan, aktivasi, dan arsip;
- audit login, logout, dan seluruh mutasi administrasi;
- migration berurutan dengan checksum;
- bootstrap superadmin khusus development;
- unit test serta integration test administrasi, autentikasi, tata kelola, workflow OPD, dan akses lintas role.

Endpoint yang sudah aktif:

| Method | Path | Keterangan |
|---|---|---|
| GET | `/api/v1/health` | Status aplikasi dan database |
| POST | `/api/v1/auth/login` | Membuat session |
| POST | `/api/v1/auth/logout` | Mencabut session |
| GET, POST | `/api/v1/auth/invitations/{token}...` | Pemeriksaan dan penerimaan undangan |
| GET | `/api/v1/me` | Profil, role, permission, dan scope |
| GET | `/api/v1/me/menu` | Menu yang diizinkan untuk pengguna |
| GET, POST | `/api/v1/organizations` | Daftar dan pembuatan organisasi/OPD |
| GET, POST | `/api/v1/users` | Daftar dan pembuatan undangan pengguna |
| PATCH | `/api/v1/users/{user_id}` | Profil dan status pengguna |
| POST | `/api/v1/users/{user_id}/role-assignments` | Assignment role dan scope |
| GET | `/api/v1/roles`, `/api/v1/permissions` | Referensi role dan permission |
| PUT | `/api/v1/roles/{role_id}/permissions` | Konfigurasi permission role |
| GET | `/api/v1/menus` | Referensi menu administrasi |
| GET, PUT | `/api/v1/roles/{role_id}/menus` | Baca dan ubah konfigurasi menu role |
| GET | `/api/v1/system/configuration` | Pengaturan dan feature flag |
| PUT | `/api/v1/system/settings/{key}` | Simpan pengaturan nonrahasia |
| PUT | `/api/v1/system/feature-flags/{code}` | Ubah feature flag |
| GET, POST | `/api/v1/policy-focuses` | Daftar dan pembuatan fokus kebijakan |
| GET, POST | `/api/v1/categories` | Daftar dan pembuatan kategori indikator |
| GET | `/api/v1/units`, `/api/v1/periods` | Referensi satuan dan periode |
| GET, POST | `/api/v1/indicators` | Daftar dan pembuatan indikator draft beserta target dan OPD |
| PATCH | `/api/v1/indicators/{indicator_id}` | Perubahan metadata, target, dan OPD pada versi draft |
| POST, PATCH | `/api/v1/opd-indicator-proposals` | Input satu per satu dan perubahan draf usulan indikator OPD; tanpa impor/ekstraksi otomatis |
| POST | `/api/v1/opd-indicator-proposals/{version_id}/submit` | Ajukan usulan indikator manual OPD kepada BAPPERIDA |
| POST | `/api/v1/indicator-versions/{version_id}/actions/{action}` | Submit, approve, activate, atau retire versi indikator |
| GET, POST | `/api/v1/submissions` | Daftar dan pembuatan form capaian OPD per periode |
| GET | `/api/v1/submissions/{submission_id}` | Rincian indikator aktif dan realisasi pada form |
| PUT | `/api/v1/submissions/{submission_id}/observations/{indicator_version_id}` | Simpan realisasi indikator pada draft |
| POST | `/api/v1/submissions/{submission_id}/actions/{action}` | Submit, mulai review, kembalikan, atau setujui capaian |
| GET, POST | `/api/v1/submissions/{submission_id}/evidence` | Daftar dan unggah bukti dukung privat |
| GET | `/api/v1/submissions/{submission_id}/evidence/{evidence_id}/download` | Unduh bukti sesuai scope |
| DELETE | `/api/v1/submissions/{submission_id}/evidence/{evidence_id}` | Hapus bukti dari draft dengan audit |
| GET | `/api/v1/executive/dashboard` | Ringkasan pimpinan dari publikasi aktif |
| GET, POST | `/api/v1/publications` | Daftar dan pembuatan publikasi draft |
| GET | `/api/v1/publications/candidates` | Kandidat capaian yang sudah disetujui |
| POST | `/api/v1/publications/{publication_id}/items` | Tambahkan capaian ke publikasi draft |
| POST | `/api/v1/publications/{publication_id}/activate` | Aktifkan publikasi dan gantikan versi lama |
| POST | `/api/v1/assistant/sessions` | Membuat sesi Asisten Data Pimpinan |
| POST | `/api/v1/assistant/sessions/{session_id}/messages` | Jawaban retrieval publikasi aktif beserta sitasi |
| GET | `/api/v1/notifications` | Notifikasi workflow milik pengguna dan jumlah belum dibaca |
| POST | `/api/v1/notifications/{notification_id}/read` | Tandai satu notifikasi dibaca |
| POST | `/api/v1/notifications/read-all` | Tandai seluruh notifikasi dibaca |
| GET | `/api/v1/audit/events` | Audit viewer terfilter berdasarkan permission dan scope |
| GET | `/api/v1/operations/dashboard` | Ringkasan pekerjaan dan antrean sesuai scope role/OPD |

Kontrak lengkap berada di [`../docs/api/openapi.yaml`](../docs/api/openapi.yaml). Endpoint lain pada kontrak belum dianggap selesai sampai implementasi dan tesnya tersedia.

Untuk tahap sekarang service hanya dijalankan pada `127.0.0.1`. Domain development, reverse proxy API, dan port publik belum diaktifkan.

## Menjalankan untuk development

Salin `.env.example` menjadi `.env`, isi rahasia lokal, lalu:

```bash
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm dev
```

Perintah pemeriksaan:

```bash
pnpm check
pnpm build
pnpm audit --prod
```

## Data pengembangan lokal

Khusus `NODE_ENV=development`, akun pengujian dan data sumber resmi dapat disiapkan dengan:

```bash
pnpm dev:seed-users
pnpm dev:seed-official
```

`dev:seed-official` mencatat audit sumber untuk seluruh 15 indikator pilot dan menerbitkan hanya capaian yang sudah dapat ditelusuri. Setiap observasi menyimpan nama sumber, URL, status verifikasi, serta waktu pengambilan. Hasil perhitungan dibedakan dari kutipan langsung. Rangkuman audit terdapat di `docs/17-audit-sumber-indikator-pilot.md`.

Integration test membutuhkan database sementara yang sudah dimigrasikan dan akun tes:

```bash
INTEGRATION_DATABASE_URL='postgresql://...' \
INTEGRATION_ADMIN_EMAIL='admin.integration@sababuka.test' \
INTEGRATION_ADMIN_PASSWORD='password-khusus-tes' \
pnpm test:integration
```

## Ketentuan keamanan

- Jangan simpan `.env`, password, session token, atau token CSRF di repository.
- `COOKIE_SECURE=true` wajib pada staging dan production yang memakai HTTPS.
- Bootstrap superadmin menolak berjalan pada `NODE_ENV=production`.
- Token undangan dan session hanya disimpan sebagai hash, bukan nilai aslinya.
- Permission dan menu inti Superadmin dilindungi agar konfigurasi tidak mengunci akses administrasi.
- Perubahan status pengguna mencabut session aktif ketika akun tidak lagi aktif.
- Extension `postgis`, `citext`, dan `pgcrypto` harus disiapkan administrator database sebelum migration dijalankan oleh role aplikasi terbatas.

