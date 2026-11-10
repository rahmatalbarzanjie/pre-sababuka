import type { AppConfig } from "../config.js";
import type { Database, QueryResultRow } from "../database.js";
import { ApiError } from "../errors.js";
import { hashPassword, verifyPassword } from "../security/password.js";
import { hashToken, randomToken } from "../security/tokens.js";
import type {
  AuthContext,
  AuthOrganization,
  CurrentUser,
  EffectiveRole,
} from "../types/auth.js";
import { recordAudit } from "./audit-service.js";

interface UserRow extends QueryResultRow {
  id: string;
  email: string;
  full_name: string;
  mfa_required: boolean;
  must_change_password: boolean;
  password_hash: string | null;
  status: string;
  failed_login_count: number;
  locked_until: Date | null;
}

interface SessionRow extends QueryResultRow {
  session_id: string;
  csrf_token_hash: Buffer;
  user_id: string;
  email: string;
  full_name: string;
  mfa_required: boolean;
  must_change_password: boolean;
}

interface PermissionRow extends QueryResultRow {
  code: string;
}

interface MenuRow extends QueryResultRow {
  code: string;
  parent_code: string | null;
  label: string;
  icon: string | null;
  route_name: string | null;
  badge: string | null;
  navigation_disabled: boolean;
  display_order: number;
}

export interface LoginInput {
  identifier: string;
  password: string;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string;
}

export interface LoginResult {
  sessionToken: string;
  csrfToken: string;
  expiresAt: Date;
  user: CurrentUser;
}

export interface EffectiveMenuItem {
  code: string;
  label: string;
  icon: string | null;
  route_name: string | null;
  badge: string | null;
  navigation_disabled: boolean;
  display_order: number;
  children: EffectiveMenuItem[];
}

const dummyPasswordHash = hashPassword(randomToken(24));

export class AuthService {
  constructor(
    private readonly db: Database,
    private readonly config: AppConfig,
  ) {}

