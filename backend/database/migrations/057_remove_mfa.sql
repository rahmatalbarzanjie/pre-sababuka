-- MFA dihapus dari alur login dan aktivasi. Login hanya memakai email/username dan kata sandi.
-- Tabel user_mfa_methods dipertahankan sebagai arsip; metode yang masih aktif dinonaktifkan
-- agar tidak ada rahasia TOTP atau recovery code yang tampak aktif.
UPDATE sababuka.user_mfa_methods SET disabled_at = now() WHERE disabled_at IS NULL;
UPDATE sababuka.users SET mfa_required = false WHERE mfa_required;
