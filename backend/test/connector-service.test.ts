import test from "node:test";
import assert from "node:assert/strict";
import type { QueryResult } from "pg";
import type { Database, QueryResultRow } from "../src/database.js";
import { readFileSync } from "node:fs";
import { bpsApiBase, BPS_WEBAPI_BASE, buildBpsDomainUrl, CONNECTOR_YEAR_MAX, CONNECTOR_YEAR_MIN, ConnectorService, extractBpsDomains, parseCsv } from "../src/services/connector-service.js";
import { testConfig } from "./test-config.js";

function result<R extends QueryResultRow>(rows: R[]): QueryResult<R> {
  return { command: "SELECT", rowCount: rows.length, oid: 0, fields: [], rows };
}

test("parseCsv preserves quoted commas and escaped quotes", () => {
  const rows = parseCsv('tahun,wilayah,nilai,catatan\n2025,6203,"24,07","Angka ""resmi"""\n');
  assert.deepEqual(rows, [{ tahun: "2025", wilayah: "6203", nilai: "24,07", catatan: 'Angka "resmi"' }]);
});

test("parseCsv returns an empty list for header-only resources", () => {
  assert.deepEqual(parseCsv("tahun,nilai\n"), []);
});

test("BPS domain request uses the current public API contract", () => {
  const url = new URL(buildBpsDomainUrl("https://webapi.bps.go.id/v1/api/", "secret key"));
  assert.equal(url.pathname, "/v1/api/domain");
  assert.equal(url.searchParams.get("type"), "kab");
  assert.equal(url.searchParams.get("key"), "secret key");
  assert.equal(url.toString().includes("adminkab"), false);
});

test("BPS domains are extracted from the documented paginated response", () => {
  const domains = extractBpsDomains({ status: "OK", data: [{ page: 1, pages: 1 }, [{ domain_id: "6203", domain_name: "Kabupaten Kapuas" }]] });
  assert.deepEqual(domains, [{ domain_id: "6203", domain_name: "Kabupaten Kapuas" }]);
});

