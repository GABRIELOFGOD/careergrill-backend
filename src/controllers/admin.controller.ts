import type { Response } from "express";
import { z } from "zod";
import type { AuthRequest } from "../middleware/auth.middleware.js";
import { config, decryptSecret, encryptSecret, HttpError } from "../config.js";
import { database } from "../database.js";
import { assertSupportedDocumentType, extractDocumentText } from "../services/documents.service.js";
import { aiProviderSchema, defaultAiModels, generateContent } from "../services/ai.service.js";
import { deleteAsset, uploadAsset } from "../services/storage.service.js";
import { deleteSetting, readSetting, readStringMap, writeSetting } from "../services/settings.service.js";
import { listAdminContent, sanitizeContentBody } from "../services/content.service.js";
import { servicePricingSchema } from "../pricing.js";
import { readServicePricing } from "../services/pricing.service.js";

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
  const [provider, model, storedModels, storageProvider, aiCredentials, cloudinaryCredentials, careerAuditPrompt, servicePricing] = await Promise.all([
    readSetting("ai_provider"),
    readSetting("ai_model"),
    readSetting("ai_models"),
    readSetting("storage_provider"),
    readSetting("ai_credentials"),
    readSetting("cloudinary_credentials"),
    readSetting("career_audit_prompt"),
    readServicePricing(),
  ]);
  const credentials = readStringMap(aiCredentials, "AI credentials");
  const configuredModels = readStringMap(storedModels, "AI model");
  const defaultProvider = aiProviderSchema.parse(provider ?? "openai");
  const auditPrompt = z.string().max(8000).safeParse(careerAuditPrompt ?? "");
  if (!auditPrompt.success) throw new HttpError(500, "Career Audit instructions are invalid.", "AUDIT_PROMPT_INVALID");
  const models = { ...defaultAiModels, ...configuredModels };
  if (typeof model === "string" && !configuredModels[defaultProvider]) models[defaultProvider] = model;
  const cloudinary = readStringMap(cloudinaryCredentials, "Cloudinary credentials");
  response.json({
    ai_provider: provider ?? "openai",
    ai_model: model ?? "gpt-4.1-mini",
    ai_models: models,
    career_audit_prompt: auditPrompt.data,
    service_pricing: servicePricing,
    storage_provider: storageProvider ?? "supabase",
    configured_ai_providers: Object.keys(credentials),
    cloudinary_configured: ["cloud_name", "api_key", "api_secret"].every((key) => Boolean(cloudinary[key])),
    supabase_storage_bucket: config.SUPABASE_STORAGE_BUCKET,
    email_configured: Boolean(config.SMTP_HOST && config.SMTP_USER && config.SMTP_PASSWORD && config.SMTP_FROM),
  });
}

