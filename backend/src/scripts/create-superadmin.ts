import { loadConfig } from "../config.js";
import { createDatabase } from "../database.js";
import { hashPassword } from "../security/password.js";

const config = loadConfig();

const email = process.env.SUPERADMIN_EMAIL?.trim();
const fullName = process.env.SUPERADMIN_NAME?.trim();
const password = process.env.SUPERADMIN_PASSWORD;

if (!email || !fullName || !password) {
  throw new Error("SUPERADMIN_EMAIL, SUPERADMIN_NAME, dan SUPERADMIN_PASSWORD wajib diatur.");
}
if (password.length < 16) {
  throw new Error("SUPERADMIN_PASSWORD minimal 16 karakter.");
}

const db = createDatabase(config.databaseUrl);
const client = await db.connect();

try {
  const passwordHash = await hashPassword(password);
  await client.query("BEGIN");
  const userResult = await client.query<{ id: string }>(
    `INSERT INTO sababuka.users
       (email, full_name, password_hash, status, must_change_password, mfa_required)
     VALUES ($1, $2, $3, 'active', false, false)
     ON CONFLICT (email) DO UPDATE
     SET full_name = EXCLUDED.full_name,
         password_hash = EXCLUDED.password_hash,
         status = 'active',
         failed_login_count = 0,
         locked_until = NULL
     RETURNING id`,
    [email, fullName, passwordHash],
  );
  const userId = userResult.rows[0]!.id;

  await client.query(
    `INSERT INTO sababuka.organization_memberships
       (user_id, organization_id, membership_type, is_primary)
     SELECT $1, o.id, 'administrator', true
     FROM sababuka.organizations o
     WHERE o.code = 'KAPUAS'
     ON CONFLICT (user_id, organization_id) DO UPDATE
     SET membership_type = EXCLUDED.membership_type,
         is_primary = true,
         ends_at = NULL`,
    [userId],
  );

  await client.query(
    `INSERT INTO sababuka.user_role_assignments
       (user_id, role_id, organization_id, scope_type, assigned_by)
     SELECT $1, r.id, NULL, 'global', $1
     FROM sababuka.roles r
     WHERE r.code = 'superadmin'
     ON CONFLICT (user_id, role_id, organization_id, scope_type)
     DO UPDATE SET ends_at = NULL`,
    [userId],
  );

  await client.query(
    `INSERT INTO sababuka.audit_events
       (actor_id, event_type, entity_type, entity_id, metadata)
     VALUES ($1, 'user.superadmin_bootstrapped', 'user', $1, $2::jsonb)`,
    [userId, JSON.stringify({ environment: config.nodeEnv })],
  );
  await client.query("COMMIT");
  console.log(`Akun Developer siap: ${email}`);
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await db.end();
}
