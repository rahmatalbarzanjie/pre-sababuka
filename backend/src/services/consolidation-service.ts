import type { Database, QueryResultRow } from "../database.js";
import { ApiError } from "../errors.js";
import type { AuthContext } from "../types/auth.js";
import { recordAudit, type AuditContext } from "./audit-service.js";

export type ConflictStatus = "open" | "resolved" | "all";

export interface ConflictDecisionInput { chosen_observation_id: string; note: string }

type Row = QueryResultRow & Record<string, unknown>;

function isGlobal(auth: AuthContext): boolean {
  return auth.user.roles.some((role) => role.scope_type === "global");
}

function organizationScope(auth: AuthContext): string[] {
  return [...new Set([
    ...auth.user.organizations.map((organization) => organization.id),
    ...auth.user.roles.flatMap((role) => role.organization_id ? [role.organization_id] : []),
  ])];
}

/**
 * Konsolidasi nilai antarsumber. Sistem hanya mendeteksi dan mencatat keputusan; tidak pernah memilih nilai
 * sendiri. Nilai identik dari sumber berbeda bukan konflik dan tetap menjadi baris-baris bersumber.
 */
export class ConsolidationService {
  constructor(private readonly db: Database) {}

  async list(auth: AuthContext, status: ConflictStatus) {
    const global = isGlobal(auth);
    const scope = organizationScope(auth);
    const conflicts = await this.db.query<Row>(
      `SELECT c.slot_id::text, c.status, c.decision_id::text, c.chosen_observation_id::text, c.decision_note,
              c.decided_at::text, decider.full_name AS decided_by_name,
              i.code AS indicator_code, i.name AS indicator_name, per.label AS period_label,
              geo.name AS geography_name, u.name AS unit, u.symbol AS unit_symbol,
              i.owner_organization_id::text AS owner_organization_id, owner.name AS owner_organization_name,
              c.observation_ids::text[] AS observation_ids
       FROM sababuka.observation_conflicts c
       JOIN sababuka.indicator_versions iv ON iv.id = c.indicator_version_id
       JOIN sababuka.indicators i ON i.id = iv.indicator_id
       JOIN sababuka.units u ON u.id = iv.unit_id
       JOIN sababuka.periods per ON per.id = c.period_id
       LEFT JOIN sababuka.geographies geo ON geo.id = c.geography_id
       LEFT JOIN sababuka.organizations owner ON owner.id = i.owner_organization_id
       LEFT JOIN sababuka.users decider ON decider.id = c.decided_by
       WHERE ($1::text = 'all' OR c.status = $1::text)
         AND ($2::boolean OR i.owner_organization_id = ANY($3::uuid[]))
       ORDER BY (c.status = 'open') DESC, per.starts_on DESC, i.name, c.slot_id`,
      [status, global, scope],
    );
    const ids = [...new Set(conflicts.rows.flatMap((row) => row.observation_ids as string[]))];
    const observations = ids.length
      ? await this.db.query<Row>(
        `SELECT o.id::text, o.numeric_value, o.text_value, o.source_name, o.source_url, o.source_status,
                o.source_retrieved_at::text, o.created_at::text, o.notes, b.submission_method,
                org.name AS organization_name
         FROM sababuka.observations o
         JOIN sababuka.data_batches b ON b.id = o.batch_id
         JOIN sababuka.organizations org ON org.id = b.organization_id
         WHERE o.id = ANY($1::uuid[])
         ORDER BY o.created_at, o.id`, [ids])
      : { rows: [] as Row[] };
    const byId = new Map(observations.rows.map((row) => [row.id as string, row]));
    const data = conflicts.rows.map(({ observation_ids, ...row }) => ({
      ...row,
      observations: (observation_ids as string[]).map((id) => byId.get(id)).filter(Boolean),
    }));
    const counts = await this.db.query<{ status: string; total: string }>(
      `SELECT c.status, count(*)::text AS total
       FROM sababuka.observation_conflicts c
       JOIN sababuka.indicator_versions iv ON iv.id = c.indicator_version_id
       JOIN sababuka.indicators i ON i.id = iv.indicator_id
       WHERE ($1::boolean OR i.owner_organization_id = ANY($2::uuid[]))
       GROUP BY c.status`, [global, scope]);
    const total = (key: string) => Number(counts.rows.find((row) => row.status === key)?.total ?? 0);
    return { open_count: total("open"), resolved_count: total("resolved"), data };
  }

  async decide(auth: AuthContext, input: ConflictDecisionInput, audit: AuditContext) {
    const note = input.note.trim();
    if (note.length < 10) throw new ApiError(400, "VALIDATION_ERROR", "Catatan alasan minimal 10 karakter agar keputusan dapat diaudit.");
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      const slot = await client.query<Row>(
        `SELECT c.slot_id::text, c.status, c.indicator_version_id::text, c.period_id::text, c.geography_id::text,
                encode(c.dimension_hash, 'hex') AS dimension_hash_hex, c.observation_ids::text[] AS observation_ids,
                c.chosen_observation_id::text AS previous_chosen_observation_id, i.owner_organization_id::text AS owner_organization_id
         FROM sababuka.observation_conflicts c
         JOIN sababuka.indicator_versions iv ON iv.id = c.indicator_version_id
         JOIN sababuka.indicators i ON i.id = iv.indicator_id
         WHERE $1::uuid = ANY(c.observation_ids)`, [input.chosen_observation_id]);
      const conflict = slot.rows[0];
      if (!conflict) throw new ApiError(404, "NOT_FOUND", "Capaian ini tidak sedang berada dalam konflik antarsumber.");
      const owner = conflict.owner_organization_id as string | null;
      if (!isGlobal(auth) && !(owner && organizationScope(auth).includes(owner))) {
        throw new ApiError(403, "SCOPE_DENIED", "Hanya BAPPERIDA atau OPD pemilik indikator yang dapat menetapkan nilai valid.");
      }
      const saved = await client.query<Row>(
        `INSERT INTO sababuka.observation_conflict_decisions
           (indicator_version_id, period_id, geography_id, dimension_hash, chosen_observation_id, considered_observation_ids, note, decided_by)
         VALUES ($1, $2, $3, decode($4, 'hex'), $5, $6::uuid[], $7, $8)
         ON CONFLICT (indicator_version_id, period_id, geography_id, dimension_hash) DO UPDATE
           SET chosen_observation_id = EXCLUDED.chosen_observation_id,
               considered_observation_ids = EXCLUDED.considered_observation_ids,
               note = EXCLUDED.note, decided_by = EXCLUDED.decided_by, decided_at = now()
         RETURNING id::text`,
        [conflict.indicator_version_id, conflict.period_id, conflict.geography_id, conflict.dimension_hash_hex,
          input.chosen_observation_id, conflict.observation_ids, note, auth.user.id]);
      const decisionId = saved.rows[0]!.id as string;
      await recordAudit(client, {
        ...audit, eventType: "consolidation.decided", entityType: "observation_conflict", entityId: conflict.slot_id as string,
        beforeData: { status: conflict.status, chosen_observation_id: conflict.previous_chosen_observation_id },
        afterData: { status: "resolved", chosen_observation_id: input.chosen_observation_id, decision_id: decisionId },
        metadata: { observation_ids: conflict.observation_ids, note },
      });
      await client.query("COMMIT");
      return { decision_id: decisionId, slot_id: conflict.slot_id, status: "resolved" as const, chosen_observation_id: input.chosen_observation_id };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }
}