test("BPS connection profile exposes sanitized metrics and candidate summary", async () => {
  const originalKey = process.env.BPS_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.BPS_API_KEY = "mock-bps-key-2026";
  const fakeDb: Database = {
    query: async <R extends QueryResultRow>(sql: string) => {
      if (sql.includes("FROM sababuka.data_sources WHERE code")) return result<R>([{ id: "source-1", code: "BPS_KAPUAS", name: "BPS", source_type: "bps", base_url: "https://example.test/v1/api", connection_config: { domain_code: "6203" }, credential_reference: "BPS_API_KEY", last_checked_at: null }] as unknown as R[]);
      if (sql.includes("FROM sababuka.connector_secrets")) return result<R>([]);
      if (sql.includes("SELECT 'category' AS type")) return result<R>([{ type: "indicator", code: "IKP", name: "Indeks Ketahanan Pangan", indicator_version_id: "version-1" }] as unknown as R[]);
      if (sql.includes("FROM sababuka.indicator_source_mappings")) return result<R>([]);
      return result<R>([]);
    },
    connect: async () => { throw new Error("connect tidak digunakan"); },
    end: async () => undefined,
  };
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.pathname, "/v1/api/domain");
    assert.equal(url.searchParams.get("type"), "kab");
    return new Response(JSON.stringify({ status: "OK", data: [{ page: 1, pages: 1 }, [{ domain_id: "6203", domain_name: "Indeks Ketahanan Pangan" }]] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const profile = await new ConnectorService(fakeDb, testConfig).testSource("BPS_KAPUAS", { actorId: "user-1", requestId: "req-1", ipAddress: null, userAgent: null });
    assert.equal(profile.reachable, true);
    assert.equal(profile.platform, "BPS WebAPI");
    assert.equal(profile.publishers[0], "BPS Kabupaten Kapuas");
    assert.equal(profile.candidate_summary.candidate_count, 1);
    assert.equal(JSON.stringify(profile).includes("mock-bps-key-2026"), false);
    globalThis.fetch = async () => new Response("unauthorized", { status: 401 });
    const failed = await new ConnectorService(fakeDb, testConfig).testSource("BPS_KAPUAS", { actorId: "user-1", requestId: "req-2", ipAddress: null, userAgent: null });
    assert.equal(failed.reachable, false);
    assert.equal(failed.error, "API key ditolak oleh WebAPI BPS. Periksa kembali key yang dimasukkan.");
    assert.equal(JSON.stringify(failed).includes("mock-bps-key-2026"), false);
    globalThis.fetch = async () => new Response(JSON.stringify({ status: "Error", error: "UserNotFound" }), { status: 200, headers: { "content-type": "application/json" } });
    const rejected = await new ConnectorService(fakeDb, testConfig).testSource("BPS_KAPUAS", { actorId: "user-1", requestId: "req-3", ipAddress: null, userAgent: null });
    assert.equal(rejected.reachable, false);
    assert.match(rejected.error ?? "", /Periksa API key, aplikasi yang terdaftar, dan parameter endpoint/u);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.BPS_API_KEY; else process.env.BPS_API_KEY = originalKey;
  }
});

test("rentang tahun konektor 2024-2029 konsisten dengan CHECK database", () => {
  assert.equal(CONNECTOR_YEAR_MIN, 2024);
  assert.equal(CONNECTOR_YEAR_MAX, 2029);
  const migration = readFileSync(new URL("../database/migrations/053_connector_year_range_2024.sql", import.meta.url), "utf8");
  assert.ok(migration.includes(`CHECK (year BETWEEN ${CONNECTOR_YEAR_MIN} AND ${CONNECTOR_YEAR_MAX})`));
});

test("API key BPS tetap tersimpan terenkripsi dan uji gagal tercatat sebagai riwayat", async () => {
  const originalFetch = globalThis.fetch;
  const plaintext = "kunci-bps-uji-gagal-2026";
  const statements: Array<{ sql: string; params: unknown[] }> = [];
  const fakeDb: Database = {
    query: async <R extends QueryResultRow>(sql: string, params: unknown[] = []) => {
      statements.push({ sql, params });
      if (sql.includes("FROM sababuka.data_sources WHERE code")) return result<R>([{ id: "source-1", code: "BPS_KAPUAS", name: "BPS", source_type: "bps", base_url: "https://example.test/v1/api", connection_config: { domain_code: "6203" }, credential_reference: null, last_checked_at: null }] as unknown as R[]);
      if (sql.includes("FROM sababuka.connector_secrets")) return result<R>([]);
      return result<R>([]);
    },
    connect: async () => { throw new Error("connect tidak digunakan"); },
    end: async () => undefined,
  };
  globalThis.fetch = async () => new Response("unauthorized", { status: 401 });
  try {
    const outcome = await new ConnectorService(fakeDb, testConfig).saveBpsSecret({ user: { id: "user-1" } } as never, plaintext, { actorId: "user-1", requestId: "req-save", ipAddress: null, userAgent: null });
    assert.equal(outcome.profile.reachable, false);
    const secretWrite = statements.find((item) => item.sql.includes("INSERT INTO sababuka.connector_secrets"));
    assert.ok(secretWrite, "key harus tetap disimpan walau uji gagal");
    assert.equal(secretWrite.params[4], "failed");
    assert.match(String(secretWrite.params[5]), /ditolak/u);
    assert.notEqual(secretWrite.params[1], plaintext);
    assert.equal(JSON.stringify(statements.map((item) => item.params)).includes(plaintext), false, "key asli tidak boleh muncul di parameter query mana pun");
    assert.ok(statements.some((item) => item.sql.includes("INSERT INTO sababuka.connector_connection_checks")), "hasil uji terakhir harus diperbarui");
    const history = statements.find((item) => item.sql.includes("INSERT INTO sababuka.connector_check_history"));
    assert.ok(history, "setiap uji gagal harus menambah riwayat");
    assert.equal(history.params[2], false);
    assert.equal(history.params[8], "user-1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rujukan data OPD hanya memuat metadata dan tidak membocorkan URL resource", async () => {
  const originalFetch = globalThis.fetch;
  const fakeDb: Database = {
    query: async <R extends QueryResultRow>() => result<R>([{ id: "s1", code: "SATUDATA_KAPUAS", name: "Satu Data Kapuas", source_type: "ckan", base_url: "https://satudata.example.test/", connection_config: {}, credential_reference: null, last_checked_at: null }] as unknown as R[]),
    connect: async () => { throw new Error("connect tidak digunakan"); },
    end: async () => undefined,
  };
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.searchParams.get("q"), "stunting");
    return new Response(JSON.stringify({ success: true, result: { count: 1, results: [{
      id: "d1", name: "angka-stunting", title: "Angka <b>Stunting</b>", notes: "**Prevalensi** stunting\n\nbalita",
      organization: { title: "Dinas Kesehatan" },
      resources: [{ format: "csv", url: "https://rahasia.example.test/file.csv" }, { format: "CSV", url: "https://rahasia.example.test/b.csv" }, { format: "xlsx" }],
    }] } }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const found = await new ConnectorService(fakeDb, testConfig).searchReferenceDatasets("stunting", 5);
    assert.equal(found.results.length, 1);
    const item = found.results[0]!;
    assert.equal(item.title, "Angka Stunting");
    assert.equal(item.description, "Prevalensi stunting balita");
    assert.deepEqual(item.formats, ["CSV", "XLSX"]);
    assert.equal(item.resource_count, 3);
    assert.equal(item.page_url, "https://satudata.example.test/dataset/angka-stunting");
    assert.equal(JSON.stringify(found).includes("rahasia.example.test"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("izin reference.search hanya diberikan ke OPD, BAPPERIDA, dan Superadmin", () => {
  const migration = readFileSync(new URL("../database/migrations/055_reference_search_permission.sql", import.meta.url), "utf8");
  assert.ok(migration.includes("'reference.search'"));
  assert.ok(migration.includes("r.code IN ('opd', 'bapperida', 'superadmin')"));
  for (const forbidden of ["pimpinan", "kominfo", "connector.manage"]) assert.equal(migration.includes(forbidden), false);
});

test("transisi mapping memberi tipe eksplisit pada $2 agar PostgreSQL tidak menolak (42P08)", async () => {
  const statements: string[] = [];
  const row = { id: "m1", status: "draft", indicator_status: "active", indicator_is_active: true, category_is_active: true, review_status: "approved" };
  const fakeDb: Database = {
    query: async <R extends QueryResultRow>(sql: string) => {
      statements.push(sql);
      return result<R>([row] as unknown as R[]);
    },
    connect: async () => { throw new Error("connect tidak digunakan"); },
    end: async () => undefined,
  };
  await new ConnectorService(fakeDb, testConfig).transitionMapping({ user: { id: "u1" } } as never, "m1", "approve", { actorId: "u1", requestId: "r1", ipAddress: null, userAgent: null });
  const update = statements.find((sql) => sql.includes("UPDATE sababuka.indicator_source_mappings SET status="));
  assert.ok(update, "UPDATE status mapping tidak dijalankan");
  assert.ok(update.includes("status=$2::text"));
  assert.ok(update.includes("$2::text IN ('approved','active')"));
});

test("impor melewati nilai yang sudah tercatat identik dan tidak membuat batch kosong", async () => {
  const statements: string[] = [];
  const fakeDb: Database = {
    query: async <R extends QueryResultRow>(sql: string) => {
      statements.push(sql);
      if (sql.includes("FROM sababuka.connector_runs r JOIN")) return result<R>([{ id: "r1", status: "ready", mapping_id: "m1", dataset_version_id: "dv1", indicator_version_id: "iv1", source_id: "s1", mapping_status: "active", indicator_status: "active", source_name: "BPS", organization_id: "o1" }] as unknown as R[]);
      if (sql.includes("FROM sababuka.connector_staging_values WHERE run_id=$1 AND validation_status")) return result<R>([{ year: 2024, geography_code: "6203", numeric_value: "5.25", text_value: null, unit_value: "persen", validation_errors: [], source_url: "u", source_retrieved_at: "2026-01-01" }] as unknown as R[]);
      if (sql.includes("FROM sababuka.geographies")) return result<R>([{ id: "g1" }] as unknown as R[]);
      if (sql.includes("FROM sababuka.periods")) return result<R>([{ id: "p1" }] as unknown as R[]);
      if (sql.includes("FROM sababuka.observations WHERE indicator_version_id")) return result<R>([{ "?column?": 1 }] as unknown as R[]);
      return result<R>([{ id: "r1" }] as unknown as R[]);
    },
    connect: async () => { throw new Error("connect tidak digunakan"); },
    end: async () => undefined,
  };
  await new ConnectorService(fakeDb, testConfig).importRun({ user: { id: "u1" } } as never, "r1", { actorId: "u1", requestId: "r", ipAddress: null, userAgent: null });
  assert.ok(!statements.some((sql) => sql.includes("INSERT INTO sababuka.data_batches")));
  assert.ok(!statements.some((sql) => sql.includes("INSERT INTO sababuka.observations")));
});

test("alamat dasar BPS memakai WebAPI resmi bila base_url tertimpa alamat halaman publikasi", () => {
  assert.equal(bpsApiBase("https://webapi.bps.go.id/v1/api/"), "https://webapi.bps.go.id/v1/api");
  assert.equal(bpsApiBase("https://kapuaskab.bps.go.id/id/publication/2026/02/27/x/kabupaten-kapuas-dalam-angka-2026.html"), BPS_WEBAPI_BASE);
  assert.equal(bpsApiBase(null), BPS_WEBAPI_BASE);
  assert.equal(bpsApiBase("bukan url"), BPS_WEBAPI_BASE);
  assert.ok(buildBpsDomainUrl(bpsApiBase("https://kapuaskab.bps.go.id/halaman.html"), "KUNCI").startsWith("https://webapi.bps.go.id/v1/api/domain?"));
});

test("simpan profil integrasi memberi tipe eksplisit pada $7/$8 dan menggabung connection_config", async () => {
  const statements: string[] = [];
  const fakeClient = {
    query: async <R extends QueryResultRow>(sql: string) => { statements.push(sql); return result<R>([{ source_id: "s1", id: "p1" }] as unknown as R[]); },
    release: () => undefined,
  };
  const fakeDb: Database = {
    query: async <R extends QueryResultRow>(sql: string) => { statements.push(sql); return result<R>([{ id: "p1" }] as unknown as R[]); },
    connect: async () => fakeClient as never,
    end: async () => undefined,
  };
  const input = { organization_id: "o1", code: "BPS_KAPUAS", name: "BPS WebAPI", connector_kind: "bps", base_url: "https://webapi.bps.go.id/v1/api", auth_type: "api_key", data_format: "json", sync_mode: "manual", verification_mode: "preview_required" } as never;
  const audit = { actorId: "u1", requestId: "r1", ipAddress: null, userAgent: null };
  const service = new ConnectorService(fakeDb, testConfig);
  await service.saveIntegrationProfile({ user: { id: "u1" } } as never, input, audit, "p1");
  await service.saveIntegrationProfile({ user: { id: "u1" } } as never, input, audit);
  const update = statements.find((sql) => sql.includes("UPDATE sababuka.data_source_integrations"));
  const insert = statements.find((sql) => sql.includes("INSERT INTO sababuka.data_source_integrations"));
  assert.ok(update?.includes("$7::text") && update.includes("$8::int") && update.includes("CASE WHEN $7::text='scheduled'"));
  assert.ok(insert?.includes("$7::text,$8::int") && insert.includes("CASE WHEN $7::text='scheduled'"));
  assert.ok(statements.some((sql) => sql.includes("connection_config=COALESCE(connection_config,'{}'::jsonb) || $7::jsonb")), "connection_config harus digabung, bukan ditimpa");
});
