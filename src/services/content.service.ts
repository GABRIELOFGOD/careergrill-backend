import { database } from "../database.js";
import { HttpError } from "../config.js";
import sanitizeHtml from "sanitize-html";
import { contentTypes, makeSlug, type ContentInput, type ContentUpdate } from "../content.js";

export function sanitizeContentBody(body: string): string {
  return sanitizeHtml(body, {
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags,
      "h2", "h3", "u", "img", "table", "thead", "tbody", "tr", "th", "td", "div",
    ],
    allowedAttributes: {
      a: ["href", "name", "target", "rel"],
      img: ["src", "alt", "width", "height"],
      th: ["colspan", "rowspan"],
      td: ["colspan", "rowspan"],
      div: ["data-text-box", "style"],
    },
    allowedStyles: {
      p: { "text-align": [/^(left|center|right|justify)$/] },
      h2: { "text-align": [/^(left|center|right|justify)$/] },
      h3: { "text-align": [/^(left|center|right|justify)$/] },
      div: { "background-color": [/^#[0-9a-f]{6}$/i] },
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: ["http", "https"] },
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer", target: "_blank" }),
    },
  });
}

const tableByType = {
  job: "jobs",
  scholarship: "scholarships",
  article: "blog_posts",
  resource: "resources",
  service: "services",
  faq: "faqs",
  testimonial: "feedback",
} as const;

export type ContentRecord = Record<string, unknown> & { id: string; type: typeof contentTypes[number] };

function withType<T extends Record<string, unknown>>(type: typeof contentTypes[number], row: T): T & { type: typeof contentTypes[number] } {
  return {
    ...row,
    ...(typeof row.body === "string" ? { body: sanitizeContentBody(row.body) } : {}),
    type,
  };
}

async function readById(id: string, includeDeleted = false): Promise<ContentRecord | null> {
  const results = await Promise.all(contentTypes.map(async (type) => {
    let query = database().from(tableByType[type]).select("*").eq("id", id);
    if (!includeDeleted) query = query.is("deleted_at", null);
    const { data, error } = await query.maybeSingle();
    if (error) throw new HttpError(500, "Could not load this content.", "CONTENT_READ_FAILED");
    return data ? withType(type, data) as ContentRecord : null;
  }));
  const rows = results.filter((row): row is ContentRecord => row !== null);
  if (rows.length > 1) throw new HttpError(500, "Content identifiers are ambiguous.", "CONTENT_ID_AMBIGUOUS");
  return rows[0] ?? null;
}

export async function listContentByIds(
  type: typeof contentTypes[number],
  ids: string[],
  includeDeleted = false,
) {
  if (!ids.length) return [];
  let query = database().from(tableByType[type]).select("*").in("id", ids);
  if (!includeDeleted) query = query.is("deleted_at", null);
  const { data, error } = await query;
  if (error) throw new HttpError(500, "Could not load saved content.", "CONTENT_READ_FAILED");
  return (data ?? []).map((row) => withType(type, row));
}

export async function getContentById(id: string, type?: typeof contentTypes[number]) {
  const item = type
    ? await (async () => {
      const { data, error } = await database().from(tableByType[type]).select("*").eq("id", id).is("deleted_at", null).maybeSingle();
      if (error) throw new HttpError(500, "Could not load this content.", "CONTENT_READ_FAILED");
      return data ? withType(type, data) as ContentRecord : null;
    })()
    : await readById(id);
  return item;
}

export async function listPublishedContent(type?: typeof contentTypes[number]) {
  const now = new Date().toISOString();
  const types = type ? [type] : [...contentTypes];
  const results = await Promise.all(types.map(async (contentType) => {
    const { data, error } = await database()
      .from(tableByType[contentType])
      .select("id, title, slug, excerpt, body, category, tags, expires_at, source_url, data, published_at, created_at")
      .eq("status", "published")
      .is("deleted_at", null)
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order("published_at", { ascending: false });
    if (error) throw new HttpError(500, "Could not load published content.", "CONTENT_READ_FAILED");
    return (data ?? []).map((row) => withType(contentType, row));
  }));
  return results.flat()
    .sort((a, b) => String(b.published_at ?? "").localeCompare(String(a.published_at ?? "")))
    .slice(0, 100);
}

export async function getPublishedContent(slug: string) {
  const results = await Promise.all(contentTypes.map(async (type) => {
    const { data, error } = await database().from(tableByType[type])
      .select("id, title, slug, excerpt, body, category, tags, expires_at, source_url, data, published_at")
      .eq("slug", slug)
      .eq("status", "published")
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw new HttpError(500, "Could not load this content.", "CONTENT_READ_FAILED");
    return data ? withType(type, data) : null;
  }));
  const rows = results.filter((row) => row !== null);
  if (rows.length > 1) throw new HttpError(500, "This content URL is ambiguous.", "CONTENT_SLUG_AMBIGUOUS");
  const item = rows[0];
  if (!item || (item.expires_at && new Date(String(item.expires_at)) <= new Date())) {
    throw new HttpError(404, "This content could not be found.", "CONTENT_NOT_FOUND");
  }
  return item;
}