export async function updateSettings(request: AuthRequest, response: Response): Promise<void> {
  const input = z.object({
    ai_provider: aiProviderSchema.optional(),
    ai_model: z.string().trim().min(2).max(120).optional(),
    storage_provider: z.enum(["supabase", "cloudinary"]).optional(),
    ai_api_key: z.string().trim().min(8).max(500).optional(),
    ai_models: z.partialRecord(aiProviderSchema, z.string().trim().min(2).max(120)).optional(),
    career_audit_prompt: z.string().trim().max(8000).optional(),
    service_pricing: servicePricingSchema.optional(),
    cloudinary_cloud_name: z.string().trim().min(2).max(150).optional(),
    cloudinary_api_key: z.string().trim().min(4).max(150).optional(),
    cloudinary_api_secret: z.string().trim().min(8).max(300).optional(),
  }).parse(request.body);
  const cloudinaryValues = [input.cloudinary_cloud_name, input.cloudinary_api_key, input.cloudinary_api_secret];
  let cloudinaryCredentialsInput: { cloud_name: string; api_key: string; api_secret: string } | undefined;
  if (cloudinaryValues.some(Boolean)) {
    const [cloudName, apiKey, apiSecret] = cloudinaryValues;
    if (!cloudName || !apiKey || !apiSecret) {
      throw new HttpError(422, "Enter all three Cloudinary credentials together.", "CLOUDINARY_CREDENTIALS_INCOMPLETE");
    }
    cloudinaryCredentialsInput = { cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret };
  }
  if (input.ai_api_key && !input.ai_provider) {
    throw new HttpError(422, "Choose an AI provider before saving its API key.", "PROVIDER_REQUIRED");
  }
  if (input.ai_provider) await writeSetting("ai_provider", input.ai_provider);
  if (input.ai_model) await writeSetting("ai_model", input.ai_model);
  if (input.ai_models) {
    const configuredModels = readStringMap(await readSetting("ai_models"), "AI model");
    await writeSetting("ai_models", { ...configuredModels, ...input.ai_models });
  }
  if (input.career_audit_prompt !== undefined) {
    await writeSetting("career_audit_prompt", input.career_audit_prompt);
  }
  if (input.service_pricing !== undefined) {
    await writeSetting("service_pricing", input.service_pricing);
  }
  if (input.ai_api_key && input.ai_provider) {
    const credentials = readStringMap(await readSetting("ai_credentials"), "AI credentials");
    await writeSetting("ai_credentials", { ...credentials, [input.ai_provider]: encryptSecret(input.ai_api_key) });
  }
  if (cloudinaryCredentialsInput) {
    await writeSetting("cloudinary_credentials", {
      cloud_name: encryptSecret(cloudinaryCredentialsInput.cloud_name),
      api_key: encryptSecret(cloudinaryCredentialsInput.api_key),
      api_secret: encryptSecret(cloudinaryCredentialsInput.api_secret),
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
    type: z.enum(["job", "scholarship", "article", "resource", "service", "testimonial"]),
    document_ids: z.array(z.string().uuid()).max(10).default([]),
    provider: aiProviderSchema.optional(),
  }).parse(request.body);
  const defaultProvider = aiProviderSchema.parse(await readSetting("ai_provider") ?? "openai");
  const provider = input.provider ?? defaultProvider;
  const [storedModel, storedModels] = await Promise.all([
    readSetting("ai_model"),
    readSetting("ai_models"),
  ]);
  const models = readStringMap(storedModels, "AI model");
  const model = models[provider]
    ?? (provider === defaultProvider && typeof storedModel === "string" ? storedModel : defaultAiModels[provider]);
  const encryptedKey = readStringMap(await readSetting("ai_credentials"), "AI credentials")[provider];
  if (typeof encryptedKey !== "string") {
    throw new HttpError(503, `Add an API key for ${provider} in Settings.`, "AI_SETUP_REQUIRED");
  }
  let sourceText = "";
  if (input.document_ids.length) {
    const { data, error } = await database().from("ai_documents")
      .select("id, filename, extracted_text, processing_status").in("id", input.document_ids);
    if (error) throw new HttpError(500, "Could not load the selected reference documents.", "DOCUMENT_READ_FAILED");
    if (data?.length !== input.document_ids.length) {
      throw new HttpError(404, "One or more selected reference documents are unavailable.", "DOCUMENT_NOT_FOUND");
    }
    if (data.some((document) => document.processing_status !== "ready")) {
      throw new HttpError(409, "Wait for selected documents to finish processing before generating a draft.", "DOCUMENT_NOT_READY");
    }
    sourceText = data.map((document) => `--- ${document.filename} ---\n${document.extracted_text}`).join("\n\n").slice(0, 120_000);
  }
  const item = await generateContent(provider, decryptSecret(encryptedKey), model, input.prompt, sourceText, input.type);
  item.body = sanitizeContentBody(item.body);
  response.json({ item, provider, model, status: "draft" });
}

export async function listReferenceDocuments(_request: AuthRequest, response: Response): Promise<void> {
  const staleProcessingCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: staleDocuments, error: staleError } = await database().from("ai_documents")
    .update({ processing_status: "failed" })
    .eq("processing_status", "processing")
    .lt("created_at", staleProcessingCutoff)
    .select("id");
  if (staleError) throw new HttpError(500, "Could not refresh uploaded document status.", "DOCUMENT_STATUS_UPDATE_FAILED");
  const staleIds = new Set((staleDocuments ?? []).map((item) => item.id));
  const { data, error } = await database().from("ai_documents")
    .select("id, filename, mimetype, size_bytes, created_at, processing_status")
    .order("created_at", { ascending: false });
  if (error) throw new HttpError(500, "Could not load uploaded documents.", "DOCUMENT_READ_FAILED");
  response.json({ items: (data ?? []).map((item) =>
    staleIds.has(item.id) ? { ...item, processing_status: "failed" } : item) });
}

export async function uploadReferenceDocument(request: AuthRequest, response: Response): Promise<void> {
  const file = request.file;
  if (!file) throw new HttpError(400, "Choose a document to upload.", "FILE_REQUIRED");
  assertSupportedDocumentType(file.originalname, file.mimetype);
  const [extraction, storage] = await Promise.allSettled([
    extractDocumentText(file.buffer, file.originalname, file.mimetype),
    uploadAsset(file.buffer, file.originalname, file.mimetype),
  ]);
  if (storage.status === "rejected") throw storage.reason;
  if (extraction.status === "rejected") {
    try {
      await deleteAsset(storage.value.provider, storage.value.key);
    } catch (cleanupError) {
      console.error("Could not remove the uploaded file after document extraction failed:", cleanupError);
    }
    throw extraction.reason;
  }
  const asset = storage.value;
  const { data, error } = await database().from("ai_documents")
    .insert({
      filename: file.originalname.slice(0, 180),
      mimetype: file.mimetype,
      size_bytes: file.size,
      extracted_text: extraction.value,
      storage_provider: asset.provider,
      storage_key: asset.key,
      uploaded_by: request.user!.id,
      processing_status: "ready",
    })
    .select("id, filename, mimetype, size_bytes, created_at")
    .single();
  if (error) {
    try {
      await deleteAsset(asset.provider, asset.key);
    } catch (cleanupError) {
      console.error("Could not remove the uploaded file after its database record failed:", cleanupError);
    }
    throw new HttpError(500, "Could not save the uploaded document.", "DOCUMENT_CREATE_FAILED");
  }
  response.status(201).json({ item: { ...data, processing_status: "ready" } });
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
