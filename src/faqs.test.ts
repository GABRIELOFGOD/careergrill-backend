import assert from "node:assert/strict";
import test from "node:test";
import { faqInput, faqUpdate } from "./faqs.js";

test("dedicated FAQ input accepts only title and rich-text body", () => {
  assert.equal(faqInput.safeParse({ title: "How does this work?", body: "<p>It works well.</p>" }).success, true);
  assert.equal(faqInput.safeParse({ title: "OK", body: "<p>Answer.</p>" }).success, false);
  assert.equal(faqInput.safeParse({ title: "A valid question", body: " " }).success, false);
});

test("FAQ updates can change either editable field without exposing a slug", () => {
  assert.equal(faqUpdate.safeParse({ title: "Updated question" }).success, true);
  assert.equal(faqUpdate.safeParse({ body: "<p>Updated answer.</p>" }).success, true);
  assert.equal(faqUpdate.safeParse({ slug: "public-url" }).success, false);
});
