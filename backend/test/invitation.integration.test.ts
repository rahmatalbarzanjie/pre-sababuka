import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../src/app.js";
import { createDatabase } from "../src/database.js";
import { testConfig } from "./test-config.js";

const databaseUrl = process.env.INTEGRATION_DATABASE_URL;
const adminEmail = process.env.INTEGRATION_ADMIN_EMAIL ?? "admin.integration@sababuka.test";
const adminPassword = process.env.INTEGRATION_ADMIN_PASSWORD ?? "integration-password-not-for-production";

test(
  "undangan, aktivasi dengan kata sandi, dan login tanpa MFA berjalan end-to-end",
  { skip: !databaseUrl },
  async () => {
    const db = createDatabase(databaseUrl!);
    const app = await buildApp({
      config: { ...testConfig, databaseUrl: databaseUrl! },
      db,
      logger: false,
    });

    try {
      const adminLogin = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { identifier: adminEmail, password: adminPassword },
      });
      assert.equal(adminLogin.statusCode, 200, adminLogin.body);
      const adminAuth = adminLogin.json();
      const adminCookie = String(adminLogin.headers["set-cookie"]).split(";", 1)[0]!;
      const adminHeaders = { cookie: adminCookie, "x-csrf-token": adminAuth.csrf_token };

      const organization = await app.inject({
        method: "POST",
        url: "/api/v1/organizations",
        headers: adminHeaders,
        payload: { code: "MFA_TEST_OPD", name: "MFA Integration OPD", organization_type: "opd" },
      });
      assert.equal(organization.statusCode, 201, organization.body);
      const organizationId = organization.json().id as string;

      const invitedUser = await app.inject({
        method: "POST",
        url: "/api/v1/users",
        headers: adminHeaders,
        payload: {
          email: "mfa.integration@sababuka.test",
          full_name: "Pengguna MFA Integration",
          organization_id: organizationId,
        },
      });
      assert.equal(invitedUser.statusCode, 201, invitedUser.body);
      const invitationToken = invitedUser.json().invitation_token as string;
      const userId = invitedUser.json().id as string;
      assert.ok(invitationToken.length >= 32);

      const roles = await app.inject({ method: "GET", url: "/api/v1/roles", headers: { cookie: adminCookie } });
      const opdRole = roles.json().data.find((role: { code: string }) => role.code === "opd");
      assert.ok(opdRole?.id);
      const assignment = await app.inject({
        method: "POST",
        url: `/api/v1/users/${userId}/role-assignments`,
        headers: adminHeaders,
        payload: { role_id: opdRole.id, scope_type: "organization", organization_id: organizationId },
      });
      assert.equal(assignment.statusCode, 201, assignment.body);

      const invitation = await app.inject({
        method: "GET",
        url: `/api/v1/auth/invitations/${invitationToken}`,
      });
      assert.equal(invitation.statusCode, 200, invitation.body);
      assert.equal(invitation.json().email, "mfa.integration@sababuka.test");

      const userPassword = "Mfa-Integration-Password-2026!";
      const accepted = await app.inject({
        method: "POST",
        url: `/api/v1/auth/invitations/${invitationToken}/accept`,
        payload: { password: userPassword },
      });
      assert.equal(accepted.statusCode, 200, accepted.body);
      assert.equal(accepted.json().status, "active");

      const reusedInvitation = await app.inject({
        method: "GET",
        url: `/api/v1/auth/invitations/${invitationToken}`,
      });
      assert.equal(reusedInvitation.statusCode, 404, reusedInvitation.body);

      const login = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { identifier: "mfa.integration@sababuka.test", password: userPassword },
      });
      assert.equal(login.statusCode, 200, login.body);
      assert.equal(login.json().user.mfa_required, false);
      const cookie = String(login.headers["set-cookie"]).split(";", 1)[0]!;
      const logout = await app.inject({
        method: "POST",
        url: "/api/v1/auth/logout",
        headers: { cookie, "x-csrf-token": login.json().csrf_token },
      });
      assert.equal(logout.statusCode, 204, logout.body);
    } finally {
      await app.close();
      await db.end();
    }
  },
);

