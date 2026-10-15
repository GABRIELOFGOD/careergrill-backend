import type { Response } from "express";
import { z } from "zod";
import type { AuthRequest } from "../middleware/auth.middleware.js";
import { config, decryptSecret, encryptSecret, HttpError } from "../config.js";
import { database } from "../database.js";
import { extractDocumentText } from "../services/documents.service.js";
import { aiProviderSchema, generateContent } from "../services/ai.service.js";
import { deleteAsset, uploadAsset } from "../services/storage.service.js";
import { deleteSetting, readSetting, readStringMap, writeSetting } from "../services/settings.service.js";
import { listAdminContent, sanitizeContentBody } from "../services/content.service.js";

export async function getOverview(_request: AuthRequest, response: Response): Promise<void> {
  const [content, files, users] = await Promise.all([
    listAdminContent(),
    database().from("ai_documents").select("id", { count: "exact", head: true }),
    database().from("users").select("id", { count: "exact", head: true }).eq("role", "user"),
  ]);
  if (files.error || users.error) throw new HttpError(500, "Could not load the dashboard.", "DASHBOARD_READ_FAILED");
  response.json({
    contentCount: content.length,
    publishedCount: content.filter((item) => item.status === "published").length,
    documentCount: files.count ?? 0,
    userCount: users.count ?? 0,
  });
}

export async function getSettings(_request: AuthRequest, response: Response): Promise<void> {
  const [provider, model, storageProvider, aiCredentials, cloudinaryCredentials] = await Promise.all([
    readSetting("ai_provider"),
    readSetting("ai_model"),
    readSetting("storage_provider"),
    readSetting("ai_credentials"),
    readSetting("cloudinary_credentials"),
  ]);
  const credentials = readStringMap(aiCredentials, "AI credentials");
  response.json({
    ai_provider: provider ?? "openai",
    ai_model: model ?? "gpt-4.1-mini",
    storage_provider: storageProvider ?? "supabase",
    configured_ai_providers: Object.keys(credentials),
    cloudinary_configured: Boolean(readStringMap(cloudinaryCredentials, "Cloudinary credentials").cloud_name),
    email_configured: Boolean(config.SMTP_HOST && config.SMTP_USER && config.SMTP_PASSWORD && config.SMTP_FROM),
  });
}

export async function updateSettings(request: AuthRequest, response: Response): Promise<void> {
  const input = z.object({
    ai_provider: aiProviderSchema.optional(),
    ai_model: z.string().trim().min(2).max(120).optional(),
    storage_provider: z.enum(["supabase", "cloudinary"]).optional(),
    ai_api_key: z.string().trim().min(8).max(500).optional(),
    cloudinary_cloud_name: z.string().trim().min(2).max(150).optional(),
    cloudinary_api_key: z.string().trim().min(4).max(150).optional(),
    cloudinary_api_secret: z.string().trim().min(8).max(300).optional(),
  }).parse(request.body);
  if (input.ai_api_key && !input.ai_provider) {
    throw new HttpError(422, "Choose an AI provider before saving its API key.", "PROVIDER_REQUIRED");
  }
  if (input.ai_provider) await writeSetting("ai_provider", input.ai_provider);
  if (input.ai_model) await writeSetting("ai_model", input.ai_model);
  if (input.ai_api_key && input.ai_provider) {
    const credentials = readStringMap(await readSetting("ai_credentials"), "AI credentials");
    await writeSetting("ai_credentials", { ...credentials, [input.ai_provider]: encryptSecret(input.ai_api_key) });
  }
  const cloudinaryValues = [input.cloudinary_cloud_name, input.cloudinary_api_key, input.cloudinary_api_secret];
  if (cloudinaryValues.some(Boolean)) {
    if (!cloudinaryValues.every(Boolean)) {
      throw new HttpError(422, "Enter all three Cloudinary credentials together.", "CLOUDINARY_CREDENTIALS_INCOMPLETE");
    }
    await writeSetting("cloudinary_credentials", {
      cloud_name: encryptSecret(input.cloudinary_cloud_name!),
      api_key: encryptSecret(input.cloudinary_api_key!),
      api_secret: encryptSecret(input.cloudinary_api_secret!),
    });
  }
  if (input.storage_provider === "cloudinary") {
    const credentials = readStringMap(await readSetting("cloudinary_credentials"), "Cloudinary credentials");
    if (!credentials.cloud_name || !credentials.api_key || !credentials.api_secret) {
      throw new HttpError(422, "Configure Cloudinary credentials before selecting Cloudinary storage.", "CLOUDINARY_SETUP_REQUIRED");
    }
  }
  if (input.storage_provider) await writeSetting("storage_provider", input.storage_provider);
  response.json({ saved: true });
}

