import { z } from "zod";

export const faqInput = z.object({
  title: z.string().trim().min(3).max(180),
  body: z.string().trim().min(1).max(200000),
}).strict();

export const faqUpdate = faqInput.partial();

export type FaqInput = z.infer<typeof faqInput>;
export type FaqUpdate = z.infer<typeof faqUpdate>;
