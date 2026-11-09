import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword, verifyPassword } from "../src/security/password.js";
import { hashToken, randomToken, tokensMatch } from "../src/security/tokens.js";

test("token acak dapat diverifikasi tanpa menyimpan token asli", () => {
  const token = randomToken();
  const digest = hashToken(token);
  assert.equal(tokensMatch(token, digest), true);
  assert.equal(tokensMatch(`${token}x`, digest), false);
});

test("password memakai Argon2id dan dapat diverifikasi", async () => {
  const password = "contoh-password-yang-panjang";
  const digest = await hashPassword(password);
  assert.match(digest, /^\$argon2id\$/);
  assert.equal(await verifyPassword(digest, password), true);
  assert.equal(await verifyPassword(digest, "password-salah"), false);
});
