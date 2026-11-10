import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../src/app.js";
import { createDatabase } from "../src/database.js";
import { testConfig } from "./test-config.js";

const databaseUrl = process.env.INTEGRATION_DATABASE_URL;
const email = process.env.INTEGRATION_ADMIN_EMAIL ?? "admin.integration@sababuka.test";
const password = process.env.INTEGRATION_ADMIN_PASSWORD ?? "integration-password-not-for-production";

test(
  "login, me, menu, dan logout berjalan end-to-end",
  { skip: !databaseUrl },
  async () => {
    const db = createDatabase(databaseUrl!);
    const app = await buildApp({
      config: { ...testConfig, databaseUrl: databaseUrl! },
      db,
      logger: false,
    });

    try {
      const login = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { identifier: email, password },
      });
      assert.equal(login.statusCode, 200, login.body);
      const loginBody = login.json();
      assert.equal(loginBody.user.email, email);
      assert.ok(loginBody.user.permissions.includes("system.configure"));
      assert.equal(typeof loginBody.csrf_token, "string");

      const setCookie = login.headers["set-cookie"];
      assert.equal(typeof setCookie, "string");
      const cookie = (setCookie as string).split(";", 1)[0]!;

      const me = await app.inject({ method: "GET", url: "/api/v1/me", headers: { cookie } });
      assert.equal(me.statusCode, 200, me.body);
      assert.equal(me.json().email, email);

      const menu = await app.inject({ method: "GET", url: "/api/v1/me/menu", headers: { cookie } });
      assert.equal(menu.statusCode, 200, menu.body);
      assert.ok(menu.json().data.length > 0);
      const flattenMenu = (items: Array<{ code: string; badge: string | null; navigation_disabled: boolean; children: unknown[] }>): typeof items =>
        items.flatMap((item) => [item, ...flattenMenu(item.children as typeof items)]);
      const menuItems = flattenMenu(menu.json().data);
      const placeholders = menuItems.filter((item) => item.navigation_disabled);
      assert.deepEqual(placeholders.map((item) => item.code).sort(), ["focuses", "metadata-profiles"]);
      assert.ok(placeholders.every((item) => item.badge === "Segera"));

      const configuredPlaceholders = await db.query<{ code: string; badge: string | null }>(
        `SELECT code, badge
         FROM sababuka.menu_items
         WHERE navigation_disabled = true
         ORDER BY code`,
      );
      assert.deepEqual(configuredPlaceholders.rows.map((item) => item.code), ["focuses", "metadata-profiles"]);
      assert.ok(configuredPlaceholders.rows.every((item) => item.badge === "Segera"));

      const logout = await app.inject({
        method: "POST",
        url: "/api/v1/auth/logout",
        headers: { cookie, "x-csrf-token": loginBody.csrf_token },
      });
      assert.equal(logout.statusCode, 204, logout.body);

      const afterLogout = await app.inject({ method: "GET", url: "/api/v1/me", headers: { cookie } });
      assert.equal(afterLogout.statusCode, 401, afterLogout.body);
    } finally {
      await app.close();
      await db.end();
    }
  },
);
