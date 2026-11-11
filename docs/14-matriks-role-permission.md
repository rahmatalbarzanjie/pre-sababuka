# Matriks Role dan Permission MVP v1

Status: baseline implementasi  
Tanggal: 2026-09-29

## 1. Aturan evaluasi akses

Sebuah permintaan hanya diizinkan jika seluruh syarat berikut terpenuhi:

1. sesi pengguna aktif;
2. akun berstatus aktif;
3. role memberikan permission yang diminta;
4. pengguna berada dalam lingkup organisasi objek;
5. status workflow mengizinkan tindakan;
6. feature flag terkait aktif;
7. permintaan lolos validasi bisnis.

Superadmin dapat memiliki lingkup seluruh organisasi. Role lain menggunakan lingkup organisasi pada `user_role_assignments` dan `organization_memberships`.

## 2. Katalog permission

| Kelompok | Permission utama |
|---|---|
| Sistem | `system.configure`, `system.feature_manage`, `system.integration_manage` |
| Organisasi | `organization.view`, `organization.manage` |
| Pengguna | `user.view`, `user.create`, `user.update`, `user.activate`, `user.assign_role` |
| Akses | `role.view`, `role.manage`, `menu.manage` |
| Kebijakan | `policy_focus.view`, `policy_focus.manage`, `category.view`, `category.manage` |
| Indikator | `indicator.view`, `indicator.manage`, `indicator.submit`, `indicator.approve`, `indicator.activate` |
| Dataset | `dataset.view`, `dataset.manage`, `dataset.import`, `metadata_profile.manage` |
| Pengiriman | `submission.view`, `submission.create`, `submission.update`, `submission.validate`, `submission.submit`, `submission.confirm_opd` |
| Review | `submission.review`, `submission.return`, `submission.approve` |
| Publikasi | `publication.view`, `publication.manage`, `publication.activate` |
| Eksekutif | `executive_dashboard.view`, `assistant.use` |
| Audit | `audit.view`, `audit.export` |

## 3. Matriks role default

`Ya` adalah hak default. Superadmin tetap dapat mengubah menu dan assignment, tetapi permission berisiko tinggi tidak boleh diberikan kepada role biasa tanpa catatan keputusan.

| Kapabilitas | Superadmin | BAPPERIDA | Kominfo | OPD | Pimpinan |
|---|---:|---:|---:|---:|---:|
| Konfigurasi sistem | Ya | - | - | - | - |
| Organisasi, pengguna, role, menu | Ya | Lihat | Lihat terbatas | Anggota sendiri sesuai delegasi | - |
| Fokus dan kategori | Ya/override | Ya | Lihat | Lihat | Lihat |
| Definisi dan versi indikator | Ya/override | Ya | Lihat | Lihat/usul melalui proses | Lihat aktif |
| Dataset dan metadata | Ya | Lihat dan kurasi substansi | Baca status sumber dan alur | Milik OPD | Lihat terbit |
| Input dan revisi data | Ya/override | Lihat | - | Milik OPD | - |
| Konfirmasi internal OPD | Ya/override | - | - | Lingkup OPD | - |
| Review dan persetujuan | Ya/override | Ya | - | - | - |
| Aktivasi publikasi | Ya/override | Ya | - | - | - |
| Dashboard pimpinan | Ya | Ya | Terbatas | Terbatas | Ya |
| Asisten AI | Ya | Opsional | - | - pada MVP | Ya |
| Audit | Penuh | Substantif | Teknis dan baca-saja | Aktivitas sendiri | - |

Kominfo memantau kesehatan layanan, status konektor, alur data, dan keterbukaan data. Kominfo tidak memvalidasi indikator, tidak menyetujui observasi, tidak mengimpor data, dan tidak mengaktifkan publikasi. Operator yang berasal dari organisasi Kominfo tetap dapat memakai role `opd` dengan scope organisasi jika Kominfo menjadi pemilik indikator dan harus melakukan verifikasi teknis.

Mapping teknis dan aksi sinkronisasi dijalankan oleh Superadmin/developer pada environment yang ditetapkan. BAPPERIDA melihat status mapping untuk pemeriksaan substansi, sedangkan OPD pemilik mengonfirmasi sumber dan definisinya.

## 4. Scope data

- `global`: seluruh organisasi; default hanya Superadmin.
- `organization`: organisasi yang ditentukan pada assignment.
- `self`: objek yang dibuat atau ditugaskan kepada pengguna.
- `published`: hanya data pada publikasi aktif.

Permission tidak pernah menggantikan scope. Contoh: `submission.update` pada role OPD hanya berlaku pada submission milik OPD tersebut.

## 5. Akun darurat

Akun pemulihan Superadmin harus terpisah dari akun harian, memakai kata sandi kuat yang unik, tidak dipakai untuk pekerjaan rutin, dan setiap penggunaannya menghasilkan audit prioritas tinggi.
