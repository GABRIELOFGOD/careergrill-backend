import { z } from "zod";

export const contentTypes = ["job", "scholarship", "article", "resource", "service", "faq", "testimonial"] as const;
export const publicContentTypes = ["job", "scholarship", "article", "resource", "service", "testimonial"] as const;
export const contentStatuses = ["draft", "published", "archived"] as const;

const reservedBlogSlugs = new Set([
  "admin",
  "blog",
  "career-audit",
  "client-feedback",
  "content",
  "consultation",
  "dashboard",
  "faq",
  "job",
  "jobs",
  "my-audits",
  "privacy",
  "resources",
  "scholarship",
  "scholarships",
  "services",
  "signin",
  "verify-email",
  "workspace",
]);

export function isReservedBlogSlug(slug: string): boolean {
  return reservedBlogSlugs.has(slug);
}

const contentSlug = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().min(3).max(180).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
);

export const contentInput = z.object({
  type: z.enum(publicContentTypes),
  title: z.string().trim().min(3).max(180),
  slug: contentSlug,
  excerpt: z.string().trim().max(500).default(""),
  body: z.string().max(200000).default(""),
  category: z.string().trim().max(80).default(""),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
  status: z.enum(contentStatuses).default("draft"),
  published_at: z.string().datetime().nullable().optional(),
  expires_at: z.string().datetime().nullable().optional(),
  source_url: z.string().url().refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  }, "Source URLs must use HTTP or HTTPS.").nullable().optional(),
  data: z.record(z.string(), z.unknown()).default({}),
});

export const contentUpdate = contentInput.partial().omit({ slug: true }).extend({
  slug: contentSlug,
});

export type ContentInput = z.infer<typeof contentInput>;
export type ContentUpdate = z.infer<typeof contentUpdate>;

export function makeSlug(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 160);
}
