import assert from "node:assert/strict";
import test from "node:test";
import { contentInput, contentUpdate, makeSlug } from "./content.js";

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

test("blank content slugs are treated as omitted so titles can generate slugs", () => {
  const valid = {
    type: "testimonial",
    title: "A client story",
    slug: "  ",
  };
  assert.equal(contentInput.parse(valid).slug, undefined);
  assert.equal(contentUpdate.parse({ slug: "" }).slug, undefined);
});

test("FAQs are excluded from generic content create validation", () => {
  assert.equal(contentInput.safeParse({
    type: "faq",
    title: "A common question",
    body: "A clear answer.",
  }).success, false);
});
