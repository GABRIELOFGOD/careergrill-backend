import { z } from "zod";

export const careerAuditPromptWordLimit = 10_000;
export const careerAuditPromptCharacterLimit = 100_000;

export const careerAuditPromptSchema = z.string()
  .max(careerAuditPromptCharacterLimit)
  .refine((prompt) => {
    const words = prompt.trim().split(/\s+/).filter(Boolean);
    return words.length <= careerAuditPromptWordLimit;
  });
