import assert from "node:assert/strict";
import test from "node:test";
import { contentInput, makeSlug } from "./content.js";

test("content slugs are normalized into URL-safe values", () => {
  assert.equal(makeSlug("Éducation, Work & You!"), "education-work-you");
  assert.equal(makeSlug("  --A New Story--  "), "a-new-story");
});

test("content validation rejects invalid publication status and unsafe URLs", () => {
  const valid = {
    type: "article",
    title: "A useful application guide",
    body: "Evidence first.",
    status: "draft",
  };
  assert.equal(contentInput.safeParse(valid).success, true);
  assert.equal(contentInput.safeParse({ ...valid, status: "public" }).success, false);
  assert.equal(contentInput.safeParse({ ...valid, source_url: "javascript:alert(1)" }).success, false);
});
