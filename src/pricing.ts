import { z } from "zod";

const price = z.number().int().min(0).max(1_000_000_000);
const careerBand = z.object({
  individual: price,
  bundle: price,
});

export const servicePricingSchema = z.object({
  career: z.object({
    bands: z.object({
      "0-3": careerBand,
      "4-6": careerBand,
      "7-10": careerBand,
      "10+": careerBand,
    }),
    interview: price,
  }),
  admissions: z.object({
    clarity: price,
    precision: price,
    distinction: price,
  }),
  scholarships: z.object({
    "1-2": z.tuple([price, price, price]),
    "3-4": z.tuple([price, price, price]),
    "5-6": z.tuple([price, price, price]),
    "7+": z.tuple([z.null(), z.null(), z.null()]),
  }),
  mba: z.object({
    essentials: price,
    mastery: price,
    fullRide: price,
    discountAtFive: z.number().int().min(0).max(100),
    discountAtTen: z.number().int().min(0).max(100),
  }).refine((mba) => mba.discountAtTen >= mba.discountAtFive, {
    message: "The 10-school discount must be at least the 5-school discount.",
  }),
});

export type ServicePricing = z.infer<typeof servicePricingSchema>;
