# Laporan Audit Data RPJMD vs Produksi SABABUKA

Tanggal audit: 11 November 2026
Objek: katalog indikator RPJMD Kabupaten Kapuas 2025-2029 di produksi (https://dev.sababuka.com), dibandingkan dengan Matriks Fokus Isu Indikator RPJMD (Tabel 3.3 RPJMD, hal. III-18 s.d. III-22).
Aturan audit: hanya membaca. Tidak ada data produksi yang diubah.

## 1. Ringkasan

| Pemeriksaan | Hasil |
| --- | --- |
| Jumlah indikator | 69 di produksi = 69 di Matriks (8 fokus, 29 kelompok isu, 69 indikator). Sesuai. |
| Nama indikator | 69 dari 69 sama dengan sumber. |
| Arah yang diharapkan (naik/turun/pertahankan) | 69 dari 69 sama dengan sumber. |
| Target 2025-2029 | 68 dari 69 sama dengan sumber. 1 indikator (I041) tidak punya target 2025 di sumber, jadi kosong di produksi. |
| OPD penanggung jawab utama | 69 dari 69 sama dengan label OPD pada Matriks. |
| Definisi, satuan, sumber, OPD pemilik terisi | 69 dari 69 terisi. |
| OPD pendukung | Tidak tersimpan sebagai relasi di produksi (lihat temuan 3). |

Kesimpulan: isi katalog sudah sesuai Matriks. Ada 1 cacat penugasan OPD, beberapa satuan yang perlu dikoreksi, dan beberapa angka target yang perlu dicek ulang ke halaman cetak RPJMD.

## 2. Metode dan batasan

1. Data produksi diambil lewat API `GET /indicators` (69 indikator, semua asal `rpjmd_master`).
2. Nilai acuan diambil dari katalog awal `backend/database/migrations/015_rpjmd_draft_catalog.sql`, yang dibangun dari Matriks. Hasil perbandingan otomatis: nama, arah, target 2025-2029, OPD utama.
3. Catatan pada Matriks menyatakan angka sudah dicocokkan dengan gambar halaman asli RPJMD. Audit ini tidak membaca ulang PDF RPJMD halaman per halaman. Karena itu, kecocokan di atas berarti "produksi = Matriks", bukan "produksi = PDF" secara independen.
4. Pembacaan langsung Matriks dari Drive hanya mengembalikan contoh baris, bukan seluruh isi. Detail OPD pendukung per indikator diambil dari metadata di katalog awal.
5. Perbandingan otomatis mencakup 66 indikator; 3 indikator pariwisata/budaya (I022, I023, I061) dibandingkan manual karena ditambahkan pemiliknya lewat migration 030. Nama, arah, dan target ketiganya sudah dilihat dan sesuai.
6. Pemeriksaan kewajaran (tren target terhadap arah, satuan, metadata) dijalankan terhadap seluruh 69 indikator.

## 3. Temuan

### Temuan 1 (perlu perbaikan): relasi OPD utama pada 3 indikator pariwisata/budaya

Matriks menetapkan Dinas Kebudayaan, Pariwisata, Kepemudaan dan Olahraga (Disbudparpora) sebagai penanggung jawab utama. Kolom pemilik di produksi sudah Disbudparpora, tetapi tabel relasi OPD utama masih menunjuk OPD lama hasil penugasan contoh (migration 018):

| Indikator | Pemilik (benar) | Relasi OPD utama yang masih tersisa |
| --- | --- | --- |
| PAD Sektor Pariwisata (I022) | Disbudparpora | Badan Pendapatan Daerah |
| Rasio PDRB Penyediaan Akomodasi dan Makan Minum (I023) | Disbudparpora | Dinas Perdagangan, Perindustrian, Koperasi dan UKM |
| Indeks Pembangunan Kebudayaan (I061) | Disbudparpora | Dinas Pendidikan |

Penyebab: migration 030 hanya menambah relasi Disbudparpora bila belum ada relasi utama; relasi dari migration 018 sudah ada, sehingga baris Disbudparpora tidak terbentuk.

Dampak: aturan cakupan tugas OPD memakai "pemilik ATAU relasi" (`submission-service.ts`). Akibatnya Bapenda, Disperindagkop-UKM, dan Disdik masih melihat indikator ini sebagai tugas mereka, dan halaman indikator menampilkan OPD utama yang salah.

Usulan: migration baru yang menghapus relasi utama lama pada 3 indikator tersebut dan membuat relasi utama Disbudparpora. Perlu persetujuan sebelum diterapkan di produksi.

### Temuan 2 (perlu keputusan): satuan yang kurang tepat

| Indikator | Satuan di produksi | Catatan |
| --- | --- | --- |
| Indeks Pembangunan Kebudayaan, IPK (I061) | Persen | Nilai 50 sampai 55 adalah skor indeks. Usulan: Indeks. |
| Indeks Pembangunan Kualitas (I041) | Persen | Nama berupa indeks, nilai 56,69 sampai 60,41. Usulan: Indeks. |
| Indeks Gini (I026) | Poin | Nilai 0,307 sampai 0,299 berskala 0 sampai 1. Satuan "Poin" menyesatkan. Sudah tercatat sebagai butir terbuka. |
| Indeks Pengelolaan Keanekaragaman Hayati (I057) | Poin | Nilai 0,35 sampai 0,45 berskala 0 sampai 1. |
| Indeks Daya Saing Daerah (I016), Literasi Digital (I069), Inovasi Daerah (I070) | Angka | Bukan salah, tetapi tidak seragam dengan indikator indeks lain yang memakai satuan Indeks. |
| PAD Sektor Pariwisata (I022) | Persen | Nilai 5, 5, 5, 6, 6. Pastikan di RPJMD memang persentase, bukan nilai rupiah. |

Satuan di Matriks tidak dapat dibaca penuh pada audit ini, jadi koreksi satuan harus dikonfirmasi ke Matriks atau OPD pemilik lebih dulu.

### Temuan 3 (kesenjangan model): OPD pendukung tidak tersimpan sebagai relasi

Matriks mencantumkan OPD pendukung untuk hampir semua indikator (misalnya Stunting didukung DP3APPKB, Bapperida, DKPP, Dinas PUPR, Disperkimtan, DPMD). Di produksi, setiap indikator hanya punya 1 relasi OPD (utama). Daftar pendukung hanya ada sebagai teks usulan di metadata versi indikator.

Dampak: OPD pendukung tidak melihat indikator tersebut di menu mereka dan tidak ikut alur verifikasi. Perlu keputusan produk: apakah pendukung dibuat sebagai relasi `supporting` atau tetap sebagai catatan. Jika dibuat relasi, OPD pendukung harus dicocokkan ke direktori OPD terlebih dulu (beberapa pendukung bukan OPD, misalnya Kecamatan, RSUD, Puskesmas, FKUB, Kemenag vertikal, Perumda Air Minum).

### Temuan 4 (perlu dicek ke halaman cetak RPJMD): angka target yang janggal

Angka berikut cocok dengan Matriks, tetapi bentuknya tidak wajar dan layak dicek ulang ke Tabel 3.3.

| Indikator | Target 2025 / 2026 / 2027 / 2028 / 2029 | Alasan |
| --- | --- | --- |
| Persentase Peningkatan PAD (I075) | 30,76 / 2,42 / 2,8 / 7,26 / 7,33 | Nilai 2025 jauh di atas tahun lain; arah tercatat "pertahankan" padahal angka berubah. |
| Indeks Tutupan Lahan (I053) | 81,59 / 78,5 / 81,66 / 81,8 / 81,87 | Turun di 2026 lalu naik lagi. |
| Indeks Pembangunan Kualitas (I041) | kosong / 56,69 / 59,93 / 60,17 / 60,41 | Target 2025 kosong; status indikator masih draft. |
| Indeks Risiko Bencana (I058) | 132,83 / 131,55 / 130,27 / 129,017 / 127,72 | Presisi desimal tidak seragam (129,017). |
| Angka Keberhasilan Pengobatan (I035) | 90 untuk semua tahun | Arah "naik" tetapi target datar. |
| Treatment Coverage Tuberkulosis (I034) | 85 untuk semua tahun | Arah "naik" tetapi target datar. Kemungkinan target standar layanan; arah "pertahankan" mungkin lebih tepat. |
| Persentase Penurunan Emisi (I055) | 8,946 sampai 44,73 | Kumulatif, naik rata. Wajar, tetapi pastikan definisinya kumulatif. |
| Rasio Pajak Daerah terhadap PDRB (I074) | 0,0019 sampai 0,0021 | Skala sangat kecil; pastikan satuan persen atau rasio. |

### Temuan 5 (informasi): status verifikasi OPD

| Status | Jumlah |
| --- | --- |
| Verifikasi OPD (opd_verification) | 41 |
| Disetujui (approved) | 8 |
| Aktif (active) | 19 |
| Draft | 1 (I041) |

41 indikator masih menunggu verifikasi OPD pemilik. Ini sudah tercatat sebagai butir terbuka dan tidak berhubungan dengan kesesuaian data.

## 4. Kesesuaian per OPD

Seluruh penugasan OPD utama sama dengan Matriks. Kolom terakhir berisi temuan yang menyangkut OPD tersebut.

| OPD penanggung jawab utama | Jumlah indikator | Sesuai Matriks | Catatan |
| --- | --- | --- | --- |
| Dinas Lingkungan Hidup dan Kehutanan | 7 | Ya | I053 tren turun di 2026; I057 satuan Poin skala 0-1. |
| Dinas Pekerjaan Umum dan Penataan Ruang | 6 | Ya | - |
| Dinas Kesehatan | 6 | Ya | I034 dan I035 target datar. |
| Badan Perencanaan Pembangunan, Riset dan Inovasi Daerah | 5 | Ya | - |
| Dinas Ketahanan Pangan dan Perikanan | 4 | Ya | - |
| Dinas Perdagangan, Perindustrian, Koperasi dan UKM | 4 | Ya | Masih tercatat sebagai relasi utama I023 (temuan 1). |
| Sekretariat Daerah | 4 | Ya | - |
| Dinas Pendidikan | 4 | Ya | Masih tercatat sebagai relasi utama I061 (temuan 1). |
| Disbudparpora | 3 | Ya (pemilik) | Relasi utama belum terbentuk (temuan 1); I061 satuan. |
| Dinas Transmigrasi dan Tenaga Kerja | 3 | Ya | - |
| DP3APPKB | 3 | Ya | I041 target 2025 kosong; satuan. |
| Dinas Komunikasi, Informatika, Persandian dan Statistik | 3 | Ya | Satuan "Angka" tidak seragam. |
| Dinas Pemberdayaan Masyarakat dan Desa | 2 | Ya | - |
| Dinas Sosial | 2 | Ya | I026 Gini satuan. |
| Dinas Kearsipan dan Perpustakaan | 2 | Ya | - |
| Badan Pendapatan Daerah | 2 | Ya | I075 angka janggal; masih tercatat sebagai relasi utama I022 (temuan 1). |
| Dinas Pertanian | 1 | Ya | - |
| Dinas Penanaman Modal dan PTSP | 1 | Ya | - |
| Dinas Perhubungan | 1 | Ya | - |
| Dinas Perumahan, Kawasan Permukiman dan Pertanahan | 1 | Ya | - |
| Badan Penanggulangan Bencana Daerah | 1 | Ya | I058 presisi desimal. |
| Badan Kesatuan Bangsa dan Politik | 1 | Ya | - |
| Inspektorat | 1 | Ya | - |
| BKPSDM | 1 | Ya | - |
| Badan Keuangan dan Aset Daerah | 1 | Ya | - |

Total: 25 OPD pemilik, 69 indikator.

## 5. Rekomendasi (urut prioritas)

1. Terapkan migration koreksi relasi OPD utama untuk I022, I023, I061 (temuan 1). Cadangkan database lebih dulu.
2. Cek ke Tabel 3.3 RPJMD: I075, I053, I041, I058 (temuan 4).
3. Putuskan satuan: Indeks untuk I061 dan I041; skala untuk Gini dan I057 (temuan 2).
4. Putuskan model OPD pendukung (temuan 3).
5. Untuk I034 dan I035, putuskan apakah arah "pertahankan" lebih tepat.
6. Minta OPD pemilik menyelesaikan verifikasi 41 indikator.

## 6. Yang tidak diperiksa

- Pembacaan ulang PDF RPJMD per halaman (lihat bagian 2, butir 3).
- Nilai capaian atau realisasi indikator. Audit ini hanya mencakup definisi, satuan, arah, target, dan penugasan OPD.
- Profil OPD, URL, dan baseline per OPD (dibahas pada dokumen lain).
