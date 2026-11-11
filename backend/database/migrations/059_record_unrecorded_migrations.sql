-- Migrasi 053, 054, 057, dan 058 tidak mencatat dirinya di schema_migrations sehingga
-- dijalankan ulang pada setiap deploy. Isinya idempoten, jadi tidak ada data rusak;
-- migrasi ini hanya mencatatnya agar runner melewatinya.
INSERT INTO sababuka.schema_migrations (version, description)
VALUES
  ('053', 'connector year range 2024'),
  ('054', 'connector check history'),
  ('057', 'remove mfa'),
  ('058', 'superadmin all menus'),
  ('059', 'record unrecorded migrations')
ON CONFLICT (version) DO NOTHING;
