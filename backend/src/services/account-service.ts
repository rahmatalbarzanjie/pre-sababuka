import type { AppConfig } from "../config.js";
import type { Database, QueryResultRow } from "../database.js";
import { ApiError } from "../errors.js";
import { hashPassword, verifyPassword } from "../security/password.js";
import { hashToken } from "../security/tokens.js";
import type { AuthContext } from "../types/auth.js";
import { recordAudit, type AuditContext } from "./audit-service.js";
import { notifyRole } from "./notification-service.js";

interface InvitationRow extends QueryResultRow {
  invitation_id: string;
  user_id: string;
  email: string;
  full_name: string;
  expires_at: Date;
  purpose: "invitation" | "password_reset";
  user_status: string;
}

export interface SelfRegistrationInput {
  email: string;
  username?: string | null;
  full_name: string;
  organization_id: string;
  contact_phone: string;
  job_title: string;
  employee_id?: string | null;
  request_note?: string | null;
  password: string;
}

export class AccountService {
  constructor(
    private readonly db: Database,
    private readonly config: AppConfig,
  ) {}

  async changePassword(auth: AuthContext, currentPassword: string, newPassword: string, audit: AuditContext) {
    if (currentPassword === newPassword) throw new ApiError(400, "VALIDATION_ERROR", "Kata sandi baru harus berbeda dari kata sandi awal.");
    const current = await this.db.query<{ password_hash: string | null }>(
      `SELECT password_hash FROM sababuka.users WHERE id = $1 AND status = 'active'`, [auth.user.id],
    );
    const hash = current.rows[0]?.password_hash;
    if (!hash || !(await verifyPassword(hash, currentPassword))) {
      throw new ApiError(401, "INVALID_CREDENTIALS", "Kata sandi saat ini tidak sesuai.");
    }
    const passwordHash = await hashPassword(newPassword);
    await this.db.query(
      `UPDATE sababuka.users SET password_hash = $2, must_change_password = false, failed_login_count = 0, locked_until = NULL, updated_at = now() WHERE id = $1`,
      [auth.user.id, passwordHash],
    );
    await recordAudit(this.db, { ...audit, actorId: auth.user.id, eventType: "auth.password_changed", entityType: "user", entityId: auth.user.id });
    return { changed: true };
  }

  async updateProfile(auth: AuthContext, fullName: string, audit: AuditContext) {
    const name = fullName.trim().replace(/s+/gu, " ");
    if (name.length < 3) throw new ApiError(400, "VALIDATION_ERROR", "Nama lengkap minimal 3 karakter.");
    const before = await this.db.query<{ full_name: string }>(`SELECT full_name FROM sababuka.users WHERE id = $1`, [auth.user.id]);
    await this.db.query(`UPDATE sababuka.users SET full_name = $2, updated_at = now() WHERE id = $1`, [auth.user.id, name]);
    await recordAudit(this.db, { ...audit, actorId: auth.user.id, eventType: "user.profile_updated", entityType: "user", entityId: auth.user.id, beforeData: { full_name: before.rows[0]?.full_name }, afterData: { full_name: name } });
    return { full_name: name };
  }

  async registrationOrganizations() {
    const result = await this.db.query<QueryResultRow & Record<string, unknown>>(
      `SELECT id::text, code, name, short_name, organization_type
       FROM sababuka.organizations
       WHERE is_active = true AND archived_at IS NULL
         AND organization_type IN ('opd', 'vertical_agency')
       ORDER BY name, code`,
    );
    return { data: result.rows };
  }

