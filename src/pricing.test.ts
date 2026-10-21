import assert from "node:assert/strict";
import test from "node:test";
import { servicePricingSchema } from "./pricing.js";

const validPricing = {
  career: {
    bands: {
      "0-3": { individual: 20_000, bundle: 50_000 },
      "4-6": { individual: 35_000, bundle: 90_000 },
      "7-10": { individual: 50_000, bundle: 130_000 },
      "10+": { individual: 80_000, bundle: 205_000 },
    },
    interview: 50_000,
  },
  admissions: { clarity: 60_000, precision: 100_000, distinction: 150_000 },
  scholarships: {
    "1-2": [170_000, 220_000, 270_000],
    "3-4": [200_000, 260_000, 320_000],
    "5-6": [240_000, 310_000, 390_000],
    "7+": [null, null, null],
  },
  mba: {
    essentials: 100_000,
    mastery: 150_000,
    fullRide: 180_000,
    discountAtFive: 5,
    discountAtTen: 10,
  },
};

test("service pricing accepts all editable package rates", () => {
  assert.equal(servicePricingSchema.safeParse(validPricing).success, true);
});

test("service pricing rejects invalid amounts and backwards volume discounts", () => {
  assert.equal(servicePricingSchema.safeParse({
    ...validPricing,
    career: { ...validPricing.career, interview: -1 },
  }).success, false);
  assert.equal(servicePricingSchema.safeParse({
    ...validPricing,
    mba: { ...validPricing.mba, discountAtFive: 15, discountAtTen: 10 },
  }).success, false);
});