export async function listAdminContent() {
  const results = await Promise.all(contentTypes.map(async (type) => {
    const { data, error } = await database().from(tableByType[type]).select("*")
      .is("deleted_at", null).order("updated_at", { ascending: false });
    if (error) throw new HttpError(500, "Could not load CMS content.", "CONTENT_READ_FAILED");
    return (data ?? []).map((row) => withType(type, row));
  }));
  return results.flat().sort((a, b) => String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")));
}

export async function listTrashedContent() {
  const results = await Promise.all(contentTypes.map(async (type) => {
    const { data, error } = await database().from(tableByType[type]).select("*")
      .not("deleted_at", "is", null).order("deleted_at", { ascending: false });
    if (error) throw new HttpError(500, "Could not load trashed content.", "CONTENT_TRASH_READ_FAILED");
    return (data ?? []).map((row) => withType(type, row));
  }));
  return results.flat().sort((a, b) => String(b.deleted_at ?? "").localeCompare(String(a.deleted_at ?? "")));
}

export async function createContent(input: ContentInput) {
  const slug = input.slug ?? makeSlug(input.title);
  if (!slug) throw new HttpError(422, "Add a title that can be used to create a URL.", "INVALID_SLUG");
  const existing = await Promise.all(contentTypes.map(async (type) => {
    const { data, error } = await database().from(tableByType[type]).select("id").eq("slug", slug).maybeSingle();
    if (error) throw new HttpError(500, "Could not check the content URL.", "CONTENT_READ_FAILED");
    return data;
  }));
  if (existing.some(Boolean)) throw new HttpError(409, "That URL is already in use.", "SLUG_IN_USE");

  const now = new Date().toISOString();
  const { type, ...fields } = input;
  const { data, error } = await database()
    .from(tableByType[type])
    .insert({ ...fields, body: sanitizeContentBody(fields.body), slug, published_at: input.status === "published" ? now : null, updated_at: now })
    .select("*")
    .single();
  if (error?.code === "23505") throw new HttpError(409, "That URL is already in use.", "SLUG_IN_USE");
  if (error) throw new HttpError(500, "Could not create content.", "CONTENT_CREATE_FAILED");
  return withType(type, data);
}

export async function updateContent(id: string, input: ContentUpdate) {
  const current = await readById(id);
  if (!current) throw new HttpError(404, "Content not found.", "CONTENT_NOT_FOUND");
  if (input.type && input.type !== current.type) {
    throw new HttpError(422, "Content cannot be moved between content types.", "CONTENT_TYPE_IMMUTABLE");
  }
  if (input.slug) {
    const slugMatches = await Promise.all(contentTypes.map(async (type) => {
      const { data, error } = await database().from(tableByType[type]).select("id").eq("slug", input.slug).maybeSingle();
      if (error) throw new HttpError(500, "Could not check the content URL.", "CONTENT_READ_FAILED");
      return data;
    }));
    if (slugMatches.some((row) => row && row.id !== id)) {
      throw new HttpError(409, "That URL is already in use.", "SLUG_IN_USE");
    }
  }
  const { type: _type, ...fields } = input;
  const { data, error } = await database()
    .from(tableByType[current.type])
    .update({
      ...fields,
      ...(fields.body === undefined ? {} : { body: sanitizeContentBody(fields.body) }),
      ...(input.status === "published" ? { published_at: new Date().toISOString() } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error?.code === "23505") throw new HttpError(409, "That URL is already in use.", "SLUG_IN_USE");
  if (error) throw new HttpError(500, "Could not update content.", "CONTENT_UPDATE_FAILED");
  if (!data) throw new HttpError(404, "Content not found.", "CONTENT_NOT_FOUND");
  return withType(current.type, data);
}

export async function deleteContent(id: string) {
  const current = await readById(id);
  if (!current) throw new HttpError(404, "Content not found.", "CONTENT_NOT_FOUND");
  const { data, error } = await database().from(tableByType[current.type])
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id).is("deleted_at", null).select("id").maybeSingle();
  if (error) throw new HttpError(500, "Could not move content to trash.", "CONTENT_DELETE_FAILED");
  if (!data) throw new HttpError(404, "Content not found.", "CONTENT_NOT_FOUND");
}

export async function restoreContent(id: string) {
  const current = await readById(id, true);
  if (!current || !current.deleted_at) throw new HttpError(404, "Trashed content not found.", "CONTENT_NOT_FOUND");
  const { data, error } = await database().from(tableByType[current.type])
    .update({ deleted_at: null, updated_at: new Date().toISOString() })
    .eq("id", id).not("deleted_at", "is", null).select("*").maybeSingle();
  if (error) throw new HttpError(500, "Could not restore content.", "CONTENT_RESTORE_FAILED");
  if (!data) throw new HttpError(404, "Trashed content not found.", "CONTENT_NOT_FOUND");
  return withType(current.type, data);
}
