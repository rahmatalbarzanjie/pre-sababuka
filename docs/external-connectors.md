# Konektor sumber eksternal

SABABUKA memakai konektor eksplisit untuk menghubungkan indikator tahunan dengan sumber resmi. Konektor tidak mencocokkan judul secara otomatis dan tidak menimpa data manual.

## Sumber yang tersedia

- **Satu Data Kapuas** memakai katalog CKAN. Pencarian katalog tersedia dari menu Konektor dan mengambil metadata paket/resource. Resource CSV atau JSON harus dipilih dan dipetakan ke indikator tertentu.
- **BPS Kabupaten Kapuas** memakai WebAPI BPS. Status awalnya `Menunggu API key` sampai `BPS_API_KEY` diatur di environment backend. Setelah key tersedia, mapping membutuhkan URL endpoint resource BPS yang eksplisit.

Superadmin dapat mengelola key BPS dari **Konfigurasi Sistem → API BPS Kabupaten Kapuas**. Tombol **Simpan & Uji Koneksi** menguji key lebih dulu, lalu menyimpannya dalam bentuk terenkripsi dengan `CONNECTOR_ENCRYPTION_KEY`. Nilai key tidak pernah dikembalikan ke browser, log, audit, atau pesan error. Tombol **Nonaktifkan / Hapus key** menghapus ciphertext dari database. `BPS_API_KEY` environment tetap dibaca sebagai fallback kompatibilitas, tetapi tidak dapat ditulis dari aplikasi.

Tombol **Simpan & Uji Koneksi** menyimpan key terenkripsi walau uji koneksi gagal, sehingga operator tidak perlu mengetik ulang; status gagal dan alasannya ditampilkan. Setiap uji dicatat sebagai riwayat append-only pada `connector_check_history` (maksimal 100 entri terakhir per sumber, migration 054) dan ditampilkan di panel API BPS. Key dan respons mentah tidak ikut tersimpan di riwayat.

Contoh konfigurasi lokal ada di `backend/.env.example`. Jangan menyimpan API key di Git, seed, atau metadata dataset.
Skrip demo menyimpan master key konektor di `backend/tmp/connector-encryption-key` yang di-ignore Git agar ciphertext tetap bisa dibuka setelah restart lokal; environment produksi harus menyediakan `CONNECTOR_ENCRYPTION_KEY` dari secret manager.

## Alur penggunaan

1. Cari resource di katalog atau siapkan endpoint BPS.
2. Buat mapping draf ke satu versi indikator tahunan. Mapping wajib mencantumkan field tahun, nilai, dan kode wilayah; rentang yang diterima 2024-2029 (periode jabatan bupati; konstanta `CONNECTOR_YEAR_MIN`/`CONNECTOR_YEAR_MAX` dan CHECK `connector_staging_year_check`, migration 053). Target RPJMD tetap 2025-2029 dan wilayah default Kabupaten Kapuas `6203`.
3. BAPPERIDA menyetujui lalu mengaktifkan mapping.
4. Jalankan **Preview sinkronisasi**. Data diambil ke staging, divalidasi tahun, wilayah, nilai numerik, dan satuan. Baris yang tidak valid ditahan dan tidak masuk batch.
5. Tinjau preview, lalu impor. Impor membuat batch `api_import` terpisah dengan checksum, URL, waktu pengambilan, dan status sumber `verified_direct`; batch manual tidak diubah.

Tombol **Uji koneksi** pada setiap konektor menampilkan profile terukur: keterjangkauan, waktu respons, identitas platform, jumlah dataset dan resource yang dapat diproses, publisher, cakupan tahun, serta error yang sudah disanitasi. Profile juga menampilkan kandidat kategori dan indikator yang sudah `approved` atau `active` saja. Skor dan alasan kata kunci hanya bahan review; kandidat tidak pernah otomatis membuat master baru, menyetujui mapping, atau mengimpor nilai. Endpoint website/API OPD dapat ditambahkan dengan kontrak profile yang sama, tetapi belum dinyatakan terhubung sampai konektornya benar-benar diimplementasikan.

Konektor hanya bertugas mengambil realisasi dari sumber resmi. Target RPJMD/Renstra tetap menjadi data perencanaan yang dikelola di SABABUKA. Jika dua sumber menghasilkan angka berbeda, buat mapping sumber pendukung dan tahan keputusan sampai diverifikasi, jangan memilih diam-diam.

## Hak akses

Ruang konektor, mapping kandidat, dan isi preview staging hanya dapat dibuka oleh akun Developer atau Superadmin dengan role `superadmin` berscope `global`. Pemeriksaan ini diterapkan pada API, bukan hanya dengan menyembunyikan menu. Walidata, BPS, OPD, BAPPERIDA, dan pimpinan tidak dapat membaca nilai mentah staging.

Mapping kandidat boleh dibuat untuk indikator berstatus `opd_verification`. Mapping draf boleh menjalankan preview, tetapi tidak dapat disetujui, diaktifkan, dijadwalkan, atau diimpor sampai indikator berstatus `approved` atau `active`. Preview tidak menulis ke `data_batches`, `observations`, dashboard pimpinan, maupun publikasi.

## Rujukan data untuk OPD (hanya-baca)

Saat mengusulkan atau menyusun indikator, OPD dapat membuka panel "Cari rujukan data" di formulir indikator untuk menelusuri katalog Satu Data Kapuas. Endpoint `GET /reference/datasets` memakai izin `reference.search` (OPD, BAPPERIDA, Superadmin) dan dibatasi 20 permintaan per menit.

