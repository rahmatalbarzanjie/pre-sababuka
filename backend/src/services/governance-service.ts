import type { Database, QueryResultRow } from "../database.js";
import { ApiError } from "../errors.js";
import type { AuthContext } from "../types/auth.js";
import { recordAudit, type AuditContext } from "./audit-service.js";
import { notifyOrganization, notifyRole, notifyUser } from "./notification-service.js";

interface CountedRow extends QueryResultRow {
  total_count: string;
  metadata_complete_count?: string;
  active_count?: string;
}

export interface GovernancePageQuery {
  page: number;
  pageSize: number;
  search?: string | undefined;
  sortBy?: string | undefined;
  sortOrder?: "asc" | "desc" | undefined;
}

export interface DatasetPageQuery extends GovernancePageQuery {
  organizationId?: string | undefined;
}

export type CategoryTransitionAction = "submit" | "approve" | "reject" | "reopen";
/** Developer (termasuk saat bertindak sebagai peran lain) dikecualikan dari aturan pengaju/reviewer/verifikator yang sama atas keputusan pemilik (12 Nov 2026). */
function isDeveloperActor(auth: AuthContext): boolean {
  return Boolean(auth.user.simulation?.active)
    || auth.user.roles.some((role) => role.code === "superadmin" && role.scope_type === "global");
}

export type IndicatorTransitionAction = "submit" | "approve" | "verify" | "activate" | "retire";

export function buildAutoPublicationNumber(publicationKey: string, versionNumber: number): string {
  return `${publicationKey}-${versionNumber.toString().padStart(3, "0")}`;
}

export interface BulkTransitionResult {
  processed: Array<{ id: string; status: string }>;
  skipped: Array<{ id: string; reason: string }>;
}

export interface PolicyFocusInput {
  code: string;
  name: string;
  description?: string | null;
  display_order?: number;
}

export interface CategoryInput {
  code: string;
  name: string;
  description?: string | null;
  policy_focus_id?: string | null;
  parent_id?: string | null;
  display_order?: number;
}

export interface IndicatorOrganizationInput {
  organization_id: string;
  responsibility: "primary_producer" | "supporter" | "validator" | "curator";
  is_primary?: boolean;
}

export interface IndicatorTargetInput {
  period_id: string;
  numeric_value?: number | null;
  text_value?: string | null;
  notes?: string | null;
}

export interface IndicatorInput {
  code: string;
  kodref_ip?: string | null;
  name: string;
  category_id: string;
  owner_organization_id?: string | null;
  definition: string;
  formula?: string | null;
  unit_id: string;
  frequency: "annual" | "semester" | "quarter" | "monthly" | "weekly" | "event" | "custom";
  data_type: "number" | "integer" | "percentage" | "currency" | "text" | "boolean";
  direction?: "increase" | "decrease" | "maintain" | null;
  source_reference?: string | null;
  access_level?: "public" | "internal" | "restricted";
  effective_from: string;
  change_notes?: string | null;
  organizations?: IndicatorOrganizationInput[];
  targets?: IndicatorTargetInput[];
}

export interface OpdIndicatorProposalInput extends IndicatorInput {
  planning_document_type: "renstra" | "renja" | "other";
  planning_document_reference: string;
}

export interface IndicatorTechnicalMetadataInput {
  definition: string;
  formula?: string | null;
  unit_id: string;
  frequency: "annual" | "semester" | "quarter" | "monthly" | "weekly" | "event" | "custom";
  data_type: "number" | "integer" | "percentage" | "currency" | "text" | "boolean";
  direction?: "increase" | "decrease" | "maintain" | null;
  source_reference: string;
  change_notes?: string | null;
}

function pageEnvelope<T>(rows: (T & CountedRow)[], page: number, pageSize: number) {
  const total = Number(rows[0]?.total_count ?? 0);
  const metadataComplete = Number(rows[0]?.metadata_complete_count ?? 0);
  const active = Number(rows[0]?.active_count ?? 0);
  return {
    data: rows.map(({ total_count: _total, metadata_complete_count: _complete, active_count: _active, ...row }) => row),
    meta: {
      page,
      page_size: pageSize,
      total_items: total,
      total_pages: total ? Math.ceil(total / pageSize) : 0,
      metadata_complete_count: metadataComplete,
      active_count: active,
    },
  };
}

function isGlobal(auth: AuthContext): boolean {
  return auth.user.roles.some((role) => role.scope_type === "global");
}

function organizationScope(auth: AuthContext): string[] {
  return [...new Set([
    ...auth.user.organizations.map((organization) => organization.id),
    ...auth.user.roles.flatMap((role) => role.organization_id ? [role.organization_id] : []),
  ])];
}

function requireGlobal(auth: AuthContext): void {
  if (!isGlobal(auth)) throw new ApiError(403, "SCOPE_DENIED", "Pengelolaan master indikator memerlukan scope global.");
}

const INDICATOR_DRAFTER_ROLES = new Set(["superadmin", "indicator_author"]);
const CATEGORY_DRAFTER_ROLES = new Set(["superadmin", "category_author"]);

function requireCategoryDrafter(auth: AuthContext): void {
  if (!auth.user.roles.some((role) => CATEGORY_DRAFTER_ROLES.has(role.code))) {
    throw new ApiError(403, "PERMISSION_DENIED", "Hanya akun penyusun kategori yang dapat mengajukan kategori ke BAPPERIDA.");
  }
}

function requireIndicatorDrafter(auth: AuthContext): void {
  if (!auth.user.roles.some((role) => INDICATOR_DRAFTER_ROLES.has(role.code))) {
    throw new ApiError(403, "PERMISSION_DENIED", "Hanya role penyusun indikator yang dapat mengajukan definisi ke BAPPERIDA.");
  }
}

function translateDatabaseError(error: unknown): never {
  const code = (error as { code?: string }).code;
  if (code === "23505") throw new ApiError(409, "CONFLICT", "Kode atau identitas data sudah digunakan.");
  if (code === "23503") throw new ApiError(400, "VALIDATION_ERROR", "Referensi kategori, unit, OPD, atau periode tidak valid.");
  if (code === "23514" || code === "22P02") throw new ApiError(400, "VALIDATION_ERROR", "Nilai tidak memenuhi aturan data.");
  throw error;
}

export class GovernanceService {
  constructor(private readonly db: Database) {}

