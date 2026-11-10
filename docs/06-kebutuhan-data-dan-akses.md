# Checklist Kebutuhan Data dan Akses

Jangan menuliskan kata sandi, token, atau private key di dokumen ini. Dokumen hanya mencatat status dan pemilik akses.

## Tata kelola

- [ ] Pemilik produk dan pemberi keputusan final.
- [ ] PIC teknis BAPPERIDA/Diskominfo.
- [ ] PIC data dan PIC teknis setiap OPD.
- [ ] Mekanisme persetujuan indikator serta publikasi.
- [ ] Kebijakan klasifikasi, retensi, dan penghapusan data.
- [ ] Kontak insiden keamanan dan prosedur eskalasi.

## Inventaris OPD

Untuk setiap OPD diperlukan:

- nama resmi dan unit pemilik;
- nama dataset/indikator;
- definisi, satuan, periode, granularitas, serta frekuensi pembaruan;
- URL tepat atau mekanisme pertukaran data;
- format dan sampel data;
- status publik/terbatas/pribadi;
- sumber yang berwenang jika terjadi konflik;
- PIC validasi dan waktu respons yang diharapkan.

## Infrastruktur

- [ ] Spesifikasi OS, CPU, RAM, penyimpanan, dan jaringan server.
- [ ] Akses development, staging, dan production yang terpisah.
- [ ] Domain/subdomain dan pengelola DNS.
- [ ] Sertifikat TLS dan prosedur perpanjangan.
- [ ] Database, backup target, jadwal, retensi, RPO, dan RTO.
- [ ] SMTP/notifikasi operasional bila diperlukan.
- [ ] Monitoring dan pengelola alert.
- [ ] Repository resmi serta kebijakan branch/review.

## Identitas dan hak akses

- [ ] Daftar role dan matriks permission.
- [ ] Pilihan login lokal, SSO, atau identitas pemerintah.
- [ ] Kebijakan sesi, reset akses, dan offboarding. (MFA dihapus per 10 Nov 2026; login memakai kata sandi.)
- [ ] Daftar pengguna uji tanpa memakai akun produksi bersama.

## WhatsApp dan AI

- [ ] Diagram dan akses terbatas ke Node-RED yang ada.
- [ ] Status akun, paket, batas, dan dokumentasi Fonnte.
- [ ] Status akun, model, batas, dan anggaran Claude API.
- [ ] Nomor WhatsApp resmi dan daftar nomor Bupati/pendamping yang diizinkan.
- [ ] Kebijakan percakapan, retensi, audit, dan persetujuan penggunaan AI.
- [ ] Contoh pertanyaan prioritas dan bentuk jawaban yang diharapkan.

## Android dan distribusi

- [ ] Nama aplikasi, package ID, ikon, dan identitas visual.
- [ ] Target perangkat serta versi Android minimum.
- [ ] Mekanisme distribusi: internal APK, MDM, atau Play Store.
- [ ] Pemilik signing key dan prosedur penyimpanannya.

## Artefak survei yang perlu dibuat setelah format disetujui

- register OPD;
- register sumber data;
- katalog indikator;
- matriks RBAC;
- daftar akses dan PIC tanpa nilai rahasia;
- berita acara persetujuan definisi data.
