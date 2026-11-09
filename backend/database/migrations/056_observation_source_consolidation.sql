-- Konsolidasi nilai antarsumber.
-- Aturan: nilai identik dari sumber berbeda tetap menjadi dua baris bersumber (bukan konflik);
-- nilai berbeda untuk indikator, periode, wilayah, dan dimensi yang sama ditandai konflik dan harus
-- ditetapkan oleh BAPPERIDA atau OPD pemilik indikator. Konflik tidak pernah diselesaikan otomatis.
-- Observasi tidak diubah atau dihapus; keputusan disimpan terpisah sehingga jejak sumber tetap utuh.
BEGIN;

CREATE TABLE sababuka.observation_conflict_decisions (
    id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    indicator_version_id       uuid NOT NULL REFERENCES sababuka.indicator_versions(id),
    period_id                  uuid NOT NULL REFERENCES sababuka.periods(id),
    geography_id               uuid REFERENCES sababuka.geographies(id),
    dimension_hash             bytea NOT NULL,
    chosen_observation_id      uuid NOT NULL REFERENCES sababuka.observations(id),
    considered_observation_ids uuid[] NOT NULL,
    note                       text NOT NULL,
    decided_by                 uuid NOT NULL REFERENCES sababuka.users(id),
    decided_at                 timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT observation_conflict_decisions_note_check CHECK (length(btrim(note)) >= 10),
    CONSTRAINT observation_conflict_decisions_chosen_considered CHECK (chosen_observation_id = ANY (considered_observation_ids))
);

CREATE UNIQUE INDEX observation_conflict_decisions_slot_idx
    ON sababuka.observation_conflict_decisions (indicator_version_id, period_id, geography_id, dimension_hash)
    NULLS NOT DISTINCT;

-- Satu "slot" = indikator + periode + wilayah + dimensi. Hanya observasi dari batch yang disetujui/terbit
-- dan belum digantikan revisi yang dihitung sebagai pesaing.
CREATE VIEW sababuka.observation_conflicts AS
WITH current_observations AS (
    SELECT o.*
    FROM sababuka.observations o
    JOIN sababuka.data_batches b ON b.id = o.batch_id AND b.status IN ('approved', 'published')
    WHERE NOT EXISTS (SELECT 1 FROM sababuka.observations newer WHERE newer.supersedes_id = o.id)
), slots AS (
    SELECT o.indicator_version_id, o.period_id, o.geography_id, o.dimension_hash,
           array_agg(o.id ORDER BY o.created_at, o.id) AS observation_ids
    FROM current_observations o
    GROUP BY o.indicator_version_id, o.period_id, o.geography_id, o.dimension_hash
    HAVING count(DISTINCT COALESCE(o.numeric_value::text, o.text_value)) > 1
)
SELECT md5(concat_ws('|', s.indicator_version_id, s.period_id, COALESCE(s.geography_id::text, ''), encode(s.dimension_hash, 'hex')))::uuid AS slot_id,
       s.indicator_version_id, s.period_id, s.geography_id, s.dimension_hash, s.observation_ids,
       d.id AS decision_id, d.chosen_observation_id, d.note AS decision_note, d.decided_by, d.decided_at,
       CASE WHEN d.id IS NOT NULL AND s.observation_ids <@ d.considered_observation_ids THEN 'resolved' ELSE 'open' END AS status
FROM slots s
LEFT JOIN sababuka.observation_conflict_decisions d
       ON d.indicator_version_id = s.indicator_version_id
      AND d.period_id = s.period_id
      AND d.geography_id IS NOT DISTINCT FROM s.geography_id
      AND d.dimension_hash = s.dimension_hash;

-- Observasi yang tidak boleh masuk kurasi baru / dashboard:
--   open_conflict : slot belum diputuskan (tidak boleh ditambahkan ke publikasi baru)
--   not_chosen    : slot sudah diputuskan dan observasi ini bukan yang ditetapkan valid
CREATE VIEW sababuka.observation_publication_blocks AS
SELECT unnest(c.observation_ids) AS observation_id, 'open_conflict'::text AS reason, c.slot_id
FROM sababuka.observation_conflicts c
WHERE c.status = 'open'
UNION ALL
SELECT o.observation_id, 'not_chosen'::text, c.slot_id
FROM sababuka.observation_conflicts c
CROSS JOIN LATERAL unnest(c.observation_ids) AS o(observation_id)
WHERE c.status = 'resolved' AND o.observation_id <> c.chosen_observation_id;

INSERT INTO sababuka.permissions (code, name, risk_level)
VALUES ('consolidation.view', 'Lihat konflik nilai antarsumber', 'normal'),
       ('consolidation.resolve', 'Tetapkan nilai valid pada konflik antarsumber', 'elevated')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, risk_level = EXCLUDED.risk_level;

INSERT INTO sababuka.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM sababuka.roles r
JOIN sababuka.permissions p ON (
       (p.code = 'consolidation.view' AND r.code IN ('opd', 'bapperida', 'superadmin', 'kominfo'))
    OR (p.code = 'consolidation.resolve' AND r.code IN ('opd', 'bapperida', 'superadmin')))
ON CONFLICT DO NOTHING;

INSERT INTO sababuka.menu_items (code, label, icon, route_name, required_permission, display_order, is_active)
VALUES ('consolidation', 'Konsolidasi Sumber', 'git-compare', '/consolidation', 'consolidation.view', 35, true)
ON CONFLICT (code) DO UPDATE SET
    label = EXCLUDED.label, icon = EXCLUDED.icon, route_name = EXCLUDED.route_name,
    required_permission = EXCLUDED.required_permission, is_active = true, updated_at = now();

INSERT INTO sababuka.role_menu_items (role_id, menu_item_id, is_visible, display_order)
SELECT r.id, m.id, true, desired.display_order
FROM (VALUES ('bapperida', 35), ('opd', 35), ('superadmin', 25), ('kominfo', 15)) AS desired(role_code, display_order)
JOIN sababuka.roles r ON r.code = desired.role_code AND r.is_active = true
JOIN sababuka.menu_items m ON m.code = 'consolidation'
ON CONFLICT (role_id, menu_item_id) DO UPDATE
SET is_visible = true, display_order = EXCLUDED.display_order;

INSERT INTO sababuka.schema_migrations (version, description)
VALUES ('056', 'cross-source observation conflict detection and owner decisions')
ON CONFLICT (version) DO NOTHING;

COMMIT;
