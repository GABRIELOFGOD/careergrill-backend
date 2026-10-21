import { database } from "../database.js";
import { HttpError } from "../config.js";
import { makeSlug } from "../content.js";
import type { FaqInput, FaqUpdate } from "../faqs.js";
import { sanitizeContentBody } from "./content.service.js";

type FaqRow = Omit<FaqRecord, "category_order" | "display_order"> & {
  data: { category_order?: unknown; display_order?: unknown } | null;
};

export type FaqRecord = {
  id: string;
  title: string;
  body: string;
  category: string;
  category_order: number;
  display_order: number;
  status: "draft" | "published" | "archived";
  updated_at: string;
};

function mapFaq(row: FaqRow): FaqRecord {
  return {
    id: row.id,
    title: row.title,
    body: sanitizeContentBody(row.body),
    category: row.category,
    category_order: typeof row.data?.category_order === "number" ? row.data.category_order : 999,
    display_order: typeof row.data?.display_order === "number" ? row.data.display_order : 0,
    status: row.status,
    updated_at: row.updated_at,
  };
}

function sortFaqs(rows: FaqRow[]): FaqRecord[] {
  return rows.map(mapFaq).sort((left, right) =>
    left.category_order - right.category_order
    || left.display_order - right.display_order
    || left.title.localeCompare(right.title),
  );
}

export async function listPublishedFaqs(): Promise<FaqRecord[]> {
  const { data, error } = await database()
    .from("faqs")
    .select("id, title, body, category, data, status, updated_at")
    .eq("status", "published")
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) throw new HttpError(500, "Could not load FAQs.", "FAQ_READ_FAILED");
  return sortFaqs((data ?? []) as FaqRow[]);
}

export async function listAdminFaqs(): Promise<FaqRecord[]> {
  const { data, error } = await database()
    .from("faqs")
    .select("id, title, body, category, data, status, updated_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) throw new HttpError(500, "Could not load FAQs.", "FAQ_READ_FAILED");
  return sortFaqs((data ?? []) as FaqRow[]);
}

export async function createFaq(input: FaqInput): Promise<FaqRecord> {
  const slug = makeSlug(input.title);
  if (!slug) throw new HttpError(422, "Add a title that can be used to identify this FAQ.", "INVALID_SLUG");
  const now = new Date().toISOString();
  const { data, error } = await database()
    .from("faqs")
    .insert({
      title: input.title,
      slug,
      excerpt: "",
      body: sanitizeContentBody(input.body),
      category: "General questions",
      data: { category_order: 999, display_order: 0 },
      tags: [],
      status: "published",
      published_at: now,
      updated_at: now,
    })
    .select("id, title, body, category, data, status, updated_at")
    .single();
  if (error?.code === "23505") throw new HttpError(409, "A FAQ with that title already exists.", "FAQ_TITLE_IN_USE");
  if (error) throw new HttpError(500, "Could not create the FAQ.", "FAQ_CREATE_FAILED");
  return mapFaq(data as FaqRow);
}

export async function updateFaq(id: string, input: FaqUpdate): Promise<FaqRecord> {
  const { data: current, error: readError } = await database()
    .from("faqs")
    .select("id, title, slug")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (readError) throw new HttpError(500, "Could not load this FAQ.", "FAQ_READ_FAILED");
  if (!current) throw new HttpError(404, "FAQ not found.", "FAQ_NOT_FOUND");

  const title = input.title ?? current.title;
  const { data, error } = await database()
    .from("faqs")
    .update({
      ...(input.title === undefined ? {} : { title, slug: makeSlug(title) }),
      ...(input.body === undefined ? {} : { body: sanitizeContentBody(input.body) }),
      status: "published",
      published_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id, title, body, category, data, status, updated_at")
    .maybeSingle();
  if (error?.code === "23505") throw new HttpError(409, "A FAQ with that title already exists.", "FAQ_TITLE_IN_USE");
  if (error) throw new HttpError(500, "Could not update the FAQ.", "FAQ_UPDATE_FAILED");
  if (!data) throw new HttpError(404, "FAQ not found.", "FAQ_NOT_FOUND");
  return mapFaq(data as FaqRow);
}

export async function deleteFaq(id: string): Promise<void> {
  const { data, error } = await database()
    .from("faqs")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) throw new HttpError(500, "Could not delete the FAQ.", "FAQ_DELETE_FAILED");
  if (!data) throw new HttpError(404, "FAQ not found.", "FAQ_NOT_FOUND");
}