export async function generateDraft(request: AuthRequest, response: Response): Promise<void> {
  const input = z.object({
    prompt: z.string().trim().min(2).max(4000),
    type: z.enum(["job", "scholarship", "article", "resource", "service", "faq", "testimonial"]),
    document_ids: z.array(z.string().uuid()).max(10).default([]),
  }).parse(request.body);
  const provider = aiProviderSchema.parse(await readSetting("ai_provider") ?? "openai");
  const storedModel = await readSetting("ai_model");
  const model = typeof storedModel === "string" ? storedModel : "gpt-4.1-mini";
  const encryptedKey = readStringMap(await readSetting("ai_credentials"), "AI credentials")[provider];
  if (typeof encryptedKey !== "string") {
    throw new HttpError(503, `Add an API key for ${provider} in Settings.`, "AI_SETUP_REQUIRED");
  }
  let sourceText = "";
  if (input.document_ids.length) {
    const { data, error } = await database().from("ai_documents")
      .select("id, filename, extracted_text").in("id", input.document_ids);
    if (error) throw new HttpError(500, "Could not load the selected reference documents.", "DOCUMENT_READ_FAILED");
    if (data?.length !== input.document_ids.length) {
      throw new HttpError(404, "One or more selected reference documents are unavailable.", "DOCUMENT_NOT_FOUND");
    }
    sourceText = data.map((document) => `--- ${document.filename} ---\n${document.extracted_text}`).join("\n\n").slice(0, 120_000);
  }
  const item = await generateContent(provider, decryptSecret(encryptedKey), model, input.prompt, sourceText, input.type);
  item.body = sanitizeContentBody(item.body);
  response.json({ item, provider, model, status: "draft" });
}

export async function listReferenceDocuments(_request: AuthRequest, response: Response): Promise<void> {
  const { data, error } = await database().from("ai_documents")
    .select("id, filename, mimetype, size_bytes, created_at").order("created_at", { ascending: false });
  if (error) throw new HttpError(500, "Could not load uploaded documents.", "DOCUMENT_READ_FAILED");
  response.json({ items: data });
}

export async function uploadReferenceDocument(request: AuthRequest, response: Response): Promise<void> {
  const file = request.file;
  if (!file) throw new HttpError(400, "Choose a document to upload.", "FILE_REQUIRED");
  const extractedText = await extractDocumentText(file.buffer, file.originalname, file.mimetype);
  const asset = await uploadAsset(file.buffer, file.originalname, file.mimetype);
  const { data, error } = await database().from("ai_documents")
    .insert({
      filename: file.originalname.slice(0, 180),
      mimetype: file.mimetype,
      size_bytes: file.size,
      extracted_text: extractedText,
      storage_provider: asset.provider,
      storage_key: asset.key,
      uploaded_by: request.user!.id,
    })
    .select("id, filename, mimetype, size_bytes, created_at")
    .single();
  if (error) {
    await deleteAsset(asset.provider, asset.key);
    throw new HttpError(500, "Could not save the uploaded document.", "DOCUMENT_CREATE_FAILED");
  }
  response.status(201).json({ item: data });
}

export async function deleteReferenceDocument(request: AuthRequest, response: Response): Promise<void> {
  const id = z.string().uuid().parse(request.params.id);
  const { data, error } = await database().from("ai_documents")
    .select("id, storage_provider, storage_key").eq("id", id).maybeSingle();
  if (error) throw new HttpError(500, "Could not load the uploaded document.", "DOCUMENT_READ_FAILED");
  if (!data) throw new HttpError(404, "Document not found.", "DOCUMENT_NOT_FOUND");
  await deleteAsset(data.storage_provider, data.storage_key);
  const { error: deleteError } = await database().from("ai_documents").delete().eq("id", data.id);
  if (deleteError) throw new HttpError(500, "The file was removed, but its record could not be deleted.", "DOCUMENT_DELETE_FAILED");
  response.status(204).end();
}
