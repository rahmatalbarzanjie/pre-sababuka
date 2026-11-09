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
