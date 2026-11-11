-- Tautan atur ulang kata sandi diterbitkan Superadmin untuk akun yang sudah aktif.
-- Memakai tabel undangan dengan kolom purpose agar token, kedaluwarsa, dan sekali-pakai tetap sama.
ALTER TABLE sababuka.user_invitations
  ADD COLUMN IF NOT EXISTS purpose varchar(24) NOT NULL DEFAULT 'invitation';
ALTER TABLE sababuka.user_invitations
  DROP CONSTRAINT IF EXISTS user_invitations_purpose_check;
ALTER TABLE sababuka.user_invitations
  ADD CONSTRAINT user_invitations_purpose_check CHECK (purpose IN ('invitation', 'password_reset'));

INSERT INTO sababuka.schema_migrations (version, description)
VALUES ('061', 'password reset invitations issued by superadmin')
ON CONFLICT (version) DO NOTHING;
