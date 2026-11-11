BEGIN;

-- Migration 030 menetapkan Disbudparpora sebagai pemilik tiga indikator, tetapi hanya
-- menambah relasi utama bila belum ada. Relasi utama dari penugasan contoh (migration 018)
-- masih tersisa, sehingga OPD lama tetap melihat indikator ini sebagai tugasnya.
DELETE FROM sababuka.indicator_organizations io
USING sababuka.indicator_versions v, sababuka.indicators i
WHERE io.indicator_version_id = v.id
  AND v.indicator_id = i.id
  AND io.is_primary = true
  AND i.code IN (
      'RPJMD_I022_PAD_SEKTOR_PARIWISATA',
      'RPJMD_I023_RASIO_PDRB_PENYEDIAAN_AKOMODASI_DAN_MAKAN_MINUM',
      'RPJMD_I061_INDEKS_PEMBANGUNAN_KEBUDAYAAN_IPK'
  )
  AND io.organization_id <> (SELECT id FROM sababuka.organizations WHERE code = 'DISBUDPARPORA');

INSERT INTO sababuka.indicator_organizations (indicator_version_id, organization_id, responsibility, is_primary)
SELECT v.id, o.id, 'primary_producer', true
FROM sababuka.indicator_versions v
JOIN sababuka.indicators i ON i.id = v.indicator_id
JOIN sababuka.organizations o ON o.code = 'DISBUDPARPORA'
WHERE i.code IN (
    'RPJMD_I022_PAD_SEKTOR_PARIWISATA',
    'RPJMD_I023_RASIO_PDRB_PENYEDIAAN_AKOMODASI_DAN_MAKAN_MINUM',
    'RPJMD_I061_INDEKS_PEMBANGUNAN_KEBUDAYAAN_IPK'
)
AND NOT EXISTS (
    SELECT 1 FROM sababuka.indicator_organizations x
    WHERE x.indicator_version_id = v.id AND x.organization_id = o.id
)
ON CONFLICT DO NOTHING;

UPDATE sababuka.indicator_organizations io
SET is_primary = true, responsibility = 'primary_producer'
FROM sababuka.indicator_versions v, sababuka.indicators i, sababuka.organizations o
WHERE io.indicator_version_id = v.id AND v.indicator_id = i.id
  AND o.code = 'DISBUDPARPORA' AND io.organization_id = o.id
  AND i.code IN (
      'RPJMD_I022_PAD_SEKTOR_PARIWISATA',
      'RPJMD_I023_RASIO_PDRB_PENYEDIAAN_AKOMODASI_DAN_MAKAN_MINUM',
      'RPJMD_I061_INDEKS_PEMBANGUNAN_KEBUDAYAAN_IPK'
  );

INSERT INTO sababuka.schema_migrations (version, description)
VALUES ('062', 'fix Disbudparpora primary relation for three tourism/culture RPJMD indicators')
ON CONFLICT (version) DO NOTHING;

COMMIT;
