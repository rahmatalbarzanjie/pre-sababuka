import type { AppConfig } from "../config.js";
import type { Database, QueryResultRow } from "../database.js";
import { ApiError } from "../errors.js";
import { hashToken, randomToken } from "../security/tokens.js";
import type { AuthContext } from "../types/auth.js";
import { recordAudit, type AuditContext } from "./audit-service.js";
import { notifyUser } from "./notification-service.js";

interface CountedRow extends QueryResultRow {
  total_count: string;
}

interface IdRow extends QueryResultRow {
  id: string;
}

export interface PageQuery {
  page: number;
  pageSize: number;
  search?: string | undefined;
  sortBy?: string | undefined;
  sortOrder?: "asc" | "desc" | undefined;
}

export interface OrganizationInput {
  code: string;
  name: string;
  short_name?: string | null;
  organization_type: string;
  parent_id?: string | null;
}

export interface UserCreateInput {
  email: string;
  username?: string | null;
  full_name: string;
  organization_id: string;
}

export interface UserUpdateInput {
  email?: string;
  username?: string | null;
  full_name?: string;
  contact_phone?: string | null;
  job_title?: string | null;
  employee_id?: string | null;
  status?: "invited" | "active" | "suspended" | "locked";
}

export interface RoleAssignmentInput {
  role_id: string;
  scope_type: "global" | "organization" | "self" | "published";
  organization_id?: string | null;
  ends_at?: string | null;
  approval_notes?: string | null;
}

export type RoleScope = RoleAssignmentInput["scope_type"];

export const ROLE_SCOPE_RULES: Readonly<Record<string, readonly RoleScope[]>> = {
  superadmin: ["global"],
  bapperida: ["global"],
  kominfo: ["global"],
  pembina_statistik: ["global"],
  opd: ["organization"],
  pimpinan: ["published"],
};

export function allowedScopesForRole(roleCode: string): readonly RoleScope[] {
  return ROLE_SCOPE_RULES[roleCode] ?? [];
}

export function assertRoleScope(roleCode: string, scopeType: RoleScope, organizationId?: string | null): void {
  const allowed = allowedScopesForRole(roleCode);
  if (!allowed.length || !allowed.includes(scopeType)) {
    throw new ApiError(400, "INVALID_ROLE_SCOPE", `Scope ${scopeType} tidak sah untuk role ${roleCode}.`);
  }
  if ((scopeType === "organization") !== Boolean(organizationId)) {
    throw new ApiError(400, "VALIDATION_ERROR", "organization_id wajib hanya untuk scope organization.");
  }
}

export function registrationRoleCodesForOrganization(organizationCode: string): string[] {
  if (organizationCode === "BAPPERIDA") return ["opd", "bapperida"];
  if (organizationCode === "DISKOMINFOSANTIK") return ["opd", "kominfo"];
  if (organizationCode === "BPS_KAPUAS") return ["opd", "pembina_statistik"];
  return ["opd"];
}

const PROTECTED_SUPERADMIN_PERMISSIONS = [
  "system.configure",
  "organization.manage",
  "user.view",
  "user.create",
  "user.update",
  "user.activate",
  "user.assign_role",
  "role.view",
  "role.manage",
  "menu.manage",
] as const;

const PROTECTED_SUPERADMIN_MENUS = [
  "administration",
  "organizations",
  "users",
  "roles",
  "menus",
  "system-settings",
] as const;