  async register(input: SelfRegistrationInput, audit: AuditContext) {
    const passwordHash = await hashPassword(input.password);
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      const organization = await client.query<{ id: string; code: string } & QueryResultRow>(
        `SELECT id::text, code FROM sababuka.organizations
         WHERE id = $1 AND is_active = true AND archived_at IS NULL
           AND organization_type IN ('opd', 'vertical_agency')
         FOR SHARE`,
        [input.organization_id],
      );
      if (!organization.rowCount) throw new ApiError(404, "NOT_FOUND", "Organisasi tidak ditemukan atau sudah tidak aktif.");

      const accountLimit = 1;
      const occupied = await client.query<{ count: string } & QueryResultRow>(
        `SELECT count(DISTINCT u.id)::text AS count
         FROM sababuka.users u
         JOIN sababuka.organization_memberships om ON om.user_id = u.id
         LEFT JOIN sababuka.user_registration_requests rr ON rr.user_id = u.id
         WHERE om.organization_id = $1 AND om.ends_at IS NULL
           AND u.archived_at IS NULL AND u.status IN ('invited','active','locked')
           AND COALESCE(rr.status, 'approved') <> 'rejected'`,
        [input.organization_id],
      );
      if (Number(occupied.rows[0]?.count ?? 0) >= accountLimit) {
        throw new ApiError(409, "CONFLICT", "Instansi ini sudah memiliki satu akun PIC. Hubungi Pengelola Sistem jika PIC perlu diganti.");
      }

      const result = await client.query<QueryResultRow & Record<string, unknown>>(
        `INSERT INTO sababuka.users
           (email, username, full_name, password_hash, status, must_change_password, mfa_required)
         VALUES ($1, $2, $3, $4, 'invited', false, false)
         RETURNING id::text, email::text, username::text, full_name, status, created_at::text`,
        [input.email.trim().toLowerCase(), input.username?.trim() || null, input.full_name.trim(), passwordHash],
      );
      const user = result.rows[0]!;
      await client.query(
        `INSERT INTO sababuka.organization_memberships
           (user_id, organization_id, membership_type, is_primary)
         VALUES ($1, $2, 'applicant', true)`,
        [user.id, input.organization_id],
      );
      await client.query(
        `INSERT INTO sababuka.user_registration_requests
           (user_id, requested_organization_id, contact_email, contact_phone,
            job_title, employee_id, request_note)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          user.id,
          input.organization_id,
          input.email.trim().toLowerCase(),
          input.contact_phone.trim(),
          input.job_title.trim(),
          input.employee_id?.trim() || null,
          input.request_note?.trim() || null,
        ],
      );
      await recordAudit(client, {
        ...audit,
        actorId: user.id as string,
        eventType: "user.registration_requested",
        entityType: "user",
        entityId: user.id as string,
        organizationId: input.organization_id,
        afterData: {
          ...user,
          requested_organization_id: input.organization_id,
          contact_phone: input.contact_phone.trim(),
          job_title: input.job_title.trim(),
          employee_id: input.employee_id?.trim() || null,
        },
      });
      await notifyRole(client, "superadmin", {
        type: "user.registration_requested",
        title: "Pendaftaran PIC baru",
        message: `${input.full_name.trim()} mendaftar sebagai perwakilan ${organization.rows[0]!.code}. Periksa identitas, instansi, dan perannya.`,
        entityType: "user",
        entityId: user.id as string,
      });
      await client.query("COMMIT");
      return {
        email: user.email,
        status: "pending_approval",
        message: "Pendaftaran berhasil. Superadmin akan memverifikasi identitas PIC, instansi, dan peran sebelum akun dapat digunakan.",
      };
    } catch (error) {
      await client.query("ROLLBACK");
      if ((error as { code?: string }).code === "23505") {
        throw new ApiError(409, "CONFLICT", "Email atau username sudah terdaftar.");
      }
      if (error instanceof ApiError) throw error;
      throw error;
    } finally {
      client.release();
    }
  }

  private async validInvitation(executor: unknown, token: string, lock = false) {
    const result = await (executor as Database).query<InvitationRow>(
      `SELECT i.id::text AS invitation_id, u.id::text AS user_id,
              u.email::text, u.full_name, i.expires_at, i.purpose, u.status AS user_status
       FROM sababuka.user_invitations i
       JOIN sababuka.users u ON u.id = i.user_id
       WHERE i.token_hash = $1
         AND i.accepted_at IS NULL
         AND i.revoked_at IS NULL
         AND i.expires_at > now()
         AND ((i.purpose = 'invitation' AND u.status = 'invited')
           OR (i.purpose = 'password_reset' AND u.status IN ('active', 'invited')))
         AND u.archived_at IS NULL
       LIMIT 1${lock ? " FOR UPDATE OF i, u" : ""}`,
      [hashToken(token)],
    );
    const invitation = result.rows[0];
    if (!invitation) throw new ApiError(404, "INVITATION_INVALID", "Undangan tidak valid atau telah kedaluwarsa.");
    return invitation;
  }

  async inspectInvitation(token: string) {
    const invitation = await this.validInvitation(this.db, token);
    return {
      email: invitation.email,
      full_name: invitation.full_name,
      expires_at: invitation.expires_at.toISOString(),
      purpose: invitation.purpose,
    };
  }

  async acceptInvitation(token: string, password: string, audit: AuditContext) {
    const passwordHash = await hashPassword(password);
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      const invitation = await this.validInvitation(client, token, true);
      if (invitation.purpose === "password_reset") {
        await client.query(
          `UPDATE sababuka.users
           SET password_hash = $2, must_change_password = false,
               failed_login_count = 0, locked_until = NULL
           WHERE id = $1`,
          [invitation.user_id, passwordHash],
        );
        await client.query(`UPDATE sababuka.user_invitations SET accepted_at = now() WHERE id = $1`, [invitation.invitation_id]);
        await client.query(
          `UPDATE sababuka.auth_sessions SET revoked_at = now(), revoke_reason = 'password_reset'
           WHERE user_id = $1 AND revoked_at IS NULL`,
          [invitation.user_id],
        );
        await recordAudit(client, {
          ...audit,
          actorId: invitation.user_id,
          eventType: "auth.password_reset_completed",
          entityType: "user",
          entityId: invitation.user_id,
          metadata: { invitation_id: invitation.invitation_id },
        });
        await client.query("COMMIT");
        return { email: invitation.email, status: invitation.user_status === "active" ? "active" : "pending_approval" };
      }
      const pendingRegistration = await client.query<{ exists: boolean } & QueryResultRow>(
        `SELECT EXISTS (
           SELECT 1 FROM sababuka.user_registration_requests
           WHERE user_id = $1 AND status = 'pending'
         ) AS exists`,
        [invitation.user_id],
      );
      const nextStatus = pendingRegistration.rows[0]?.exists ? "invited" : "active";
      await client.query(
        `UPDATE sababuka.users
         SET password_hash = $2, status = $3, must_change_password = false,
             mfa_required = false, failed_login_count = 0, locked_until = NULL
         WHERE id = $1`,
        [invitation.user_id, passwordHash, nextStatus],
      );
      await client.query(
        `UPDATE sababuka.user_invitations SET accepted_at = now() WHERE id = $1`,
        [invitation.invitation_id],
      );
      await recordAudit(client, {
        ...audit,
        actorId: invitation.user_id,
        eventType: "auth.invitation_accepted",
        entityType: "user",
        entityId: invitation.user_id,
        metadata: { invitation_id: invitation.invitation_id },
      });
      await client.query("COMMIT");
      return {
        email: invitation.email,
        status: nextStatus === "active" ? "active" : "pending_approval",
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
