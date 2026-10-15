import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

test("application integration secrets are authenticated and encrypted", async () => {
  process.env.NODE_ENV ??= "test";
  process.env.APP_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  const { decryptSecret, encryptSecret } = await import("./config.js");
  const secret = "provider-api-secret-for-tests";
  const encrypted = encryptSecret(secret);
  assert.notEqual(encrypted, secret);
  assert.equal(decryptSecret(encrypted), secret);
  const [iv, tag, ciphertext] = encrypted.split(".");
  assert.ok(iv && tag && ciphertext);
  const replacement = ciphertext.endsWith("0") ? "1" : "0";
  assert.throws(() => decryptSecret(`${iv}.${tag}.${ciphertext.slice(0, -1)}${replacement}`));
});