  async listDatasets(auth: AuthContext, query: DatasetPageQuery) {
    const scopedOrganizations = organizationScope(auth);
    const result = await this.db.query<CountedRow & Record<string, unknown>>(
      `SELECT d.id::text, d.code, d.title, d.owner_organization_id::text, d.source_id::text,
              d.is_active, d.created_at::text, d.updated_at::text,
              owner.name AS owner_organization_name,
              source.name AS source_name, source.source_type,
              version.id::text AS version_id, version.version_number, version.name AS version_name,
              version.status AS version_status, version.visibility, version.metadata_json AS metadata,
              version.effective_from::text, version.effective_until::text,
              COALESCE(resources.resource_count, 0)::int AS resource_count,
              COALESCE(indicators.indicator_count, 0)::int AS indicator_count,
              count(*) OVER()::text AS total_count,
              count(*) FILTER (WHERE version.status IN ('approved', 'active')) OVER()::text AS active_count
       FROM sababuka.datasets d
       JOIN sababuka.organizations owner ON owner.id = d.owner_organization_id
       JOIN sababuka.data_sources source ON source.id = d.source_id
       LEFT JOIN LATERAL (
         SELECT dv.* FROM sababuka.dataset_versions dv
         WHERE dv.dataset_id = d.id
         ORDER BY dv.version_number DESC LIMIT 1
       ) version ON true
       LEFT JOIN LATERAL (
         SELECT count(*)::int AS resource_count FROM sababuka.data_resources dr
         WHERE dr.dataset_version_id = version.id
       ) resources ON true
       LEFT JOIN LATERAL (
         SELECT count(*)::int AS indicator_count FROM sababuka.indicator_datasets link
         WHERE link.dataset_version_id = version.id
       ) indicators ON true
       WHERE d.archived_at IS NULL
         AND ($1::text IS NULL OR d.code ILIKE '%' || $1 || '%' OR d.title ILIKE '%' || $1 || '%'
              OR owner.name ILIKE '%' || $1 || '%' OR source.name ILIKE '%' || $1 || '%')
         AND ($2::uuid IS NULL OR d.owner_organization_id = $2)
         AND ($3::boolean OR d.owner_organization_id = ANY($4::uuid[]))
       ORDER BY d.updated_at DESC, d.title ASC
       LIMIT $5 OFFSET $6`,
      [query.search?.trim() || null, query.organizationId ?? null, isGlobal(auth), scopedOrganizations, query.pageSize, (query.page - 1) * query.pageSize],
    );
    return pageEnvelope(result.rows, query.page, query.pageSize);
  }

  async listPolicyFocuses(query: GovernancePageQuery) {
    const result = await this.db.query<CountedRow & Record<string, unknown>>(
      `SELECT id::text, code, name, description, display_order, is_active,
              created_at::text, updated_at::text, count(*) OVER()::text AS total_count
       FROM sababuka.policy_focuses
       WHERE archived_at IS NULL
         AND ($1::text IS NULL OR code ILIKE '%' || $1 || '%' OR name ILIKE '%' || $1 || '%')
       ORDER BY display_order, name, code LIMIT $2 OFFSET $3`,
      [query.search?.trim() || null, query.pageSize, (query.page - 1) * query.pageSize],
    );
    return pageEnvelope(result.rows, query.page, query.pageSize);
  }

  async createPolicyFocus(auth: AuthContext, input: PolicyFocusInput, audit: AuditContext) {
    requireGlobal(auth);
    try {
      const result = await this.db.query<QueryResultRow & Record<string, unknown>>(
        `INSERT INTO sababuka.policy_focuses (code, name, description, display_order, created_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id::text, code, name, description, display_order, is_active, created_at::text, updated_at::text`,
        [input.code, input.name, input.description ?? null, input.display_order ?? 0, auth.user.id],
      );
      const focus = result.rows[0]!;
      await recordAudit(this.db, { ...audit, eventType: "policy_focus.created", entityType: "policy_focus", entityId: focus.id as string, afterData: focus });
      return focus;
    } catch (error) { translateDatabaseError(error); }
  }

  async listCategories(query: GovernancePageQuery & { policyFocusId?: string | undefined }) {
    const orderColumns: Record<string, string> = { hierarchy: "c.display_order", name: "c.name", focus: "pf.name", count: "indicator_count", status: "c.review_status", updated_at: "c.updated_at" };
    const orderColumn = orderColumns[query.sortBy ?? "updated_at"] ?? orderColumns.updated_at!;
    const orderDirection = query.sortOrder === "asc" ? "ASC" : "DESC";
    const result = await this.db.query<CountedRow & Record<string, unknown>>(
      `SELECT c.id::text, c.code, c.name, c.description, c.policy_focus_id::text,
              pf.name AS policy_focus_name, c.parent_id::text, c.display_order, c.is_active,
              c.review_status, c.submitted_by::text, c.submitted_at::text,
              c.decided_by::text, c.decided_at::text, c.decision_notes, c.updated_at::text,
              count(i.id)::int AS indicator_count, count(*) OVER()::text AS total_count
       FROM sababuka.categories c
       LEFT JOIN sababuka.policy_focuses pf ON pf.id = c.policy_focus_id
       LEFT JOIN sababuka.indicators i ON i.category_id = c.id AND i.archived_at IS NULL
       WHERE c.archived_at IS NULL
         AND ($1::text IS NULL OR c.code ILIKE '%' || $1 || '%' OR c.name ILIKE '%' || $1 || '%')
         AND ($2::uuid IS NULL OR c.policy_focus_id = $2)
       GROUP BY c.id, pf.name
       ORDER BY ${orderColumn} ${orderDirection} NULLS LAST, c.display_order, c.code, c.name LIMIT $3 OFFSET $4`,
      [query.search?.trim() || null, query.policyFocusId ?? null, query.pageSize, (query.page - 1) * query.pageSize],
    );
    return pageEnvelope(result.rows, query.page, query.pageSize);
  }

  async createCategory(auth: AuthContext, input: CategoryInput, audit: AuditContext) {
    requireGlobal(auth);
    try {
      const result = await this.db.query<QueryResultRow & Record<string, unknown>>(
        `INSERT INTO sababuka.categories
           (code, name, description, policy_focus_id, parent_id, display_order, review_status, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, 'draft', $7)
         RETURNING id::text, code, name, description, policy_focus_id::text, parent_id::text,
                   display_order, is_active, review_status, submitted_at::text,
                   decided_at::text, decision_notes, created_at::text, updated_at::text`,
        [input.code, input.name, input.description ?? null, input.policy_focus_id ?? null, input.parent_id ?? null, input.display_order ?? 0, auth.user.id],
      );
      const category = result.rows[0]!;
      await recordAudit(this.db, { ...audit, eventType: "category.created", entityType: "category", entityId: category.id as string, afterData: category });
      return category;
    } catch (error) { translateDatabaseError(error); }
  }