- Hanya metadata yang dikembalikan: judul, deskripsi singkat, organisasi, format, jumlah resource, dan tautan halaman dataset. URL resource, kredensial, dan nilai data tidak pernah ikut.
- Tombol "Pakai sebagai sumber data" hanya mengisi kolom teks sumber data; OPD tetap mengisi dan menyetujui seluruh isi indikator secara manual.
- Panel ini tidak membuat mapping, staging, atau impor. Rujukan BPS menyusul setelah penelusur BPS tersedia.

## Penelusur BPS dan adaptor format BPS

Di halaman Konektor, panel "Cari variabel BPS Kabupaten Kapuas" membantu membuat mapping tanpa mengetik endpoint dan kolom secara manual:

1. Cari kata kunci; hasil berupa variabel BPS (judul, subjek, satuan).
2. Pilih variabel. Backend mengambil data 2021-2029 dan menampilkan kategori (`vervar`/`turvar`), tahun yang tersedia, dan pratinjau nilai. Pada tabel tingkat provinsi (baris = kabupaten/kota), baris "Kapuas" dipilih otomatis.
3. "Isi form mapping otomatis" mengisi endpoint, kolom `tahun`/`nilai`/`satuan`, kode wilayah 6203, dan pilihan kategori. Pemilihan indikator dan penyimpanan tetap dilakukan manual.

Detail teknis:

- Respons data BPS (`list/model/data`) memakai `datacontent` dengan kunci gabungan `vervar + var + turvar + tahun + turtahun`. Adaptor ada di `backend/src/services/bps-adapter.ts` dan diuji dengan sampel respons asli.
- WebAPI BPS membatasi parameter `th` maksimum 3 tahun per permintaan; sinkronisasi memecah 2024-2029 menjadi dua permintaan. Jendela tanpa data mengembalikan `datacontent: []` dan diperlakukan sebagai nol baris.
- Mapping BPS menyimpan pilihan kategori di `transform_json.bps`. Bila satu tahun masih memiliki lebih dari satu nilai, sinkronisasi ditolak dengan pesan agar kategori dipilih lebih spesifik.
- Variabel yang hanya punya data sebelum 2024 tetap dapat dipetakan, tetapi pratinjau memberi peringatan dan staging hanya menerima tahun 2024-2029.
- Kunci API hanya dipakai di backend dan disamarkan pada URL yang dicatat. OPD dapat mencari rujukan BPS (hanya metadata) lewat panel "Cari rujukan data" dengan sumber "BPS Kabupaten Kapuas".

## Retensi dan penghapusan staging

- Nilai mentah pada `connector_staging_values` disimpan maksimal 90 hari sejak connector run dibuat.
- Pembersihan diperiksa otomatis oleh scheduler backend setiap menit, serta saat daftar mapping dibuka, preview baru dijalankan, atau riwayat preview dibaca.
- Setelah masa retensi, nilai mentah dihapus dan `staging_purged_at` dicatat.
- Ringkasan run, checksum, URL sumber, waktu pengambilan, dan audit event tetap disimpan untuk ketertelusuran.
- Jika preview masih dibutuhkan setelah masa retensi, Developer harus mengambil ulang sumber untuk membuat run baru.
- Perubahan masa retensi harus dibuat melalui migration baru dan dicatat pada dokumen ini; jangan menonaktifkan pembersihan hanya dari UI.

### Impor tidak menggandakan data

Saat impor, baris staging yang nilainya sudah tercatat identik **dari sumber yang sama** (indikator, periode, nilai, nama sumber; wilayah sama atau kosong pada data lama) dilewati dan dicatat di audit sebagai `skipped_existing`. Batch tidak dibuat bila semua baris dilewati, sehingga impor ulang aman.

### Konsolidasi nilai antarsumber

Nilai dari sumber berbeda untuk slot yang sama (indikator, periode, wilayah, dimensi) mengikuti aturan berikut. Sistem tidak pernah memilih nilai sendiri.

- **Nilai identik dari sumber berbeda:** bukan konflik; tetap dua baris dengan sumber masing-masing.
- **Nilai berbeda:** ditandai konflik (`open`) dan tampil di menu **Konsolidasi Sumber** lengkap dengan sumbernya. BAPPERIDA, atau OPD pemilik indikator, menetapkan satu nilai valid dengan catatan alasan (min. 10 karakter, masuk audit). Observasi tidak diubah atau dihapus; keputusan disimpan di `observation_conflict_decisions`.
- **Sumber baru dengan nilai lain** setelah keputusan membuka konflik kembali.
- **Dashboard pimpinan hanya memuat data tervalidasi:** konflik terbuka menahan capaian dari kandidat kurasi dan dari penambahan ke publikasi; capaian yang tidak dipilih (`not_chosen`) tidak tampil di dashboard dan analisis pimpinan. Publikasi yang sudah aktif tidak ditarik otomatis saat konflik baru muncul; konflik itu terlihat di menu konsolidasi sampai diputuskan.

Izin: `consolidation.view` (OPD, BAPPERIDA, Walidata, Superadmin) dan `consolidation.resolve` (OPD pemilik indikator, BAPPERIDA, Superadmin). API: `GET /consolidation/conflicts`, `POST /consolidation/decisions`.