test(
  "Superadmin menerbitkan tautan atur ulang; kata sandi baru berlaku, sesi lama dicabut, tautan sekali pakai",
  { skip: !databaseUrl },
  async () => {
    const stamp = Date.now();
    const db = createDatabase(databaseUrl!);
    const app = await buildApp({ config: { ...testConfig, databaseUrl: databaseUrl! }, db, logger: false });
    try {
      const adminLogin = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { identifier: adminEmail, password: adminPassword } });
      assert.equal(adminLogin.statusCode, 200, adminLogin.body);
      const adminCookie = String(adminLogin.headers["set-cookie"]).split(";", 1)[0]!;
      const adminHeaders = { cookie: adminCookie, "x-csrf-token": adminLogin.json().csrf_token };

      const organization = await app.inject({ method: "POST", url: "/api/v1/organizations", headers: adminHeaders, payload: { code: `RESET_TEST_${stamp}`, name: `Reset Integration OPD ${stamp}`, organization_type: "opd" } });
      assert.equal(organization.statusCode, 201, organization.body);
      const organizationId = organization.json().id as string;
      const email = `reset.${stamp}@sababuka.test`;
      const invited = await app.inject({ method: "POST", url: "/api/v1/users", headers: adminHeaders, payload: { email, full_name: "Pengguna Reset Integration", organization_id: organizationId } });
      assert.equal(invited.statusCode, 201, invited.body);
      const userId = invited.json().id as string;
      const roles = await app.inject({ method: "GET", url: "/api/v1/roles", headers: { cookie: adminCookie } });
      const opdRole = roles.json().data.find((role: { code: string }) => role.code === "opd");
      const assignment = await app.inject({ method: "POST", url: `/api/v1/users/${userId}/role-assignments`, headers: adminHeaders, payload: { role_id: opdRole.id, scope_type: "organization", organization_id: organizationId } });
      assert.equal(assignment.statusCode, 201, assignment.body);
      const firstPassword = "Reset-Integration-Sandi-Awal-2026!";
      const accepted = await app.inject({ method: "POST", url: `/api/v1/auth/invitations/${invited.json().invitation_token}/accept`, payload: { password: firstPassword } });
      assert.equal(accepted.statusCode, 200, accepted.body);

      const oldLogin = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { identifier: email, password: firstPassword } });
      assert.equal(oldLogin.statusCode, 200, oldLogin.body);
      const oldCookie = String(oldLogin.headers["set-cookie"]).split(";", 1)[0]!;
      const oldCsrf = oldLogin.json().csrf_token as string;

      const forbidden = await app.inject({ method: "POST", url: `/api/v1/users/${userId}/password-reset`, headers: { cookie: oldCookie, "x-csrf-token": oldCsrf } });
      assert.equal(forbidden.statusCode, 403, forbidden.body);

      const issued = await app.inject({ method: "POST", url: `/api/v1/users/${userId}/password-reset`, headers: adminHeaders });
      assert.equal(issued.statusCode, 201, issued.body);
      assert.equal(issued.json().purpose, "password_reset");
      const resetToken = issued.json().invitation_token as string;

      const info = await app.inject({ method: "GET", url: `/api/v1/auth/invitations/${resetToken}` });
      assert.equal(info.statusCode, 200, info.body);
      assert.equal(info.json().purpose, "password_reset");

      // kata sandi lama boleh dipakai kembali
      const reset = await app.inject({ method: "POST", url: `/api/v1/auth/invitations/${resetToken}/accept`, payload: { password: firstPassword } });
      assert.equal(reset.statusCode, 200, reset.body);
      assert.equal(reset.json().status, "active");

      const reused = await app.inject({ method: "GET", url: `/api/v1/auth/invitations/${resetToken}` });
      assert.equal(reused.statusCode, 404, reused.body);
      const staleSession = await app.inject({ method: "GET", url: "/api/v1/me", headers: { cookie: oldCookie } });
      assert.equal(staleSession.statusCode, 401, staleSession.body);
      const newLogin = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { identifier: email, password: firstPassword } });
      assert.equal(newLogin.statusCode, 200, newLogin.body);

      const suspended = await app.inject({ method: "PATCH", url: `/api/v1/users/${userId}`, headers: adminHeaders, payload: { status: "suspended" } });
      assert.equal(suspended.statusCode, 200, suspended.body);
      const blocked = await app.inject({ method: "POST", url: `/api/v1/users/${userId}/password-reset`, headers: adminHeaders });
      assert.equal(blocked.statusCode, 409, blocked.body);
    } finally {
      await app.close();
      await db.end();
    }
  },
);
