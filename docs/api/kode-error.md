# Kode Error API v1

| HTTP | Kode | Arti |
|---:|---|---|
| 400 | `VALIDATION_ERROR` | Isi permintaan tidak valid |
| 400 | `INVALID_TRANSITION` | Transisi workflow tidak diizinkan dari status saat ini |
| 401 | `AUTH_REQUIRED` | Sesi tidak tersedia atau kedaluwarsa |
| 401 | `INVALID_CREDENTIALS` | Kredensial login salah |
| 403 | `PERMISSION_DENIED` | Permission tidak dimiliki |
| 403 | `SCOPE_DENIED` | Objek berada di luar lingkup organisasi pengguna |
| 404 | `NOT_FOUND` | Objek tidak ditemukan atau tidak boleh diungkapkan |
| 404 | `INVITATION_INVALID` | Token undangan tidak valid, kedaluwarsa, sudah diterima, atau dicabut |
| 409 | `CONFLICT` | Versi, kode, atau data aktif berbenturan |
| 409 | `OPEN_VALIDATION_ERRORS` | Masih ada error validasi terbuka |
| 413 | `UPLOAD_TOO_LARGE` | Ukuran berkas melebihi batas |
| 415 | `UNSUPPORTED_FILE_TYPE` | Jenis berkas tidak didukung |
| 422 | `BUSINESS_RULE_VIOLATION` | Melanggar aturan bisnis |
| 429 | `RATE_LIMITED` | Terlalu banyak permintaan |
| 500 | `INTERNAL_ERROR` | Kesalahan internal; detail sensitif tidak dikirim ke klien |

Format error:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Permintaan tidak valid.",
    "request_id": "8be45d40-e437-4f44-86da-91d0cae75488",
    "details": [
      {"field": "title", "message": "Wajib diisi."}
    ]
  }
}
```