  async login(input: LoginInput): Promise<LoginResult | null> {
    const result = await this.db.query<UserRow>(
      `SELECT id, email::text, full_name, password_hash, status,
              failed_login_count, locked_until, mfa_required
       FROM sababuka.users
       WHERE email = $1::citext OR username = $1::citext
       LIMIT 1`,
      [input.identifier],
    );
    const user = result.rows[0];

    if (!user) {
      await verifyPassword(await dummyPasswordHash, input.password);
      await this.auditFailedLogin(null, input, "unknown_identifier");
      return null;
    }

    if (user.status === "invited" && user.password_hash) {
      const passwordValid = await verifyPassword(user.password_hash, input.password);
      if (passwordValid) {
        throw new ApiError(403, "ACCOUNT_PENDING", "Akun masih menunggu persetujuan Superadmin SABABUKA.");
      }
      await this.recordLoginFailure(user, input, "invalid_password");
      return null;
    }

    if (
      user.status !== "active" ||
      (user.locked_until !== null && user.locked_until.getTime() > Date.now()) ||
      !user.password_hash
    ) {
      await verifyPassword(await dummyPasswordHash, input.password);
      await this.auditFailedLogin(user.id, input, "account_unavailable");
      return null;
    }

    const passwordValid = await verifyPassword(user.password_hash, input.password);
    if (!passwordValid) {
      await this.recordLoginFailure(user, input, "invalid_password");
      return null;
    }

    const sessionToken = randomToken();
    const csrfToken = randomToken();
    const expiresAt = new Date(Date.now() + this.config.sessionTtlSeconds * 1000);
    const client = await this.db.connect();
    let sessionId: string;

    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE sababuka.users
         SET failed_login_count = 0, locked_until = NULL, last_login_at = now()
         WHERE id = $1`,
        [user.id],
      );
      const session = await client.query<{ id: string }>(
        `INSERT INTO sababuka.auth_sessions
           (user_id, token_hash, csrf_token_hash, ip_address, user_agent, expires_at)
         VALUES ($1, $2, $3, $4::inet, $5, $6)
         RETURNING id`,
        [user.id, hashToken(sessionToken), hashToken(csrfToken), input.ipAddress, input.userAgent, expiresAt],
      );
      sessionId = session.rows[0]!.id;
      await recordAudit(client, {
        actorId: user.id,
        eventType: "auth.login_succeeded",
        entityType: "auth_session",
        entityId: sessionId,
        requestId: input.requestId,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      });
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    const auth = await this.getAuthContext(hashToken(sessionToken));
    if (!auth) throw new Error("Sesi yang baru dibuat tidak dapat dimuat.");

    return { sessionToken, csrfToken, expiresAt, user: auth.user };
  }

  async getAuthContext(tokenHash: Buffer): Promise<AuthContext | null> {
    const result = await this.db.query<SessionRow>(
      `SELECT s.id AS session_id, s.csrf_token_hash, u.id AS user_id,
              u.email::text, u.full_name, u.mfa_required, u.must_change_password
       FROM sababuka.auth_sessions s
       JOIN sababuka.users u ON u.id = s.user_id
       WHERE s.token_hash = $1
         AND s.revoked_at IS NULL
         AND s.expires_at > now()
         AND u.status = 'active'
         AND (u.locked_until IS NULL OR u.locked_until <= now())
       LIMIT 1`,
      [tokenHash],
    );
    const session = result.rows[0];
    if (!session) return null;

    const [rolesResult, permissionsResult, organizationsResult] = await Promise.all([
      this.db.query<EffectiveRole & QueryResultRow>(
        `SELECT r.code, ura.scope_type, ura.organization_id::text
         FROM sababuka.user_role_assignments ura
         JOIN sababuka.roles r ON r.id = ura.role_id AND r.is_active = true
         WHERE ura.user_id = $1
           AND ura.starts_at <= now()
           AND (ura.ends_at IS NULL OR ura.ends_at > now())
         ORDER BY r.code, ura.scope_type, ura.organization_id`,
        [session.user_id],
      ),
      this.db.query<PermissionRow>(
        `SELECT DISTINCT p.code
         FROM sababuka.user_role_assignments ura
         JOIN sababuka.roles r ON r.id = ura.role_id AND r.is_active = true
         JOIN sababuka.role_permissions rp ON rp.role_id = r.id
         JOIN sababuka.permissions p ON p.id = rp.permission_id
         WHERE ura.user_id = $1
           AND ura.starts_at <= now()
           AND (ura.ends_at IS NULL OR ura.ends_at > now())
         ORDER BY p.code`,
        [session.user_id],
      ),
      this.db.query<AuthOrganization & QueryResultRow>(
        `SELECT DISTINCT o.id::text, o.code, o.name, o.short_name,
                o.organization_type, o.parent_id::text, o.is_active,
                o.created_at::text, o.updated_at::text
         FROM sababuka.organizations o
         WHERE o.id IN (
           SELECT om.organization_id
           FROM sababuka.organization_memberships om
           WHERE om.user_id = $1
             AND om.starts_at <= now()
             AND (om.ends_at IS NULL OR om.ends_at > now())
           UNION
           SELECT ura.organization_id
           FROM sababuka.user_role_assignments ura
           WHERE ura.user_id = $1
             AND ura.organization_id IS NOT NULL
             AND ura.starts_at <= now()
             AND (ura.ends_at IS NULL OR ura.ends_at > now())
         )
         ORDER BY o.name`,
        [session.user_id],
      ),
    ]);

    await this.db.query(
      `UPDATE sababuka.auth_sessions
       SET last_seen_at = now()
       WHERE id = $1 AND last_seen_at < now() - interval '5 minutes'`,
      [session.session_id],
    );

    return {
      sessionId: session.session_id,
      csrfTokenHash: session.csrf_token_hash,
      user: {
        id: session.user_id,
        email: session.email,
        full_name: session.full_name,
        mfa_required: session.mfa_required,
        must_change_password: session.must_change_password,
        roles: rolesResult.rows,
        permissions: permissionsResult.rows.map((row) => row.code),
        organizations: organizationsResult.rows,
      },
    };
  }

  async getPreviewAuthContext(auth: AuthContext, roleCode: string, organizationId?: string): Promise<AuthContext> {
    if (!auth.user.roles.some((role) => role.code === "superadmin" && role.scope_type === "global")) {
      throw new ApiError(403, "PERMISSION_DENIED", "Pratinjau peran hanya tersedia untuk Developer.");
    }
    const allowed = new Set(["bapperida", "kominfo", "pembina_statistik", "opd", "pimpinan"]);
    if (!allowed.has(roleCode)) throw new ApiError(400, "VALIDATION_ERROR", "Peran pratinjau tidak valid.");
    if (roleCode === "opd" && !organizationId) throw new ApiError(400, "VALIDATION_ERROR", "Pilih OPD yang akan ditinjau.");

    const role = await this.db.query<{ id: string; code: string } & QueryResultRow>(
      `SELECT id::text, code FROM sababuka.roles WHERE code = $1 AND is_active = true`, [roleCode],
    );
    if (!role.rows[0]) throw new ApiError(404, "NOT_FOUND", "Peran pratinjau belum tersedia.");
    const scopeType: EffectiveRole["scope_type"] = roleCode === "opd" ? "organization" : roleCode === "pimpinan" ? "published" : "global";
    const organizationCode = roleCode === "bapperida" ? "BAPPERIDA" : roleCode === "kominfo" ? "DISKOMINFOSANTIK" : roleCode === "pembina_statistik" ? "BPS_KAPUAS" : roleCode === "pimpinan" ? "KAPUAS" : null;
    const organization = await this.db.query<AuthOrganization & QueryResultRow>(
      `SELECT id::text, code, name, short_name, organization_type, parent_id::text,
              is_active, created_at::text, updated_at::text
       FROM sababuka.organizations
       WHERE archived_at IS NULL AND is_active = true
         AND ($1::uuid IS NOT NULL AND id = $1::uuid OR $1::uuid IS NULL AND code = $2::varchar)
       LIMIT 1`, [roleCode === "opd" ? organizationId : null, organizationCode],
    );
    if (!organization.rows[0]) throw new ApiError(404, "NOT_FOUND", roleCode === "opd" ? "OPD tidak ditemukan atau tidak aktif." : "Organisasi peran belum tersedia.");
    if (roleCode === "opd" && organization.rows[0].organization_type !== "opd") throw new ApiError(400, "VALIDATION_ERROR", "Organisasi yang dipilih bukan OPD.");
    const permissions = await this.db.query<PermissionRow>(
      `SELECT DISTINCT p.code FROM sababuka.role_permissions rp
       JOIN sababuka.permissions p ON p.id = rp.permission_id
       WHERE rp.role_id = $1 ORDER BY p.code`, [role.rows[0].id],
    );
    const roleLabel = roleCode === "bapperida" ? "BAPPERIDA" : roleCode === "kominfo" ? "Walidata Diskominfosantik" : roleCode === "pembina_statistik" ? "Pembina Data Statistik BPS" : roleCode === "pimpinan" ? "Pimpinan" : `OPD ${organization.rows[0].short_name ?? organization.rows[0].name}`;
    return {
      sessionId: auth.sessionId,
      csrfTokenHash: auth.csrfTokenHash,
      user: {
        id: auth.user.id,
        email: auth.user.email,
        full_name: `Pratinjau ${roleLabel}`,
        mfa_required: false,
        must_change_password: false,
        roles: [{ code: roleCode, scope_type: scopeType, organization_id: roleCode === "opd" ? organization.rows[0].id : null }],
        permissions: permissions.rows.map((row) => row.code),
        organizations: [organization.rows[0]],
        simulation: { active: true, role_code: roleCode as "bapperida" | "kominfo" | "pembina_statistik" | "opd" | "pimpinan", organization_id: roleCode === "opd" ? organization.rows[0].id : null, organization_name: organization.rows[0].name, original_full_name: auth.user.full_name, original_email: auth.user.email },
      },
    };
  }

  async logout(
    auth: AuthContext,
    request: { requestId: string; ipAddress: string | null; userAgent: string | null },
  ): Promise<void> {
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE sababuka.auth_sessions
         SET revoked_at = now(), revoke_reason = 'user_logout'
         WHERE id = $1 AND revoked_at IS NULL`,
        [auth.sessionId],
      );
      await recordAudit(client, {
        actorId: auth.user.id,
        eventType: "auth.logout",
        entityType: "auth_session",
        entityId: auth.sessionId,
        requestId: request.requestId,
        ipAddress: request.ipAddress,
        userAgent: request.userAgent,
      });
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getMenu(userId: string): Promise<EffectiveMenuItem[]> {
    const result = await this.db.query<MenuRow>(
      `SELECT DISTINCT m.code, parent.code AS parent_code, m.label, m.icon,
              m.route_name, m.badge, m.navigation_disabled,
              COALESCE(rmi.display_order, m.display_order) AS display_order
       FROM sababuka.user_role_assignments ura
       JOIN sababuka.roles r ON r.id = ura.role_id AND r.is_active = true
       JOIN sababuka.role_menu_items rmi ON rmi.role_id = r.id AND rmi.is_visible = true
       JOIN sababuka.menu_items m ON m.id = rmi.menu_item_id AND m.is_active = true
       LEFT JOIN sababuka.menu_items parent ON parent.id = m.parent_id
       WHERE ura.user_id = $1
         AND ura.starts_at <= now()
         AND (ura.ends_at IS NULL OR ura.ends_at > now())
         AND (
           m.required_permission IS NULL
           OR EXISTS (
             SELECT 1
             FROM sababuka.role_permissions rp
             JOIN sababuka.permissions p ON p.id = rp.permission_id
             WHERE rp.role_id = r.id AND p.code = m.required_permission
           )
         )
       ORDER BY display_order, m.label`,
      [userId],
    );

    const items = new Map<string, EffectiveMenuItem>();
    for (const row of result.rows) {
      items.set(row.code, {
        code: row.code,
        label: row.label,
        icon: row.icon,
        route_name: row.route_name,
        badge: row.badge,
        navigation_disabled: row.navigation_disabled,
        display_order: row.display_order,
        children: [],
      });
    }

    const roots: EffectiveMenuItem[] = [];
    for (const row of result.rows) {
      const item = items.get(row.code)!;
      const parent = row.parent_code ? items.get(row.parent_code) : undefined;
      if (parent) parent.children.push(item);
      else roots.push(item);
    }

    const sortItems = (entries: EffectiveMenuItem[]): void => {
      entries.sort((a, b) => a.display_order - b.display_order || a.label.localeCompare(b.label, "id"));
      for (const entry of entries) sortItems(entry.children);
    };
    sortItems(roots);
    return roots;
  }

