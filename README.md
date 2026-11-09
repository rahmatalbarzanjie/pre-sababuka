# SABABUKA BERSINAR

SABABUKA BERSINAR adalah rancangan Sistem Analisis Big Data Kabupaten Kapuas. Sistem akan mengumpulkan data dari OPD, menormalisasikannya, menyimpannya pada basis data pusat, lalu menyajikannya melalui Dashboard DIES, WhatsApp Bot khusus Bupati, dan aplikasi Android.

Repository ini telah memasuki tahap implementasi MVP lokal. Kontrak OpenAPI v1 dan migration PostgreSQL/PostGIS menjadi baseline; backend TypeScript/Fastify serta frontend React/TypeScript sudah mencakup administrasi akses dan master indikator pilot.

Repository pribadi `rahmatalbarzanjie/sababuka` menjadi sumber utama pengembangan. Repository organisasi `sababuka-id/pre-sababuka` dipertahankan sebagai mirror sampai tata kelola organisasi difinalkan. Panduan lintas-agen berada di `AGENTS.md` dan `CLAUDE.md`; keduanya harus dijaga selaras.

## Prinsip kerja

Keputusan proyek dinilai dengan urutan berikut:

1. Benar dan aman untuk data pemerintah.
2. Sederhana untuk dibangun dan dirawat.
3. Cepat memberikan hasil yang dapat diuji.
4. Hemat biaya pengembangan dan operasional.
5. Memiliki kualitas, dokumentasi, dan jejak audit yang memadai.

## Arsitektur konseptual

```text
Sumber data OPD
      |
      v
Scraper per sumber -> validasi -> normalisasi -> PostgreSQL/PostGIS
                                                    |
                                                    v
                                             Backend API + RBAC
                                              /       |       \
                                             v        v        v
                                      Dashboard   WA Bot   Android wrapper
```

Backend API menjadi jalur data tunggal bagi seluruh kanal. Data mentah, data hasil normalisasi, dan histori perubahan harus dapat ditelusuri.

## Status saat ini

- Dokumen rancang bangun awal telah dipahami.
- Frontend lokal telah mencakup autentikasi, administrasi internal, kategori, dan master indikator pilot.
- Baseline MVP v1, matriks RBAC, workflow, OpenAPI, dan migration awal telah disiapkan.
- VPS baru telah diinventarisasi, tetapi aplikasi, domain development, dan layanan produksi belum diterapkan. Seluruh verifikasi aplikasi saat ini tetap dilakukan secara lokal pada database sementara yang terisolasi.
- Lima kategori, 15 indikator, pemetaan awal OPD, dan target 2025–2029 telah disiapkan sebagai data draft pilot yang masih memerlukan validasi.
- Administrasi organisasi/OPD, pengguna, assignment role, permission, menu, pengaturan sistem, dan feature flag telah diimplementasikan sebagai API lokal.
- Undangan pengguna dan aktivasi password telah diimplementasikan. MFA dihapus (migration 057): login memakai email/username dan kata sandi.
- Migration 001–013, API master indikator, workflow data, publikasi, provenance sumber, asisten, dan antarmuka lokal telah melalui build serta integration test.
- Transisi review, persetujuan, aktivasi, dan arsip versi indikator telah diimplementasikan dengan permission serta audit trail.
- Formulir realisasi per OPD/periode, penyimpanan capaian, serta alur submit–return–approve telah diimplementasikan dan diuji pada database sementara.
- Bukti dukung privat dan ringkasan capaian aman untuk pimpinan telah masuk ke MVP; angka pimpinan hanya berasal dari publikasi aktif.
- Modul kurasi/publikasi sudah menghubungkan capaian approved ke dashboard pimpinan melalui aktivasi yang terkendali dan teraudit.
- Asisten Data Pimpinan lokal sudah membaca publikasi aktif, memberikan sitasi, dan menolak jawaban jika data belum cukup.
- Notifikasi workflow dan audit viewer sudah tersedia untuk memantau tindak lanjut OPD/Bapperida sesuai scope.
- QA lintas-role dan dashboard operasional telah tersedia; kesiapan deployment development dinilai melalui dokumen audit sebelum VPS/domain disentuh.
- Environment lokal memakai katalog RPJMD sebagai master indikator; paket kategori dan indikator demo tidak ditanamkan saat startup.

## Pemeriksaan kualitas kode

GitHub Actions menjalankan pemeriksaan kontrak OpenAPI dan build frontend, type-check serta test backend, dan smoke test browser Playwright pada setiap pull request serta push ke `main`.

Jika kontrak API berubah, dari folder `frontend` jalankan:

```bash
pnpm api:types
pnpm check
```

Tipe hasil generate berada di `frontend/src/generated/api-schema.d.ts` dan dipakai oleh tipe identitas/menu frontend. Generator OpenAPI diisolasi di `tools/openapi-generator` dengan TypeScript 5.9 agar tidak mengubah compiler TypeScript 7 aplikasi. Untuk tes browser lokal, pasang dependency kedua paket, pasang Chromium lewat `pnpm exec playwright install chromium` dari folder `backend`, lalu jalankan `pnpm test:e2e` dari folder tersebut. E2E saat ini menguji proteksi halaman dan respons form login memakai API mock; ini bukan pengganti UAT/integration test pada database staging.

## Peta dokumentasi

- [Blueprint teknis](docs/01-blueprint-teknis.md)
- [Ruang lingkup dan asumsi](docs/02-ruang-lingkup-dan-asumsi.md)
- [Backlog fase](docs/03-backlog-fase.md)
- [Kriteria penerimaan](docs/04-kriteria-penerimaan.md)
- [Register risiko](docs/05-register-risiko.md)
- [Kebutuhan data dan akses](docs/06-kebutuhan-data-dan-akses.md)
- [Catatan keputusan](docs/07-catatan-keputusan.md)
- [Baseline MVP v1](docs/13-baseline-mvp-v1.md)
- [Matriks role dan permission](docs/14-matriks-role-permission.md)
- [Workflow MVP v1](docs/15-workflow-mvp-v1.md)
- [Laporan QA lintas role dan gerbang kesiapan](docs/16-qa-lintas-role-dan-kesiapan-dev.md)
- [Spesifikasi redesign UI/UX lintas agen](docs/SABABUKA_REDESIGN_SPEC.md)
- [Dokumentasi API](docs/api/README.md)
- [OpenAPI v1](docs/api/openapi.yaml)
- [Backend API](backend/README.md)
- [Migration database](backend/database/README.md)

## Aturan status pekerjaan

- **Rencana**: belum disetujui untuk dikerjakan.
- **Siap**: input minimum tersedia dan pekerjaan telah disetujui.
- **Berjalan**: sedang dikerjakan.
- **Terblokir**: ada input atau otorisasi yang belum tersedia.
- **Selesai**: bukti uji dan dokumentasi memenuhi kriteria penerimaan.

Sebuah fitur tidak dinyatakan selesai hanya karena tampilannya sudah dapat dibuka.