  async transitionCategory(
    auth: AuthContext,
    categoryId: string,
    action: CategoryTransitionAction,
    audit: AuditContext,
  ) {
    requireGlobal(auth);
    if (["submit", "reopen"].includes(action)) requireCategoryDrafter(auth);
    const transitions = {
      submit: { from: "draft", to: "in_review" },
      approve: { from: "in_review", to: "approved" },
      reject: { from: "in_review", to: "rejected" },
      reopen: { from: "rejected", to: "draft" },
    } as const;
    const transition = transitions[action];
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query<QueryResultRow & { id: string; code: string; name: string; review_status: string; submitted_by: string | null }>(
        `SELECT id::text, code, name, review_status, submitted_by::text FROM sababuka.categories
         WHERE id = $1 AND archived_at IS NULL FOR UPDATE`,
        [categoryId],
      );
      if (!current.rowCount) throw new ApiError(404, "NOT_FOUND", "Kategori tidak ditemukan.");
      if (current.rows[0]!.review_status !== transition.from) {
        throw new ApiError(409, "CONFLICT", `Aksi ${action} hanya dapat dijalankan dari status ${transition.from}.`);
      }
      if (["approve", "reject"].includes(action) && current.rows[0]!.submitted_by === auth.user.id && !isDeveloperActor(auth)) {
        throw new ApiError(409, "CONFLICT", "Pengaju kategori tidak boleh menjadi pengambil keputusan pada kategori yang sama.");
      }
      const result = await client.query<QueryResultRow & Record<string, unknown>>(
        `UPDATE sababuka.categories
         SET review_status = $2,
             submitted_by = CASE WHEN $3 = 'submit' THEN $4 ELSE submitted_by END,
             submitted_at = CASE WHEN $3 = 'submit' THEN now() ELSE submitted_at END,
             decided_by = CASE WHEN $3 IN ('approve', 'reject') THEN $4 WHEN $3 = 'reopen' THEN NULL ELSE decided_by END,
             decided_at = CASE WHEN $3 IN ('approve', 'reject') THEN now() WHEN $3 = 'reopen' THEN NULL ELSE decided_at END,
             decision_notes = CASE WHEN $3 = 'reject' THEN 'Kategori dikembalikan untuk perbaikan.' WHEN $3 = 'reopen' THEN NULL ELSE decision_notes END
         WHERE id = $1
         RETURNING id::text, code, name, review_status, submitted_by::text, submitted_at::text,
                   decided_by::text, decided_at::text, decision_notes, updated_at::text`,
        [categoryId, transition.to, action, auth.user.id],
      );
      await recordAudit(client, {
        ...audit, eventType: `category.${action}`, entityType: "category", entityId: categoryId,
        beforeData: { review_status: transition.from }, afterData: result.rows[0]!,
      });
      const category = current.rows[0]!;
      const categoryEntity = { entityType: "category", entityId: categoryId };
      if (action === "submit") {
        await notifyRole(client, "bapperida", {
          ...categoryEntity, type: "category.submitted", title: "Kategori menunggu verifikasi BAPPERIDA",
          message: `Kategori ${category.name} diajukan untuk ditinjau.`,
        }, auth.user.id);
      } else if ((action === "approve" || action === "reject") && category.submitted_by) {
        await notifyUser(client, category.submitted_by, {
          ...categoryEntity,
          type: `category.${action}`,
          title: action === "approve" ? "Kategori disetujui BAPPERIDA" : "Kategori perlu diperbaiki",
          message: action === "approve"
            ? `Kategori ${category.name} telah disetujui. Indikator di dalamnya kini dapat diajukan.`
            : `Kategori ${category.name} dikembalikan untuk diperbaiki.`,
        });
      }
      await client.query("COMMIT");
      return result.rows[0]!;
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof ApiError) throw error;
      translateDatabaseError(error);
    } finally { client.release(); }
  }

  async bulkTransitionCategories(
    auth: AuthContext,
    categoryIds: string[],
    action: CategoryTransitionAction,
    audit: AuditContext,
  ): Promise<BulkTransitionResult> {
    const result: BulkTransitionResult = { processed: [], skipped: [] };
    for (const id of [...new Set(categoryIds)]) {
      try {
        const changed = await this.transitionCategory(auth, id, action, audit) as { review_status?: string };
        result.processed.push({ id, status: changed.review_status ?? "" });
      } catch (error) {
        if (error instanceof ApiError) result.skipped.push({ id, reason: error.message });
        else throw error;
      }
    }
    return result;
  }

  async submitAllDraftCategories(
    auth: AuthContext,
    audit: AuditContext,
  ): Promise<BulkTransitionResult> {
    requireGlobal(auth);
    requireCategoryDrafter(auth);
    const drafts = await this.db.query<{ id: string }>(
      `SELECT id::text
       FROM sababuka.categories
       WHERE archived_at IS NULL
         AND is_active = true
         AND review_status = 'draft'
       ORDER BY display_order, name`,
    );
    return this.bulkTransitionCategories(auth, drafts.rows.map((item) => item.id), "submit", audit);
  }

  async listUnits() {
    const result = await this.db.query(`SELECT id::text, code, name, symbol, decimal_places FROM sababuka.units WHERE is_active = true ORDER BY name`);
    return { data: result.rows };
  }

  async listPeriods() {
    const result = await this.db.query(`SELECT id::text, code, label, period_type, starts_on::text, ends_on::text FROM sababuka.periods ORDER BY starts_on DESC`);
    return { data: result.rows };
  }

  async listIndicators(auth: AuthContext, query: GovernancePageQuery & { policyFocusId?: string | undefined; categoryId?: string | undefined; organizationId?: string | undefined; status?: string | undefined; completeness?: string | undefined }) {
    const scope = organizationScope(auth);
    const orderColumns: Record<string, string> = { hierarchy: "pf.display_order", name: "i.name", focus: "pf.name", owner: "owner.name", metadata: "metadata_complete", targets: "target_count", status: "iv.status", updated_at: "i.updated_at" };
    const orderColumn = orderColumns[query.sortBy ?? "updated_at"] ?? orderColumns.updated_at!;
    const orderDirection = query.sortOrder === "asc" ? "ASC" : "DESC";
    const result = await this.db.query<CountedRow & Record<string, unknown>>(
      `SELECT i.id::text, i.code, i.kodref_ip, i.name, i.category_id::text, c.code AS category_code, c.name AS category_name,
              c.policy_focus_id::text, pf.code AS policy_focus_code, pf.name AS policy_focus_name,
              c.review_status AS category_review_status,
              i.owner_organization_id::text, owner.name AS owner_organization_name, i.is_active, i.updated_at::text,
              i.origin_type, i.planning_document_type, i.planning_document_reference,
              i.proposed_by_organization_id::text,
              iv.id::text AS version_id, iv.version_number, iv.definition, iv.formula,
              iv.frequency, iv.data_type, iv.direction, iv.source_reference,
              iv.access_level, iv.effective_from::text, iv.status,
              u.id::text AS unit_id, u.name AS unit_name, u.symbol AS unit_symbol,
              COALESCE(orgs.items, '[]'::json) AS organizations,
              COALESCE(targets.items, '[]'::json) AS targets,
              COALESCE(targets.target_count, 0)::int AS target_count,
              (length(trim(iv.definition)) >= 5) AS has_definition,
              (i.owner_organization_id IS NOT NULL) AS has_owner,
              (iv.unit_id IS NOT NULL) AS has_unit,
              (length(trim(COALESCE(iv.source_reference, ''))) > 0) AS has_source,
              (COALESCE(targets.target_count, 0) >= 1) AS has_rpjmd_targets,
              (length(trim(iv.definition)) >= 5 AND i.owner_organization_id IS NOT NULL
                AND iv.unit_id IS NOT NULL AND length(trim(COALESCE(iv.source_reference, ''))) > 0
                AND COALESCE(targets.target_count, 0) >= 1) AS metadata_complete,
              count(*) OVER()::text AS total_count,
              count(*) FILTER (WHERE length(trim(iv.definition)) >= 5
                AND i.owner_organization_id IS NOT NULL AND iv.unit_id IS NOT NULL
                AND length(trim(COALESCE(iv.source_reference, ''))) > 0
                AND COALESCE(targets.target_count, 0) >= 1) OVER()::text AS metadata_complete_count,
              count(*) FILTER (WHERE iv.status = 'active') OVER()::text AS active_count
       FROM sababuka.indicators i
       JOIN sababuka.categories c ON c.id = i.category_id
       LEFT JOIN sababuka.policy_focuses pf ON pf.id = c.policy_focus_id
       LEFT JOIN sababuka.organizations owner ON owner.id = i.owner_organization_id
       JOIN LATERAL (
         SELECT v.* FROM sababuka.indicator_versions v
         WHERE v.indicator_id = i.id ORDER BY v.version_number DESC LIMIT 1
       ) iv ON true
       JOIN sababuka.units u ON u.id = iv.unit_id
       LEFT JOIN LATERAL (
         SELECT json_agg(json_build_object('organization_id', io.organization_id::text, 'organization_name', o.name,
                  'responsibility', io.responsibility, 'is_primary', io.is_primary) ORDER BY io.is_primary DESC, o.name) AS items
         FROM sababuka.indicator_organizations io JOIN sababuka.organizations o ON o.id = io.organization_id
         WHERE io.indicator_version_id = iv.id
       ) orgs ON true
       LEFT JOIN LATERAL (
         SELECT json_agg(json_build_object('id', t.id::text, 'period_id', p.id::text, 'period_code', p.code,
                  'period_label', p.label, 'numeric_value', t.numeric_value, 'text_value', t.text_value, 'notes', t.notes)
                  ORDER BY p.starts_on) AS items, count(*)::int AS target_count
         FROM sababuka.targets t JOIN sababuka.periods p ON p.id = t.period_id
         WHERE t.indicator_version_id = iv.id AND t.geography_id IS NULL AND t.dimension_values = '{}'::jsonb
       ) targets ON true
       WHERE i.archived_at IS NULL
         AND ($1::text IS NULL OR i.code ILIKE '%' || $1 || '%' OR i.kodref_ip ILIKE '%' || $1 || '%' OR i.name ILIKE '%' || $1 || '%')
         AND ($2::uuid IS NULL OR i.category_id = $2)
         AND ($3::uuid IS NULL OR c.policy_focus_id = $3)
         AND ($4::uuid IS NULL OR i.owner_organization_id = $4 OR EXISTS (
           SELECT 1 FROM sababuka.indicator_organizations x WHERE x.indicator_version_id = iv.id AND x.organization_id = $4))
         AND ($5::text IS NULL OR iv.status = $5)
         AND ($6::text IS NULL OR ($6 = 'complete' AND length(trim(iv.definition)) >= 5
              AND i.owner_organization_id IS NOT NULL AND iv.unit_id IS NOT NULL
              AND length(trim(COALESCE(iv.source_reference, ''))) > 0 AND COALESCE(targets.target_count, 0) >= 1)
            OR ($6 = 'incomplete' AND NOT (length(trim(iv.definition)) >= 5
              AND i.owner_organization_id IS NOT NULL AND iv.unit_id IS NOT NULL
              AND length(trim(COALESCE(iv.source_reference, ''))) > 0 AND COALESCE(targets.target_count, 0) >= 1)))
         AND ($7::boolean OR i.owner_organization_id = ANY($8::uuid[]) OR EXISTS (
           SELECT 1 FROM sababuka.indicator_organizations x WHERE x.indicator_version_id = iv.id AND x.organization_id = ANY($8::uuid[])))
       ORDER BY ${orderColumn} ${orderDirection} NULLS LAST, pf.display_order, c.display_order, c.code, i.name, i.code LIMIT $9 OFFSET $10`,
      [query.search?.trim() || null, query.categoryId ?? null, query.policyFocusId ?? null,
       query.organizationId ?? null, query.status ?? null, query.completeness ?? null,
       isGlobal(auth), scope, query.pageSize, (query.page - 1) * query.pageSize],
    );
    return pageEnvelope(result.rows, query.page, query.pageSize);
  }

  async createIndicator(
    auth: AuthContext,
    input: IndicatorInput | OpdIndicatorProposalInput,
    audit: AuditContext,
    originType: "rpjmd_master" | "opd_manual" = "rpjmd_master",
  ) {
    const scope = organizationScope(auth);
    if (originType === "rpjmd_master") requireGlobal(auth);
    else if (!input.owner_organization_id || !scope.includes(input.owner_organization_id)) {
      throw new ApiError(403, "SCOPE_DENIED", "OPD hanya dapat mengusulkan indikator untuk organisasinya sendiri.");
    }
    const proposalInput = originType === "opd_manual" ? input as OpdIndicatorProposalInput : null;
    if (proposalInput && proposalInput.planning_document_reference.trim().length < 3) {
      throw new ApiError(400, "VALIDATION_ERROR", "Referensi dokumen perencanaan wajib diisi.");
    }
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      const effectiveOrganizations: IndicatorOrganizationInput[] = originType === "opd_manual"
        ? [{ organization_id: input.owner_organization_id!, responsibility: "primary_producer", is_primary: true }]
        : input.organizations ?? [];
      const indicatorResult = await client.query<QueryResultRow & Record<string, unknown>>(
        `INSERT INTO sababuka.indicators
           (code, kodref_ip, name, category_id, owner_organization_id, origin_type, planning_document_type,
            planning_document_reference, proposed_by_organization_id, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id::text, code, kodref_ip, name, category_id::text, owner_organization_id::text, is_active`,
        [input.code, input.kodref_ip?.trim() || null, input.name, input.category_id, input.owner_organization_id ?? null, originType,
         proposalInput?.planning_document_type ?? null, proposalInput?.planning_document_reference.trim() ?? null,
         originType === "opd_manual" ? input.owner_organization_id : null, auth.user.id],
      );
      const indicator = indicatorResult.rows[0]!;
      const versionResult = await client.query<QueryResultRow & { id: string }>(
        `INSERT INTO sababuka.indicator_versions
           (indicator_id, version_number, definition, formula, unit_id, frequency, data_type,
            direction, source_reference, access_level, effective_from, status, change_notes, created_by)
         VALUES ($1, 1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'draft', $11, $12)
         RETURNING id::text`,
        [indicator.id, input.definition, input.formula ?? null, input.unit_id, input.frequency, input.data_type,
         input.direction ?? null, input.source_reference ?? null, input.access_level ?? "internal",
         input.effective_from, input.change_notes ?? null, auth.user.id],
      );
      const versionId = versionResult.rows[0]!.id;
      for (const organization of effectiveOrganizations) {
        await client.query(
          `INSERT INTO sababuka.indicator_organizations
             (indicator_version_id, organization_id, responsibility, is_primary) VALUES ($1, $2, $3, $4)`,
          [versionId, organization.organization_id, organization.responsibility, organization.is_primary ?? false],
        );
      }
      for (const target of input.targets ?? []) {
        if ((target.numeric_value == null) === (target.text_value == null || target.text_value === "")) {
          throw new ApiError(400, "VALIDATION_ERROR", "Setiap target harus memiliki tepat satu nilai numerik atau teks.");
        }
        await client.query(
          `INSERT INTO sababuka.targets
             (indicator_version_id, period_id, numeric_value, text_value, notes, created_by)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [versionId, target.period_id, target.numeric_value ?? null, target.text_value || null, target.notes ?? null, auth.user.id],
        );
      }
      await recordAudit(client, {
        ...audit, eventType: "indicator.created", entityType: "indicator", entityId: indicator.id as string,
        organizationId: input.owner_organization_id ?? null,
        afterData: { ...indicator, origin_type: originType, planning_document_type: proposalInput?.planning_document_type ?? null,
          planning_document_reference: proposalInput?.planning_document_reference.trim() ?? null,
          version_id: versionId, status: "draft", organizations: effectiveOrganizations, targets: input.targets ?? [] },
      });
      await client.query("COMMIT");
      return { ...indicator, version_id: versionId, version_number: 1, status: "draft" };
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof ApiError) throw error;
      translateDatabaseError(error);
    } finally { client.release(); }
  }

  async updateIndicatorDraft(
    auth: AuthContext,
    indicatorId: string,
    input: IndicatorInput | OpdIndicatorProposalInput,
    audit: AuditContext,
    originType: "rpjmd_master" | "opd_manual" = "rpjmd_master",
  ) {
    if (originType === "rpjmd_master") requireGlobal(auth);
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query<QueryResultRow & Record<string, unknown>>(
        `SELECT i.id::text, i.code, i.kodref_ip, i.name, i.category_id::text, i.owner_organization_id::text,
                i.origin_type, i.proposed_by_organization_id::text,
                iv.id::text AS version_id, iv.version_number, iv.definition, iv.formula,
                iv.unit_id::text, iv.frequency, iv.data_type, iv.direction, iv.source_reference,
                iv.access_level, iv.effective_from::text, iv.status, iv.change_notes
         FROM sababuka.indicators i
         JOIN LATERAL (
           SELECT v.* FROM sababuka.indicator_versions v
           WHERE v.indicator_id = i.id ORDER BY v.version_number DESC LIMIT 1
         ) iv ON true
         WHERE i.id = $1 AND i.archived_at IS NULL
         FOR UPDATE OF i`,
        [indicatorId],
      );
      if (!current.rowCount) throw new ApiError(404, "NOT_FOUND", "Indikator tidak ditemukan.");
      if (current.rows[0]!.origin_type !== originType) {
        throw new ApiError(409, "CONFLICT", "Jenis indikator tidak sesuai dengan jalur perubahan yang digunakan.");
      }
      if (originType === "opd_manual") {
        const scope = organizationScope(auth);
        if (!current.rows[0]!.proposed_by_organization_id || !scope.includes(current.rows[0]!.proposed_by_organization_id as string)
          || input.owner_organization_id !== current.rows[0]!.proposed_by_organization_id) {
          throw new ApiError(403, "SCOPE_DENIED", "Draf hanya dapat diubah oleh OPD pengusul.");
        }
      }
      if (current.rows[0]!.status !== "draft") {
        throw new ApiError(409, "CONFLICT", "Hanya versi indikator berstatus draft yang dapat diubah langsung.");
      }
      const versionId = current.rows[0]!.version_id as string;
      const effectiveOrganizations: IndicatorOrganizationInput[] = originType === "opd_manual"
        ? [{ organization_id: input.owner_organization_id!, responsibility: "primary_producer", is_primary: true }]
        : input.organizations ?? [];
      await client.query(
        `UPDATE sababuka.indicators
         SET code = $2, kodref_ip = $3, name = $4, category_id = $5, owner_organization_id = $6,
             planning_document_type = CASE WHEN origin_type = 'opd_manual' THEN $7 ELSE planning_document_type END,
             planning_document_reference = CASE WHEN origin_type = 'opd_manual' THEN $8 ELSE planning_document_reference END
         WHERE id = $1`,
        [indicatorId, input.code, input.kodref_ip?.trim() || null, input.name, input.category_id, input.owner_organization_id ?? null,
         originType === "opd_manual" ? (input as OpdIndicatorProposalInput).planning_document_type : null,
         originType === "opd_manual" ? (input as OpdIndicatorProposalInput).planning_document_reference.trim() : null],
      );
      await client.query(
        `UPDATE sababuka.indicator_versions
         SET definition = $2, formula = $3, unit_id = $4, frequency = $5, data_type = $6,
             direction = $7, source_reference = $8, access_level = $9, effective_from = $10,
             change_notes = $11
         WHERE id = $1`,
        [versionId, input.definition, input.formula ?? null, input.unit_id, input.frequency, input.data_type,
         input.direction ?? null, input.source_reference ?? null, input.access_level ?? "internal",
         input.effective_from, input.change_notes ?? null],
      );
      await client.query(`DELETE FROM sababuka.indicator_organizations WHERE indicator_version_id = $1`, [versionId]);
      for (const organization of effectiveOrganizations) {
        await client.query(
          `INSERT INTO sababuka.indicator_organizations
             (indicator_version_id, organization_id, responsibility, is_primary) VALUES ($1, $2, $3, $4)`,
          [versionId, organization.organization_id, organization.responsibility, organization.is_primary ?? false],
        );
      }
      await client.query(`DELETE FROM sababuka.targets WHERE indicator_version_id = $1`, [versionId]);
      for (const target of input.targets ?? []) {
        if ((target.numeric_value == null) === (target.text_value == null || target.text_value === "")) {
          throw new ApiError(400, "VALIDATION_ERROR", "Setiap target harus memiliki tepat satu nilai numerik atau teks.");
        }
        await client.query(
          `INSERT INTO sababuka.targets
             (indicator_version_id, period_id, numeric_value, text_value, notes, created_by)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [versionId, target.period_id, target.numeric_value ?? null, target.text_value || null, target.notes ?? null, auth.user.id],
        );
      }
      const afterData = { ...input, id: indicatorId, version_id: versionId, status: "draft" };
      await recordAudit(client, {
        ...audit, eventType: "indicator.draft_updated", entityType: "indicator", entityId: indicatorId,
        organizationId: input.owner_organization_id ?? null, beforeData: current.rows[0]!, afterData,
      });
      await client.query("COMMIT");
      return afterData;
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof ApiError) throw error;
      translateDatabaseError(error);
    } finally { client.release(); }
  }

  async updateIndicatorTechnicalMetadata(
    auth: AuthContext,
    versionId: string,
    input: IndicatorTechnicalMetadataInput,
    audit: AuditContext,
  ) {
    const scope = organizationScope(auth);
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query<QueryResultRow & {
        id: string; indicator_id: string; indicator_name: string; owner_organization_id: string | null;
        status: string; definition: string; formula: string | null; unit_id: string; frequency: string;
        data_type: string; direction: string | null; source_reference: string | null; change_notes: string | null;
      }>(
        `SELECT iv.id::text, iv.indicator_id::text, i.name AS indicator_name,
                i.owner_organization_id::text, iv.status, iv.definition, iv.formula,
                iv.unit_id::text, iv.frequency, iv.data_type, iv.direction,
                iv.source_reference, iv.change_notes
         FROM sababuka.indicator_versions iv
         JOIN sababuka.indicators i ON i.id = iv.indicator_id
         WHERE iv.id = $1 AND i.archived_at IS NULL
         FOR UPDATE OF iv`,
        [versionId],
      );
      if (!current.rows[0]) throw new ApiError(404, "NOT_FOUND", "Versi indikator tidak ditemukan.");
      const before = current.rows[0];
      if (before.status !== "opd_verification") {
        throw new ApiError(409, "CONFLICT", "Metadata teknis hanya dapat diperbaiki saat indikator menunggu verifikasi OPD.");
      }
      if (!isDeveloperActor(auth) && (!before.owner_organization_id || !scope.includes(before.owner_organization_id))) {
        throw new ApiError(403, "SCOPE_DENIED", "Metadata teknis hanya dapat diubah oleh OPD penanggung jawab indikator.");
      }
      const result = await client.query<QueryResultRow & Record<string, unknown>>(
        `UPDATE sababuka.indicator_versions
         SET definition = $2, formula = $3, unit_id = $4, frequency = $5,
             data_type = $6, direction = $7, source_reference = $8, change_notes = $9
         WHERE id = $1
         RETURNING id::text, indicator_id::text, status, definition, formula, unit_id::text,
                   frequency, data_type, direction, source_reference, change_notes, updated_at::text`,
        [versionId, input.definition.trim(), input.formula?.trim() || null, input.unit_id,
         input.frequency, input.data_type, input.direction ?? null, input.source_reference.trim(),
         input.change_notes?.trim() || null],
      );
      await recordAudit(client, {
        ...audit,
        eventType: "indicator.technical_metadata_updated",
        entityType: "indicator_version",
        entityId: versionId,
        organizationId: before.owner_organization_id,
        beforeData: before,
        afterData: result.rows[0]!,
      });
      await client.query("COMMIT");
      return result.rows[0]!;
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof ApiError) throw error;
      translateDatabaseError(error);
    } finally { client.release(); }
  }

  async transitionIndicatorVersion(
    auth: AuthContext,
    versionId: string,
    action: IndicatorTransitionAction,
    audit: AuditContext,
  ) {
    const transitions = {
      submit: { from: "draft", to: "in_review" },
      approve: { from: "in_review", to: "opd_verification" },
      verify: { from: "opd_verification", to: "approved" },
      activate: { from: "approved", to: "active" },
      retire: { from: "active", to: "retired" },
    } as const;
    const transition = transitions[action];
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query<QueryResultRow & {
        id: string; indicator_id: string; indicator_code: string; indicator_name: string; status: string; origin_type: string; owner_organization_id: string | null; owner_organization_name: string | null; category_review_status: string; submitted_by: string | null; bapperida_reviewed_by: string | null; metadata_complete: boolean;
      }>(
        `SELECT iv.id::text, iv.indicator_id::text, i.code AS indicator_code, i.name AS indicator_name, iv.status,
                i.origin_type,
                iv.submitted_by::text, iv.bapperida_reviewed_by::text,
                i.owner_organization_id::text, owner.name AS owner_organization_name, c.review_status AS category_review_status,
                (length(trim(iv.definition)) >= 5 AND i.owner_organization_id IS NOT NULL
                  AND iv.unit_id IS NOT NULL AND length(trim(COALESCE(iv.source_reference, ''))) > 0
                  AND (SELECT count(*) FROM sababuka.targets t
                       WHERE t.indicator_version_id = iv.id AND t.geography_id IS NULL
                         AND t.dimension_values = '{}'::jsonb) >= 1) AS metadata_complete
         FROM sababuka.indicator_versions iv
         JOIN sababuka.indicators i ON i.id = iv.indicator_id
         LEFT JOIN sababuka.organizations owner ON owner.id = i.owner_organization_id
         JOIN sababuka.categories c ON c.id = i.category_id
         WHERE iv.id = $1 FOR UPDATE OF iv`,
        [versionId],
      );
      if (!current.rowCount) throw new ApiError(404, "NOT_FOUND", "Versi indikator tidak ditemukan.");
      const currentVersion = current.rows[0]!;
      if (action === "submit") {
        if (currentVersion.origin_type === "opd_manual") {
          const scope = organizationScope(auth);
          if (!currentVersion.owner_organization_id || !scope.includes(currentVersion.owner_organization_id)) {
            throw new ApiError(403, "SCOPE_DENIED", "Usulan hanya dapat diajukan oleh OPD pengusul.");
          }
        } else requireIndicatorDrafter(auth);
      } else if (action === "verify") {
        const scope = organizationScope(auth);
        if (!isDeveloperActor(auth) && (!currentVersion.owner_organization_id || !scope.includes(currentVersion.owner_organization_id))) {
          throw new ApiError(403, "SCOPE_DENIED", "Verifikasi hanya dapat dilakukan oleh OPD pemilik indikator.");
        }
      } else {
        requireGlobal(auth);
      }
      if (currentVersion.status !== transition.from) {
        throw new ApiError(409, "CONFLICT", `Aksi ${action} hanya dapat dijalankan dari status ${transition.from}.`);
      }
      if (action === "submit" && currentVersion.category_review_status !== "approved") {
        throw new ApiError(409, "CONFLICT", "Kategori harus disetujui BAPPERIDA sebelum indikator diajukan.");
      }
      if (action === "submit" && !currentVersion.metadata_complete) {
        throw new ApiError(409, "CONFLICT", "Lengkapi definisi, satuan, OPD, sumber data, dan minimal satu target tahunan sebelum indikator diajukan. Tahun tanpa data boleh dikosongkan.");
      }
      if (action === "approve" && !currentVersion.owner_organization_id) {
        throw new ApiError(409, "CONFLICT", "OPD pemilik harus ditetapkan sebelum indikator dikirim untuk verifikasi teknis.");
      }
      if (action === "verify" && !currentVersion.metadata_complete) {
        throw new ApiError(409, "CONFLICT", "Lengkapi metadata teknis dan target indikator sebelum konfirmasi OPD.");
      }
      if (action === "approve" && currentVersion.submitted_by === auth.user.id && !isDeveloperActor(auth)) {
        throw new ApiError(409, "CONFLICT", "Pengaju indikator tidak boleh menyetujui review indikator yang sama.");
      }
      if (action === "verify" && currentVersion.bapperida_reviewed_by === auth.user.id && !isDeveloperActor(auth)) {
        throw new ApiError(409, "CONFLICT", "Reviewer BAPPERIDA tidak boleh menjadi verifikator teknis OPD yang sama.");
      }
      if (action === "activate") {
        await client.query(
          `UPDATE sababuka.indicator_versions
           SET status = 'retired'
           WHERE indicator_id = $1 AND status = 'active' AND id <> $2`,
          [current.rows[0]!.indicator_id, versionId],
        );
      }
      const targetStatus = action === "approve" && currentVersion.origin_type === "opd_manual"
        ? "approved"
        : transition.to;
      const result = await client.query<QueryResultRow & Record<string, unknown>>(
        `UPDATE sababuka.indicator_versions
         SET status = $2,
             submitted_by = CASE WHEN $3 = 'submit' THEN $4 ELSE submitted_by END,
             submitted_at = CASE WHEN $3 = 'submit' THEN now() ELSE submitted_at END,
             bapperida_reviewed_by = CASE WHEN $3 = 'approve' THEN $4 ELSE bapperida_reviewed_by END,
             bapperida_reviewed_at = CASE WHEN $3 = 'approve' THEN now() ELSE bapperida_reviewed_at END,
             opd_verified_by = CASE WHEN $3 = 'verify' THEN $4 WHEN $3 = 'approve' AND $5 = 'opd_manual' THEN submitted_by ELSE opd_verified_by END,
             opd_verified_at = CASE WHEN $3 = 'verify' THEN now() WHEN $3 = 'approve' AND $5 = 'opd_manual' THEN COALESCE(submitted_at, now()) ELSE opd_verified_at END,
             approved_by = CASE WHEN $3 = 'verify' OR ($3 = 'approve' AND $5 = 'opd_manual') THEN $4 ELSE approved_by END,
             approved_at = CASE WHEN $3 = 'verify' OR ($3 = 'approve' AND $5 = 'opd_manual') THEN now() ELSE approved_at END
         WHERE id = $1
         RETURNING id::text, indicator_id::text, version_number, status,
                   submitted_by::text, submitted_at::text,
                   bapperida_reviewed_by::text, bapperida_reviewed_at::text,
                   opd_verified_by::text, opd_verified_at::text,
                   approved_by::text, approved_at::text, updated_at::text`,
        [versionId, targetStatus, action, auth.user.id, currentVersion.origin_type],
      );
      await recordAudit(client, {
        ...audit, eventType: `indicator.${action}`, entityType: "indicator_version", entityId: versionId,
        beforeData: { status: transition.from }, afterData: result.rows[0]!,
      });
      const indicator = current.rows[0]!;
      const indicatorEntity = { entityType: "indicator_version", entityId: versionId };
      if (action === "submit") {
        await notifyRole(client, "bapperida", {
          ...indicatorEntity, type: "indicator.submitted", title: "Indikator menunggu review BAPPERIDA",
          message: `Indikator ${indicator.indicator_name} diajukan untuk ditinjau.`,
        }, auth.user.id);
      } else if (action === "approve" && indicator.owner_organization_id && indicator.origin_type === "opd_manual") {
        await notifyOrganization(client, indicator.owner_organization_id, {
          ...indicatorEntity, type: "indicator.proposal_approved", title: "Usulan indikator disetujui BAPPERIDA",
          message: `Usulan ${indicator.indicator_name} telah diperiksa dan menunggu aktivasi BAPPERIDA.`,
        }, auth.user.id);
      } else if (action === "approve" && indicator.owner_organization_id) {
        await notifyOrganization(client, indicator.owner_organization_id, {
          ...indicatorEntity, type: "indicator.opd_verification", title: "Indikator menunggu verifikasi OPD",
          message: `Indikator ${indicator.indicator_name} perlu diverifikasi oleh ${indicator.owner_organization_name ?? "OPD pemilik"}.`,
        }, auth.user.id);
      } else if (action === "verify") {
        await notifyRole(client, "bapperida", {
          ...indicatorEntity, type: "indicator.verified", title: "Verifikasi teknis OPD selesai",
          message: `Indikator ${indicator.indicator_name} telah diverifikasi OPD dan menunggu aktivasi.`,
        }, auth.user.id);
      } else if (action === "activate") {
        // Bila sudah ada observasi resmi yang valid, aktivasi langsung membuat
        // publikasi aktif agar alur demo dapat terlihat sampai Dashboard Pimpinan.
        // Sumber tetap ditampilkan bersama observasi; ini bukan pengganti mapping
        // konektor live yang memerlukan endpoint dan kredensial sumber.
        const observations = await client.query<QueryResultRow & { id: string; dataset_version_id: string }>(
          `SELECT o.id::text, b.dataset_version_id::text
           FROM sababuka.observations o
           JOIN sababuka.data_batches b ON b.id = o.batch_id AND b.status IN ('approved', 'published')
           WHERE o.indicator_version_id = $1 AND o.quality_status = 'valid'
             AND o.source_status IN ('verified_direct', 'verified_calculated')
           ORDER BY o.period_id, o.created_at DESC`, [versionId],
        );
        if (observations.rows.length) {
          const publicationKey = `AUTO_${indicator.indicator_code.replace(/[^A-Z0-9_]/gu, "_").slice(0, 68)}`;
          const activePublication = await client.query<{ id: string }>(
            `SELECT id::text FROM sababuka.publications WHERE publication_key = $1 AND status = 'active' LIMIT 1`, [publicationKey],
          );
          if (!activePublication.rows[0]) {
            const previous = await client.query<{ version_number: number }>(
              `SELECT version_number FROM sababuka.publications WHERE publication_key = $1 ORDER BY version_number DESC LIMIT 1`, [publicationKey],
            );
            const versionNumber = (previous.rows[0]?.version_number ?? 0) + 1;
            const publication = await client.query<{ id: string }>(
              `INSERT INTO sababuka.publications
                 (publication_key, version_number, publication_number, title, description, status, effective_at, change_notes, created_by)
               VALUES ($1, $2, $3, $4, $5, 'draft', now(), $6, $7) RETURNING id::text`,
              [publicationKey, versionNumber, buildAutoPublicationNumber(publicationKey, versionNumber),
               `Rilis otomatis — ${indicator.indicator_name}`,
               "Capaian bersumber dari observasi resmi yang telah lolos validasi teknis OPD.",
               "Diterbitkan otomatis saat BAPPERIDA mengaktifkan indikator.", auth.user.id],
            );
            await client.query(
              `INSERT INTO sababuka.publication_items (publication_id, observation_id, dataset_version_id, display_order)
               SELECT $1, selected.id, b.dataset_version_id, row_number() OVER (ORDER BY selected.id)::int FROM unnest($2::uuid[]) WITH ORDINALITY AS selected(id, position)
               JOIN sababuka.observations o ON o.id = selected.id
               JOIN sababuka.data_batches b ON b.id = o.batch_id`,
              [publication.rows[0]!.id, observations.rows.map((row) => row.id)],
            );
            await client.query(
              `UPDATE sababuka.publications
               SET status = 'active', activated_by = $2, activated_at = now(),
                   effective_at = COALESCE(effective_at, now()), updated_at = now()
               WHERE id = $1`,
              [publication.rows[0]!.id, auth.user.id],
            );
            await recordAudit(client, { ...audit, eventType: "publication.auto_activated", entityType: "publication", entityId: publication.rows[0]!.id, afterData: { publication_key: publicationKey, observation_count: observations.rows.length } });
            await notifyRole(client, "pimpinan", {
              entityType: "publication", entityId: publication.rows[0]!.id, type: "publication.activated",
              title: "Data indikator siap dipantau", message: `${indicator.indicator_name} sudah dirilis ke Dashboard Pimpinan.`,
            }, auth.user.id);
          }
        }
        if (indicator.owner_organization_id) {
          await notifyOrganization(client, indicator.owner_organization_id, {
            ...indicatorEntity, type: "indicator.activated", title: "Indikator telah diaktifkan",
            message: `Indikator ${indicator.indicator_name} sudah aktif di SABABUKA.`,
          }, auth.user.id);
        }
        await notifyRole(client, "pimpinan", {
          ...indicatorEntity, type: "indicator.activated", title: "Indikator baru tersedia",
          message: `Indikator ${indicator.indicator_name} sudah tersedia untuk dipantau.`,
        }, auth.user.id);
      }
      await client.query("COMMIT");
      return result.rows[0]!;
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof ApiError) throw error;
      translateDatabaseError(error);
    } finally { client.release(); }
  }

  async bulkTransitionIndicatorVersions(
    auth: AuthContext,
    versionIds: string[],
    action: IndicatorTransitionAction,
    audit: AuditContext,
  ): Promise<BulkTransitionResult> {
    const result: BulkTransitionResult = { processed: [], skipped: [] };
    for (const id of [...new Set(versionIds)]) {
      try {
        const changed = await this.transitionIndicatorVersion(auth, id, action, audit) as { status?: string };
        result.processed.push({ id, status: changed.status ?? "" });
      } catch (error) {
        if (error instanceof ApiError) result.skipped.push({ id, reason: error.message });
        else throw error;
      }
    }
    return result;
  }
}