  async getMenuForRoles(roleCodes: string[]): Promise<EffectiveMenuItem[]> {
    const result = await this.db.query<MenuRow>(
      `SELECT DISTINCT m.code, parent.code AS parent_code, m.label, m.icon,
              m.route_name, m.badge, m.navigation_disabled,
              COALESCE(rmi.display_order, m.display_order) AS display_order
       FROM sababuka.roles r
       JOIN sababuka.role_menu_items rmi ON rmi.role_id = r.id AND rmi.is_visible = true
       JOIN sababuka.menu_items m ON m.id = rmi.menu_item_id AND m.is_active = true
       LEFT JOIN sababuka.menu_items parent ON parent.id = m.parent_id
       WHERE r.code = ANY($1::varchar[]) AND r.is_active = true
         AND (m.required_permission IS NULL OR EXISTS (
           SELECT 1 FROM sababuka.role_permissions rp
           JOIN sababuka.permissions p ON p.id = rp.permission_id
           WHERE rp.role_id = r.id AND p.code = m.required_permission
         ))
       ORDER BY display_order, m.label`, [roleCodes],
    );
    const items = new Map<string, EffectiveMenuItem>();
    for (const row of result.rows) items.set(row.code, { code: row.code, label: row.label, icon: row.icon, route_name: row.route_name, badge: row.badge, navigation_disabled: row.navigation_disabled, display_order: row.display_order, children: [] });
    const roots: EffectiveMenuItem[] = [];
    for (const row of result.rows) {
      const item = items.get(row.code)!; const parent = row.parent_code ? items.get(row.parent_code) : undefined;
      if (parent) parent.children.push(item); else roots.push(item);
    }
    const sortItems = (entries: EffectiveMenuItem[]): void => { entries.sort((a, b) => a.display_order - b.display_order || a.label.localeCompare(b.label, "id")); for (const entry of entries) sortItems(entry.children); };
    sortItems(roots);
    return roots;
  }

  private async recordLoginFailure(user: UserRow, input: LoginInput, reason: string): Promise<void> {
    const nextCount = user.failed_login_count + 1;
    const lockAccount = nextCount >= this.config.loginMaxFailures;
    await this.db.query(
      `UPDATE sababuka.users
       SET failed_login_count = $2,
           locked_until = CASE WHEN $3 THEN now() + ($4 * interval '1 second') ELSE locked_until END
       WHERE id = $1`,
      [user.id, nextCount, lockAccount, this.config.loginLockSeconds],
    );
    await this.auditFailedLogin(user.id, input, lockAccount ? "locked" : reason);
  }

  private async auditFailedLogin(
    actorId: string | null,
    input: LoginInput,
    reason: string,
  ): Promise<void> {
    await recordAudit(this.db, {
      actorId,
      eventType: "auth.login_failed",
      entityType: "user",
      entityId: actorId,
      requestId: input.requestId,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      metadata: { reason },
    });
  }
}