function pageEnvelope<T>(rows: (T & CountedRow)[], page: number, pageSize: number) {
  const total = Number(rows[0]?.total_count ?? 0);
  return {
    data: rows.map(({ total_count: _total, ...row }) => row),
    meta: {
      page,
      page_size: pageSize,
      total_items: total,
      total_pages: total === 0 ? 0 : Math.ceil(total / pageSize),
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
  if (!isGlobal(auth)) {
    throw new ApiError(403, "SCOPE_DENIED", "Tindakan ini memerlukan scope global.");
  }
}

async function assertOrganizationAccountLimit(
  client: Pick<Database, "query">,
  userId: string,
  roleCode: string,
  organizationId?: string | null,
): Promise<void> {
  if (!organizationId) return;
  const organization = await client.query<{ code: string } & QueryResultRow>(
    "SELECT code FROM sababuka.organizations WHERE id = $1 AND is_active = true AND archived_at IS NULL",
    [organizationId],
  );
  if (!organization.rows[0]) throw new ApiError(404, "NOT_FOUND", "Organisasi tidak ditemukan.");
  const code = organization.rows[0].code;
  const limit = 1;
  if (roleCode !== "opd" && !["BAPPERIDA", "DISKOMINFOSANTIK"].includes(code)) return;
  const occupied = await client.query<{ count: string } & QueryResultRow>(
    `SELECT count(DISTINCT u.id)::text AS count
     FROM sababuka.users u
     JOIN sababuka.organization_memberships om ON om.user_id = u.id
     WHERE om.organization_id = $1 AND om.ends_at IS NULL
       AND u.id <> $2 AND u.archived_at IS NULL AND u.status IN ('active','locked')`,
    [organizationId, userId],
  );
  if (Number(occupied.rows[0]?.count ?? 0) >= limit) {
    throw new ApiError(409, "CONFLICT", "Setiap instansi hanya boleh memiliki satu akun PIC aktif. Nonaktifkan atau ganti PIC lama terlebih dahulu.");
  }
}

function translateDatabaseError(error: unknown): never {
  const code = (error as { code?: string }).code;
  if (code === "23505") throw new ApiError(409, "CONFLICT", "Data dengan identitas yang sama sudah ada.");
  if (code === "23503") throw new ApiError(400, "VALIDATION_ERROR", "Referensi data tidak valid.");
  if (code === "23514" || code === "22P02") {
    throw new ApiError(400, "VALIDATION_ERROR", "Nilai tidak memenuhi aturan data.");
  }
  throw error;
}

export class AdminService {
  constructor(
    private readonly db: Database,
    private readonly config: AppConfig,
  ) {}

  async listOrganizations(auth: AuthContext, query: PageQuery & { active?: boolean | undefined }) {
    const offset = (query.page - 1) * query.pageSize;
    const scope = organizationScope(auth);
    const orderColumns: Record<string, string> = { name: "o.name", code: "o.code", type: "o.organization_type", status: "o.is_active", updated_at: "o.updated_at" };
    const orderColumn = orderColumns[query.sortBy ?? "updated_at"] ?? orderColumns.updated_at!;
    const orderDirection = query.sortOrder === "asc" ? "ASC" : "DESC";
    const result = await this.db.query<CountedRow & Record<string, unknown>>(
      `SELECT o.id::text, o.code, o.name, o.short_name, o.organization_type,
              o.parent_id::text, o.is_active, o.created_at::text, o.updated_at::text,
              (SELECT count(DISTINCT i.id)::int
               FROM sababuka.indicators i
               JOIN LATERAL (SELECT v.id FROM sababuka.indicator_versions v
                 WHERE v.indicator_id = i.id ORDER BY v.version_number DESC LIMIT 1) current_version ON true
               LEFT JOIN sababuka.indicator_organizations io ON io.indicator_version_id = current_version.id
               WHERE i.archived_at IS NULL AND (i.owner_organization_id = o.id OR io.organization_id = o.id)) AS indicator_count,
              (SELECT count(DISTINCT i.category_id)::int
               FROM sababuka.indicators i
               JOIN LATERAL (SELECT v.id FROM sababuka.indicator_versions v
                 WHERE v.indicator_id = i.id ORDER BY v.version_number DESC LIMIT 1) current_version ON true
               LEFT JOIN sababuka.indicator_organizations io ON io.indicator_version_id = current_version.id
               WHERE i.archived_at IS NULL AND (i.owner_organization_id = o.id OR io.organization_id = o.id)) AS category_count,
              count(*) OVER()::text AS total_count
       FROM sababuka.organizations o
       WHERE o.archived_at IS NULL
         AND ($1::text IS NULL OR o.code ILIKE '%' || $1 || '%' OR o.name ILIKE '%' || $1 || '%')
         AND ($2::boolean IS NULL OR o.is_active = $2)
         AND ($3::boolean OR o.id = ANY($4::uuid[]))
       ORDER BY ${orderColumn} ${orderDirection} NULLS LAST, o.name, o.code
       LIMIT $5 OFFSET $6`,
      [query.search?.trim() || null, query.active ?? null, isGlobal(auth), scope, query.pageSize, offset],
    );
    return pageEnvelope(result.rows, query.page, query.pageSize);
  }

  async createOrganization(auth: AuthContext, input: OrganizationInput, audit: AuditContext) {
    requireGlobal(auth);
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<QueryResultRow & Record<string, unknown>>(
        `INSERT INTO sababuka.organizations
           (code, name, short_name, organization_type, parent_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id::text, code, name, short_name, organization_type, parent_id::text,
                   is_active, created_at::text, updated_at::text`,
        [input.code, input.name, input.short_name ?? null, input.organization_type, input.parent_id ?? null],
      );
      const organization = result.rows[0]!;
      await recordAudit(client, {
        ...audit,
        eventType: "organization.created",
        entityType: "organization",
        entityId: organization.id as string,
        organizationId: organization.id as string,
        afterData: organization,
      });
      await client.query("COMMIT");
      return organization;
    } catch (error) {
      await client.query("ROLLBACK");
      translateDatabaseError(error);
    } finally {
      client.release();
    }
  }

  async listUsers(auth: AuthContext, query: PageQuery & { organizationId?: string | undefined; status?: string | undefined }) {
    const offset = (query.page - 1) * query.pageSize;
    const scope = organizationScope(auth);
    const orderColumns: Record<string, string> = { name: "u.full_name", organization: "COALESCE(po.name, ro.name)", status: "u.status", mfa: "u.mfa_required", last_login: "u.last_login_at", created_at: "COALESCE(rr.created_at, u.created_at)", updated_at: "u.updated_at" };
    const orderColumn = orderColumns[query.sortBy ?? "updated_at"] ?? orderColumns.updated_at!;
    const orderDirection = query.sortOrder === "asc" ? "ASC" : "DESC";
    const result = await this.db.query<CountedRow & Record<string, unknown>>(
      `SELECT u.id::text, u.email::text, u.username::text, u.full_name, u.status,
              u.mfa_required, (u.password_hash IS NOT NULL) AS has_password,
              u.last_login_at::text, u.created_at::text, u.updated_at::text,
              po.id::text AS organization_id, po.code AS organization_code,
              po.name AS organization_name,
              rr.requested_organization_id::text, ro.code AS requested_organization_code,
              ro.name AS requested_organization_name, rr.contact_email::text,
              rr.contact_phone, rr.job_title, rr.employee_id, rr.request_note,
              rr.status AS registration_status, rr.created_at::text AS registration_created_at,
              count(*) OVER()::text AS total_count
       FROM sababuka.users u
       LEFT JOIN LATERAL (
         SELECT o.id, o.code, o.name
         FROM sababuka.organization_memberships om
         JOIN sababuka.organizations o ON o.id = om.organization_id
         WHERE om.user_id = u.id AND om.ends_at IS NULL
         ORDER BY om.is_primary DESC, om.created_at
         LIMIT 1
       ) po ON true
       LEFT JOIN sababuka.user_registration_requests rr ON rr.user_id = u.id
       LEFT JOIN sababuka.organizations ro ON ro.id = rr.requested_organization_id
       WHERE u.archived_at IS NULL
         AND ($1::text IS NULL OR u.email::text ILIKE '%' || $1 || '%'
              OR u.full_name ILIKE '%' || $1 || '%' OR u.username::text ILIKE '%' || $1 || '%')
         AND ($2::uuid IS NULL OR po.id = $2)
         AND ($3::boolean OR po.id = ANY($4::uuid[]))
         AND ($5::text IS NULL OR u.status = $5)
       ORDER BY ${orderColumn} ${orderDirection} NULLS LAST, u.full_name, u.email
       LIMIT $6 OFFSET $7`,
      [query.search?.trim() || null, query.organizationId ?? null, isGlobal(auth), scope,
       query.status ?? null, query.pageSize, offset],
    );
    return pageEnvelope(result.rows, query.page, query.pageSize);
  }

  async createUser(auth: AuthContext, input: UserCreateInput, audit: AuditContext) {
    requireGlobal(auth);
    const invitationToken = randomToken(32);
    const invitationExpiresAt = new Date(Date.now() + this.config.invitationTtlSeconds * 1000);
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      const organization = await client.query<IdRow>(
        `SELECT id::text FROM sababuka.organizations
         WHERE id = $1 AND is_active = true AND archived_at IS NULL`,
        [input.organization_id],
      );
      if (!organization.rowCount) throw new ApiError(404, "NOT_FOUND", "Organisasi tidak ditemukan.");

      const result = await client.query<QueryResultRow & Record<string, unknown>>(
        `INSERT INTO sababuka.users (email, username, full_name, status, mfa_required)
         VALUES ($1, $2, $3, 'invited', true)
         RETURNING id::text, email::text, username::text, full_name, status,
                   mfa_required, created_at::text`,
        [input.email.trim().toLowerCase(), input.username?.trim() || null, input.full_name.trim()],
      );
      const user = result.rows[0]!;
      await assertOrganizationAccountLimit(client, user.id as string, "opd", input.organization_id);
      await client.query(
        `INSERT INTO sababuka.organization_memberships
           (user_id, organization_id, membership_type, is_primary)
         VALUES ($1, $2, 'member', true)`,
        [user.id, input.organization_id],
      );
      await client.query(
        `INSERT INTO sababuka.user_invitations
           (user_id, token_hash, expires_at, created_by)
         VALUES ($1, $2, $3, $4)`,
        [user.id, hashToken(invitationToken), invitationExpiresAt, auth.user.id],
      );
      const afterData = { ...user, organization_id: input.organization_id };
      await recordAudit(client, {
        ...audit,
        eventType: "user.invited",
        entityType: "user",
        entityId: user.id as string,
        organizationId: input.organization_id,
        afterData,
      });
      await client.query("COMMIT");
      return {
        ...afterData,
        invitation_token: invitationToken,
        invitation_expires_at: invitationExpiresAt.toISOString(),
      };
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof ApiError) throw error;
      translateDatabaseError(error);
    } finally {
      client.release();
    }
  }

  async updateUser(auth: AuthContext, userId: string, input: UserUpdateInput, audit: AuditContext) {
    requireGlobal(auth);
    if (userId === auth.user.id && input.status && input.status !== "active") {
      throw new ApiError(409, "CONFLICT", "Superadmin tidak dapat menonaktifkan akunnya sendiri.");
    }
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      const before = await client.query<QueryResultRow & Record<string, unknown>>(
        `SELECT u.id::text, u.email::text, u.username::text, u.full_name, u.status, u.mfa_required,
                (u.password_hash IS NOT NULL) AS has_password, rr.status AS registration_status,
                rr.contact_phone, rr.job_title, rr.employee_id
         FROM sababuka.users u
         LEFT JOIN sababuka.user_registration_requests rr ON rr.user_id = u.id
         WHERE u.id = $1 AND u.archived_at IS NULL FOR UPDATE OF u`,
        [userId],
      );
      if (!before.rowCount) throw new ApiError(404, "NOT_FOUND", "Pengguna tidak ditemukan.");
      if (input.status === "active" && before.rows[0]!.registration_status === "pending") {
        throw new ApiError(409, "CONFLICT", "Pendaftaran mandiri harus disetujui melalui pemeriksaan pendaftaran, bukan diaktifkan langsung.");
      }
      if (input.status === "active" && before.rows[0]!.has_password !== true) {
        throw new ApiError(409, "CONFLICT", "Pengguna harus menerima undangan dan membuat password sebelum diaktifkan.");
      }
      if (input.status && input.status !== "active") {
        const activeSuperadmin = await client.query(
          `SELECT 1 FROM sababuka.user_role_assignments ura
           JOIN sababuka.roles r ON r.id = ura.role_id AND r.code = 'superadmin'
           WHERE ura.user_id = $1 AND ura.ends_at IS NULL`, [userId],
        );
        if (activeSuperadmin.rowCount) {
          const others = await client.query(
            `SELECT 1 FROM sababuka.users u
             JOIN sababuka.user_role_assignments ura ON ura.user_id = u.id AND ura.ends_at IS NULL
             JOIN sababuka.roles r ON r.id = ura.role_id AND r.code = 'superadmin'
             WHERE u.id <> $1 AND u.status = 'active' AND u.archived_at IS NULL LIMIT 1`, [userId],
          );
          if (!others.rowCount) throw new ApiError(409, "CONFLICT", "Superadmin aktif terakhir tidak dapat dinonaktifkan.");
        }
      }
      const result = await client.query<QueryResultRow & Record<string, unknown>>(
        `UPDATE sababuka.users
         SET email = CASE WHEN $2::boolean THEN $3::citext ELSE email END,
             username = CASE WHEN $4::boolean THEN $5::citext ELSE username END,
             full_name = COALESCE($6, full_name),
             status = COALESCE($7, status),
             failed_login_count = CASE WHEN $7 = 'active' THEN 0 ELSE failed_login_count END,
             locked_until = CASE WHEN $7 = 'active' THEN NULL ELSE locked_until END,
             archived_at = CASE WHEN $7 = 'archived' THEN now() ELSE archived_at END
         WHERE id = $1
         RETURNING id::text, email::text, username::text, full_name, status,
                   mfa_required, last_login_at::text, created_at::text, updated_at::text`,
        [
          userId,
          Object.hasOwn(input, "email"), input.email?.trim().toLowerCase() || null,
          Object.hasOwn(input, "username"), input.username?.trim() || null,
          input.full_name?.trim() || null, input.status ?? null,
        ],
      );
      const user = result.rows[0]!;
      if (["contact_phone", "job_title", "employee_id"].some((field) => Object.hasOwn(input, field))) {
        await client.query(
          `UPDATE sababuka.user_registration_requests
           SET contact_email = CASE WHEN $2::boolean THEN $3::citext ELSE contact_email END,
               contact_phone = CASE WHEN $4::boolean THEN $5 ELSE contact_phone END,
               job_title = CASE WHEN $6::boolean THEN $7 ELSE job_title END,
               employee_id = CASE WHEN $8::boolean THEN $9 ELSE employee_id END
           WHERE user_id = $1`,
          [userId, Object.hasOwn(input, "email"), input.email?.trim().toLowerCase() || null,
           Object.hasOwn(input, "contact_phone"), input.contact_phone?.trim() || "-",
           Object.hasOwn(input, "job_title"), input.job_title?.trim() || "Belum dilengkapi",
           Object.hasOwn(input, "employee_id"), input.employee_id?.trim() || null],
        );
      } else if (Object.hasOwn(input, "email")) {
        await client.query(
          `UPDATE sababuka.user_registration_requests SET contact_email = $2 WHERE user_id = $1`,
          [userId, input.email!.trim().toLowerCase()],
        );
      }
      if (input.status && input.status !== "active") {
        await client.query(
          `UPDATE sababuka.auth_sessions
           SET revoked_at = now(), revoke_reason = 'account_status_changed'
           WHERE user_id = $1 AND revoked_at IS NULL`,
          [userId],
        );
      }
      await recordAudit(client, {
        ...audit,
        eventType: "user.updated",
        entityType: "user",
        entityId: userId,
        beforeData: before.rows[0]!,
        afterData: user,
      });
      await client.query("COMMIT");
      return user;
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof ApiError) throw error;
      translateDatabaseError(error);
    } finally {
      client.release();
    }
  }

  async rejectRegistration(auth: AuthContext, userId: string, notes: string, audit: AuditContext) {
    requireGlobal(auth);
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      const registration = await client.query<QueryResultRow & { status: string; full_name: string }>(
        `SELECT rr.status, u.full_name
         FROM sababuka.user_registration_requests rr
         JOIN sababuka.users u ON u.id = rr.user_id
         WHERE rr.user_id = $1 AND u.archived_at IS NULL
         FOR UPDATE OF rr, u`, [userId],
      );
      if (!registration.rowCount) throw new ApiError(404, "NOT_FOUND", "Pendaftaran tidak ditemukan.");
      if (registration.rows[0]!.status !== "pending") throw new ApiError(409, "CONFLICT", "Pendaftaran ini sudah pernah diputuskan.");
      await client.query(
        `UPDATE sababuka.user_registration_requests
         SET status = 'rejected', reviewed_by = $2, reviewed_at = now(), review_notes = $3
         WHERE user_id = $1`, [userId, auth.user.id, notes.trim()],
      );
      await client.query(
        `UPDATE sababuka.users SET status = 'suspended', updated_at = now() WHERE id = $1`, [userId],
      );
      await client.query(
        `UPDATE sababuka.organization_memberships SET ends_at = now(), is_primary = false
         WHERE user_id = $1 AND ends_at IS NULL`, [userId],
      );
      await recordAudit(client, { ...audit, eventType: "user.registration_rejected", entityType: "user", entityId: userId,
        beforeData: { status: "pending" }, afterData: { status: "rejected", account_status: "suspended", review_notes: notes.trim() } });
      await client.query("COMMIT");
      return { id: userId, status: "suspended", registration_status: "rejected" };
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof ApiError) throw error;
      translateDatabaseError(error);
    } finally { client.release(); }
  }

  async archiveUser(auth: AuthContext, userId: string, audit: AuditContext) {
    requireGlobal(auth);
    if (userId === auth.user.id) throw new ApiError(409, "CONFLICT", "Superadmin tidak dapat menghapus akunnya sendiri.");
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      const before = await client.query<QueryResultRow & Record<string, unknown>>(
        `SELECT id::text, email::text, full_name, status FROM sababuka.users
         WHERE id = $1 AND archived_at IS NULL FOR UPDATE`, [userId],
      );
      if (!before.rowCount) throw new ApiError(404, "NOT_FOUND", "Pengguna tidak ditemukan.");
      const activeSuperadmin = await client.query(
        `SELECT 1 FROM sababuka.user_role_assignments ura
         JOIN sababuka.roles r ON r.id = ura.role_id AND r.code = 'superadmin'
         WHERE ura.user_id = $1 AND ura.ends_at IS NULL`, [userId],
      );
      if (activeSuperadmin.rowCount) {
        const others = await client.query(
          `SELECT 1 FROM sababuka.users u
           JOIN sababuka.user_role_assignments ura ON ura.user_id = u.id AND ura.ends_at IS NULL
           JOIN sababuka.roles r ON r.id = ura.role_id AND r.code = 'superadmin'
           WHERE u.id <> $1 AND u.status = 'active' AND u.archived_at IS NULL LIMIT 1`, [userId],
        );
        if (!others.rowCount) throw new ApiError(409, "CONFLICT", "Superadmin aktif terakhir tidak dapat dihapus.");
      }
      await client.query(`UPDATE sababuka.users SET status = 'archived', archived_at = now(), updated_at = now() WHERE id = $1`, [userId]);
      await client.query(`UPDATE sababuka.auth_sessions SET revoked_at = now(), revoke_reason = 'account_archived' WHERE user_id = $1 AND revoked_at IS NULL`, [userId]);
      await client.query(`UPDATE sababuka.user_invitations SET revoked_at = now() WHERE user_id = $1 AND accepted_at IS NULL AND revoked_at IS NULL`, [userId]);
      await client.query(`UPDATE sababuka.organization_memberships SET ends_at = now(), is_primary = false WHERE user_id = $1 AND ends_at IS NULL`, [userId]);
      await client.query(`UPDATE sababuka.user_role_assignments SET ends_at = now() WHERE user_id = $1 AND ends_at IS NULL`, [userId]);
      await client.query(
        `UPDATE sababuka.user_registration_requests
         SET status = 'rejected', reviewed_by = $2, reviewed_at = now(),
             review_notes = COALESCE(review_notes, 'Akun dihapus oleh superadmin.')
         WHERE user_id = $1 AND status = 'pending'`, [userId, auth.user.id],
      );
      await recordAudit(client, { ...audit, eventType: "user.archived", entityType: "user", entityId: userId,
        beforeData: before.rows[0]!, afterData: { status: "archived" } });
      await client.query("COMMIT");
      return { id: userId, status: "archived" };
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof ApiError) throw error;
      translateDatabaseError(error);
    } finally { client.release(); }
  }

  async approveRegistration(auth: AuthContext, userId: string, input: RoleAssignmentInput, audit: AuditContext) {
    requireGlobal(auth);
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      const user = await client.query<QueryResultRow & { status: string; has_password: boolean; registration_status: string | null }>(
        `SELECT u.status, (u.password_hash IS NOT NULL) AS has_password,
                rr.status AS registration_status
         FROM sababuka.users u
         LEFT JOIN sababuka.user_registration_requests rr ON rr.user_id = u.id
         WHERE u.id = $1 AND u.archived_at IS NULL
         FOR UPDATE OF u`,
        [userId],
      );
      if (!user.rowCount) throw new ApiError(404, "NOT_FOUND", "Pengguna tidak ditemukan.");
      if (user.rows[0]!.status !== "invited" || !user.rows[0]!.has_password) {
        throw new ApiError(409, "CONFLICT", "Hanya pendaftaran mandiri yang masih menunggu verifikasi yang dapat disetujui.");
      }
      if (user.rows[0]!.registration_status && user.rows[0]!.registration_status !== "pending") {
        throw new ApiError(409, "CONFLICT", "Pendaftaran ini sudah pernah diputuskan.");
      }
      const role = await client.query<{ code: string } & QueryResultRow>(
        "SELECT code FROM sababuka.roles WHERE id = $1 AND is_active = true",
        [input.role_id],
      );
      if (!role.rows[0]) throw new ApiError(404, "NOT_FOUND", "Peran tidak ditemukan.");
      assertRoleScope(role.rows[0].code, input.scope_type, input.organization_id);
      if (role.rows[0].code !== "opd" || input.scope_type !== "organization" || !input.organization_id) {
        throw new ApiError(400, "VALIDATION_ERROR", "Pendaftaran PIC harus disetujui untuk satu instansi. Peran khusus BAPPERIDA, Walidata, atau Pembina Data Statistik diberikan otomatis sesuai instansi.");
      }
      await assertOrganizationAccountLimit(client, userId, role.rows[0].code, input.organization_id);
      const organization = await client.query<{ code: string } & QueryResultRow>(
        "SELECT code FROM sababuka.organizations WHERE id = $1 AND is_active = true AND archived_at IS NULL",
        [input.organization_id],
      );
      if (!organization.rows[0]) throw new ApiError(404, "NOT_FOUND", "Organisasi tidak ditemukan.");
      const roleCodes = registrationRoleCodesForOrganization(organization.rows[0].code);
      const packageRoles = await client.query<{ id: string; code: string } & QueryResultRow>(
        "SELECT id::text, code FROM sababuka.roles WHERE code = ANY($1::text[]) AND is_active = true",
        [roleCodes],
      );
      if (packageRoles.rowCount !== roleCodes.length) throw new ApiError(409, "CONFLICT", "Paket peran instansi belum lengkap. Hubungi Pengelola Sistem.");
      const assignments: Record<string, unknown>[] = [];
      for (const packageRole of packageRoles.rows) {
        const opdRole = packageRole.code === "opd";
        const assignment = await client.query<QueryResultRow & Record<string, unknown>>(
          `INSERT INTO sababuka.user_role_assignments
             (user_id, role_id, organization_id, scope_type, ends_at, assigned_by)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (user_id, role_id, organization_id, scope_type) DO UPDATE
           SET starts_at = now(), ends_at = EXCLUDED.ends_at, assigned_by = EXCLUDED.assigned_by
           RETURNING id::text, role_id::text, organization_id::text, scope_type`,
          [userId, packageRole.id, opdRole ? input.organization_id : null, opdRole ? "organization" : "global", input.ends_at ?? null, auth.user.id],
        );
        assignments.push(assignment.rows[0]!);
      }
      await client.query(
        `UPDATE sababuka.users
         SET status = 'active', failed_login_count = 0, locked_until = NULL, updated_at = now()
         WHERE id = $1`,
        [userId],
      );
      await client.query(
        `UPDATE sababuka.organization_memberships
         SET ends_at = now(), is_primary = false
         WHERE user_id = $1 AND ends_at IS NULL
           AND ($2::uuid IS NULL OR organization_id <> $2)`,
        [userId, input.organization_id ?? null],
      );
      if (input.organization_id) {
        await client.query(
          `INSERT INTO sababuka.organization_memberships
             (user_id, organization_id, membership_type, is_primary)
           VALUES ($1, $2, $3, true)
           ON CONFLICT (user_id, organization_id) DO UPDATE
           SET membership_type = EXCLUDED.membership_type,
               is_primary = true, ends_at = NULL`,
          [userId, input.organization_id, role.rows[0].code === "opd" ? "operator" : "member"],
        );
      } else {
        await client.query(
          `UPDATE sababuka.organization_memberships
           SET membership_type = $2, is_primary = true
           WHERE user_id = $1 AND ends_at IS NULL`,
          [userId, role.rows[0].code === "opd" ? "operator" : "member"],
        );
      }
      await client.query(
        `UPDATE sababuka.user_registration_requests
         SET status = 'approved', approved_organization_id = $2,
             approved_role_id = $3, reviewed_by = $4, reviewed_at = now(),
             review_notes = $5
         WHERE user_id = $1 AND status = 'pending'`,
        [userId, input.organization_id ?? null, input.role_id, auth.user.id, input.approval_notes?.trim() || null],
      );
      await recordAudit(client, {
        ...audit,
        eventType: "user.registration_approved",
        entityType: "user",
        entityId: userId,
        organizationId: input.organization_id ?? null,
        beforeData: { status: "invited" },
        afterData: {
          status: "active",
          role_codes: roleCodes,
          approved_organization_id: input.organization_id ?? null,
          approval_notes: input.approval_notes?.trim() || null,
          assignments,
        },
      });
      await notifyUser(client, userId, {
        type: "user.registration_approved",
        title: "Pendaftaran akun disetujui",
        message: "Akun Anda sudah aktif. Buka Beranda Tugas untuk melihat tanggung jawab sesuai peran dan OPD.",
        entityType: "user",
        entityId: userId,
      });
      await client.query("COMMIT");
      return { id: userId, status: "active", role_codes: roleCodes };
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof ApiError) throw error;
      translateDatabaseError(error);
    } finally {
      client.release();
    }
  }

  async assignRole(auth: AuthContext, userId: string, input: RoleAssignmentInput, audit: AuditContext) {
    requireGlobal(auth);
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      const role = await client.query<{ code: string }>("SELECT code FROM sababuka.roles WHERE id = $1 AND is_active = true", [input.role_id]);
      if (!role.rows[0]) throw new ApiError(404, "NOT_FOUND", "Role tidak ditemukan.");
      assertRoleScope(role.rows[0].code, input.scope_type, input.organization_id);
      await assertOrganizationAccountLimit(client, userId, role.rows[0].code, input.organization_id);
      const result = await client.query<QueryResultRow & Record<string, unknown>>(
        `INSERT INTO sababuka.user_role_assignments
           (user_id, role_id, organization_id, scope_type, ends_at, assigned_by)
         SELECT $1, r.id, $3, $4, $5, $6
         FROM sababuka.roles r
         WHERE r.id = $2 AND r.is_active = true
           AND EXISTS (SELECT 1 FROM sababuka.users u WHERE u.id = $1 AND u.archived_at IS NULL)
           AND ($3::uuid IS NULL OR EXISTS (
             SELECT 1 FROM sababuka.organizations o
             WHERE o.id = $3 AND o.is_active = true AND o.archived_at IS NULL
           ))
         RETURNING id::text, user_id::text, role_id::text, organization_id::text,
                   scope_type, starts_at::text, ends_at::text`,
        [userId, input.role_id, input.organization_id ?? null, input.scope_type, input.ends_at ?? null, auth.user.id],
      );
      if (!result.rowCount) throw new ApiError(404, "NOT_FOUND", "Pengguna, role, atau organisasi tidak ditemukan.");
      const assignment = result.rows[0]!;
      await recordAudit(client, {
        ...audit,
        eventType: "user.role_assigned",
        entityType: "user_role_assignment",
        entityId: assignment.id as string,
        organizationId: input.organization_id ?? null,
        afterData: assignment,
      });
      await client.query("COMMIT");
      return assignment;
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof ApiError) throw error;
      translateDatabaseError(error);
    } finally {
      client.release();
    }
  }

  async listRoles() {
    const result = await this.db.query<QueryResultRow & Record<string, unknown>>(
      `SELECT r.id::text, r.code,
              CASE r.code
                WHEN 'superadmin' THEN 'Pengelola Sistem'
                WHEN 'bapperida' THEN 'Verifikator BAPPERIDA'
                WHEN 'kominfo' THEN 'Walidata Diskominfosantik'
                WHEN 'pembina_statistik' THEN 'Pembina Data Statistik (BPS)'
                WHEN 'opd' THEN 'Admin/PIC OPD'
                WHEN 'pimpinan' THEN 'Pimpinan'
                ELSE r.name
              END AS name,
              r.description, r.is_system, r.is_active,
              COALESCE(array_agg(p.code ORDER BY p.code) FILTER (WHERE p.id IS NOT NULL), '{}') AS permissions
       FROM sababuka.roles r
       LEFT JOIN sababuka.role_permissions rp ON rp.role_id = r.id
       LEFT JOIN sababuka.permissions p ON p.id = rp.permission_id
       GROUP BY r.id
       ORDER BY r.is_system DESC, r.name`,
    );
    return { data: result.rows };
  }

  async listPermissions() {
    const result = await this.db.query(
      `SELECT id::text, code, name, description, risk_level
       FROM sababuka.permissions ORDER BY code`,
    );
    return { data: result.rows };
  }

  async replaceRolePermissions(auth: AuthContext, roleId: string, permissionIds: string[], audit: AuditContext, reason?: string) {
    requireGlobal(auth);
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      const role = await client.query<QueryResultRow & { id: string; code: string }>(
        `SELECT id::text, code FROM sababuka.roles WHERE id = $1 FOR UPDATE`,
        [roleId],
      );
      if (!role.rowCount) throw new ApiError(404, "NOT_FOUND", "Role tidak ditemukan.");
      const permissions = await client.query<QueryResultRow & { id: string; code: string }>(
        `SELECT id::text, code FROM sababuka.permissions WHERE id = ANY($1::uuid[]) ORDER BY code`,
        [permissionIds],
      );
      if (permissions.rowCount !== new Set(permissionIds).size) {
        throw new ApiError(400, "VALIDATION_ERROR", "Satu atau lebih permission tidak valid.");
      }
      const codes = permissions.rows.map((permission) => permission.code);
      if (role.rows[0]!.code === "superadmin") {
        const missing = PROTECTED_SUPERADMIN_PERMISSIONS.filter((code) => !codes.includes(code));
        if (missing.length) {
          throw new ApiError(409, "CONFLICT", `Hak akses inti Superadmin wajib dipertahankan: ${missing.join(", ")}.`);
        }
      }
      const before = await client.query<QueryResultRow & { code: string }>(
        `SELECT p.code FROM sababuka.role_permissions rp
         JOIN sababuka.permissions p ON p.id = rp.permission_id
         WHERE rp.role_id = $1 ORDER BY p.code`,
        [roleId],
      );
      await client.query(`DELETE FROM sababuka.role_permissions WHERE role_id = $1`, [roleId]);
      if (permissionIds.length) {
        await client.query(
          `INSERT INTO sababuka.role_permissions (role_id, permission_id, granted_by)
           SELECT $1, unnest($2::uuid[]), $3`,
          [roleId, permissionIds, auth.user.id],
        );
      }
      await recordAudit(client, {
        ...audit,
        eventType: "role.permissions_replaced",
        entityType: "role",
        entityId: roleId,
        beforeData: { permissions: before.rows.map((row) => row.code) },
        afterData: { permissions: codes, reason: reason ?? null },
      });
      await client.query("COMMIT");
      return { role_id: roleId, permissions: codes };
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof ApiError) throw error;
      translateDatabaseError(error);
    } finally {
      client.release();
    }
  }

  async listMenus() {
    const result = await this.db.query(
      `SELECT m.id::text, m.code, m.parent_id::text, parent.code AS parent_code,
              m.label, m.icon, m.route_name, m.required_permission,
              m.badge, m.navigation_disabled, m.display_order, m.is_active
       FROM sababuka.menu_items m
       LEFT JOIN sababuka.menu_items parent ON parent.id = m.parent_id
       ORDER BY COALESCE(parent.display_order, m.display_order), m.parent_id NULLS FIRST, m.display_order, m.label`,
    );
    return { data: result.rows };
  }

  async getRoleMenus(roleId: string) {
    const role = await this.db.query<IdRow>(`SELECT id::text FROM sababuka.roles WHERE id = $1`, [roleId]);
    if (!role.rowCount) throw new ApiError(404, "NOT_FOUND", "Role tidak ditemukan.");
    const result = await this.db.query<QueryResultRow & { id: string; code: string }>(
      `SELECT m.id::text, m.code
       FROM sababuka.role_menu_items rmi
       JOIN sababuka.menu_items m ON m.id = rmi.menu_item_id
       WHERE rmi.role_id = $1 AND rmi.is_visible = true
       ORDER BY m.code`,
      [roleId],
    );
    return { role_id: roleId, menu_ids: result.rows.map((item) => item.id), menu_codes: result.rows.map((item) => item.code) };
  }

  async replaceRoleMenus(auth: AuthContext, roleId: string, menuIds: string[], audit: AuditContext) {
    requireGlobal(auth);
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      const role = await client.query<QueryResultRow & { id: string; code: string }>(
        `SELECT id::text, code FROM sababuka.roles WHERE id = $1 FOR UPDATE`,
        [roleId],
      );
      if (!role.rowCount) throw new ApiError(404, "NOT_FOUND", "Role tidak ditemukan.");
      const menus = await client.query<QueryResultRow & { id: string; code: string; parent_id: string | null }>(
        `SELECT id::text, code, parent_id::text FROM sababuka.menu_items
         WHERE id = ANY($1::uuid[]) AND is_active = true`,
        [menuIds],
      );
      if (menus.rowCount !== new Set(menuIds).size) {
        throw new ApiError(400, "VALIDATION_ERROR", "Satu atau lebih menu tidak valid atau tidak aktif.");
      }
      const resolvedIds = new Set(menuIds);
      for (const menu of menus.rows) if (menu.parent_id) resolvedIds.add(menu.parent_id);
      const resolved = await client.query<QueryResultRow & { id: string; code: string }>(
        `SELECT id::text, code FROM sababuka.menu_items WHERE id = ANY($1::uuid[]) ORDER BY code`,
        [[...resolvedIds]],
      );
      const codes = resolved.rows.map((menu) => menu.code);
      if (role.rows[0]!.code === "superadmin") {
        const missing = PROTECTED_SUPERADMIN_MENUS.filter((code) => !codes.includes(code));
        if (missing.length) {
          throw new ApiError(409, "CONFLICT", `Menu inti Superadmin wajib dipertahankan: ${missing.join(", ")}.`);
        }
      }
      const before = await client.query<QueryResultRow & { code: string }>(
        `SELECT m.code FROM sababuka.role_menu_items rmi
         JOIN sababuka.menu_items m ON m.id = rmi.menu_item_id
         WHERE rmi.role_id = $1 AND rmi.is_visible = true ORDER BY m.code`,
        [roleId],
      );
      await client.query(`DELETE FROM sababuka.role_menu_items WHERE role_id = $1`, [roleId]);
      if (resolvedIds.size) {
        await client.query(
          `INSERT INTO sababuka.role_menu_items (role_id, menu_item_id, is_visible)
           SELECT $1, unnest($2::uuid[]), true`,
          [roleId, [...resolvedIds]],
        );
      }
      await recordAudit(client, {
        ...audit,
        eventType: "role.menus_replaced",
        entityType: "role",
        entityId: roleId,
        beforeData: { menus: before.rows.map((row) => row.code) },
        afterData: { menus: codes },
      });
      await client.query("COMMIT");
      return { role_id: roleId, menus: codes };
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof ApiError) throw error;
      translateDatabaseError(error);
    } finally {
      client.release();
    }
  }

  async listSystemConfiguration() {
    const [settings, features] = await Promise.all([
      this.db.query(
        `SELECT key, value, description, updated_at::text
         FROM sababuka.system_settings WHERE is_secret = false ORDER BY key`,
      ),
      this.db.query(
        `SELECT id::text, code, name, description, is_enabled, configuration, updated_at::text
         FROM sababuka.feature_flags ORDER BY code`,
      ),
    ]);
    return { settings: settings.rows, feature_flags: features.rows };
  }

  async getSystemDashboard() {
    const startedAt = Date.now();
    const [summary, organizations, indicators, categories] = await Promise.all([
      this.db.query<QueryResultRow & Record<string, number>>(
        `SELECT
           (SELECT count(*)::int FROM sababuka.organizations WHERE archived_at IS NULL AND is_active = true) AS active_organizations,
           (SELECT count(*)::int FROM sababuka.users WHERE archived_at IS NULL AND status = 'active') AS active_users,
           (SELECT count(*)::int FROM sababuka.users WHERE archived_at IS NULL AND status = 'invited') AS pending_users,
           (SELECT count(*)::int FROM sababuka.data_source_integrations WHERE status = 'active') AS active_integrations,
           (SELECT count(*)::int FROM sababuka.data_source_integrations WHERE status = 'error' OR last_sync_status = 'failed') AS failed_integrations,
           (SELECT count(*)::int FROM sababuka.connector_runs WHERE status = 'failed' AND created_at >= now() - interval '30 days') AS failed_runs_30d`,
      ),
      this.db.query<QueryResultRow & Record<string, unknown>>(
        `SELECT o.id::text, o.code, COALESCE(o.short_name, o.name) AS name,
                count(u.id)::int AS active_pic_count,
                count(*) OVER()::int AS total_count
         FROM sababuka.organizations o
         LEFT JOIN sababuka.organization_memberships om
           ON om.organization_id = o.id AND om.ends_at IS NULL
         LEFT JOIN sababuka.users u
           ON u.id = om.user_id AND u.archived_at IS NULL AND u.status = 'active'
         WHERE o.organization_type = 'opd' AND o.is_active = true AND o.archived_at IS NULL
         GROUP BY o.id
         HAVING count(u.id) = 0
         ORDER BY o.name, o.code
         LIMIT 8`,
      ),
      this.db.query<QueryResultRow & Record<string, unknown>>(
        `SELECT i.id::text, i.code, i.name, iv.status,
                array_remove(ARRAY[
                  CASE WHEN i.owner_organization_id IS NULL THEN 'OPD penanggung jawab belum ditetapkan' END,
                  CASE WHEN iv.id IS NULL THEN 'Versi indikator belum tersedia' END,
                  CASE WHEN iv.id IS NOT NULL AND iv.status <> 'active' THEN 'Tahap: ' || replace(iv.status, '_', ' ') END,
                  CASE WHEN iv.id IS NOT NULL AND NOT EXISTS (
                    SELECT 1 FROM sababuka.targets t WHERE t.indicator_version_id = iv.id
                  ) THEN 'Target tahunan belum tersedia' END
                ], NULL) AS reasons,
                count(*) OVER()::int AS total_count
         FROM sababuka.indicators i
         LEFT JOIN LATERAL (
           SELECT candidate.id, candidate.status
           FROM sababuka.indicator_versions candidate
           WHERE candidate.indicator_id = i.id
           ORDER BY candidate.version_number DESC
           LIMIT 1
         ) iv ON true
         WHERE i.is_active = true AND i.archived_at IS NULL
           AND (i.owner_organization_id IS NULL OR iv.id IS NULL OR iv.status <> 'active' OR NOT EXISTS (
             SELECT 1 FROM sababuka.targets t WHERE t.indicator_version_id = iv.id
           ))
         ORDER BY i.updated_at DESC, i.code
         LIMIT 8`,
      ),
      this.db.query<QueryResultRow & Record<string, unknown>>(
        `SELECT c.id::text, c.code, c.name, count(*) OVER()::int AS total_count
         FROM sababuka.categories c
         WHERE c.is_active = true AND NOT EXISTS (
           SELECT 1 FROM sababuka.indicators i
           WHERE i.category_id = c.id AND i.is_active = true AND i.archived_at IS NULL
         )
         ORDER BY c.name, c.code
         LIMIT 8`,
      ),
    ]);
    const totals = summary.rows[0] ?? {};
    return {
      generated_at: new Date().toISOString(),
      health: {
        status: Number(totals.failed_integrations ?? 0) + Number(totals.failed_runs_30d ?? 0) > 0 ? "attention" : "healthy",
        database: "healthy",
        database_response_ms: Date.now() - startedAt,
        failed_integrations: Number(totals.failed_integrations ?? 0),
        failed_runs_30d: Number(totals.failed_runs_30d ?? 0),
      },
      metrics: {
        active_organizations: Number(totals.active_organizations ?? 0),
        active_users: Number(totals.active_users ?? 0),
        pending_users: Number(totals.pending_users ?? 0),
        active_integrations: Number(totals.active_integrations ?? 0),
      },
      organizations_without_pic: { total: Number(organizations.rows[0]?.total_count ?? 0), data: organizations.rows },
      problematic_indicators: { total: Number(indicators.rows[0]?.total_count ?? 0), data: indicators.rows },
      empty_categories: { total: Number(categories.rows[0]?.total_count ?? 0), data: categories.rows },
    };
  }

  async upsertSetting(auth: AuthContext, key: string, value: unknown, description: string | null, audit: AuditContext) {
    requireGlobal(auth);
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      const before = await client.query<QueryResultRow & Record<string, unknown>>(
        `SELECT key, value, description FROM sababuka.system_settings WHERE key = $1 FOR UPDATE`,
        [key],
      );
      const result = await client.query<QueryResultRow & Record<string, unknown>>(
        `INSERT INTO sababuka.system_settings (key, value, description, updated_by)
         VALUES ($1, $2::jsonb, $3, $4)
         ON CONFLICT (key) DO UPDATE
         SET value = EXCLUDED.value, description = EXCLUDED.description, updated_by = EXCLUDED.updated_by
         RETURNING key, value, description, updated_at::text`,
        [key, JSON.stringify(value), description, auth.user.id],
      );
      await recordAudit(client, {
        ...audit,
        eventType: "system.setting_updated",
        entityType: "system_setting",
        entityId: null,
        beforeData: before.rows[0] ?? null,
        afterData: result.rows[0]!,
        metadata: { key },
      });
      await client.query("COMMIT");
      return result.rows[0]!;
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof ApiError) throw error;
      translateDatabaseError(error);
    } finally {
      client.release();
    }
  }

  async updateFeatureFlag(auth: AuthContext, code: string, enabled: boolean, configuration: Record<string, unknown>, audit: AuditContext) {
    requireGlobal(auth);
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      const before = await client.query<QueryResultRow & Record<string, unknown>>(
        `SELECT id::text, code, is_enabled, configuration
         FROM sababuka.feature_flags WHERE code = $1 FOR UPDATE`,
        [code],
      );
      if (!before.rowCount) throw new ApiError(404, "NOT_FOUND", "Feature flag tidak ditemukan.");
      const result = await client.query<QueryResultRow & Record<string, unknown>>(
        `UPDATE sababuka.feature_flags
         SET is_enabled = $2, configuration = $3::jsonb, updated_by = $4
         WHERE code = $1
         RETURNING id::text, code, name, description, is_enabled, configuration, updated_at::text`,
        [code, enabled, JSON.stringify(configuration), auth.user.id],
      );
      await recordAudit(client, {
        ...audit,
        eventType: "system.feature_flag_updated",
        entityType: "feature_flag",
        entityId: result.rows[0]!.id as string,
        beforeData: before.rows[0]!,
        afterData: result.rows[0]!,
      });
      await client.query("COMMIT");
      return result.rows[0]!;
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof ApiError) throw error;
      translateDatabaseError(error);
    } finally {
      client.release();
    }
  }
}
