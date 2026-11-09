import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../src/app.js";
import { createDatabase } from "../src/database.js";
import { testConfig } from "./test-config.js";

const databaseUrl = process.env.INTEGRATION_DATABASE_URL;
const adminEmail = process.env.INTEGRATION_ADMIN_EMAIL ?? "admin.integration@sababuka.test";
const password = process.env.INTEGRATION_ADMIN_PASSWORD ?? "integration-password-not-for-production";

test("konsolidasi antarsumber: identik = dua baris bersumber, berbeda = konflik yang diputuskan pemilik", { skip: !databaseUrl }, async () => {
  const db = createDatabase(databaseUrl!);
  const app = await buildApp({ config: { ...testConfig, databaseUrl: databaseUrl! }, db, logger: false });
  const observations: string[] = [];
  const batches: string[] = [];
  const publications: string[] = [];
  try {
    const login = async (identifier: string) => {
      const response = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { identifier, password } });
      assert.equal(response.statusCode, 200, response.body);
      return { cookie: (response.headers["set-cookie"] as string).split(";", 1)[0]!, csrf: response.json().csrf_token as string };
    };
    const admin = await login(adminEmail);
    const opd = await login("opd.dkpp@sababuka.com");

    const adminId = (await db.query<{ id: string }>(`SELECT id::text FROM sababuka.users WHERE email = $1`, [adminEmail])).rows[0]!.id;
    const dkppOrg = (await db.query<{ id: string }>(
      `SELECT ura.organization_id::text AS id FROM sababuka.users u JOIN sababuka.user_role_assignments ura ON ura.user_id = u.id WHERE u.email = 'opd.dkpp@sababuka.com' AND ura.organization_id IS NOT NULL LIMIT 1`)).rows[0]?.id ?? null;
    const target = (await db.query<{ iv: string; period: string; dsv: string; org: string; code: string }>(
      `SELECT iv.id::text AS iv, per.id::text AS period, dv.id::text AS dsv, i.owner_organization_id::text AS org, i.code
       FROM sababuka.indicator_versions iv JOIN sababuka.indicators i ON i.id = iv.indicator_id
       CROSS JOIN LATERAL (SELECT id FROM sababuka.periods WHERE code = '2029' LIMIT 1) per
       CROSS JOIN LATERAL (SELECT id FROM sababuka.dataset_versions ORDER BY created_at LIMIT 1) dv
       WHERE i.owner_organization_id IS NOT NULL AND i.owner_organization_id IS DISTINCT FROM $1::uuid
       ORDER BY i.code LIMIT 1`, [dkppOrg])).rows[0]!;

    // Satu batch per sumber: indeks unik batch tidak mengizinkan dua nilai pada slot yang sama dalam satu batch.
    const put = async (value: number, source: string) => {
      const batch = await db.query<{ id: string }>(
        `INSERT INTO sababuka.data_batches (dataset_version_id, organization_id, reporting_period_id, submission_method, source_metadata, row_count, status, submitted_by, submitted_at, approved_by, approved_at, created_by)
         VALUES ($1, $2, $3, 'api_import', '{}'::jsonb, 0, 'approved', $4, now(), $4, now(), $4) RETURNING id::text`, [target.dsv, target.org, target.period, adminId]);
      batches.push(batch.rows[0]!.id);
      const observation = await db.query<{ id: string }>(
        `INSERT INTO sababuka.observations (batch_id, indicator_version_id, period_id, geography_id, numeric_value, quality_status, created_by, source_name, source_status)
         VALUES ($1, $2, $3, NULL, $4, 'valid', $5, $6, 'verified_direct') RETURNING id::text`, [batch.rows[0]!.id, target.iv, target.period, value, adminId, source]);
      observations.push(observation.rows[0]!.id);
      return observation.rows[0]!.id;
    };
    const conflicts = async (cookie: string, status = "open") =>
      (await app.inject({ method: "GET", url: `/api/v1/consolidation/conflicts?status=${status}`, headers: { cookie } })).json();
    const slot = async () => (await conflicts(admin.cookie)).data.find((c: { indicator_code: string; period_label: string }) => c.indicator_code === target.code && c.period_label.includes("2029"));
    const decide = (who: { cookie: string; csrf: string }, body: object) =>
      app.inject({ method: "POST", url: "/api/v1/consolidation/decisions", headers: { cookie: who.cookie, "x-csrf-token": who.csrf }, payload: body });

    const obsA = await put(10, "Sumber A");
    const obsB = await put(10, "Sumber B");
    assert.equal(await slot(), undefined, "nilai identik dari dua sumber bukan konflik (tetap dua baris bersumber)");

    const obsC = await put(12, "Sumber C");
    const open = await slot();
    assert.ok(open, "nilai berbeda harus menjadi konflik terbuka");
    assert.deepEqual(open.observations.map((o: { source_name: string }) => o.source_name), ["Sumber A", "Sumber B", "Sumber C"]);
    const held = await db.query(`SELECT reason FROM sababuka.observation_publication_blocks WHERE observation_id = ANY($1::uuid[])`, [[obsA, obsB, obsC]]);
    assert.equal(held.rows.length, 3);
    assert.ok(held.rows.every((row) => row.reason === "open_conflict"), "konflik terbuka menahan semua baris dari kurasi");

    // Konflik terbuka tidak boleh masuk kurasi, dan tidak muncul sebagai kandidat publikasi.
    const draft = await app.inject({ method: "POST", url: "/api/v1/publications", headers: { cookie: admin.cookie, "x-csrf-token": admin.csrf }, payload: { publication_key: "UJI.KONSOLIDASI", publication_number: "UJI-KONS-1", title: "Uji konsolidasi sumber" } });
    assert.equal(draft.statusCode, 201, draft.body);
    const publicationId = draft.json().id as string;
    publications.push(publicationId);
    const rejected = await app.inject({ method: "POST", url: `/api/v1/publications/${publicationId}/items`, headers: { cookie: admin.cookie, "x-csrf-token": admin.csrf }, payload: { observation_ids: [obsA] } });
    assert.equal(rejected.statusCode, 422, rejected.body);
    const candidates = (await app.inject({ method: "GET", url: "/api/v1/publications/candidates", headers: { cookie: admin.cookie } })).json().data as Array<{ observation_id: string }>;
    assert.ok(!candidates.some((item) => [obsA, obsB, obsC].includes(item.observation_id)), "capaian yang ditahan tidak menjadi kandidat");

    assert.equal((await decide(admin, { chosen_observation_id: obsA, note: "pendek" })).statusCode, 400, "catatan terlalu pendek ditolak");
    const denied = await decide(opd, { chosen_observation_id: obsA, note: "OPD lain tidak berwenang atas indikator ini." });
    assert.equal(denied.statusCode, 403, denied.body);

    const ok = await decide(admin, { chosen_observation_id: obsC, note: "Sumber C dikonfirmasi BAPPERIDA sebagai nilai yang valid." });
    assert.equal(ok.statusCode, 200, ok.body);
    assert.equal(await slot(), undefined, "konflik yang diputuskan tidak lagi terbuka");
    const resolved = (await conflicts(admin.cookie, "resolved")).data.find((c: { chosen_observation_id: string }) => c.chosen_observation_id === obsC);
    assert.ok(resolved, "keputusan tercatat di riwayat");
    const after = await db.query(`SELECT observation_id::text, reason FROM sababuka.observation_publication_blocks WHERE observation_id = ANY($1::uuid[])`, [[obsA, obsB, obsC]]);
    assert.deepEqual(after.rows.map((row) => row.observation_id).sort(), [obsA, obsB].sort(), "hanya yang tidak dipilih yang ditahan");
    assert.ok(after.rows.every((row) => row.reason === "not_chosen"));

    await put(15, "Sumber D");
    assert.ok(await slot(), "sumber baru dengan nilai berbeda membuka konflik kembali");
  } finally {
    if (observations.length) {
      await db.query(`DELETE FROM sababuka.observation_conflict_decisions WHERE chosen_observation_id = ANY($1::uuid[])`, [observations]);
      await db.query(`DELETE FROM sababuka.observations WHERE id = ANY($1::uuid[])`, [observations]);
    }
    if (publications.length) await db.query(`DELETE FROM sababuka.publications WHERE id = ANY($1::uuid[])`, [publications]);
    if (batches.length) await db.query(`DELETE FROM sababuka.data_batches WHERE id = ANY($1::uuid[])`, [batches]);
    await app.close();
    await db.end();
  }
});
