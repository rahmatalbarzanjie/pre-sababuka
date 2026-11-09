import type { FastifyInstance } from "fastify";
import type { QueryResultRow } from "pg";
import { requirePermission } from "../plugins/authentication.js";

const uuid = { type: "string", format: "uuid" } as const;

interface AnalysisRow extends QueryResultRow {
  observation_id: string; indicator_id: string; indicator_code: string; indicator_name: string;
  category_name: string; policy_focus_name: string | null; direction: "increase" | "decrease" | "maintain" | null;
  period_id: string; period_label: string; period_end: string; geography_id: string | null;
  geography_code: string | null; geography_name: string | null; geography_level: string | null;
  numeric_value: string | null; text_value: string | null; target_value: string | null;
  quality_status: string; notes: string | null;
  unit: string; unit_symbol: string | null; source_name: string; source_url: string | null;
  organization_name: string; publication_title: string; effective_at: string;
}

function numeric(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function movement(first: number, last: number): "up" | "down" | "stable" {
  const tolerance = Math.max(Math.abs(first) * 0.001, 0.000001);
  if (last - first > tolerance) return "up";
  if (first - last > tolerance) return "down";
  return "stable";
}

function performance(direction: AnalysisRow["direction"], trend: ReturnType<typeof movement>): "improving" | "worsening" | "stable" | "unclassified" {
  if (trend === "stable") return "stable";
  if (direction === "increase") return trend === "up" ? "improving" : "worsening";
  if (direction === "decrease") return trend === "down" ? "improving" : "worsening";
  if (direction === "maintain") return "worsening";
  return "unclassified";
}

export async function executiveRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { policy_focus_id?: string; period_id?: string } }>("/executive/dashboard", {
    schema: { querystring: { type: "object", additionalProperties: false, properties: { policy_focus_id: uuid, period_id: uuid } } },
  }, async (request) => {
    requirePermission(request, "executive_dashboard.view");
    const [metrics, items] = await Promise.all([
      app.db.query(`SELECT
        (SELECT count(*)::int FROM sababuka.indicator_versions iv
         JOIN sababuka.indicators i ON i.id = iv.indicator_id AND i.is_active = true
         JOIN sababuka.categories c ON c.id = i.category_id AND c.is_active = true AND c.review_status = 'approved'
         WHERE iv.status = 'active') AS active_indicators,
        (SELECT count(*)::int FROM sababuka.data_batches WHERE status = 'approved') AS approved_submissions,
        (SELECT count(DISTINCT organization_id)::int FROM sababuka.data_batches WHERE status = 'approved') AS covered_organizations,
        (SELECT count(DISTINCT pub.id)::int
         FROM sababuka.publications pub
         JOIN sababuka.publication_items pi ON pi.publication_id = pub.id
         JOIN sababuka.observations obs ON obs.id = pi.observation_id
         JOIN sababuka.data_batches b ON b.id = obs.batch_id AND b.status IN ('approved', 'published')
         JOIN sababuka.indicator_versions iv ON iv.id = obs.indicator_version_id AND iv.status = 'active'
         JOIN sababuka.indicators i ON i.id = iv.indicator_id AND i.is_active = true
         JOIN sababuka.categories c ON c.id = i.category_id AND c.is_active = true AND c.review_status = 'approved'
         WHERE pub.status = 'active' AND NOT EXISTS (SELECT 1 FROM sababuka.observation_publication_blocks nb WHERE nb.observation_id = obs.id AND nb.reason = 'not_chosen')) AS active_publications`),
      app.db.query(
        `SELECT i.id::text AS indicator_id, i.code AS indicator_code, i.name AS indicator_name,
                c.name AS category_name, pf.id::text AS policy_focus_id, pf.name AS policy_focus_name,
                per.id::text AS period_id, per.label AS period_label, u.name AS unit,
                u.symbol AS unit_symbol, obs.numeric_value, obs.text_value, obs.quality_status, obs.notes,
                pi.id::text AS publication_item_id, pub.title AS publication_title,
                pub.effective_at::text, org.name AS organization_name,
                COALESCE(obs.source_name, iv.source_reference, d.title) AS source,
                obs.source_url, obs.source_status, obs.source_retrieved_at::text
         FROM sababuka.publication_items pi
         JOIN sababuka.publications pub ON pub.id = pi.publication_id AND pub.status = 'active'
         JOIN sababuka.observations obs ON obs.id = pi.observation_id
         JOIN sababuka.indicator_versions iv ON iv.id = obs.indicator_version_id
         JOIN sababuka.indicators i ON i.id = iv.indicator_id
         JOIN sababuka.categories c ON c.id = i.category_id
         LEFT JOIN sababuka.policy_focuses pf ON pf.id = c.policy_focus_id
         JOIN sababuka.periods per ON per.id = obs.period_id
         JOIN sababuka.units u ON u.id = iv.unit_id
         JOIN sababuka.data_batches b ON b.id = obs.batch_id AND b.status IN ('approved', 'published')
         JOIN sababuka.organizations org ON org.id = b.organization_id
         JOIN sababuka.dataset_versions dv ON dv.id = pi.dataset_version_id
         JOIN sababuka.datasets d ON d.id = dv.dataset_id
         WHERE iv.status = 'active'
           AND i.is_active = true
           AND c.is_active = true
           AND c.review_status = 'approved'
           AND NOT EXISTS (SELECT 1 FROM sababuka.observation_publication_blocks nb WHERE nb.observation_id = obs.id AND nb.reason = 'not_chosen')
           AND ($1::uuid IS NULL OR pf.id = $1) AND ($2::uuid IS NULL OR per.id = $2)
         ORDER BY c.display_order, c.code, pi.display_order, i.name, i.code, pi.id`,
        [request.query.policy_focus_id ?? null, request.query.period_id ?? null],
      ),
    ]);
    return { generated_at: new Date().toISOString(), metrics: metrics.rows[0], items: items.rows };
  });

  app.get("/executive/analysis", async (request) => {
    requirePermission(request, "executive_dashboard.view");
    const result = await app.db.query<AnalysisRow>(
      `WITH eligible AS (
         SELECT DISTINCT ON (obs.id)
           obs.id, obs.indicator_version_id, obs.period_id, obs.geography_id,
           obs.numeric_value, obs.text_value, obs.quality_status, obs.notes, obs.source_name, obs.source_url,
           pub.title AS publication_title, pub.effective_at
         FROM sababuka.publication_items pi
         JOIN sababuka.publications pub ON pub.id = pi.publication_id AND pub.status = 'active'
         JOIN sababuka.observations obs ON obs.id = pi.observation_id AND obs.quality_status IN ('valid', 'warning')
         AND NOT EXISTS (SELECT 1 FROM sababuka.observation_publication_blocks nb WHERE nb.observation_id = obs.id AND nb.reason = 'not_chosen')
         JOIN sababuka.data_batches b ON b.id = obs.batch_id AND b.status IN ('approved', 'published')
         ORDER BY obs.id, pub.effective_at DESC, pub.id DESC
       )
       SELECT e.id::text AS observation_id, i.id::text AS indicator_id, i.code AS indicator_code,
              i.name AS indicator_name, c.name AS category_name, pf.name AS policy_focus_name,
              iv.direction, per.id::text AS period_id, per.label AS period_label,
              per.ends_on::text AS period_end, geo.id::text AS geography_id,
              geo.code AS geography_code, geo.name AS geography_name, geo.level AS geography_level,
              e.numeric_value, e.text_value, e.quality_status, e.notes, target.numeric_value AS target_value,
              unit.name AS unit, unit.symbol AS unit_symbol,
              COALESCE(e.source_name, iv.source_reference, 'Sumber belum dicatat') AS source_name,
              e.source_url, org.name AS organization_name, e.publication_title, e.effective_at::text
       FROM eligible e
       JOIN sababuka.indicator_versions iv ON iv.id = e.indicator_version_id AND iv.status = 'active'
       JOIN sababuka.indicators i ON i.id = iv.indicator_id AND i.is_active = true
       JOIN sababuka.categories c ON c.id = i.category_id AND c.is_active = true AND c.review_status = 'approved'
       LEFT JOIN sababuka.policy_focuses pf ON pf.id = c.policy_focus_id
       JOIN sababuka.periods per ON per.id = e.period_id
       JOIN sababuka.units unit ON unit.id = iv.unit_id
       LEFT JOIN sababuka.geographies geo ON geo.id = e.geography_id
       LEFT JOIN LATERAL (
         SELECT t.numeric_value
         FROM sababuka.targets t
         WHERE t.indicator_version_id = iv.id AND t.period_id = e.period_id
           AND (t.geography_id IS NOT DISTINCT FROM e.geography_id OR (e.geography_id IS NOT NULL AND t.geography_id IS NULL))
         ORDER BY (t.geography_id = e.geography_id) DESC
         LIMIT 1
       ) target ON true
       JOIN sababuka.data_batches batch ON batch.id = (SELECT obs.batch_id FROM sababuka.observations obs WHERE obs.id = e.id)
       JOIN sababuka.organizations org ON org.id = batch.organization_id
       ORDER BY i.name, geo.name NULLS FIRST, per.ends_on, e.id`,
    );

    const seriesMap = new Map<string, { indicator_id: string; indicator_code: string; indicator_name: string; category_name: string; policy_focus_name: string | null; direction: AnalysisRow["direction"]; unit: string; unit_symbol: string | null; geography_id: string | null; geography_code: string | null; geography_name: string; geography_level: string; points: Array<Record<string, unknown>> }>();
    for (const row of result.rows) {
      if (row.numeric_value === null) continue;
      const key = `${row.indicator_id}:${row.geography_id ?? "regency"}`;
      const current = seriesMap.get(key) ?? {
        indicator_id: row.indicator_id, indicator_code: row.indicator_code, indicator_name: row.indicator_name,
        category_name: row.category_name, policy_focus_name: row.policy_focus_name, direction: row.direction,
        unit: row.unit, unit_symbol: row.unit_symbol, geography_id: row.geography_id,
        geography_code: row.geography_code, geography_name: row.geography_name ?? "Kabupaten Kapuas",
        geography_level: row.geography_level ?? "regency", points: [],
      };
      current.points.push({ observation_id: row.observation_id, period_id: row.period_id, period_label: row.period_label,
        period_end: row.period_end, value: numeric(row.numeric_value), target: numeric(row.target_value),
        source_name: row.source_name, source_url: row.source_url, organization_name: row.organization_name,
        publication_title: row.publication_title, effective_at: row.effective_at });
      seriesMap.set(key, current);
    }
    const series = Array.from(seriesMap.values()).map((item) => {
      const points = item.points.sort((a, b) => String(a.period_end).localeCompare(String(b.period_end)));
      const first = Number(points[0]?.value); const last = Number(points.at(-1)?.value);
      const trend = points.length > 1 ? movement(first, last) : "insufficient";
      return { ...item, points, trend, performance: trend === "insufficient" ? "insufficient" : performance(item.direction, trend) };
    });

    const conflictGroups = new Map<string, AnalysisRow[]>();
    for (const row of result.rows) {
      const key = `${row.indicator_id}:${row.period_id}:${row.geography_id ?? "regency"}`;
      conflictGroups.set(key, [...(conflictGroups.get(key) ?? []), row]);
    }
    const reconciliation = Array.from(conflictGroups.values()).flatMap((rows) => {
      const sources = new Set(rows.map((row) => row.source_name));
      const values = new Set(rows.map((row) => row.numeric_value ?? `text:${row.text_value ?? ""}`));
      const sample = rows[0];
      if (!sample) return [];
      const sourceWarnings = rows.filter((row) => row.quality_status === "warning" && row.notes);
      if (!sourceWarnings.length && (sources.size < 2 || values.size < 2)) return [];
      return [{ indicator_id: sample.indicator_id, indicator_code: sample.indicator_code, indicator_name: sample.indicator_name,
        period_label: sample.period_label, geography_name: sample.geography_name ?? "Kabupaten Kapuas",
        status: "needs_reconciliation", sources: rows.map((row) => ({ source_name: row.source_name,
          organization_name: row.organization_name, value: numeric(row.numeric_value), text_value: row.text_value,
          source_url: row.source_url, publication_title: row.publication_title, quality_note: row.notes })) }];
    });

    const recommendations: Array<{ severity: "high" | "medium" | "info"; indicator_id: string; title: string; evidence: string; meaning: string; action: string }> = [];
    const byIndicator = new Map<string, typeof series>();
    for (const item of series) byIndicator.set(item.indicator_id, [...(byIndicator.get(item.indicator_id) ?? []), item]);
    for (const [indicatorId, indicatorSeries] of byIndicator) {
      const overall = indicatorSeries.find((item) => item.geography_level === "regency");
      const worseningRegions = indicatorSeries.filter((item) => item.geography_level === "district" && item.performance === "worsening");
      const sample = indicatorSeries[0];
      if (!sample) continue;
      if (overall?.performance === "improving" && worseningRegions.length) {
        recommendations.push({ severity: "high", indicator_id: indicatorId,
          title: `${sample.indicator_name}: tren kabupaten membaik, tetapi ${worseningRegions.length} kecamatan memburuk`,
          evidence: worseningRegions.map((item) => item.geography_name).join(", "),
          meaning: "Perbaikan agregat belum merata dan berisiko menutupi wilayah yang tertinggal.",
          action: `Prioritaskan verifikasi penyebab dan intervensi pada ${worseningRegions.map((item) => item.geography_name).join(", ")}.` });
      } else if (overall?.performance === "worsening") {
        recommendations.push({ severity: "high", indicator_id: indicatorId,
          title: `${sample.indicator_name}: tren kabupaten memburuk`,
          evidence: `${overall.points[0]?.period_label} ${overall.points[0]?.value} menjadi ${overall.points.at(-1)?.period_label} ${overall.points.at(-1)?.value}`,
          meaning: "Arah capaian bergerak berlawanan dengan arah kinerja indikator.",
          action: "Minta OPD pemilik menjelaskan faktor pendorong, lokasi terdampak, dan rencana koreksi pada periode berikutnya." });
      }
    }
    for (const item of reconciliation) recommendations.push({ severity: "high", indicator_id: item.indicator_id,
      title: `${item.indicator_name}: data perlu direkonsiliasi`, evidence: `${item.period_label} · ${item.geography_name}${item.sources.find((source) => source.quality_note)?.quality_note ? ` · ${item.sources.find((source) => source.quality_note)?.quality_note}` : ""}`,
      meaning: "Angka belum aman dijadikan dasar keputusan tunggal sebelum definisi, perhitungan, periode, dan sumber disamakan.",
      action: "Tandai untuk rekonsiliasi BAPPERIDA bersama OPD pemilik dan Walidata; pertahankan seluruh versi serta catat nilai rujukan yang disepakati." });

    return { generated_at: new Date().toISOString(), methodology: {
      trend: "Membandingkan nilai antarperiode dan menilai arahnya sesuai karakter indikator (naik, turun, atau dipertahankan).",
      region: "Membandingkan nilai pada tingkat wilayah yang benar-benar tersedia; angka kabupaten tidak diturunkan menjadi angka kecamatan.",
      consistency: "Membandingkan nilai indikator, periode, dan wilayah yang sama dari sumber berbeda; setiap perbedaan ditandai untuk rekonsiliasi.",
      decision: "Menggabungkan tren, kesenjangan wilayah, target, dan konsistensi sumber menjadi arti kebijakan serta tindakan yang dapat ditindaklanjuti.",
      causality_guard: "Sistem tidak menyimpulkan sebab-akibat hanya dari korelasi. Jawaban 'mengapa' harus didukung dimensi, catatan OPD, atau sumber pendukung yang terverifikasi.",
    }, items: result.rows, series, reconciliation, recommendations };
  });
}
