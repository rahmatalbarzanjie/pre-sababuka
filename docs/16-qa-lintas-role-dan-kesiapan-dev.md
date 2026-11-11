# QA Lintas Role dan Gerbang Kesiapan Development

Tanggal pemeriksaan: 2026-10-04  
Lingkungan: lokal, PostgreSQL/PostGIS sementara dan terisolasi  
Keputusan: **layak masuk persiapan environment development/staging; belum layak produksi**

## 1. Tujuan

Pemeriksaan ini memastikan implementasi lokal berjalan runut dari migration, autentikasi, pembatasan role, input capaian OPD, review BAPPERIDA, publikasi, sampai penyajian data untuk pimpinan. Pemeriksaan tidak melakukan deployment ke VPS, perubahan DNS Cloudflare, atau aktivasi `dev.sababuka.com`.

## 2. Alur produk yang diverifikasi

```text
Superadmin internal
  -> konfigurasi organisasi, pengguna, role, permission, dan menu
  -> BAPPERIDA mengelola master indikator dan meninjau capaian
  -> OPD mengisi capaian serta bukti dukung sesuai scope
  -> BAPPERIDA mengembalikan atau menyetujui
  -> publikasi aktif menjadi satu-satunya sumber dashboard pimpinan
  -> Asisten Data membaca publikasi aktif dan menyertakan sitasi
  -> notifikasi dan audit merekam tindak lanjut
```

Konfigurasi Superadmin tidak ditampilkan sebagai fitur publik. Satu aplikasi menggunakan login yang sama, lalu menu dan akses efektif ditentukan oleh role, permission, scope organisasi, status workflow, dan feature flag.

## 3. Hasil QA lintas role

| Role | Landing/menu utama | Akses yang terbukti | Pembatasan yang terbukti |
|---|---|---|---|
| Superadmin | Administrasi internal | Organisasi, pengguna, role, permission, menu, konfigurasi, dan seluruh modul | Konfigurasi inti dilindungi dari penguncian akses sendiri |
| OPD | Dashboard Operasional | Form capaian dan data milik OPD sesuai assignment | Tidak dapat membuat kategori atau membuka administrasi/review lintas OPD |
| BAPPERIDA | Dashboard Operasional | Review capaian, tata kelola indikator, kurasi, dan publikasi | Tidak dapat mengubah konfigurasi sistem Superadmin |
| Kominfo | Dashboard Operasional | Pemantauan operasional dan audit teknis | Tidak dapat mengaktifkan publikasi substansi |
| Pimpinan | Ringkasan Pimpinan | Dashboard publikasi aktif dan Asisten Data | Tidak dapat membuka form OPD atau audit internal |

Dashboard operasional memakai permission `submission.view` dan selalu memfilter organisasi pengguna non-global. Dashboard pimpinan tidak membaca draft atau submission yang belum dipublikasikan.

## 4. Bukti pemeriksaan teknis

| Pemeriksaan | Hasil |
|---|---|
| Migration database kosong | 12/12 migration diterapkan berurutan |
| Migration dijalankan ulang | 12/12 dilewati berdasarkan ledger/checksum; idempoten |
| Integration test serial pada database bersih | 6 skenario lulus, 0 gagal |
| Unit/service test backend | 6 lulus, 0 gagal; 6 integration test dilewati saat mode unit tanpa database |
| TypeScript backend | Lulus tanpa error |
| Build frontend | Lulus; 1.597 modul ditransformasi |
| OpenAPI 3.1 | Valid menurut Redocly CLI, tanpa error/warning |
| Audit dependency produksi backend | Tidak ditemukan vulnerability yang diketahui |
| Audit dependency produksi frontend | Tidak ditemukan vulnerability yang diketahui |

Skenario integration mencakup administrasi Superadmin, login/session/menu/logout, undangan dan aktivasi kata sandi, master kategori/indikator, workflow form capaian, serta permission dan scope lintas lima role.

## 5. Temuan yang diperbaiki dalam QA

1. Landing non-Superadmin sebelumnya selalu menuju dashboard pimpinan. Routing sekarang mengarahkan Pimpinan ke ringkasan, sedangkan OPD/BAPPERIDA/Kominfo ke dashboard operasional.
2. Migration 010–012 sebelumnya belum seluruhnya mencatat ledger. Ketiganya sekarang memiliki ledger/checksum dan aman dijalankan ulang.
3. Test administrasi masih mengunci jumlah 19 menu. Ekspektasi diperbarui menjadi 20 dan secara eksplisit memeriksa menu `operations`.
4. Dashboard operasional belum masuk kontrak API. Endpoint, schema, changelog, permission, dan dokumentasinya sudah diselaraskan.
5. OpenAPI lama memiliki parameter pencarian organisasi ganda. Duplikasi dihapus dan kontrak divalidasi ulang hingga bersih.
6. Query dashboard operasional, notifikasi, dan audit sekarang memiliki schema validasi request.

## 6. Batas MVP yang sengaja belum diselesaikan

Hal berikut tidak boleh dinyatakan siap produksi:

- import batch CSV/XLSX dan validasi kualitas otomatis;
- tahap validator internal OPD (`opd_confirmed`);
- integrasi CKAN/Satu Data eksternal dan sinkronisasi sumber otomatis;
- portal data publik;
- model AI eksternal; Asisten saat ini retrieval lokal deterministik;
- pengujian beban, pemindaian keamanan aplikasi, dan penetration test;
- latihan backup/restore, rollback, monitoring, alerting, serta respons insiden;
- UAT dengan pengguna nyata dan validasi 15 indikator pilot oleh pemilik data;
- pemisahan rahasia, akun layanan, database, dan observability untuk environment server;
- deployment VPS, reverse proxy, TLS, Cloudflare, dan domain development/production.

## 7. Gerbang sebelum produksi

Urutan lanjut yang aman adalah:

1. kunci baseline lokal dan simpan bukti QA;
2. susun arsitektur environment development/staging, secret, backup, dan rollback;
3. deploy hanya ke `dev.sababuka.com` untuk UAT terbatas;
4. lakukan security scan, load test, restore drill, dan UAT lintas role;
5. perbaiki temuan dan terbitkan berita acara penerimaan;
6. baru susun keputusan deployment `sababuka.com` sebagai produksi.

Dengan posisi pekerjaan saat ini, fondasi MVP dapat dinilai sekitar **50–55% terhadap layanan pilot yang siap operasional**. Fitur inti lokal sudah terhubung, sedangkan pekerjaan environment, integrasi sumber, validasi data resmi, UAT, dan kesiapan operasional masih menjadi separuh pekerjaan berikutnya.
