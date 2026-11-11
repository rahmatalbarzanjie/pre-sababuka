-- Mapping draf yang belum pernah disetujui tidak dapat dipensiunkan karena batasan
-- approval_check mewajibkan approved_by pada status 'retired' (galat 500). Mapping boleh
-- dipensiunkan dari draf tanpa persetujuan; 'approved' dan 'active' tetap wajib disetujui.
ALTER TABLE sababuka.indicator_source_mappings
  DROP CONSTRAINT indicator_source_mappings_approval_check;
ALTER TABLE sababuka.indicator_source_mappings
  ADD CONSTRAINT indicator_source_mappings_approval_check CHECK (
    (status IN ('approved', 'active') AND approved_by IS NOT NULL AND approved_at IS NOT NULL)
    OR status IN ('draft', 'retired')
  );

INSERT INTO sababuka.schema_migrations (version, description)
VALUES ('060', 'allow retiring draft connector mapping')
ON CONFLICT (version) DO NOTHING;
