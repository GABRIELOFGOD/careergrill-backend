import assert from "node:assert/strict";
import test from "node:test";
import { careerAuditPromptSchema } from "./career-audit.js";

test("Career Audit administrator prompt accepts up to 10,000 words", () => {
  const prompt = Array.from({ length: 10_000 }, () => "guidance").join(" ");
  assert.equal(careerAuditPromptSchema.safeParse(prompt).success, true);
});

test("Career Audit administrator prompt rejects more than 10,000 words", () => {
  const prompt = Array.from({ length: 10_001 }, () => "guidance").join(" ");
  assert.equal(careerAuditPromptSchema.safeParse(prompt).success, false);
});

test("Career Audit administrator prompt rejects inputs over the character limit", () => {
  assert.equal(careerAuditPromptSchema.safeParse("x".repeat(100_001)).success, false);
});
