BEGIN;

-- Dataset sistem "Capaian Indikator Manual SABABUKA" menampung seluruh input capaian OPD
-- (migration 010) dan tidak boleh dihapus. Statusnya diaktifkan agar daftar dataset tidak
-- menampilkan wadah resmi ini sebagai draf.
UPDATE sababuka.dataset_versions dv
SET status = 'active',
    approved_by = admin.user_id,
    approved_at = now()
FROM sababuka.datasets d,
     (SELECT ur.user_id
      FROM sababuka.user_role_assignments ur
      JOIN sababuka.roles r ON r.id = ur.role_id
      WHERE r.code = 'superadmin'
      ORDER BY ur.user_id
      LIMIT 1) admin
WHERE d.id = dv.dataset_id
  AND d.code = 'SABABUKA.CAPAIAN_MANUAL'
  AND dv.status = 'draft';

INSERT INTO sababuka.schema_migrations (version, description)
VALUES ('063', 'activate system dataset for manual indicator reporting')
ON CONFLICT (version) DO NOTHING;

COMMIT;
